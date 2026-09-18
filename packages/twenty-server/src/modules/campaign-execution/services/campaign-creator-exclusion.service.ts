import { Injectable } from '@nestjs/common';
import { validate as uuidValidate } from 'uuid';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { CampaignLifecycleTransactionService } from 'src/modules/campaign-execution/services/campaign-lifecycle-transaction.service';
import { CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';
import {
  OUTBOUND_EMAIL_ATTEMPT_RECEIPT_PROJECTION,
  OutboundEmailAttemptService,
} from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import { type OutboundEmailAttemptReservationIdentity } from 'src/modules/campaign-execution/types/outbound-email-attempt.type';

type ExclusionResult = Readonly<{
  status: 'EXCLUDED' | 'REPLAYED';
  excludedAt: string;
  mayStillSend: boolean;
}>;

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) && Array.isArray(value[0])
    ? value[0]
    : Array.isArray(value)
      ? value
      : [];

@Injectable()
export class CampaignCreatorExclusionService {
  constructor(
    private readonly transaction: CampaignLifecycleTransactionService,
    private readonly timelineEventWriter: CampaignTimelineEventWriterService,
    private readonly attemptService?: OutboundEmailAttemptService,
  ) {}

  async exclude(input: {
    workspaceId: string;
    campaignId: string;
    campaignCreatorId: string;
    reason: string;
    authContext: WorkspaceAuthContext;
  }): Promise<ExclusionResult> {
    if (
      !uuidValidate(input.campaignCreatorId) ||
      input.reason.trim().length === 0 ||
      input.reason.trim().length > 500
    )
      throw new Error('Campaign Creator exclusion input was invalid');

    return this.transaction.run(input, async (context) => {
      const runner = context.manager.queryRunner;
      if (!runner?.isTransactionActive || runner.manager !== context.manager)
        throw new Error('Campaign Creator exclusion requires the transaction');
      const authContext = context.actorPermissionContext.authContext;
      if (
        !('workspaceMemberId' in authContext) ||
        !authContext.workspaceMemberId
      )
        throw new Error(
          'Campaign Creator exclusion requires a workspace member',
        );

      const creatorRows = rows(
        await runner.query(
          `SELECT id, "creatorId", stage, "excludedAt"
             FROM "${context.schemaName}"."campaignCreator"
            WHERE id=$1 AND "campaignId"=$2
            FOR UPDATE`,
          [input.campaignCreatorId, context.campaignId],
        ),
      );
      if (creatorRows.length !== 1)
        throw new Error('Campaign Creator was not found in Campaign');

      const enrollmentRows = rows(
        await runner.query(
          `SELECT id FROM core."campaignEnrollment"
            WHERE "workspaceId"=$1 AND "campaignId"=$2 AND "campaignCreatorId"=$3
            ORDER BY id FOR UPDATE`,
          [context.workspaceId, context.campaignId, input.campaignCreatorId],
        ),
      );
      await runner.query(
        `SELECT o.id FROM core."campaignOccurrence" o
          JOIN core."campaignEnrollment" e ON e.id=o."enrollmentId"
         WHERE e."workspaceId"=$1 AND e."campaignId"=$2 AND e."campaignCreatorId"=$3
         ORDER BY o.id FOR UPDATE OF o`,
        [context.workspaceId, context.campaignId, input.campaignCreatorId],
      );
      const attempts = rows(
        await runner.query(
          `SELECT ${OUTBOUND_EMAIL_ATTEMPT_RECEIPT_PROJECTION}
             FROM core."outboundEmailAttempt" a
             JOIN core."campaignEnrollment" e ON e.id=a."enrollmentId"
            WHERE e."workspaceId"=$1 AND e."campaignId"=$2 AND e."campaignCreatorId"=$3
            ORDER BY a."attemptId" FOR UPDATE OF a`,
          [context.workspaceId, context.campaignId, input.campaignCreatorId],
        ),
      );
      const mayStillSend = attempts.some((attempt) =>
        ['PROCESSING', 'UNKNOWN'].includes(String(attempt.attemptState)),
      );
      const existingExcludedAt = creatorRows[0].excludedAt;
      if (existingExcludedAt) {
        return {
          status: 'REPLAYED',
          excludedAt: new Date(String(existingExcludedAt)).toISOString(),
          mayStillSend,
        };
      }

      const observedRows = rows(
        await runner.query('SELECT clock_timestamp() AS "observedAt"'),
      );
      const excludedAt = new Date(String(observedRows[0]?.observedAt));
      if (!Number.isFinite(excludedAt.getTime()))
        throw new Error('Campaign Creator exclusion timestamp was invalid');

      await runner.query(
        `UPDATE "${context.schemaName}"."campaignCreator"
            SET "excludedAt"=$3, "excludedByWorkspaceMemberId"=$4,
                "exclusionReason"=$5,
                stage=CASE WHEN stage IN ('READY','CONTACTED') THEN 'DROPPED' ELSE stage END,
                "outcomeSummary"=$5
          WHERE id=$1 AND "campaignId"=$2 AND "excludedAt" IS NULL`,
        [
          input.campaignCreatorId,
          context.campaignId,
          excludedAt,
          authContext.workspaceMemberId,
          input.reason.trim(),
        ],
      );
      const reservedAttempts = attempts.filter(
        (attempt) => attempt.attemptState === 'RESERVED',
      );
      if (reservedAttempts.length > 0 && !this.attemptService)
        throw new Error('Campaign exclusion attempt service unavailable');
      for (const attempt of reservedAttempts) {
        const blocked =
          await this.attemptService?.blockReservedAttemptBeforeProvider(
            {
              reservation: this.reservationIdentity(attempt),
              reason: 'OCCURRENCE_CANCELLED',
            },
            context.manager,
          );
        if (
          blocked?.status !== 'RECORDED' &&
          blocked?.status !== 'EXACT_REPLAY'
        )
          throw new Error('Campaign exclusion reserved attempt block failed');
      }

      await runner.query(
        `UPDATE core."campaignOccurrence" o
            SET state='CANCELLED', "holdReason"=NULL, "terminalReason"='OPERATOR_EXCLUDED',
                "terminalAt"=$4, "updatedAt"=clock_timestamp()
           FROM core."campaignEnrollment" e
          WHERE o."enrollmentId"=e.id AND e."workspaceId"=$1
            AND e."campaignId"=$2 AND e."campaignCreatorId"=$3
            AND o.state IN ('PENDING','IN_FLIGHT','HELD')
            AND NOT EXISTS (
              SELECT 1 FROM core."outboundEmailAttempt" a
               WHERE a."occurrenceId"=o.id
                 AND a."attemptState" IN ('PROCESSING','UNKNOWN','ACCEPTED')
            )`,
        [
          context.workspaceId,
          context.campaignId,
          input.campaignCreatorId,
          excludedAt,
        ],
      );
      await runner.query(
        `UPDATE core."campaignEnrollment"
            SET state='EXCLUDED', "holdReason"=NULL,
                "terminalReason"='OPERATOR_EXCLUDED', "terminalAt"=$4,
                "updatedAt"=clock_timestamp()
          WHERE "workspaceId"=$1 AND "campaignId"=$2
            AND "campaignCreatorId"=$3 AND state='ACTIVE'`,
        [
          context.workspaceId,
          context.campaignId,
          input.campaignCreatorId,
          excludedAt,
        ],
      );

      await this.timelineEventWriter.writeInTransaction(context, {
        businessEventKey: `exclusion:${input.campaignCreatorId}:${excludedAt.toISOString()}`,
        eventKind: 'EXCLUDED',
        happenedAt: excludedAt.toISOString(),
        sourceId: input.campaignCreatorId,
        sourceType: 'CAMPAIGN_CREATOR',
        creatorId: String(creatorRows[0].creatorId),
        reason: input.reason.trim(),
        ...(['READY', 'CONTACTED'].includes(String(creatorRows[0].stage))
          ? { stageValue: 'DROPPED', stageLabel: 'Dropped' }
          : {}),
      });

      if (enrollmentRows.length === 0 && attempts.length > 0)
        throw new Error('Campaign exclusion attempt graph was inconsistent');

      return {
        status: 'EXCLUDED',
        excludedAt: excludedAt.toISOString(),
        mayStillSend,
      };
    });
  }

  private reservationIdentity(
    row: Record<string, unknown>,
  ): OutboundEmailAttemptReservationIdentity {
    if (row.source !== 'CAMPAIGN_SEQUENCE')
      throw new Error('Campaign exclusion reservation source is invalid');
    const common = {
      attemptId: String(row.attemptId),
      attemptNumber: Number(row.attemptNumber),
      authorizationId: String(row.authorizationId),
      campaignId: String(row.campaignId),
      claimedAt: new Date(String(row.claimedAt)),
      connectedAccountId: String(row.connectedAccountId),
      enrollmentId: String(row.enrollmentId),
      localDate: String(row.localDate),
      messageChannelId: String(row.messageChannelId),
      messageId: String(row.messageId),
      normalizedRecipient: String(row.normalizedRecipient),
      normalizedSenderHandle: String(row.normalizedSenderHandle),
      occurrenceId: String(row.occurrenceId),
      provider: String(row.provider),
      renderDigest: String(row.renderDigest),
      reservationEvidence: { kind: 'CAMPAIGN_SEQUENCE_RESERVATION' as const },
      senderPoolFingerprint: String(row.senderPoolFingerprint),
      slotAt: new Date(String(row.slotAt)),
      source: 'CAMPAIGN_SEQUENCE' as const,
      unknownAfter: new Date(String(row.unknownAfter)),
      workflowVersionId: String(row.workflowVersionId),
      workspaceId: String(row.workspaceId),
    };
    return row.selectionConstraintKind === 'PINNED_REPLY'
      ? {
          ...common,
          selectionConstraintKind: 'PINNED_REPLY',
          priorAcceptedEvidenceId: String(row.priorAcceptedEvidenceId),
        }
      : {
          ...common,
          selectionConstraintKind: 'ROTATE',
          priorAcceptedEvidenceId: null,
        };
  }
}
