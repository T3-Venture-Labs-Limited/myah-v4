import { Injectable } from '@nestjs/common';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignSentProjectionService } from 'src/modules/campaign-execution/services/campaign-sent-projection.service';
import { OutboundEmailDispatchService } from 'src/modules/campaign-execution/services/outbound-email-dispatch.service';
import { buildCampaignFinalEvidenceDigest } from 'src/modules/campaign-execution/utils/campaign-launch-proof.util';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? value[0]
    : Array.isArray(value)
      ? value
      : [];

@Injectable()
export class CampaignEmailRuntimeService {
  constructor(
    private readonly orm: GlobalWorkspaceOrmManager,
    private readonly progression: CampaignProgressionService,
    private readonly dispatch: OutboundEmailDispatchService,
    private readonly projection: CampaignSentProjectionService,
  ) {}

  async runDueOccurrences(): Promise<void> {
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    const work = records(
      await dataSource.query(
        `WITH pending AS (
           SELECT 'PENDING' AS kind,"workspaceId","campaignId",id,NULL::uuid AS "attemptId"
             FROM core."campaignOccurrence" WHERE state='PENDING' AND "dueAt" <= clock_timestamp()
             ORDER BY "dueAt",id LIMIT 100
         ), reserved AS (
           SELECT 'RESERVED' AS kind,a."workspaceId",a."campaignId",a."occurrenceId" AS id,a."attemptId"
             FROM core."outboundEmailAttempt" a JOIN core."campaignOccurrence" o ON o.id=a."occurrenceId"
            WHERE a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='RESERVED' AND o.state='IN_FLIGHT'
            ORDER BY a."unknownAfter",a."attemptId" LIMIT 100
         ), processing AS (
           SELECT 'PROCESSING' AS kind,a."workspaceId",a."campaignId",a."occurrenceId" AS id,a."attemptId"
             FROM core."outboundEmailAttempt" a JOIN core."campaignOccurrence" o ON o.id=a."occurrenceId"
            WHERE a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='PROCESSING' AND o.state='IN_FLIGHT'
            ORDER BY a."unknownAfter",a."attemptId" LIMIT 100
         ), accepted AS (
           SELECT 'ACCEPTED' AS kind,a."workspaceId",a."campaignId",a."occurrenceId" AS id,a."attemptId"
             FROM core."outboundEmailAttempt" a
            WHERE a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='ACCEPTED'
              AND (a."projectedMessageId" IS NULL OR a."projectedMessageThreadId" IS NULL
                OR EXISTS (SELECT 1 FROM core."campaignOccurrence" o WHERE o.id=a."occurrenceId" AND o.state <> 'SUCCEEDED'))
            ORDER BY a."providerAcceptedAt",a."attemptId" LIMIT 100
         ), definitelyUnaccepted AS (
           SELECT 'DEFINITELY_UNACCEPTED' AS kind,a."workspaceId",a."campaignId",a."occurrenceId" AS id,a."attemptId"
             FROM core."outboundEmailAttempt" a JOIN core."campaignOccurrence" o ON o.id=a."occurrenceId"
            WHERE a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='DEFINITELY_UNACCEPTED' AND o.state='IN_FLIGHT'
            ORDER BY a."updatedAt",a."attemptId" LIMIT 100
         ), unknown AS (
           SELECT 'UNKNOWN' AS kind,a."workspaceId",a."campaignId",a."occurrenceId" AS id,a."attemptId"
             FROM core."outboundEmailAttempt" a JOIN core."campaignOccurrence" o ON o.id=a."occurrenceId"
            WHERE a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='UNKNOWN' AND o.state='IN_FLIGHT'
            ORDER BY a."updatedAt",a."attemptId" LIMIT 100
         ), blocked AS (
           SELECT 'BLOCKED' AS kind,a."workspaceId",a."campaignId",a."occurrenceId" AS id,a."attemptId"
             FROM core."outboundEmailAttempt" a JOIN core."campaignOccurrence" o ON o.id=a."occurrenceId"
            WHERE a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"='BLOCKED' AND o.state='IN_FLIGHT'
            ORDER BY a."updatedAt",a."attemptId" LIMIT 100
         ) SELECT * FROM pending UNION ALL SELECT * FROM reserved UNION ALL SELECT * FROM processing UNION ALL SELECT * FROM accepted UNION ALL SELECT * FROM definitelyUnaccepted UNION ALL SELECT * FROM unknown UNION ALL SELECT * FROM blocked`,
      ),
    );
    for (const item of work) {
      try {
        if (item.kind === 'ACCEPTED') {
          await this.reconcileAcceptedAttempt(
            String(item.workspaceId),
            String(item.campaignId),
            String(item.attemptId),
          );
          continue;
        }
        if (item.kind === 'RESERVED') {
          await this.dispatchAttempt(
            String(item.workspaceId),
            String(item.campaignId),
            String(item.attemptId),
          );
          continue;
        }
        if (item.kind === 'PROCESSING') {
          await this.recoverProcessing(
            String(item.workspaceId),
            String(item.campaignId),
            String(item.attemptId),
          );
          continue;
        }
        if (item.kind === 'DEFINITELY_UNACCEPTED' || item.kind === 'UNKNOWN') {
          await this.reconcilePersistedOutcome(
            String(item.workspaceId),
            String(item.campaignId),
            String(item.attemptId),
            item.kind,
          );
          continue;
        }
        if (item.kind === 'BLOCKED') {
          await dataSource.transaction((manager) =>
            this.progression.holdOccurrenceInTransaction(
              String(item.id),
              'DISPATCH_CONTRACT_CONFLICT',
              manager,
            ),
          );
          continue;
        }
        const result = await dataSource.transaction((manager) =>
          this.progression.claimAndReserveDueOccurrenceInTransaction(
            {
              workspaceId: String(item.workspaceId),
              campaignId: String(item.campaignId),
              occurrenceId: String(item.id),
            },
            manager as never,
          ),
        );
        if (
          result.status === 'RESERVED' ||
          result.status === 'DISPATCHABLE_REPLAY'
        )
          await this.dispatchAttempt(
            String(item.workspaceId),
            String(item.campaignId),
            result.attemptId,
          );
      } catch (error) {
        // One bad occurrence must not prevent independently safe Campaign work.
        // oxlint-disable-next-line no-console
        console.error('Campaign email runtime item failed', error);
      }
    }
  }

  private async dispatchAttempt(
    workspaceId: string,
    campaignId: string,
    attemptId: string,
    expectedState: 'RESERVED' | 'PROCESSING' = 'RESERVED',
  ): Promise<void> {
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    const input = await dataSource.transaction(async (manager) => {
      const runner = manager.queryRunner;
      if (!runner?.isTransactionActive || runner.manager !== manager)
        throw new Error('Campaign runtime requires active manager');
      const rows = records(
        await runner.query(
          `SELECT a.*,r.subject,r.html,r.text,r."toRecipient",r."inReplyTo",r."threadExternalId",r.references,
                  ca.id AS "accountId",mc.id AS "channelId",act.id AS "activationId",act."campaignExecutionId",auth.generation AS "authorizationGeneration"
             FROM core."outboundEmailAttempt" a
             JOIN core."campaignOutboundRender" r ON r."attemptId"=a."attemptId" AND r."workspaceId"=a."workspaceId"
             JOIN core."connectedAccount" ca ON ca.id=a."connectedAccountId" AND ca."workspaceId"=a."workspaceId"
             JOIN core."messageChannel" mc ON mc.id=a."messageChannelId" AND mc."connectedAccountId"=ca.id AND mc."workspaceId"=a."workspaceId"
             JOIN core."campaignSequenceAuthorization" auth ON auth."authorizationId"=a."authorizationId" AND auth."workspaceId"=a."workspaceId" AND auth."campaignId"=a."campaignId"
             JOIN core."campaignActivation" act ON act."workspaceId"=a."workspaceId" AND act."campaignId"=a."campaignId"
                AND act."authorizationId"=a."authorizationId" AND act."authorizationGeneration"=auth.generation
                AND act."workflowVersionId"=a."workflowVersionId"
            WHERE a."attemptId"=$1 AND a."workspaceId"=$2 AND a."campaignId"=$3
              AND a.source='CAMPAIGN_SEQUENCE' AND a."attemptState"=$4
            FOR UPDATE OF a, r, ca, mc, act`,
          [attemptId, workspaceId, campaignId, expectedState],
        ),
      );
      if (rows.length !== 1) return null;
      const row = rows[0];
      const account = await manager
        .getRepository(ConnectedAccountEntity)
        .findOneByOrFail({
          id: String(row.connectedAccountId),
          workspaceId,
        });
      const references = Array.isArray(row.references) ? row.references : [];
      const claimedAt = new Date(String(row.claimedAt));
      const slotAt = new Date(String(row.slotAt));
      const unknownAfter = new Date(String(row.unknownAfter));
      if (
        [claimedAt, slotAt, unknownAfter].some((value) =>
          Number.isNaN(value.getTime()),
        )
      )
        throw new Error('Campaign runtime reservation timestamps were invalid');
      const reservationBinding = {
        attemptNumber: Number(row.attemptNumber),
        senderPoolFingerprint: String(row.senderPoolFingerprint),
        localDate: String(row.localDate),
        claimedAt,
        slotAt,
        unknownAfter,
        selectionConstraintKind: row.selectionConstraintKind,
        priorAcceptedEvidenceId: row.priorAcceptedEvidenceId,
      };
      const finalEvidenceDigest = buildCampaignFinalEvidenceDigest({
        reservation: {
          workspaceId,
          campaignId,
          campaignExecutionId: String(row.campaignExecutionId),
          authorizationId: String(row.authorizationId),
          authorizationGeneration: Number(row.authorizationGeneration),
          activationId: String(row.activationId),
          enrollmentId: String(row.enrollmentId),
          occurrenceId: String(row.occurrenceId),
          messageId: String(row.messageId),
          attemptId: String(row.attemptId),
          connectedAccountId: String(row.connectedAccountId),
          messageChannelId: String(row.messageChannelId),
          provider: String(row.provider),
          normalizedSenderHandle: String(row.normalizedSenderHandle),
          normalizedRecipient: String(row.normalizedRecipient),
          renderDigest: String(row.renderDigest),
          reservationBinding: {
            ...reservationBinding,
            claimedAt: claimedAt.toISOString(),
            slotAt: slotAt.toISOString(),
            unknownAfter: unknownAfter.toISOString(),
          },
        },
        material: {
          subject: String(row.subject),
          html: String(row.html),
          body: String(row.text),
          to: String(row.toRecipient),
          inReplyTo: row.inReplyTo ?? null,
          threadExternalId: row.threadExternalId ?? null,
          references,
          attachments: [],
        },
      });
      return {
        kind: 'CAMPAIGN_SEQUENCE_FINAL' as const,
        material: {
          connectedAccount: {
            id: account.id,
            workspaceId: account.workspaceId,
            handle: account.handle,
            provider: account.provider,
            ...(account.provider === ConnectedAccountProvider.IMAP_SMTP_CALDAV
              ? { connectionParameters: account.connectionParameters }
              : {}),
          } as ConnectedAccountEntity,
          projectedMessageId: computeCampaignProjectedMessageId(attemptId),
          sendMessageInput: {
            subject: String(row.subject),
            body: String(row.text),
            html: String(row.html),
            to: String(row.toRecipient),
            ...(row.inReplyTo === null
              ? {}
              : { inReplyTo: String(row.inReplyTo) }),
            ...(row.threadExternalId === null
              ? {}
              : { threadExternalId: String(row.threadExternalId) }),
            ...(references.length === 0
              ? {}
              : { references: references.map(String) }),
          },
        },
        submission: {
          attemptId,
          workspaceId,
          campaignId,
          campaignExecutionId: String(row.campaignExecutionId),
          authorizationId: String(row.authorizationId),
          authorizationGeneration: Number(row.authorizationGeneration),
          activationId: String(row.activationId),
          workflowVersionId: String(row.workflowVersionId),
          enrollmentId: String(row.enrollmentId),
          occurrenceId: String(row.occurrenceId),
          messageId: String(row.messageId),
          connectedAccountId: String(row.connectedAccountId),
          messageChannelId: String(row.messageChannelId),
          provider: String(row.provider),
          normalizedSenderHandle: String(row.normalizedSenderHandle),
          normalizedRecipient: String(row.normalizedRecipient),
          renderDigest: String(row.renderDigest),
          finalEvidenceDigest,
          source: 'CAMPAIGN_SEQUENCE' as const,
          submissionCapability: {
            kind: 'CAMPAIGN_SEQUENCE_SUBMISSION' as const,
            attemptId,
            campaignExecutionId: String(row.campaignExecutionId),
            authorizationGeneration: Number(row.authorizationGeneration),
            activationId: String(row.activationId),
            renderDigest: String(row.renderDigest),
            reservationBinding,
            renderContext: {
              workspaceId,
              campaignId,
              campaignExecutionId: String(row.campaignExecutionId),
              authorizationGeneration: Number(row.authorizationGeneration),
              activationId: String(row.activationId),
              enrollmentId: String(row.enrollmentId),
              occurrenceId: String(row.occurrenceId),
              authorizationId: String(row.authorizationId),
              workflowVersionId: String(row.workflowVersionId),
              messageId: String(row.messageId),
              connectedAccountId: String(row.connectedAccountId),
              messageChannelId: String(row.messageChannelId),
              provider: String(row.provider),
              normalizedSenderHandle: String(row.normalizedSenderHandle),
              normalizedRecipient: String(row.normalizedRecipient),
            },
          },
        },
      };
    });
    if (input === null) return;
    const result =
      expectedState === 'PROCESSING'
        ? await this.dispatch.recover({
            kind: 'AMBIGUOUS_EVIDENCE',
            submission: input.submission,
          } as never)
        : await this.dispatch.dispatch(input as never);
    const routing = {
      workspaceId,
      campaignId,
      campaignExecutionId: input.submission.campaignExecutionId,
      authorizationId: input.submission.authorizationId,
      authorizationGeneration: input.submission.authorizationGeneration,
      activationId: input.submission.activationId,
      workflowVersionId: input.submission.workflowVersionId,
      enrollmentId: input.submission.enrollmentId,
      occurrenceId: input.submission.occurrenceId,
      connectedAccountId: input.submission.connectedAccountId,
      messageChannelId: input.submission.messageChannelId,
      attemptId,
    };
    if (result.status === 'OUTCOME_RECOVERY_REQUIRED') {
      if (result.evidence.kind === 'UNPERSISTABLE_ACCEPTANCE_EVIDENCE') return;
      await this.routeDispatcherResult(
        await this.dispatch.recover(result.evidence),
        routing,
      );
      return;
    }
    await this.routeDispatcherResult(result, routing);
  }

  private async routeDispatcherResult(
    result: { status: string },
    routing: Parameters<
      CampaignProgressionService['reconcileAcceptedInTransaction']
    >[0],
  ): Promise<void> {
    if (result.status === 'ACCEPTED_RECORDED')
      return this.reconcileAccepted(routing);
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    if (result.status === 'DEFINITELY_UNACCEPTED_RECORDED') {
      await dataSource.transaction((manager) =>
        this.progression.reconcileDefinitelyUnacceptedInTransaction(
          routing,
          manager as never,
        ),
      );
    } else if (result.status === 'UNKNOWN_RECORDED') {
      await dataSource.transaction((manager) =>
        this.progression.reconcileUnknownInTransaction(
          routing,
          manager as never,
        ),
      );
    }
  }

  private async recoverProcessing(
    workspaceId: string,
    campaignId: string,
    attemptId: string,
  ): Promise<void> {
    await this.dispatchAttempt(
      workspaceId,
      campaignId,
      attemptId,
      'PROCESSING',
    );
  }

  private async reconcilePersistedOutcome(
    workspaceId: string,
    campaignId: string,
    attemptId: string,
    state: 'DEFINITELY_UNACCEPTED' | 'UNKNOWN',
  ): Promise<void> {
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    const rows = records(
      await dataSource.query(
        `SELECT a.*,act.id AS "activationId",act."campaignExecutionId",auth.generation AS "authorizationGeneration"
         FROM core."outboundEmailAttempt" a JOIN core."campaignSequenceAuthorization" auth ON auth."authorizationId"=a."authorizationId"
         JOIN core."campaignActivation" act ON act."workspaceId"=a."workspaceId" AND act."campaignId"=a."campaignId" AND act."authorizationId"=a."authorizationId" AND act."authorizationGeneration"=auth.generation AND act."workflowVersionId"=a."workflowVersionId"
        WHERE a."attemptId"=$1 AND a."workspaceId"=$2 AND a."campaignId"=$3 AND a."attemptState"=$4`,
        [attemptId, workspaceId, campaignId, state],
      ),
    );
    if (rows.length !== 1) return;
    const row = rows[0];
    const routing = {
      workspaceId,
      campaignId,
      attemptId,
      campaignExecutionId: String(row.campaignExecutionId),
      authorizationId: String(row.authorizationId),
      authorizationGeneration: Number(row.authorizationGeneration),
      activationId: String(row.activationId),
      workflowVersionId: String(row.workflowVersionId),
      enrollmentId: String(row.enrollmentId),
      occurrenceId: String(row.occurrenceId),
      connectedAccountId: String(row.connectedAccountId),
      messageChannelId: String(row.messageChannelId),
    };
    await dataSource.transaction(async (manager) => {
      if (state === 'UNKNOWN') {
        await this.progression.reconcileUnknownInTransaction(
          routing,
          manager as never,
        );
        return;
      }
      await this.progression.reconcileDefinitelyUnacceptedInTransaction(
        routing,
        manager as never,
      );
    });
  }

  private async reconcileAcceptedAttempt(
    workspaceId: string,
    campaignId: string,
    attemptId: string,
  ): Promise<void> {
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    const rows = records(
      await dataSource.query(
        `SELECT a.*,act.id AS "activationId",act."campaignExecutionId",auth.generation AS "authorizationGeneration"
         FROM core."outboundEmailAttempt" a JOIN core."campaignSequenceAuthorization" auth ON auth."authorizationId"=a."authorizationId"
         JOIN core."campaignActivation" act ON act."workspaceId"=a."workspaceId" AND act."campaignId"=a."campaignId" AND act."authorizationId"=a."authorizationId" AND act."authorizationGeneration"=auth.generation AND act."workflowVersionId"=a."workflowVersionId"
        WHERE a."attemptId"=$1 AND a."workspaceId"=$2 AND a."campaignId"=$3 AND a."attemptState"='ACCEPTED'`,
        [attemptId, workspaceId, campaignId],
      ),
    );
    if (rows.length !== 1) return;
    const row = rows[0];
    await this.reconcileAccepted({
      workspaceId,
      campaignId,
      attemptId,
      campaignExecutionId: String(row.campaignExecutionId),
      authorizationId: String(row.authorizationId),
      authorizationGeneration: Number(row.authorizationGeneration),
      activationId: String(row.activationId),
      workflowVersionId: String(row.workflowVersionId),
      enrollmentId: String(row.enrollmentId),
      occurrenceId: String(row.occurrenceId),
      connectedAccountId: String(row.connectedAccountId),
      messageChannelId: String(row.messageChannelId),
    });
  }

  private async reconcileAccepted(
    routing: Parameters<
      CampaignProgressionService['reconcileAcceptedInTransaction']
    >[0],
  ): Promise<void> {
    const projected = await this.projection.reconcile({
      workspaceId: routing.workspaceId,
      campaignId: routing.campaignId,
      connectedAccountId: routing.connectedAccountId,
      messageChannelId: routing.messageChannelId,
      attemptId: routing.attemptId,
    });
    if (projected === 'DEFERRED') return;
    const dataSource = await this.orm.getGlobalWorkspaceDataSource();
    await dataSource.transaction((manager) =>
      this.progression.reconcileAcceptedInTransaction(
        routing,
        manager as never,
      ),
    );
  }
}
