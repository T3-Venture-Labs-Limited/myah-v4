import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { type QueryRunner } from 'typeorm';
import { validate as uuidValidate } from 'uuid';

import { isValidCampaignSequenceAttemptHistoryRow } from 'src/modules/campaign-execution/adapters/campaign-progression-history-reader.adapter';
import {
  type CampaignActivationGraph,
  type CampaignActivationRecord,
  type CampaignExecutionPersistencePort,
  type CampaignExecutionRecord,
} from 'src/modules/campaign-execution/types/campaign-execution.type';
import { CampaignTimelineEventWriterService } from 'src/modules/campaign-execution/services/campaign-timeline-event-writer.service';
import { type LockedCampaignLifecycleContext } from 'src/modules/campaign-execution/types/campaign-lifecycle-transaction.type';

type DataRow = Readonly<Record<string, unknown>>;
type StructuredResult = Readonly<{
  affected?: unknown;
  records?: unknown;
}>;

const runnerFor = (context: LockedCampaignLifecycleContext): QueryRunner => {
  const runner = context.manager.queryRunner;

  if (
    !runner ||
    !runner.isTransactionActive ||
    runner.isReleased ||
    runner.manager !== context.manager
  ) {
    throw new Error(
      'Campaign persistence requires the supplied active manager',
    );
  }

  return runner;
};

const rows = (value: unknown, error: string): DataRow[] => {
  if (
    !Array.isArray(value) ||
    value.some((row) => !row || typeof row !== 'object' || Array.isArray(row))
  ) {
    throw new Error(error);
  }

  return value as DataRow[];
};

const exactStructuredRow = (
  value: unknown,
  expectedId: string,
  error: string,
): DataRow => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(error);
  const result = value as StructuredResult;
  const records = rows(result.records, error);

  if (
    result.affected !== 1 ||
    records.length !== 1 ||
    records[0].id !== expectedId
  ) {
    throw new Error(error);
  }

  return records[0];
};

const instant = (value: unknown): string => {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : null;

  if (!date || !Number.isFinite(date.getTime()))
    throw new Error('Campaign persistence timestamp was invalid');
  return date.toISOString();
};

const isInstant = (value: unknown): boolean => {
  try {
    instant(value);
    return true;
  } catch {
    return false;
  }
};

const hasNoSettlementProviderEvidence = (row: DataRow): boolean =>
  row.providerMessageId === null &&
  row.providerAcceptedAt === null &&
  row.providerHeaderMessageId === null &&
  row.providerMessageExternalId === null &&
  row.reconciledProviderHeaderMessageId === null &&
  row.providerThreadExternalId === null &&
  row.resolvedThreadExternalId === null &&
  row.providerDeliveredRecipients === null &&
  row.projectedMessageId === null &&
  row.projectedMessageThreadId === null;

const isValidSettlementOccurrence = (
  row: DataRow,
  context: LockedCampaignLifecycleContext,
  authorizationId: string,
): boolean =>
  uuidValidate(row.id as string) &&
  row.workspaceId === context.workspaceId &&
  row.campaignId === context.campaignId &&
  uuidValidate(row.enrollmentId as string) &&
  uuidValidate(row.workflowVersionId as string) &&
  uuidValidate(row.messageId as string) &&
  row.authorizationId === authorizationId &&
  Number.isSafeInteger(row.authoredMessageCount) &&
  (row.authoredMessageCount as number) > 0 &&
  Number.isSafeInteger(row.authoredMessageIndex) &&
  (row.authoredMessageIndex as number) >= 0 &&
  (row.authoredMessageIndex as number) < (row.authoredMessageCount as number) &&
  isInstant(row.dueAt) &&
  row.terminalReason === null &&
  row.terminalAt === null &&
  ((row.state === 'PENDING' && row.holdReason === null) ||
    (row.state === 'HELD' &&
      typeof row.holdReason === 'string' &&
      row.holdReason.trim().length > 0));

const executionRecord = (row: DataRow): CampaignExecutionRecord =>
  Object.freeze({
    campaignExecutionId: row.id as string,
    workspaceId: row.workspaceId as string,
    campaignId: row.campaignId as string,
    window: Object.freeze({
      timeZone: row.timeZone as string,
      startLocalTime: row.startLocalTime as string,
      endLocalTime: row.endLocalTime as string,
    }),
    campaignCapacityTimeZone: row.campaignCapacityTimeZone as string,
  });

const activationRecord = (row: DataRow): CampaignActivationRecord =>
  Object.freeze({
    workspaceId: row.workspaceId as string,
    campaignId: row.campaignId as string,
    campaignExecutionId: row.campaignExecutionId as string,
    activationId: row.id as string,
    authorizationId: row.authorizationId as string,
    authorizationGeneration: row.authorizationGeneration as number,
    workflowVersionId: row.workflowVersionId as string,
    activatedAt: instant(row.activatedAt),
    createdEnrollmentCount: row.createdEnrollmentCount as number,
    createdOccurrenceCount: row.createdOccurrenceCount as number,
  });

const EXECUTION_COLUMNS = `id, "workspaceId", "campaignId", "timeZone",
       "startLocalTime"::text, "endLocalTime"::text, "campaignCapacityTimeZone"`;

@Injectable()
export class CampaignExecutionPersistenceAdapter implements CampaignExecutionPersistencePort {
  constructor(
    @Optional()
    private readonly timelineEventWriter?: CampaignTimelineEventWriterService,
  ) {}

  async loadExecutionInTransaction(context: LockedCampaignLifecycleContext) {
    const result = rows(
      await runnerFor(context).query(
        `SELECT ${EXECUTION_COLUMNS}
           FROM core."campaignExecution"
          WHERE "workspaceId" = $1 AND "campaignId" = $2
          FOR UPDATE`,
        [context.workspaceId, context.campaignId],
      ),
      'Campaign execution read was invalid',
    );

    if (result.length > 1)
      throw new Error('Campaign execution read was invalid');
    return result.length === 0 ? null : executionRecord(result[0]);
  }

  async loadActivationByAuthorizationInTransaction(
    context: LockedCampaignLifecycleContext,
    authorizationId: string,
  ) {
    const result = rows(
      await runnerFor(context).query(
        `SELECT id, "workspaceId", "campaignId", "campaignExecutionId",
                "authorizationId", "authorizationGeneration", "workflowVersionId",
                "activatedAt", "createdEnrollmentCount", "createdOccurrenceCount"
           FROM core."campaignActivation"
          WHERE "workspaceId" = $1 AND "campaignId" = $2 AND "authorizationId" = $3`,
        [context.workspaceId, context.campaignId, authorizationId],
      ),
      'Campaign activation read was invalid',
    );

    if (result.length > 1)
      throw new Error('Campaign activation read was invalid');
    return result.length === 0 ? null : activationRecord(result[0]);
  }

  async writeSendingWindowInTransaction(
    context: LockedCampaignLifecycleContext,
    input: Parameters<
      CampaignExecutionPersistencePort['writeSendingWindowInTransaction']
    >[1],
  ) {
    const runner = runnerFor(context);
    const existingRows = rows(
      await runner.query(
        `SELECT ${EXECUTION_COLUMNS}
           FROM core."campaignExecution"
          WHERE "workspaceId" = $1 AND "campaignId" = $2
          FOR UPDATE`,
        [context.workspaceId, context.campaignId],
      ),
      'Campaign execution read was invalid',
    );

    if (existingRows.length > 1)
      throw new Error('Campaign execution read was invalid');
    const existing = existingRows[0];

    if (existing) {
      const unchanged =
        existing.timeZone === input.window.timeZone &&
        existing.startLocalTime === input.window.startLocalTime &&
        existing.endLocalTime === input.window.endLocalTime &&
        existing.campaignCapacityTimeZone === input.campaignCapacityTimeZone;

      if (unchanged) {
        return Object.freeze({
          status: 'UNCHANGED' as const,
          createdExecution: false,
          execution: executionRecord(existing),
        });
      }

      const updated = exactStructuredRow(
        await runner.query(
          `UPDATE core."campaignExecution"
              SET "timeZone" = $2, "startLocalTime" = $3,
                  "endLocalTime" = $4, "campaignCapacityTimeZone" = $5,
                  "updatedAt" = clock_timestamp()
            WHERE id = $1
          RETURNING ${EXECUTION_COLUMNS}`,
          [
            existing.id,
            input.window.timeZone,
            input.window.startLocalTime,
            input.window.endLocalTime,
            input.campaignCapacityTimeZone,
          ],
          true,
        ),
        existing.id as string,
        'Campaign execution update was inconsistent',
      );

      return Object.freeze({
        status: 'UPDATED' as const,
        createdExecution: false,
        execution: executionRecord(updated),
      });
    }

    const id = randomUUID();
    const created = exactStructuredRow(
      await runner.query(
        `INSERT INTO core."campaignExecution"
                (id, "workspaceId", "campaignId", "timeZone", "startLocalTime",
                 "endLocalTime", "campaignCapacityTimeZone")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${EXECUTION_COLUMNS}`,
        [
          id,
          context.workspaceId,
          context.campaignId,
          input.window.timeZone,
          input.window.startLocalTime,
          input.window.endLocalTime,
          input.campaignCapacityTimeZone,
        ],
        true,
      ),
      id,
      'Campaign execution insert was inconsistent',
    );

    return Object.freeze({
      status: 'UPDATED' as const,
      createdExecution: true,
      execution: executionRecord(created),
    });
  }

  async createActivationGraphInTransaction(
    context: LockedCampaignLifecycleContext,
    graph: CampaignActivationGraph,
  ): Promise<CampaignActivationGraph> {
    const runner = runnerFor(context);
    const activation = graph.activation;

    exactStructuredRow(
      await runner.query(
        `INSERT INTO core."campaignActivation"
                (id, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId",
                 "authorizationGeneration", "workflowVersionId", "activatedAt",
                 "createdEnrollmentCount", "createdOccurrenceCount")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id`,
        [
          activation.activationId,
          activation.workspaceId,
          activation.campaignId,
          activation.campaignExecutionId,
          activation.authorizationId,
          activation.authorizationGeneration,
          activation.workflowVersionId,
          activation.activatedAt,
          activation.createdEnrollmentCount,
          activation.createdOccurrenceCount,
        ],
        true,
      ),
      activation.activationId,
      'Campaign activation insert was inconsistent',
    );

    exactStructuredRow(
      await runner.query(
        `UPDATE "${context.schemaName}"."campaign"
            SET "lifecycleStatus" = 'ACTIVE'
          WHERE id = $1 AND "lifecycleStatus" IN ('DRAFT', 'PAUSED')
        RETURNING id`,
        [context.campaignId],
        true,
      ),
      context.campaignId,
      'Campaign lifecycle activation was inconsistent',
    );

    await this.timelineEventWriter?.writeInTransaction(context, {
      businessEventKey: `activation:${activation.activationId}:ACTIVATED`,
      eventKind: 'ACTIVATED',
      happenedAt: activation.activatedAt,
      sourceId: activation.activationId,
      sourceType: 'ACTIVATION',
    });

    for (const enrollment of graph.enrollments) {
      exactStructuredRow(
        await runner.query(
          `INSERT INTO core."campaignEnrollment"
                  (id, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId",
                   "authorizationGeneration", "campaignCreatorId", "creatorId", "authoredMessageCount",
                   "nextAuthoredMessageIndex", state, "holdReason", "terminalReason", "terminalAt", "enrolledAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,$12,$13,$14)
        RETURNING id`,
          [
            enrollment.enrollmentId,
            enrollment.workspaceId,
            enrollment.campaignId,
            enrollment.campaignExecutionId,
            enrollment.authorizationId,
            enrollment.authorizationGeneration,
            enrollment.campaignCreatorId,
            enrollment.creatorId,
            enrollment.authoredMessageCount,
            enrollment.nextAuthoredMessageIndex,
            enrollment.state,
            enrollment.terminalReason,
            enrollment.terminalAt,
            enrollment.enrolledAt,
          ],
          true,
        ),
        enrollment.enrollmentId,
        'Campaign enrollment insert was inconsistent',
      );
      await this.timelineEventWriter?.writeInTransaction(context, {
        businessEventKey: `enrollment:${enrollment.enrollmentId}:ENROLLED`,
        eventKind: 'ENROLLED',
        happenedAt: enrollment.enrolledAt,
        sourceId: enrollment.enrollmentId,
        sourceType: 'ENROLLMENT',
        creatorId: enrollment.creatorId,
      });

      if (enrollment.occurrence) {
        const occurrence = enrollment.occurrence;
        exactStructuredRow(
          await runner.query(
            `INSERT INTO core."campaignOccurrence"
                    (id, "workspaceId", "campaignId", "enrollmentId", "workflowVersionId",
                     "messageId", "authoredMessageIndex", state, "dueAt",
                     "holdReason", "terminalReason", "terminalAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,NULL)
          RETURNING id`,
            [
              occurrence.occurrenceId,
              occurrence.workspaceId,
              occurrence.campaignId,
              occurrence.enrollmentId,
              occurrence.workflowVersionId,
              occurrence.messageId,
              occurrence.authoredMessageIndex,
              occurrence.state,
              occurrence.dueAt,
            ],
            true,
          ),
          occurrence.occurrenceId,
          'Campaign occurrence insert was inconsistent',
        );
        await this.timelineEventWriter?.writeInTransaction(context, {
          businessEventKey: `occurrence:${occurrence.occurrenceId}:SCHEDULED`,
          eventKind: 'SCHEDULED',
          happenedAt: enrollment.enrolledAt,
          sourceId: occurrence.occurrenceId,
          sourceType: 'OCCURRENCE',
          creatorId: enrollment.creatorId,
        });
      }
    }

    return graph;
  }

  async transitionLifecycleInTransaction(
    context: LockedCampaignLifecycleContext,
    input: Parameters<
      CampaignExecutionPersistencePort['transitionLifecycleInTransaction']
    >[1],
  ): Promise<void> {
    exactStructuredRow(
      await runnerFor(context).query(
        `UPDATE "${context.schemaName}"."campaign"
            SET "lifecycleStatus" = $2
          WHERE id = $1 AND "lifecycleStatus" = $3
        RETURNING id`,
        [context.campaignId, input.to, input.from],
        true,
      ),
      context.campaignId,
      'Campaign lifecycle transition was inconsistent',
    );
    const happenedAt = new Date().toISOString();
    await this.timelineEventWriter?.writeInTransaction(context, {
      businessEventKey: `campaign:${context.campaignId}:${input.from}:${input.to}:${happenedAt}`,
      eventKind: input.to,
      happenedAt,
      sourceId: context.campaignId,
      sourceType: 'CAMPAIGN',
    });
  }

  async settlePausedOccurrencesInTransaction(
    context: LockedCampaignLifecycleContext,
    authorizationId: string,
  ): Promise<number> {
    const runner = runnerFor(context);
    const occurrences = rows(
      await runner.query(
        `SELECT o.id, o."workspaceId", o."campaignId", o."enrollmentId",
                o."workflowVersionId", o."messageId", o."authoredMessageIndex",
                o."dueAt", o.state, o."holdReason", o."terminalReason", o."terminalAt",
                e."authorizationId", e."authoredMessageCount"
           FROM core."campaignOccurrence" o
           JOIN core."campaignEnrollment" e
             ON e."workspaceId" = o."workspaceId"
            AND e."campaignId" = o."campaignId"
            AND e.id = o."enrollmentId"
          WHERE o."workspaceId" = $1 AND o."campaignId" = $2
            AND e."authorizationId" = $3
            AND o.state IN ('PENDING', 'HELD')
          ORDER BY o.id
          FOR UPDATE OF o`,
        [context.workspaceId, context.campaignId, authorizationId],
      ),
      'Campaign paused occurrence settlement read was invalid',
    );

    if (occurrences.length === 0) return 0;

    const candidateById = new Map(
      occurrences.map((occurrence) => [occurrence.id as string, occurrence]),
    );
    const attempts = rows(
      await runner.query(
        `SELECT source, "attemptId", "attemptState", "capacityState",
                "workspaceId", "campaignId", "enrollmentId", "occurrenceId",
                "authorizationId", "workflowVersionId", "messageId",
                "connectedAccountId", "messageChannelId", provider,
                "normalizedSenderHandle", "normalizedRecipient",
                "selectionConstraintKind", "priorAcceptedEvidenceId",
                "senderPoolFingerprint", "localDate", "claimedAt", "slotAt",
                "unknownAfter", "attemptNumber", "renderDigest",
                "testPreparationProofId", "requesterUserWorkspaceId",
                "previewDigest", "testTransportDigest", "directReservationCapabilityId",
                "providerMessageId", "providerAcceptedAt", "providerHeaderMessageId",
                "providerMessageExternalId", "reconciledProviderHeaderMessageId",
                "providerThreadExternalId", "resolvedThreadExternalId",
                "providerDeliveredRecipients", "projectedMessageId",
                "projectedMessageThreadId", "finalEvidenceDigest",
                "safeOutcomeReason", retryable
           FROM core."outboundEmailAttempt"
          WHERE "occurrenceId" = ANY($1::uuid[])
          ORDER BY "occurrenceId", "attemptNumber", "attemptId"
          FOR UPDATE`,
        [[...candidateById.keys()]],
      ),
      'Campaign paused occurrence attempt read was invalid',
    );
    const unsafeOccurrenceIds = new Set<string>();

    for (const attempt of attempts) {
      const occurrence = candidateById.get(attempt.occurrenceId as string);
      const exactBinding =
        occurrence !== undefined &&
        attempt.workspaceId === context.workspaceId &&
        attempt.campaignId === context.campaignId &&
        attempt.enrollmentId === occurrence.enrollmentId &&
        attempt.authorizationId === authorizationId &&
        attempt.workflowVersionId === occurrence.workflowVersionId &&
        attempt.messageId === occurrence.messageId;
      const safeState =
        attempt.attemptState === 'BLOCKED' ||
        attempt.attemptState === 'DEFINITELY_UNACCEPTED';

      if (
        occurrence === undefined ||
        !exactBinding ||
        !safeState ||
        !hasNoSettlementProviderEvidence(attempt) ||
        !isValidCampaignSequenceAttemptHistoryRow(attempt)
      ) {
        unsafeOccurrenceIds.add(attempt.occurrenceId as string);
      }
    }

    const eligibleIds = occurrences
      .filter(
        (occurrence) =>
          isValidSettlementOccurrence(occurrence, context, authorizationId) &&
          !unsafeOccurrenceIds.has(occurrence.id as string),
      )
      .map((occurrence) => occurrence.id as string);

    if (eligibleIds.length === 0) return 0;

    const result = await runner.query(
      `UPDATE core."campaignOccurrence" AS o
          SET state = 'CANCELLED', "holdReason" = NULL,
              "terminalReason" = 'CAMPAIGN_PAUSED',
              "terminalAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
         FROM core."campaignEnrollment" e
        WHERE o."workspaceId" = $1 AND o."campaignId" = $2
          AND e."workspaceId" = o."workspaceId"
          AND e."campaignId" = o."campaignId"
          AND e.id = o."enrollmentId"
          AND e."authorizationId" = $3
          AND o.state IN ('PENDING', 'HELD')
          AND o.id = ANY($4::uuid[])
      RETURNING o.id`,
      [context.workspaceId, context.campaignId, authorizationId, eligibleIds],
      true,
    );
    const records = rows(
      (result as StructuredResult)?.records,
      'Campaign paused occurrence settlement was inconsistent',
    );

    if (
      (result as StructuredResult)?.affected !== eligibleIds.length ||
      records.length !== eligibleIds.length ||
      records.some((record) => !eligibleIds.includes(record.id as string)) ||
      new Set(records.map((record) => record.id)).size !== eligibleIds.length
    ) {
      throw new Error('Campaign paused occurrence settlement was inconsistent');
    }

    return eligibleIds.length;
  }

  async countInFlightAttemptsInTransaction(
    context: LockedCampaignLifecycleContext,
  ): Promise<number> {
    const result = rows(
      await runnerFor(context).query(
        `SELECT COUNT(*)::integer AS count
           FROM core."outboundEmailAttempt"
          WHERE "workspaceId" = $1 AND "campaignId" = $2
            AND "attemptState" IN ('RESERVED', 'PROCESSING', 'UNKNOWN')`,
        [context.workspaceId, context.campaignId],
      ),
      'Campaign in-flight attempt count was invalid',
    );
    const count = result.length === 1 ? result[0].count : null;

    if (!Number.isSafeInteger(count) || (count as number) < 0)
      throw new Error('Campaign in-flight attempt count was invalid');
    return count as number;
  }
}
