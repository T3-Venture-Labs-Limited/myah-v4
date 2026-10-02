import { Injectable, Optional } from '@nestjs/common';

import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? value[0]
    : Array.isArray(value)
      ? value
      : [];

@Injectable()
export class CampaignReplyService {
  constructor(
    private readonly progression: CampaignProgressionService,
    @Optional()
    private readonly timelineEventWriter?: CampaignTimelineEventWriterService,
    private readonly myahInboxContactTriageLifecycleService?: MyahInboxContactTriageLifecycleService,
  ) {}

  async prepareInboundCandidateCreatorsInTransaction(
    input: {
      workspaceId: string;
      messageChannelId: string;
      candidates: Array<{ threadExternalId: string; normalizedSender: string }>;
    },
    manager: WorkspaceEntityManager,
  ): Promise<string[]> {
    const runner = manager.queryRunner;
    if (!runner?.isTransactionActive || runner.manager !== manager)
      throw new Error('Campaign reply preflight requires active manager');
    const candidates = input.candidates
      .map((candidate) => ({
        threadExternalId: candidate.threadExternalId.trim(),
        normalizedSender: candidate.normalizedSender.trim().toLowerCase(),
      }))
      .filter(
        (candidate) => candidate.threadExternalId && candidate.normalizedSender,
      );
    if (candidates.length === 0) return [];

    const attempts = rows(
      await runner.query(
        `SELECT a."attemptId",e."creatorId"
         FROM core."outboundEmailAttempt" a
         JOIN core."campaignEnrollment" e ON e.id=a."enrollmentId" AND e."workspaceId"=a."workspaceId"
         LEFT JOIN core."campaignOutboundRender" r ON r."attemptId"=a."attemptId"
        WHERE a."workspaceId"=$1 AND a."messageChannelId"=$2 AND a.source='CAMPAIGN_SEQUENCE'
          AND a."attemptState" IN ('PROCESSING','UNKNOWN','ACCEPTED')
          AND EXISTS (
            SELECT 1 FROM unnest($3::text[],$4::text[]) AS inbound(thread,sender)
             WHERE a."normalizedRecipient"=inbound.sender
               AND (a."resolvedThreadExternalId"=inbound.thread OR r."threadExternalId"=inbound.thread
                 OR (a."resolvedThreadExternalId" IS NULL AND r."threadExternalId" IS NULL))
          )
        ORDER BY a."attemptId" FOR UPDATE OF a,e`,
        [
          input.workspaceId,
          input.messageChannelId,
          candidates.map((candidate) => candidate.threadExternalId),
          candidates.map((candidate) => candidate.normalizedSender),
        ],
      ),
    );
    return [
      ...new Set(attempts.map((attempt) => String(attempt.creatorId))),
    ].sort();
  }

  async reconcilePendingMessageInTransaction(
    input: { workspaceId: string; inboundEvidenceId: string },
    manager: WorkspaceEntityManager,
  ): Promise<void> {
    const runner = manager.queryRunner;
    if (!runner?.isTransactionActive || runner.manager !== manager)
      throw new Error(
        'Pending Campaign reply reconciliation requires active manager',
      );
    const preview = rows(
      await runner.query(
        `SELECT "messageChannelId","messageThreadId","threadExternalId","normalizedSender"
         FROM core."myahCampaignReplyPending" WHERE "workspaceId"=$1 AND "messageId"=$2`,
        [input.workspaceId, input.inboundEvidenceId],
      ),
    )[0];
    if (!preview) return;
    const workspaceSchema = getWorkspaceSchemaName(input.workspaceId);
    const [triageSchema] = rows(
      await runner.query('SELECT to_regclass($1) IS NOT NULL AS "ready"', [
        `${workspaceSchema}."myahInboxTriageMigration"`,
      ]),
    );
    if (triageSchema?.ready === true) {
      await runner.query("SELECT set_config('search_path', $1, true)", [
        workspaceSchema,
      ]);
      const [marker] = rows(
        await runner.query(
          'SELECT status FROM "myahInboxTriageMigration" WHERE id=true',
        ),
      );
      // Baseline reconciliation owns the marker while MIGRATING. Keep the
      // pending proof for a later READY tick instead of taking source locks.
      if (marker?.status !== 'READY') return;
    }
    const candidateCreatorIds =
      await this.prepareInboundCandidateCreatorsInTransaction(
        {
          workspaceId: input.workspaceId,
          messageChannelId: String(preview.messageChannelId),
          candidates: [
            {
              threadExternalId: String(preview.threadExternalId),
              normalizedSender: String(preview.normalizedSender),
            },
          ],
        },
        manager,
      );
    await runner.query("SELECT set_config('search_path', $1, true)", [
      getWorkspaceSchemaName(input.workspaceId),
    ]);
    const [thread] = rows(
      await runner.query(
        'SELECT "creatorId" FROM "messageThread" WHERE id=$1',
        [preview.messageThreadId],
      ),
    );
    const coveredCreatorIds = [
      ...new Set([
        ...candidateCreatorIds,
        ...(thread?.creatorId ? [String(thread.creatorId)] : []),
      ]),
    ].sort();
    const reconcile = async () => {
      const pending = rows(
        await runner.query(
          `SELECT * FROM core."myahCampaignReplyPending"
          WHERE "workspaceId"=$1 AND "messageId"=$2 FOR UPDATE SKIP LOCKED`,
          [input.workspaceId, input.inboundEvidenceId],
        ),
      )[0];
      if (
        !pending ||
        pending.messageChannelId !== preview.messageChannelId ||
        pending.messageThreadId !== preview.messageThreadId ||
        pending.threadExternalId !== preview.threadExternalId ||
        pending.normalizedSender !== preview.normalizedSender
      )
        return;

      await this.reconcileInboundMessageInTransaction(
        {
          workspaceId: input.workspaceId,
          inboundEvidenceId: input.inboundEvidenceId,
          inboundMessageThreadId: String(pending.messageThreadId),
          messageChannelId: String(pending.messageChannelId),
          threadExternalId: String(pending.threadExternalId),
          fromHandle: String(pending.normalizedSender),
          inReplyToTokens: Array.isArray(pending.inReplyToHeaderMessageIds)
            ? pending.inReplyToHeaderMessageIds.map(String)
            : [],
          coveredCreatorIds,
        },
        manager,
      );

      const [state] = rows(
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await runner.query(
          `SELECT ev."classification", EXISTS (
           SELECT 1 FROM core."outboundEmailAttempt" a
           LEFT JOIN core."campaignOutboundRender" r ON r."attemptId"=a."attemptId"
            WHERE a."workspaceId"=p."workspaceId" AND a."messageChannelId"=p."messageChannelId"
              AND a.source='CAMPAIGN_SEQUENCE' AND a."normalizedRecipient"=p."normalizedSender"
              AND a."attemptState" IN ('PROCESSING','UNKNOWN')
              AND (a."resolvedThreadExternalId"=p."threadExternalId"
                OR r."threadExternalId"=p."threadExternalId"
                OR (a."resolvedThreadExternalId" IS NULL AND r."threadExternalId" IS NULL))
         ) AS "hasUnresolved", (
           SELECT count(*)::int FROM (
             SELECT DISTINCT a."campaignId",a."enrollmentId"
               FROM core."outboundEmailAttempt" a
               JOIN "${workspaceSchema}".message inbound
                 ON inbound.id=p."messageId" AND inbound."messageThreadId"=p."messageThreadId"
                AND inbound."deletedAt" IS NULL
              WHERE a."workspaceId"=p."workspaceId" AND a."messageChannelId"=p."messageChannelId"
                AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'
                AND a."resolvedThreadExternalId"=p."threadExternalId"
                AND a."normalizedRecipient"=p."normalizedSender"
           ) acceptedGroups
         ) AS "acceptedGroupCount", EXISTS (
           SELECT 1 FROM core."outboundEmailAttempt" a
           JOIN "${workspaceSchema}".message inbound
             ON inbound.id=p."messageId" AND inbound."messageThreadId"=p."messageThreadId"
            AND inbound."deletedAt" IS NULL
          WHERE a."workspaceId"=p."workspaceId" AND a."messageChannelId"=p."messageChannelId"
            AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'
            AND a."resolvedThreadExternalId"=p."threadExternalId"
            AND a."normalizedRecipient"=p."normalizedSender"
            AND (inbound."receivedAt">=a."providerAcceptedAt"
              OR (a."providerHeaderMessageId"=ANY(p."inReplyToHeaderMessageIds")
                AND 1=(SELECT count(*) FROM core."outboundEmailAttempt" parent
                  WHERE parent."workspaceId"=a."workspaceId"
                    AND parent."messageChannelId"=a."messageChannelId"
                    AND parent.source='CAMPAIGN_SEQUENCE' AND parent."attemptState"='ACCEPTED'
                    AND parent."resolvedThreadExternalId"=a."resolvedThreadExternalId"
                    AND parent."normalizedRecipient"=a."normalizedRecipient"
                    AND parent."providerHeaderMessageId"=ANY(p."inReplyToHeaderMessageIds"))))
         ) AS "hasEligibleAccepted"
           FROM core."myahCampaignReplyPending" p
           LEFT JOIN core."myahCampaignReplyEvidence" ev
             ON ev."workspaceId"=p."workspaceId" AND ev."inboundMessageId"=p."messageId"
          WHERE p."workspaceId"=$1 AND p."messageId"=$2`,
          [input.workspaceId, input.inboundEvidenceId],
        ),
      );
      if (
        state?.hasUnresolved === false &&
        (state.classification === 'EXACT' ||
          state.classification === 'THREAD' ||
          Number(state.acceptedGroupCount) !== 1 ||
          state.hasEligibleAccepted === false)
      ) {
        await runner.query(
          `DELETE FROM core."myahCampaignReplyPending" WHERE "workspaceId"=$1 AND "messageId"=$2`,
          [input.workspaceId, input.inboundEvidenceId],
        );
      } else {
        // Rotate ambiguous work behind other pending rows instead of starving them.
        await runner.query(
          `UPDATE core."myahCampaignReplyPending" SET "updatedAt"=clock_timestamp()
          WHERE "workspaceId"=$1 AND "messageId"=$2`,
          [input.workspaceId, input.inboundEvidenceId],
        );
      }
    };
    if (this.myahInboxContactTriageLifecycleService) {
      await this.myahInboxContactTriageLifecycleService.withCreatorMutationLocksInTransaction(
        {
          creatorIds: coveredCreatorIds,
          manager,
          mutate: reconcile,
        },
      );
    } else {
      await reconcile();
    }
  }

  async reconcileInboundMessageInTransaction(
    input: {
      workspaceId: string;
      messageChannelId: string;
      threadExternalId: string;
      fromHandle: string;
      inboundEvidenceId: string;
      inboundMessageThreadId: string;
      inReplyToTokens?: string[];
      coveredCreatorIds?: string[];
      skipProgression?: boolean;
    },
    manager: WorkspaceEntityManager,
  ): Promise<void> {
    const runner = manager.queryRunner;
    if (!runner?.isTransactionActive || runner.manager !== manager)
      throw new Error('Campaign reply reconciliation requires active manager');
    const from = input.fromHandle.trim().toLowerCase();
    if (!from || !input.threadExternalId.trim()) return;
    // UUID-derived schema identifier; message timestamps are provider data.
    const schemaName = getWorkspaceSchemaName(input.workspaceId);

    // Older workspaces continue importing mail until the additive schema is applied.
    const evidenceReady =
      rows(
        await runner.query(
          `SELECT to_regclass('core."myahCampaignReplyEvidence"') IS NOT NULL AS "exists"`,
        ),
      )[0]?.exists === true;
    let exactParentAttemptId: string | null = null;
    if (evidenceReady) {
      const parentTokens = [
        ...new Set(
          (input.inReplyToTokens ?? [])
            .map((token) => token.trim())
            .filter(Boolean),
        ),
      ];
      // A provider can commit the reply before the outgoing attempt's accepted
      // receipt commits. Keep its facts even when an older accepted send matches
      // this thread; acceptance and Inbox replay remain separate transactions.
      const unresolved = rows(
        await runner.query(
          `SELECT a."attemptId"
           FROM core."outboundEmailAttempt" a
           JOIN core."campaignEnrollment" e ON e.id=a."enrollmentId" AND e."workspaceId"=a."workspaceId"
           LEFT JOIN core."campaignOutboundRender" r ON r."attemptId"=a."attemptId"
          WHERE a."workspaceId"=$1 AND a."messageChannelId"=$2
            AND a.source='CAMPAIGN_SEQUENCE'
            AND a."attemptState" IN ('PROCESSING','UNKNOWN')
            AND a."normalizedRecipient"=$4
            AND (a."resolvedThreadExternalId"=$3 OR r."threadExternalId"=$3
              OR (a."resolvedThreadExternalId" IS NULL AND r."threadExternalId" IS NULL))
          ORDER BY a."attemptId" LIMIT 65 FOR UPDATE OF a,e`,
          [
            input.workspaceId,
            input.messageChannelId,
            input.threadExternalId,
            from,
          ],
        ),
      );
      if (unresolved.length > 0) {
        // Historical backfill has evidence authority only: a pending row would
        // later replay without skipProgression and advance live Campaign state.
        if (input.skipProgression) return;
        await runner.query(
          `INSERT INTO core."myahCampaignReplyPending" (
             "workspaceId","messageId","messageThreadId","messageChannelId",
             "threadExternalId","normalizedSender","inReplyToHeaderMessageIds",
             "candidateAttemptIds","candidateOverflow"
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT ("workspaceId","messageId") DO UPDATE SET
             "inReplyToHeaderMessageIds"=ARRAY(
               SELECT DISTINCT token FROM unnest(
                 "myahCampaignReplyPending"."inReplyToHeaderMessageIds" || EXCLUDED."inReplyToHeaderMessageIds"
               ) AS token ORDER BY token
             ),
             "candidateAttemptIds"=ARRAY(
               SELECT DISTINCT id FROM unnest(
                 "myahCampaignReplyPending"."candidateAttemptIds" || EXCLUDED."candidateAttemptIds"
               ) AS id ORDER BY id LIMIT 64
             ),
             "candidateOverflow"="myahCampaignReplyPending"."candidateOverflow" OR EXCLUDED."candidateOverflow"
               OR (SELECT count(DISTINCT id)>64 FROM unnest(
                 "myahCampaignReplyPending"."candidateAttemptIds" || EXCLUDED."candidateAttemptIds"
               ) AS id),
             "updatedAt"=clock_timestamp()
           WHERE "myahCampaignReplyPending"."messageThreadId"=EXCLUDED."messageThreadId"
             AND "myahCampaignReplyPending"."messageChannelId"=EXCLUDED."messageChannelId"
             AND "myahCampaignReplyPending"."threadExternalId"=EXCLUDED."threadExternalId"
             AND "myahCampaignReplyPending"."normalizedSender"=EXCLUDED."normalizedSender"`,
          [
            input.workspaceId,
            input.inboundEvidenceId,
            input.inboundMessageThreadId,
            input.messageChannelId,
            input.threadExternalId,
            from,
            parentTokens,
            unresolved.slice(0, 64).map((attempt) => String(attempt.attemptId)),
            unresolved.length > 64,
          ],
        );
        // Defer both Inbox attribution and ACTIVE reply progression until all
        // plausible sends settle; replay owns the eventual decision.
        return;
      }
      const accepted = rows(
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await runner.query(
          `SELECT a."workspaceId",a."campaignId",a."enrollmentId",a."attemptId",a."providerHeaderMessageId",e."creatorId",
              inbound."receivedAt">=a."providerAcceptedAt" AS "afterAcceptance"
           FROM core."outboundEmailAttempt" a
           JOIN core."campaignEnrollment" e ON e.id=a."enrollmentId" AND e."workspaceId"=a."workspaceId"
           JOIN "${schemaName}".message inbound ON inbound.id=$5 AND inbound."messageThreadId"=$6
             AND inbound."deletedAt" IS NULL
          WHERE a."workspaceId"=$1 AND a."messageChannelId"=$2 AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'
            AND a."resolvedThreadExternalId"=$3 AND a."normalizedRecipient"=$4
          FOR UPDATE OF a,e`,
          [
            input.workspaceId,
            input.messageChannelId,
            input.threadExternalId,
            from,
            input.inboundEvidenceId,
            input.inboundMessageThreadId,
          ],
        ),
      );
      const candidates = new Set(
        accepted.map(
          (attempt) => `${attempt.campaignId}:${attempt.enrollmentId}`,
        ),
      );
      const parentTokenSet = new Set(parentTokens);
      const parents = accepted.filter(
        (attempt) =>
          typeof attempt.providerHeaderMessageId === 'string' &&
          parentTokenSet.has(attempt.providerHeaderMessageId.trim()),
      );
      // An exact parent proves the send preceded this reply even if recovery
      // recorded its ACCEPTED receipt after the provider's inbound timestamp.
      const exactParent = parents.length === 1 ? parents[0] : null;
      exactParentAttemptId = exactParent ? String(exactParent.attemptId) : null;
      const attempt =
        exactParent ??
        accepted.find((candidate) => candidate.afterAcceptance === true);
      if (candidates.size === 1 && attempt) {
        await runner.query(
          `INSERT INTO core."myahCampaignReplyEvidence" (
             "workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","creatorId","classification","matchedAttemptId"
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT ("workspaceId","inboundMessageId") DO UPDATE SET
             "classification"=CASE WHEN "myahCampaignReplyEvidence"."classification"='THREAD' AND EXCLUDED."classification"='EXACT' THEN 'EXACT' ELSE "myahCampaignReplyEvidence"."classification" END,
             "matchedAttemptId"=CASE WHEN "myahCampaignReplyEvidence"."classification"='THREAD' AND EXCLUDED."classification"='EXACT' THEN EXCLUDED."matchedAttemptId" ELSE "myahCampaignReplyEvidence"."matchedAttemptId" END
           WHERE "myahCampaignReplyEvidence"."campaignId"=EXCLUDED."campaignId"
             AND "myahCampaignReplyEvidence"."enrollmentId"=EXCLUDED."enrollmentId"
             AND "myahCampaignReplyEvidence"."classification"='THREAD'
             AND EXCLUDED."classification"='EXACT'`,
          [
            input.workspaceId,
            input.inboundEvidenceId,
            input.messageChannelId,
            attempt.campaignId,
            attempt.enrollmentId,
            attempt.creatorId,
            exactParent ? 'EXACT' : 'THREAD',
            exactParent?.attemptId ?? null,
          ],
        );
        const triageReady =
          rows(
            await runner.query(
              'SELECT to_regclass($1) IS NOT NULL AS "ready"',
              [
                `${getWorkspaceSchemaName(input.workspaceId)}."myahInboxTriageMigration"`,
              ],
            ),
          )[0]?.ready === true;
        if (triageReady && this.myahInboxContactTriageLifecycleService) {
          await this.myahInboxContactTriageLifecycleService.withPreparedSourceMutationInTransaction(
            {
              workspaceId: input.workspaceId,
              sourceType: 'EMAIL_THREAD',
              sourceRecordIds: [input.inboundMessageThreadId],
              nextCreatorIds: [String(attempt.creatorId)],
              coveredCreatorIds: input.coveredCreatorIds,
              manager,
              mutate: async () => {
                await runner.query(
                  `UPDATE "messageThread"
                    SET "creatorId"=COALESCE("creatorId",$1),
                        "myahCampaignId"=COALESCE("myahCampaignId",$2)
                  WHERE id=$3
                    AND ("creatorId" IS NULL OR "creatorId"=$1)
                    AND ("myahCampaignId" IS NULL OR "myahCampaignId"=$2)
                    AND ("creatorId" IS NULL OR "myahCampaignId" IS NULL)
                    AND EXISTS (
                      SELECT 1 FROM core."myahCampaignReplyEvidence" ev
                       WHERE ev."workspaceId"=$4 AND ev."inboundMessageId"=$5
                         AND ev."messageChannelId"=$6 AND ev."creatorId"=$1
                         AND ev."campaignId"=$2 AND ev."enrollmentId"=$7
                    )`,
                  [
                    attempt.creatorId,
                    attempt.campaignId,
                    input.inboundMessageThreadId,
                    input.workspaceId,
                    input.inboundEvidenceId,
                    input.messageChannelId,
                    attempt.enrollmentId,
                  ],
                );
              },
            },
          );
        }
      }
      if (candidates.size !== 1 || !attempt) return;
    }
    if (input.skipProgression) return;
    const matches = rows(
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await runner.query(
        `SELECT a."workspaceId",a."campaignId",a."enrollmentId",a."authorizationId",auth.generation AS "authorizationGeneration",act.id AS "activationId",a."workflowVersionId",a."occurrenceId",a."connectedAccountId",a."messageChannelId",a."attemptId",e."campaignCreatorId",e."creatorId"
         FROM core."outboundEmailAttempt" a
         JOIN core."campaignEnrollment" e ON e.id=a."enrollmentId" AND e."workspaceId"=a."workspaceId" AND e.state='ACTIVE'
         JOIN core."campaignSequenceAuthorization" auth ON auth."authorizationId"=a."authorizationId" AND auth."workspaceId"=a."workspaceId" AND auth."campaignId"=a."campaignId"
         JOIN core."campaignActivation" act ON act."workspaceId"=a."workspaceId" AND act."campaignId"=a."campaignId" AND act."authorizationId"=a."authorizationId" AND act."authorizationGeneration"=auth.generation AND act."workflowVersionId"=a."workflowVersionId"
         JOIN "${schemaName}".message inbound ON inbound.id=$5 AND inbound."messageThreadId"=$6
           AND inbound."deletedAt" IS NULL
        WHERE a."workspaceId"=$1 AND a."messageChannelId"=$2 AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'
          AND a."resolvedThreadExternalId"=$3 AND a."normalizedRecipient"=$4
          AND (inbound."receivedAt">=a."providerAcceptedAt" OR a."attemptId"=$7)
        FOR UPDATE OF a,e,auth,act`,
        [
          input.workspaceId,
          input.messageChannelId,
          input.threadExternalId,
          from,
          input.inboundEvidenceId,
          input.inboundMessageThreadId,
          exactParentAttemptId,
        ],
      ),
    );
    const unique = new Map(
      matches.map((match) => [
        `${match.workspaceId}:${match.campaignId}:${match.enrollmentId}:${match.messageChannelId}`,
        match,
      ]),
    );
    if (unique.size !== 1) return;
    const match = [...unique.values()][0];
    const result = await this.progression.terminalizeReplyInTransaction(
      {
        workspaceId: String(match.workspaceId),
        campaignId: String(match.campaignId),
        enrollmentId: String(match.enrollmentId),
        inboundEvidenceId: input.inboundEvidenceId,
      },
      manager,
    );
    if (result.status === 'EXACT_REPLAY') return;
    // Workspace schema identifiers are UUID-derived and cannot be bind parameters.
    const stageUpdates = rows(
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await runner.query(
        `UPDATE "${schemaName}"."campaignCreator"
         SET stage='NEGOTIATING', "updatedAt"=clock_timestamp()
         WHERE id=$1 AND "campaignId"=$2
           AND stage IN ('READY', 'CONTACTED') AND "deletedAt" IS NULL
         RETURNING id`,
        [match.campaignCreatorId, match.campaignId],
      ),
    );
    if (stageUpdates.length === 1 && this.timelineEventWriter) {
      const happenedAtRows = rows(
        await runner.query('SELECT clock_timestamp() AS "happenedAt"'),
      );
      const happenedAt = new Date(
        String(happenedAtRows[0]?.happenedAt),
      ).toISOString();
      await this.timelineEventWriter.writeInTransaction(
        {
          manager,
          workspaceId: input.workspaceId,
          campaignId: String(match.campaignId),
        },
        {
          businessEventKey: `reply-stage:${input.inboundEvidenceId}:NEGOTIATING`,
          eventKind: 'STAGE_CHANGED',
          happenedAt,
          sourceId: input.inboundEvidenceId,
          sourceType: 'MESSAGE',
          creatorId: String(match.creatorId),
          messageId: input.inboundEvidenceId,
          stageValue: 'NEGOTIATING',
          stageLabel: 'Negotiating',
        },
      );
    }
  }
}
