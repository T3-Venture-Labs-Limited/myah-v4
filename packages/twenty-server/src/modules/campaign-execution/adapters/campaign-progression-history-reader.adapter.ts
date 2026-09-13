import { Injectable } from '@nestjs/common';
import { validate as uuidValidate } from 'uuid';

import {
  CAMPAIGN_PROGRESSION_HISTORY_BLOCKER_PRECEDENCE,
  type CampaignProgressionHistoryEntry,
  type CampaignProgressionHistoryReaderPort,
  type CampaignProgressionHistoryResult,
} from 'src/modules/campaign-execution/types/campaign-progression-history-reader.type';

const iso = (value: unknown): string | null => {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : null;

  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const DIGEST = /^[0-9a-f]{64}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ATTEMPT_STATES: ReadonlySet<unknown> = new Set([
  'RESERVED',
  'PROCESSING',
  'BLOCKED',
  'ACCEPTED',
  'DEFINITELY_UNACCEPTED',
  'UNKNOWN',
]);

const isNormalizedText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value === value.trim().toLowerCase();
const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && DIGEST.test(value);
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidValidate(value);
const noProviderEvidence = (row: Record<string, unknown>): boolean =>
  row.providerMessageId === null &&
  row.providerAcceptedAt === null &&
  row.projectedMessageId === null;

const validAttemptShape = (row: Record<string, unknown>): boolean => {
  if (
    row.source !== 'CAMPAIGN_SEQUENCE' ||
    !ATTEMPT_STATES.has(row.attemptState) ||
    !isUuid(row.attemptId) ||
    !isUuid(row.connectedAccountId) ||
    !isUuid(row.messageChannelId) ||
    !isNormalizedText(row.provider) ||
    !isNormalizedText(row.normalizedSenderHandle) ||
    !isNormalizedText(row.normalizedRecipient) ||
    !isDigest(row.senderPoolFingerprint) ||
    !isDigest(row.renderDigest) ||
    typeof row.attemptNumber !== 'number' ||
    !Number.isSafeInteger(row.attemptNumber) ||
    row.attemptNumber <= 0 ||
    typeof row.localDate !== 'string' ||
    !LOCAL_DATE.test(row.localDate) ||
    iso(row.claimedAt) === null ||
    iso(row.slotAt) === null ||
    iso(row.unknownAfter) === null ||
    Date.parse(iso(row.unknownAfter) as string) !==
      Date.parse(iso(row.claimedAt) as string) + 60_000 ||
    (row.selectionConstraintKind === 'PINNED_REPLY'
      ? !isUuid(row.priorAcceptedEvidenceId)
      : row.selectionConstraintKind !== 'ROTATE' ||
        row.priorAcceptedEvidenceId !== null) ||
    row.testPreparationProofId !== null ||
    row.requesterUserWorkspaceId !== null ||
    row.previewDigest !== null ||
    row.testTransportDigest !== null ||
    row.directReservationCapabilityId !== null
  ) {
    return false;
  }

  switch (row.attemptState) {
    case 'RESERVED':
      return (
        row.capacityState === 'RESERVED' &&
        row.finalEvidenceDigest === null &&
        row.safeOutcomeReason === null &&
        row.retryable === null &&
        noProviderEvidence(row)
      );
    case 'PROCESSING':
      return (
        row.capacityState === 'RESERVED' &&
        isDigest(row.finalEvidenceDigest) &&
        row.safeOutcomeReason === null &&
        row.retryable === null &&
        noProviderEvidence(row)
      );
    case 'BLOCKED':
      return (
        row.capacityState === 'RELEASED' &&
        row.finalEvidenceDigest === null &&
        row.safeOutcomeReason === 'STALE_FINAL_EVIDENCE' &&
        row.retryable === false &&
        noProviderEvidence(row)
      );
    case 'ACCEPTED':
      return (
        row.capacityState === 'CONSUMED' &&
        isDigest(row.finalEvidenceDigest) &&
        typeof row.providerMessageId === 'string' &&
        row.providerMessageId.trim().length > 0 &&
        iso(row.providerAcceptedAt) !== null &&
        row.safeOutcomeReason === null &&
        row.retryable === false &&
        (row.projectedMessageId === null || isUuid(row.projectedMessageId))
      );
    case 'DEFINITELY_UNACCEPTED':
      return (
        row.capacityState === 'RELEASED' &&
        isDigest(row.finalEvidenceDigest) &&
        ((row.safeOutcomeReason === 'DEFINITELY_UNACCEPTED_RETRYABLE' &&
          row.retryable === true) ||
          (row.safeOutcomeReason === 'DEFINITELY_UNACCEPTED_NON_RETRYABLE' &&
            row.retryable === false)) &&
        noProviderEvidence(row)
      );
    case 'UNKNOWN':
      return (
        row.capacityState === 'PROVISIONAL_UNKNOWN' &&
        isDigest(row.finalEvidenceDigest) &&
        row.safeOutcomeReason === 'PROVIDER_OUTCOME_UNCONFIRMED' &&
        row.retryable === false &&
        noProviderEvidence(row)
      );
    default:
      return false;
  }
};

const blocked = (
  reason: Extract<
    CampaignProgressionHistoryResult,
    { status: 'BLOCKED' }
  >['reason'],
): CampaignProgressionHistoryResult =>
  Object.freeze({ status: 'BLOCKED', reason });

@Injectable()
export class CampaignProgressionHistoryReaderAdapter implements CampaignProgressionHistoryReaderPort {
  async preparePriorVersionSupersessionInTransaction(
    input: Readonly<{
      workspaceId: string;
      campaignId: string;
      targetWorkflowVersionId: string;
    }>,
    manager: Parameters<
      CampaignProgressionHistoryReaderPort['preparePriorVersionSupersessionInTransaction']
    >[1],
  ) {
    const runner = manager.queryRunner;
    if (
      !runner ||
      !runner.isTransactionActive ||
      runner.isReleased ||
      runner.manager !== manager
    ) {
      throw new Error('Campaign history requires the supplied active manager');
    }
    const occurrences = await runner.query(
      `SELECT o.id, o."enrollmentId", o."workflowVersionId", o."messageId",
              o."authoredMessageIndex", o."dueAt", o.state, o."holdReason",
              o."terminalReason", o."terminalAt", e."authorizationId",
              e."authoredMessageCount"
         FROM core."campaignOccurrence" o
         JOIN core."campaignEnrollment" e
           ON e."workspaceId" = o."workspaceId"
          AND e."campaignId" = o."campaignId"
          AND e.id = o."enrollmentId"
        WHERE o."workspaceId" = $1 AND o."campaignId" = $2
          AND o."workflowVersionId" <> $3
        ORDER BY o.id
        FOR UPDATE OF o`,
      [input.workspaceId, input.campaignId, input.targetWorkflowVersionId],
    );
    if (!Array.isArray(occurrences))
      throw new Error('Campaign supersession query was incomplete');
    const attempts = await runner.query(
      `SELECT "attemptId" FROM core."outboundEmailAttempt"
        WHERE source = 'CAMPAIGN_SEQUENCE'
          AND "workspaceId" = $1 AND "campaignId" = $2
          AND "workflowVersionId" <> $3
        LIMIT 1`,
      [input.workspaceId, input.campaignId, input.targetWorkflowVersionId],
    );
    if (!Array.isArray(attempts))
      throw new Error('Campaign supersession attempt query was incomplete');
    if (attempts.length > 0)
      return Object.freeze({ status: 'BLOCKED' as const });

    const pendingOccurrenceIds: string[] = [];
    for (const row of occurrences) {
      if (
        !row ||
        typeof row !== 'object' ||
        !isUuid(row.id) ||
        !isUuid(row.enrollmentId) ||
        !isUuid(row.authorizationId) ||
        !isUuid(row.workflowVersionId) ||
        row.workflowVersionId === input.targetWorkflowVersionId ||
        !isUuid(row.messageId) ||
        !Number.isSafeInteger(row.authoredMessageCount) ||
        row.authoredMessageCount <= 0 ||
        !Number.isSafeInteger(row.authoredMessageIndex) ||
        row.authoredMessageIndex < 0 ||
        row.authoredMessageIndex >= row.authoredMessageCount ||
        iso(row.dueAt) === null
      ) {
        return Object.freeze({ status: 'BLOCKED' as const });
      }
      if (
        row.state === 'PENDING' &&
        row.holdReason === null &&
        row.terminalReason === null &&
        row.terminalAt === null
      ) {
        pendingOccurrenceIds.push(row.id);
        continue;
      }
      if (
        row.state === 'CANCELLED' &&
        row.holdReason === null &&
        row.terminalReason === 'SUPERSEDED_BY_WORKFLOW_VERSION' &&
        iso(row.terminalAt) !== null
      ) {
        continue;
      }
      return Object.freeze({ status: 'BLOCKED' as const });
    }
    return Object.freeze({
      status: 'READY' as const,
      pendingOccurrenceIds: Object.freeze(pendingOccurrenceIds),
    });
  }

  async applyPriorVersionSupersessionInTransaction(
    input: Readonly<{
      workspaceId: string;
      campaignId: string;
      targetWorkflowVersionId: string;
      pendingOccurrenceIds: readonly string[];
    }>,
    manager: Parameters<
      CampaignProgressionHistoryReaderPort['applyPriorVersionSupersessionInTransaction']
    >[1],
  ): Promise<void> {
    const runner = manager.queryRunner;
    if (
      !runner ||
      !runner.isTransactionActive ||
      runner.isReleased ||
      runner.manager !== manager
    ) {
      throw new Error('Campaign history requires the supplied active manager');
    }
    if (input.pendingOccurrenceIds.length === 0) return;
    const result = await runner.query(
      `UPDATE core."campaignOccurrence"
          SET state = 'CANCELLED', "holdReason" = NULL,
              "terminalReason" = 'SUPERSEDED_BY_WORKFLOW_VERSION',
              "terminalAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "workspaceId" = $1 AND "campaignId" = $2
          AND "workflowVersionId" <> $3 AND state = 'PENDING'
          AND id = ANY($4::uuid[])
        RETURNING id`,
      [
        input.workspaceId,
        input.campaignId,
        input.targetWorkflowVersionId,
        input.pendingOccurrenceIds,
      ],
    );
    const updated =
      Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    if (
      !Array.isArray(updated) ||
      updated.length !== input.pendingOccurrenceIds.length ||
      new Set(updated.map((row) => row?.id)).size !==
        input.pendingOccurrenceIds.length
    ) {
      throw new Error('Campaign supersession compare-and-set failed');
    }
  }

  async readSameWorkflowVersionHistoryInTransaction(
    input: Parameters<
      CampaignProgressionHistoryReaderPort['readSameWorkflowVersionHistoryInTransaction']
    >[0],
    manager: Parameters<
      CampaignProgressionHistoryReaderPort['readSameWorkflowVersionHistoryInTransaction']
    >[1],
  ): Promise<CampaignProgressionHistoryResult> {
    const runner = manager.queryRunner;

    if (
      !runner ||
      !runner.isTransactionActive ||
      runner.isReleased ||
      runner.manager !== manager
    ) {
      throw new Error('Campaign history requires the supplied active manager');
    }

    const orphanRows = await runner.query(
      `SELECT a."attemptId"
         FROM core."outboundEmailAttempt" a
         LEFT JOIN core."campaignEnrollment" e
           ON e."workspaceId" = a."workspaceId"
          AND e."campaignId" = a."campaignId"
          AND e.id = a."enrollmentId"
          AND e."authorizationId" = a."authorizationId"
         LEFT JOIN core."campaignOccurrence" o
           ON o."workspaceId" = a."workspaceId"
          AND o."campaignId" = a."campaignId"
          AND o."enrollmentId" = a."enrollmentId"
          AND o.id = a."occurrenceId"
          AND o."workflowVersionId" = a."workflowVersionId"
          AND o."messageId" = a."messageId"
        WHERE a.source = 'CAMPAIGN_SEQUENCE'
          AND a."workspaceId" = $1 AND a."campaignId" = $2
          AND a."workflowVersionId" = $3
          AND (e.id IS NULL OR o.id IS NULL)
        LIMIT 1`,
      [input.workspaceId, input.campaignId, input.workflowVersionId],
    );

    if (!Array.isArray(orphanRows)) {
      throw new Error('Campaign history query was incomplete');
    }
    if (orphanRows.length > 0) return blocked('MALFORMED_HISTORY');

    const rows = await runner.query(
      `SELECT e.id AS "enrollmentId", e."authorizationId", e."creatorId",
              e."authorizationGeneration", e."campaignCreatorId",
              e."authoredMessageCount", e."nextAuthoredMessageIndex",
              e.state AS "enrollmentState", e."holdReason" AS "enrollmentHoldReason",
              e."terminalReason" AS "enrollmentTerminalReason",
              e."terminalAt" AS "enrollmentTerminalAt",
              o.id AS "occurrenceId", o."workflowVersionId", o."messageId",
              o."authoredMessageIndex", o.state AS "occurrenceState",
              o."holdReason" AS "occurrenceHoldReason",
              o."terminalReason", o."terminalAt", o."dueAt",
              a.source, a."attemptId", a."attemptState", a."capacityState",
              a."connectedAccountId", a."messageChannelId", a.provider,
              a."normalizedSenderHandle", a."normalizedRecipient",
              a."selectionConstraintKind", a."priorAcceptedEvidenceId",
              a."senderPoolFingerprint", a."localDate", a."claimedAt", a."slotAt",
              a."unknownAfter", a."attemptNumber", a."renderDigest",
              a."testPreparationProofId", a."requesterUserWorkspaceId",
              a."previewDigest", a."testTransportDigest", a."directReservationCapabilityId",
              a."providerMessageId", a."providerAcceptedAt", a."projectedMessageId",
              a."finalEvidenceDigest", a."safeOutcomeReason", a.retryable
         FROM core."campaignEnrollment" e
         LEFT JOIN core."campaignOccurrence" o
           ON o."workspaceId" = e."workspaceId"
          AND o."campaignId" = e."campaignId"
          AND o."enrollmentId" = e.id
          AND o."workflowVersionId" = $3
         LEFT JOIN core."outboundEmailAttempt" a
           ON a.source = 'CAMPAIGN_SEQUENCE'
          AND a."workspaceId" = e."workspaceId"
          AND a."campaignId" = e."campaignId"
          AND a."enrollmentId" = e.id
          AND a."occurrenceId" = o.id
          AND a."authorizationId" = e."authorizationId"
          AND a."workflowVersionId" = o."workflowVersionId"
          AND a."messageId" = o."messageId"
        WHERE e."workspaceId" = $1 AND e."campaignId" = $2
        ORDER BY e."creatorId", o."authoredMessageIndex", o."messageId", a."attemptId"`,
      [input.workspaceId, input.campaignId, input.workflowVersionId],
    );

    if (!Array.isArray(rows))
      throw new Error('Campaign history query was incomplete');

    const groups = new Map<string, typeof rows>();
    const indexByMessage = new Map<string, number>();
    const messageByIndex = new Map<number, string>();
    const blockerFlags = new Set<
      Extract<CampaignProgressionHistoryResult, { status: 'BLOCKED' }>['reason']
    >();

    for (const row of rows) {
      const enrollmentMalformed =
        !uuidValidate(row.enrollmentId) ||
        !uuidValidate(row.authorizationId) ||
        !uuidValidate(row.creatorId) ||
        !uuidValidate(row.campaignCreatorId) ||
        !Number.isSafeInteger(row.authorizationGeneration) ||
        row.authorizationGeneration <= 0 ||
        !Number.isSafeInteger(row.authoredMessageCount) ||
        row.authoredMessageCount <= 0 ||
        !Number.isSafeInteger(row.nextAuthoredMessageIndex) ||
        row.nextAuthoredMessageIndex < 0 ||
        row.nextAuthoredMessageIndex > row.authoredMessageCount ||
        !['ACTIVE', 'REPLIED', 'EXCLUDED', 'FINISHED'].includes(
          row.enrollmentState,
        ) ||
        (row.enrollmentState === 'ACTIVE'
          ? (row.enrollmentHoldReason !== null &&
              (typeof row.enrollmentHoldReason !== 'string' ||
                row.enrollmentHoldReason.trim().length === 0)) ||
            row.enrollmentTerminalReason !== null ||
            row.enrollmentTerminalAt !== null
          : row.enrollmentHoldReason !== null ||
            typeof row.enrollmentTerminalReason !== 'string' ||
            row.enrollmentTerminalReason.trim().length === 0 ||
            iso(row.enrollmentTerminalAt) === null ||
            (row.enrollmentState === 'FINISHED' &&
              row.nextAuthoredMessageIndex !== row.authoredMessageCount));

      if (enrollmentMalformed) blockerFlags.add('MALFORMED_HISTORY');
      if (row.occurrenceId === null) continue;

      const occurrenceMalformed =
        !uuidValidate(row.occurrenceId) ||
        row.workflowVersionId !== input.workflowVersionId ||
        !uuidValidate(row.messageId) ||
        !Number.isSafeInteger(row.authoredMessageIndex) ||
        row.authoredMessageIndex < 0 ||
        row.authoredMessageIndex >= row.authoredMessageCount ||
        iso(row.dueAt) === null ||
        ![
          'PENDING',
          'IN_FLIGHT',
          'SUCCEEDED',
          'SKIPPED',
          'HELD',
          'UNKNOWN',
          'CANCELLED',
        ].includes(row.occurrenceState) ||
        (['PENDING', 'IN_FLIGHT', 'UNKNOWN'].includes(row.occurrenceState)
          ? row.occurrenceHoldReason !== null ||
            row.terminalReason !== null ||
            row.terminalAt !== null
          : row.occurrenceState === 'HELD'
            ? typeof row.occurrenceHoldReason !== 'string' ||
              row.occurrenceHoldReason.trim().length === 0 ||
              row.terminalReason !== null ||
              row.terminalAt !== null
            : row.occurrenceHoldReason !== null ||
              typeof row.terminalReason !== 'string' ||
              row.terminalReason.trim().length === 0 ||
              iso(row.terminalAt) === null) ||
        (row.attemptId !== null && !validAttemptShape(row));

      if (occurrenceMalformed) blockerFlags.add('MALFORMED_HISTORY');
      if (
        enrollmentMalformed ||
        occurrenceMalformed ||
        row.creatorId !== input.creatorId
      ) {
        continue;
      }

      const priorIndex = indexByMessage.get(row.messageId);
      const priorMessage = messageByIndex.get(row.authoredMessageIndex);

      if (
        (priorIndex !== undefined && priorIndex !== row.authoredMessageIndex) ||
        (priorMessage !== undefined && priorMessage !== row.messageId)
      ) {
        blockerFlags.add('AMBIGUOUS_HISTORY');
      }
      indexByMessage.set(row.messageId, row.authoredMessageIndex);
      messageByIndex.set(row.authoredMessageIndex, row.messageId);
      const key = `${row.messageId}:${row.authoredMessageIndex}`;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }

    const entries: CampaignProgressionHistoryEntry[] = [];

    for (const group of groups.values()) {
      const first = group[0];
      if (new Set(group.map((row) => row.occurrenceId)).size !== 1) {
        blockerFlags.add('AMBIGUOUS_HISTORY');
      }
      const attempts = group.filter((row) => row.attemptId !== null);
      if (
        attempts.some((row) => row.attemptState === 'UNKNOWN') ||
        group.some((row) => row.occurrenceState === 'UNKNOWN')
      ) {
        blockerFlags.add('UNKNOWN_OUTCOME');
      }
      if (
        attempts.some(
          (row) =>
            row.attemptState === 'RESERVED' ||
            row.attemptState === 'PROCESSING',
        )
      ) {
        blockerFlags.add('UNRESOLVED_HISTORY');
      }
      const accepted = attempts.filter(
        (row) => row.attemptState === 'ACCEPTED',
      );

      if (accepted.length > 1) blockerFlags.add('AMBIGUOUS_HISTORY');
      if (accepted.length === 1) {
        const row = accepted[0];
        const acceptedAt = iso(row.providerAcceptedAt);
        if (first.occurrenceState !== 'SUCCEEDED' || acceptedAt === null) {
          blockerFlags.add('UNRECONCILED_HISTORY');
        } else {
          entries.push(
            Object.freeze({
              kind: 'ACCEPTED',
              workspaceId: input.workspaceId,
              campaignId: input.campaignId,
              authorizationId: row.authorizationId,
              enrollmentId: row.enrollmentId,
              occurrenceId: row.occurrenceId,
              attemptId: row.attemptId,
              acceptedEvidenceId: row.attemptId,
              workflowVersionId: row.workflowVersionId,
              messageId: row.messageId,
              authoredMessageIndex: row.authoredMessageIndex,
              connectedAccountId: row.connectedAccountId,
              messageChannelId: row.messageChannelId,
              provider: row.provider,
              normalizedSenderHandle: row.normalizedSenderHandle,
              normalizedRecipient: row.normalizedRecipient,
              providerMessageId: row.providerMessageId,
              providerAcceptedAt: acceptedAt,
            }),
          );
        }
      } else if (
        first.occurrenceState === 'SKIPPED' ||
        first.occurrenceState === 'CANCELLED'
      ) {
        entries.push(
          Object.freeze({
            kind: 'MATERIALIZED_TERMINAL',
            authorizationId: first.authorizationId,
            enrollmentId: first.enrollmentId,
            occurrenceId: first.occurrenceId,
            workflowVersionId: first.workflowVersionId,
            messageId: first.messageId,
            authoredMessageIndex: first.authoredMessageIndex,
            occurrenceState: first.occurrenceState,
            terminalReason: first.terminalReason,
            terminalAt: iso(first.terminalAt) as string,
          }),
        );
      } else if (first.occurrenceState === 'SUCCEEDED') {
        blockerFlags.add('UNRECONCILED_HISTORY');
      } else {
        blockerFlags.add('UNRESOLVED_HISTORY');
      }
    }

    const unique = new Set(
      entries.map(
        (entry) =>
          `${entry.workflowVersionId}:${entry.messageId}:${entry.authoredMessageIndex}`,
      ),
    );
    if (unique.size !== entries.length) {
      blockerFlags.add('AMBIGUOUS_HISTORY');
    }
    for (const reason of CAMPAIGN_PROGRESSION_HISTORY_BLOCKER_PRECEDENCE) {
      if (blockerFlags.has(reason)) return blocked(reason);
    }
    entries.sort(
      (left, right) =>
        left.authoredMessageIndex - right.authoredMessageIndex ||
        left.messageId.localeCompare(right.messageId),
    );
    const acceptedTimes = entries
      .filter((entry) => entry.kind === 'ACCEPTED')
      .map((entry) => entry.providerAcceptedAt)
      .sort();

    return Object.freeze({
      status: 'COMPLETE',
      entries: Object.freeze(entries),
      lastProviderAcceptedAt:
        acceptedTimes.length === 0
          ? null
          : acceptedTimes[acceptedTimes.length - 1],
    });
  }
}
