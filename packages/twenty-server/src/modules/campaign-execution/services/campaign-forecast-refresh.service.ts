import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type EntityManager } from 'typeorm';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignForecastCandidateReaderService } from 'src/modules/campaign-execution/services/campaign-forecast-candidate-reader.service';
import { CampaignForecastProjectionService } from 'src/modules/campaign-execution/services/campaign-forecast-projection.service';
import { CampaignMessageForecastService } from 'src/modules/campaign-execution/services/campaign-message-forecast.service';
import { CampaignSenderReadinessService } from 'src/modules/myah-campaign/services/campaign-sender-readiness.service';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';

const PAGE_SIZE = 500;
const MAX_CANDIDATES = 1_000;
const HORIZON_MS = 48 * 60 * 60 * 1_000;
export const FORECAST_REFRESH_TIME_BUDGET_MS = 5_000;
export const FORECAST_REFRESH_MAX_AGE_MS = 60_000;

type StaleHead = {
  inputRevision: string;
  scopeKey: string;
  workspaceId: string;
};
type CapacityRow = {
  acceptedCount: number;
  connectedAccountId: string;
  localDate: string;
  nextEligibleAt: Date | null;
  reservedCount: number;
};

const rows = <T>(value: unknown): T[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? (value[0] as T[])
    : Array.isArray(value)
      ? (value as T[])
      : [];

@Injectable()
export class CampaignForecastRefreshService {
  private monotonicNow: () => number = () => performance.now();
  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly candidates: CampaignForecastCandidateReaderService,
    private readonly forecast: CampaignMessageForecastService,
    private readonly projection: CampaignForecastProjectionService,
    private readonly senders: CampaignSenderReadinessService,
    private readonly sequences: CampaignSequenceService,
  ) {}

  setMonotonicNowForTest(clock: () => number): void {
    this.monotonicNow = clock;
  }

  async refreshStaleForecasts(limit = 10): Promise<void> {
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    const stale = await dataSource.transaction((manager) =>
      manager.query(
        `WITH active AS (
           SELECT DISTINCT "workspaceId" FROM core."campaignOccurrence"
            WHERE state IN ('PENDING','HELD','IN_FLIGHT','UNKNOWN')
         ), ensured AS (
           INSERT INTO core."campaignForecastHead" ("workspaceId","scopeKey","inputRevision")
           SELECT "workspaceId",'workspace:' || "workspaceId"::text,1 FROM active
           ON CONFLICT ("workspaceId","scopeKey") DO NOTHING
           RETURNING "workspaceId"
         )
         SELECT head."workspaceId",head."scopeKey",head."inputRevision"::text AS "inputRevision"
           FROM core."campaignForecastHead" head
           JOIN active ON active."workspaceId"=head."workspaceId"
           LEFT JOIN core."campaignForecastGeneration" generation ON generation.id=head."currentGenerationId"
          WHERE head."scopeKey"='workspace:' || head."workspaceId"::text
            AND (generation.id IS NULL
              OR generation."inputRevision" <> head."inputRevision"
              OR generation."generatedAt" <= clock_timestamp() - ($2::integer * interval '1 millisecond'))
          ORDER BY head."updatedAt" NULLS FIRST,head."workspaceId" LIMIT $1`,
        [limit, FORECAST_REFRESH_MAX_AGE_MS],
      ),
    );

    for (const head of rows<StaleHead>(stale)) {
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        const input = await this.refresh(head, runner.manager);
        await dataSource.transaction((manager) =>
          this.projection.publish(input, manager),
        );
      } finally {
        await runner.release();
      }
    }
  }

  private async refresh(
    head: StaleHead,
    manager: EntityManager,
  ): Promise<Parameters<CampaignForecastProjectionService['publish']>[0]> {
    const generatedAt = new Date();
    const deadline = this.monotonicNow() + FORECAST_REFRESH_TIME_BUDGET_MS;
    const horizonEndsAt = new Date(generatedAt.getTime() + HORIZON_MS);
    const occurrences = [];
    let cursor = null;
    let complete = true;

    while (
      occurrences.length < MAX_CANDIDATES &&
      this.monotonicNow() < deadline
    ) {
      const page = await this.candidates.readPage(
        {
          cursor,
          horizonEndsAt,
          limit: Math.min(PAGE_SIZE, MAX_CANDIDATES - occurrences.length),
          workspaceId: head.workspaceId,
        },
        manager,
      );
      occurrences.push(...page.items);
      cursor = page.nextCursor;
      if (cursor === null) break;
    }
    if (cursor !== null || this.monotonicNow() >= deadline) complete = false;

    const campaignIds = [
      ...new Set(occurrences.map(({ campaignId }) => campaignId)),
    ];
    const pools = new Map<string, ReadyCampaignSenderReadiness[]>();
    for (const campaignId of campaignIds) {
      if (this.monotonicNow() >= deadline) {
        complete = false;
        break;
      }
      const pool = await this.senders.getCampaignEmailSenderPoolInTransaction(
        { campaignId, workspaceId: head.workspaceId },
        manager as WorkspaceEntityManager,
      );
      if (this.monotonicNow() >= deadline) {
        complete = false;
        break;
      }
      pools.set(
        campaignId,
        pool.mailboxes.filter(
          (mailbox): mailbox is ReadyCampaignSenderReadiness =>
            mailbox.status === 'READY' &&
            mailbox.bindingStatus === 'RESOLVED_BINDING',
        ),
      );
    }

    const ready = [...pools.values()].flat();
    const accountIds = [
      ...new Set(ready.map(({ connectedAccountId }) => connectedAccountId)),
    ];
    const capacity =
      accountIds.length === 0
        ? []
        : rows<CapacityRow>(
            await manager.query(
              `SELECT account.id AS "connectedAccountId",day."localDate"::text AS "localDate",
                      COALESCE(day."reservedCount",0)::integer AS "reservedCount",
                      COALESCE(day."acceptedCount",0)::integer AS "acceptedCount",
                      clock."nextEligibleAt"
                 FROM core."connectedAccount" account
                 LEFT JOIN core."mailboxCapacityDay" day
                   ON day."workspaceId"=account."workspaceId" AND day."connectedAccountId"=account.id
                 LEFT JOIN core."mailboxDispatchClock" clock
                   ON clock."workspaceId"=account."workspaceId" AND clock."connectedAccountId"=account.id
                WHERE account."workspaceId"=$1 AND account.id=ANY($2::uuid[])`,
              [head.workspaceId, accountIds],
            ),
          );
    const capacityByAccount = new Map<string, CapacityRow[]>();
    for (const row of capacity) {
      const current = capacityByAccount.get(row.connectedAccountId) ?? [];
      current.push(row);
      capacityByAccount.set(row.connectedAccountId, current);
    }
    const executionZones = rows<{
      campaignId: string;
      campaignCapacityTimeZone: string;
    }>(
      await manager.query(
        `SELECT "campaignId","campaignCapacityTimeZone" FROM core."campaignExecution"
          WHERE "workspaceId"=$1 AND "campaignId"=ANY($2::uuid[])`,
        [head.workspaceId, campaignIds],
      ),
    );
    const zoneByCampaign = new Map(
      executionZones.map(({ campaignId, campaignCapacityTimeZone }) => [
        campaignId,
        campaignCapacityTimeZone,
      ]),
    );
    const zonesByAccount = new Map<string, Set<string>>();
    for (const [campaignId, mailboxes] of pools) {
      const zone = zoneByCampaign.get(campaignId);
      for (const mailbox of mailboxes) {
        const zones =
          zonesByAccount.get(mailbox.connectedAccountId) ?? new Set();
        if (zone) zones.add(zone);
        zonesByAccount.set(mailbox.connectedAccountId, zones);
      }
    }
    const conflictingAccountIds = new Set(
      [...zonesByAccount]
        .filter(([, zones]) => zones.size !== 1)
        .map(([connectedAccountId]) => connectedAccountId),
    );

    const accounts = [
      ...new Map(
        ready.map((mailbox) => [mailbox.connectedAccountId, mailbox]),
      ).values(),
    ]
      .filter(
        ({ connectedAccountId }) =>
          !conflictingAccountIds.has(connectedAccountId),
      )
      .map((mailbox) => {
        const usage = capacityByAccount.get(mailbox.connectedAccountId) ?? [];
        return {
          acceptedByLocalDate: Object.fromEntries(
            usage
              .filter(({ localDate }) => localDate !== null)
              .map(({ localDate, acceptedCount }) => [
                localDate,
                acceptedCount,
              ]),
          ),
          capacityTimeZone: [
            ...(zonesByAccount.get(mailbox.connectedAccountId) ?? []),
          ][0],
          connectedAccountId: mailbox.connectedAccountId,
          dailySendLimit: mailbox.dailySendLimit,
          minimumSendIntervalMs: mailbox.minimumSendIntervalMs,
          nextEligibleAt: usage[0]?.nextEligibleAt ?? null,
          reservedByLocalDate: Object.fromEntries(
            usage
              .filter(({ localDate }) => localDate !== null)
              .map(({ localDate, reservedCount }) => [
                localDate,
                reservedCount,
              ]),
          ),
        };
      });
    const replyByOccurrence = new Map<string, boolean>();
    const plans = new Map<
      string,
      Awaited<
        ReturnType<CampaignSequenceService['loadExecutionPlanInTransaction']>
      >
    >();
    for (const occurrence of occurrences) {
      if (this.monotonicNow() >= deadline) {
        complete = false;
        break;
      }
      const key = `${occurrence.campaignId}:${occurrence.workflowVersionId}`;
      let plan = plans.get(key);
      if (plan === undefined) {
        plan = await this.sequences.loadExecutionPlanInTransaction(
          {
            campaignId: occurrence.campaignId,
            workflowVersionId: occurrence.workflowVersionId,
            workspaceId: head.workspaceId,
          },
          manager as WorkspaceEntityManager,
        );
        plans.set(key, plan);
      }
      const node =
        plan.kind === 'READY'
          ? plan.nodes[occurrence.authoredMessageIndex]
          : undefined;
      if (this.monotonicNow() >= deadline) {
        complete = false;
        break;
      }
      replyByOccurrence.set(
        occurrence.occurrenceId,
        node?.channel === 'EMAIL' && node.replyToThread === true,
      );
    }
    let hasUnforecastableThreadReply = false;
    const forecastOccurrences = occurrences.flatMap((occurrence) => {
      if (
        !pools.has(occurrence.campaignId) ||
        !replyByOccurrence.has(occurrence.occurrenceId)
      ) {
        complete = false;
        return [];
      }
      const replyToThread =
        replyByOccurrence.get(occurrence.occurrenceId) === true;
      const pinnedAccountReady = (pools.get(occurrence.campaignId) ?? []).some(
        ({ connectedAccountId }) =>
          connectedAccountId === occurrence.pinnedConnectedAccountId,
      );
      if (
        replyToThread &&
        (occurrence.pinnedConnectedAccountId === null || !pinnedAccountReady)
      ) {
        hasUnforecastableThreadReply = true;
        return [];
      }
      return [
        {
          ...occurrence,
          sender: replyToThread
            ? {
                kind: 'PINNED' as const,
                connectedAccountId:
                  occurrence.pinnedConnectedAccountId as string,
              }
            : {
                kind: 'ROTATE' as const,
                connectedAccountIds: [
                  ...new Set(
                    (pools.get(occurrence.campaignId) ?? []).map(
                      ({ connectedAccountId }) => connectedAccountId,
                    ),
                  ),
                ],
              },
        },
      ];
    });
    const result = this.forecast.forecast({
      accounts,
      generatedAt,
      maxItems: MAX_CANDIDATES,
      occurrences: forecastOccurrences,
    });

    return {
      complete:
        complete &&
        conflictingAccountIds.size === 0 &&
        !hasUnforecastableThreadReply &&
        result.coverage.complete,
      entries: result.projections,
      evaluatedCount: result.coverage.evaluatedCount,
      expectedInputRevision: Number(head.inputRevision),
      generatedAt: result.generatedAt,
      generationId: randomUUID(),
      horizonEndsAt: result.horizonEndsAt,
      scopeKey: head.scopeKey,
      workspaceId: head.workspaceId,
    };
  }
}
