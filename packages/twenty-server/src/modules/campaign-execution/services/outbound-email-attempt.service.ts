import { Injectable } from '@nestjs/common';
import { type EntityManager, type QueryRunner } from 'typeorm';

import {
  OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
  OUTBOUND_EMAIL_UNKNOWN_AFTER_MS,
} from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
import {
  type BeginOutboundEmailSubmissionInput,
  type OutboundEmailAttemptReceipt,
  type OutboundEmailAttemptReservationIdentity,
  type OutboundEmailAttemptState,
} from 'src/modules/campaign-execution/types/outbound-email-attempt.type';

const ATTEMPT_ADVISORY_NAMESPACE = 322331;
const ATTEMPT_ADVISORY_PREFIX = 'outbound-email-attempt:';

const ATTEMPT_ADVISORY_LOCK_SQL = `
  SELECT pg_advisory_xact_lock(hashtextextended($1, $2)) AS locked
`;

const ATTEMPT_LOCK_SQL = `
  SELECT *
  FROM "core"."outboundEmailAttempt"
  WHERE "attemptId" = $1
  FOR UPDATE
`;

const RECEIPT_READ_SQL = `
  SELECT *
  FROM "core"."outboundEmailAttempt"
  WHERE "workspaceId" = $1 AND "attemptId" = $2
`;

const INSERT_RESERVED_SQL = `
  INSERT INTO "core"."outboundEmailAttempt" (
    "attemptId", "workspaceId", "source", "attemptState", "capacityState",
    "connectedAccountId", "messageChannelId", "provider",
    "normalizedSenderHandle", "normalizedRecipient", "selectionConstraintKind",
    "priorAcceptedEvidenceId", "senderPoolFingerprint", "localDate", "claimedAt",
    "slotAt", "unknownAfter", "campaignId", "enrollmentId", "occurrenceId",
    "authorizationId", "workflowVersionId", "messageId", "attemptNumber",
    "renderDigest", "testPreparationProofId", "requesterUserWorkspaceId",
    "previewDigest", "testTransportDigest", "directReservationCapabilityId",
    "finalEvidenceDigest", "providerMessageId", "providerAcceptedAt",
    "safeOutcomeReason", "retryable", "projectedMessageId"
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
    $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
    $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36
  )
  RETURNING *
`;

const TIME_SAMPLE_SQL = `
  WITH sampled_time AS MATERIALIZED (
    SELECT clock_timestamp() AS observed_at
  )
  SELECT observed_at AS "observedAt"
  FROM sampled_time
`;

const BEGIN_PROCESSING_SQL = `
  UPDATE "core"."outboundEmailAttempt"
  SET "attemptState" = 'PROCESSING',
      "finalEvidenceDigest" = $3,
      "updatedAt" = $4
  WHERE "workspaceId" = $1
    AND "attemptId" = $2
    AND "attemptState" = 'RESERVED'
  RETURNING *
`;

type PersistedIdentity = {
  attemptId: string;
  workspaceId: string;
  source: string;
  connectedAccountId: string;
  messageChannelId: string;
  provider: string;
  normalizedSenderHandle: string;
  normalizedRecipient: string;
  selectionConstraintKind: string;
  priorAcceptedEvidenceId: string | null;
  senderPoolFingerprint: string | null;
  localDate: string;
  claimedAt: Date;
  slotAt: Date;
  unknownAfter: Date;
  campaignId: string | null;
  enrollmentId: string | null;
  occurrenceId: string | null;
  authorizationId: string | null;
  workflowVersionId: string | null;
  messageId: string | null;
  attemptNumber: number | null;
  renderDigest: string | null;
  testPreparationProofId: string | null;
  requesterUserWorkspaceId: string | null;
  previewDigest: string | null;
  testTransportDigest: string | null;
  directReservationCapabilityId: string | null;
};

type TimeSampleRow = { observedAt: Date | string };

const isActiveQueryRunner = (
  queryRunner: QueryRunner | undefined,
): queryRunner is QueryRunner =>
  queryRunner !== undefined &&
  queryRunner.isTransactionActive === true &&
  typeof queryRunner.query === 'function';

const requireRunner = (manager: EntityManager): QueryRunner => {
  if (!isActiveQueryRunner(manager.queryRunner)) {
    throw new Error('Outbound email attempt requires an active query runner');
  }

  return manager.queryRunner;
};

const isCanonicalUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);

const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

const isNormalizedText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value === value.trim().toLowerCase();

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const isLocalDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const hasOnlyExpectedSourceFields = (
  input: OutboundEmailAttemptReservationIdentity,
): boolean => {
  // SAFETY: runtime shape validation intentionally inspects forbidden union fields.
  const value = input as unknown as Record<string, unknown>;
  const absent = (keys: string[]) => keys.every((key) => value[key] == null);

  if (input.source === 'CAMPAIGN_SEQUENCE') {
    return (
      (input.selectionConstraintKind === 'ROTATE' ||
        input.selectionConstraintKind === 'PINNED_REPLY') &&
      [
        input.campaignId,
        input.enrollmentId,
        input.occurrenceId,
        input.authorizationId,
        input.workflowVersionId,
        input.messageId,
      ].every(isCanonicalUuid) &&
      Number.isInteger(input.attemptNumber) &&
      input.attemptNumber > 0 &&
      isDigest(input.senderPoolFingerprint) &&
      isDigest(input.renderDigest) &&
      input.reservationEvidence.kind === 'CAMPAIGN_SEQUENCE_RESERVATION' &&
      absent([
        'testPreparationProofId',
        'requesterUserWorkspaceId',
        'previewDigest',
        'testTransportDigest',
        'directReservationCapabilityId',
      ])
    );
  }

  if (input.source === 'CAMPAIGN_TEST') {
    return (
      input.selectionConstraintKind === 'ROTATE' &&
      input.priorAcceptedEvidenceId === null &&
      [
        input.campaignId,
        input.workflowVersionId,
        input.messageId,
        input.requesterUserWorkspaceId,
        input.reservationEvidence.testPreparationProofId,
      ].every(isCanonicalUuid) &&
      isDigest(input.senderPoolFingerprint) &&
      isDigest(input.renderDigest) &&
      isDigest(input.previewDigest) &&
      isDigest(input.testTransportDigest) &&
      input.reservationEvidence.kind === 'TEST_PREPARATION_PROOF' &&
      input.reservationEvidence.maySubmit === false &&
      absent([
        'enrollmentId',
        'occurrenceId',
        'authorizationId',
        'attemptNumber',
        'directReservationCapabilityId',
      ])
    );
  }

  return (
    (input.source === 'INBOX' || input.source === 'AUTOMATED_REPLY') &&
    (input.selectionConstraintKind === 'EXPLICIT' ||
      input.selectionConstraintKind === 'PINNED_REPLY') &&
    isCanonicalUuid(input.directReservationCapabilityId) &&
    input.reservationEvidence.kind === 'DIRECT_RESERVATION_CAPABILITY' &&
    input.reservationEvidence.directReservationCapabilityId ===
      input.directReservationCapabilityId &&
    absent([
      'campaignId',
      'enrollmentId',
      'occurrenceId',
      'authorizationId',
      'workflowVersionId',
      'messageId',
      'attemptNumber',
      'senderPoolFingerprint',
      'renderDigest',
      'testPreparationProofId',
      'requesterUserWorkspaceId',
      'previewDigest',
      'testTransportDigest',
    ])
  );
};

const isValidReservationIdentity = (
  input: OutboundEmailAttemptReservationIdentity,
): boolean =>
  input !== null &&
  typeof input === 'object' &&
  [
    input.attemptId,
    input.workspaceId,
    input.connectedAccountId,
    input.messageChannelId,
  ].every(isCanonicalUuid) &&
  isNormalizedText(input.provider) &&
  isNormalizedText(input.normalizedSenderHandle) &&
  isNormalizedText(input.normalizedRecipient) &&
  isLocalDate(input.localDate) &&
  isValidDate(input.claimedAt) &&
  isValidDate(input.slotAt) &&
  isValidDate(input.unknownAfter) &&
  input.unknownAfter.getTime() - input.claimedAt.getTime() ===
    OUTBOUND_EMAIL_UNKNOWN_AFTER_MS &&
  ((input.selectionConstraintKind === 'PINNED_REPLY' &&
    isCanonicalUuid(input.priorAcceptedEvidenceId)) ||
    ((input.selectionConstraintKind === 'ROTATE' ||
      input.selectionConstraintKind === 'EXPLICIT') &&
      input.priorAcceptedEvidenceId === null)) &&
  hasOnlyExpectedSourceFields(input);

const toPersistedIdentity = (
  input: OutboundEmailAttemptReservationIdentity,
): PersistedIdentity => ({
  attemptId: input.attemptId,
  workspaceId: input.workspaceId,
  source: input.source,
  connectedAccountId: input.connectedAccountId,
  messageChannelId: input.messageChannelId,
  provider: input.provider,
  normalizedSenderHandle: input.normalizedSenderHandle,
  normalizedRecipient: input.normalizedRecipient,
  selectionConstraintKind: input.selectionConstraintKind,
  priorAcceptedEvidenceId: input.priorAcceptedEvidenceId,
  senderPoolFingerprint:
    input.source === 'CAMPAIGN_SEQUENCE' || input.source === 'CAMPAIGN_TEST'
      ? input.senderPoolFingerprint
      : null,
  localDate: input.localDate,
  claimedAt: input.claimedAt,
  slotAt: input.slotAt,
  unknownAfter: input.unknownAfter,
  campaignId:
    input.source === 'CAMPAIGN_SEQUENCE' || input.source === 'CAMPAIGN_TEST'
      ? input.campaignId
      : null,
  enrollmentId:
    input.source === 'CAMPAIGN_SEQUENCE' ? input.enrollmentId : null,
  occurrenceId:
    input.source === 'CAMPAIGN_SEQUENCE' ? input.occurrenceId : null,
  authorizationId:
    input.source === 'CAMPAIGN_SEQUENCE' ? input.authorizationId : null,
  workflowVersionId:
    input.source === 'CAMPAIGN_SEQUENCE' || input.source === 'CAMPAIGN_TEST'
      ? input.workflowVersionId
      : null,
  messageId:
    input.source === 'CAMPAIGN_SEQUENCE' || input.source === 'CAMPAIGN_TEST'
      ? input.messageId
      : null,
  attemptNumber:
    input.source === 'CAMPAIGN_SEQUENCE' ? input.attemptNumber : null,
  renderDigest:
    input.source === 'CAMPAIGN_SEQUENCE' || input.source === 'CAMPAIGN_TEST'
      ? input.renderDigest
      : null,
  testPreparationProofId:
    input.source === 'CAMPAIGN_TEST'
      ? input.reservationEvidence.testPreparationProofId
      : null,
  requesterUserWorkspaceId:
    input.source === 'CAMPAIGN_TEST' ? input.requesterUserWorkspaceId : null,
  previewDigest: input.source === 'CAMPAIGN_TEST' ? input.previewDigest : null,
  testTransportDigest:
    input.source === 'CAMPAIGN_TEST' ? input.testTransportDigest : null,
  directReservationCapabilityId:
    input.source === 'INBOX' || input.source === 'AUTOMATED_REPLY'
      ? input.directReservationCapabilityId
      : null,
});

const toMillis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }

  return null;
};

const isExactPersistedIdentity = (
  expected: PersistedIdentity,
  receipt: OutboundEmailAttemptReceipt,
): boolean => {
  // SAFETY: the database row is inspected by the canonical persisted-field keys.
  const actual = receipt as unknown as Record<string, unknown>;

  return Object.entries(expected).every(([key, value]) => {
    if (value instanceof Date) return toMillis(actual[key]) === value.getTime();

    return actual[key] === value;
  });
};

const lockAttempt = async (
  queryRunner: QueryRunner,
  attemptId: string,
): Promise<OutboundEmailAttemptReceipt | null> => {
  const rows = (await queryRunner.query(ATTEMPT_LOCK_SQL, [
    attemptId,
  ])) as OutboundEmailAttemptReceipt[];

  if (rows.length > 1)
    throw new Error('Invalid outbound email attempt row count');

  return rows[0] ?? null;
};

const takeAttemptFence = async (
  queryRunner: QueryRunner,
  attemptId: string,
): Promise<void> => {
  await queryRunner.query(ATTEMPT_ADVISORY_LOCK_SQL, [
    `${ATTEMPT_ADVISORY_PREFIX}${attemptId}`,
    ATTEMPT_ADVISORY_NAMESPACE,
  ]);
};

const requireReservationIdentity = (
  input: OutboundEmailAttemptReservationIdentity,
): PersistedIdentity => {
  if (!isValidReservationIdentity(input)) {
    throw new Error('Invalid outbound email attempt input');
  }

  return toPersistedIdentity(input);
};

type ReservationBindingProjection = {
  selectionConstraintKind: string;
  priorAcceptedEvidenceId: string | null;
  localDate: string;
  claimedAt: Date;
  slotAt: Date;
  unknownAfter: Date;
};

const isValidCommonReservationBinding = (
  binding: ReservationBindingProjection,
): boolean =>
  isLocalDate(binding.localDate) &&
  isValidDate(binding.claimedAt) &&
  isValidDate(binding.slotAt) &&
  isValidDate(binding.unknownAfter) &&
  binding.unknownAfter.getTime() - binding.claimedAt.getTime() ===
    OUTBOUND_EMAIL_UNKNOWN_AFTER_MS;

const hasValidSelectionBinding = (
  binding: ReservationBindingProjection,
  allowed: readonly string[],
): boolean =>
  allowed.includes(binding.selectionConstraintKind) &&
  ((binding.selectionConstraintKind === 'PINNED_REPLY' &&
    isCanonicalUuid(binding.priorAcceptedEvidenceId)) ||
    (binding.selectionConstraintKind !== 'PINNED_REPLY' &&
      binding.priorAcceptedEvidenceId === null));

const matchesReservationBinding = (
  stored: Record<string, unknown>,
  binding: ReservationBindingProjection,
): boolean =>
  stored.selectionConstraintKind === binding.selectionConstraintKind &&
  stored.priorAcceptedEvidenceId === binding.priorAcceptedEvidenceId &&
  stored.localDate === binding.localDate &&
  toMillis(stored.claimedAt) === binding.claimedAt.getTime() &&
  toMillis(stored.slotAt) === binding.slotAt.getTime() &&
  toMillis(stored.unknownAfter) === binding.unknownAfter.getTime();

const isValidSubmissionInput = (
  input: BeginOutboundEmailSubmissionInput,
): boolean => {
  if (
    input === null ||
    typeof input !== 'object' ||
    ![
      input.attemptId,
      input.workspaceId,
      input.connectedAccountId,
      input.messageChannelId,
    ].every(isCanonicalUuid) ||
    !isNormalizedText(input.provider) ||
    !isNormalizedText(input.normalizedSenderHandle) ||
    !isNormalizedText(input.normalizedRecipient) ||
    !isDigest(input.finalEvidenceDigest)
  ) {
    return false;
  }

  if (input.source === 'CAMPAIGN_SEQUENCE') {
    const capability = input.submissionCapability;
    const context = capability.renderContext;

    return (
      capability.kind === 'CAMPAIGN_SEQUENCE_SUBMISSION' &&
      [
        input.campaignId,
        input.enrollmentId,
        input.occurrenceId,
        input.authorizationId,
        input.workflowVersionId,
        input.messageId,
        capability.attemptId,
        context.workspaceId,
        context.campaignId,
        context.enrollmentId,
        context.occurrenceId,
        context.authorizationId,
        context.workflowVersionId,
        context.messageId,
        context.connectedAccountId,
        context.messageChannelId,
      ].every(isCanonicalUuid) &&
      isNormalizedText(context.provider) &&
      isNormalizedText(context.normalizedSenderHandle) &&
      isNormalizedText(context.normalizedRecipient) &&
      isDigest(input.renderDigest) &&
      isDigest(capability.renderDigest) &&
      isValidCommonReservationBinding(capability.reservationBinding) &&
      hasValidSelectionBinding(capability.reservationBinding, [
        'ROTATE',
        'PINNED_REPLY',
      ]) &&
      Number.isInteger(capability.reservationBinding.attemptNumber) &&
      capability.reservationBinding.attemptNumber > 0 &&
      isDigest(capability.reservationBinding.senderPoolFingerprint)
    );
  }

  if (input.source === 'CAMPAIGN_TEST') {
    const capability = input.submissionCapability;

    return (
      capability.kind === 'CAMPAIGN_TEST_SUBMISSION' &&
      [
        input.campaignId,
        input.workflowVersionId,
        input.messageId,
        input.testPreparationProofId,
        input.requesterUserWorkspaceId,
        capability.testSubmissionCapabilityId,
        capability.attemptId,
        capability.testPreparationProofId,
        capability.workspaceId,
        capability.campaignId,
        capability.workflowVersionId,
        capability.messageId,
        capability.requesterUserWorkspaceId,
        capability.connectedAccountId,
        capability.messageChannelId,
      ].every(isCanonicalUuid) &&
      isNormalizedText(capability.provider) &&
      isNormalizedText(capability.normalizedSenderHandle) &&
      isNormalizedText(capability.normalizedRecipient) &&
      [
        input.renderDigest,
        input.previewDigest,
        input.testTransportDigest,
        capability.renderDigest,
        capability.previewDigest,
        capability.testTransportDigest,
      ].every(isDigest) &&
      isValidCommonReservationBinding(capability.reservationBinding) &&
      hasValidSelectionBinding(capability.reservationBinding, ['ROTATE']) &&
      isDigest(capability.reservationBinding.senderPoolFingerprint)
    );
  }

  const capability = input.submissionCapability;

  return (
    (input.source === 'INBOX' || input.source === 'AUTOMATED_REPLY') &&
    capability.kind === 'DIRECT_SUBMISSION_CAPABILITY' &&
    isCanonicalUuid(input.directReservationCapabilityId) &&
    [
      capability.directSubmissionCapabilityId,
      capability.directReservationCapabilityId,
      capability.attemptId,
      capability.workspaceId,
      capability.connectedAccountId,
      capability.messageChannelId,
    ].every(isCanonicalUuid) &&
    isNormalizedText(capability.provider) &&
    isDigest(capability.finalEvidenceDigest) &&
    isNormalizedText(capability.normalizedSenderHandle) &&
    isNormalizedText(capability.normalizedRecipient) &&
    isValidCommonReservationBinding(capability.reservationBinding) &&
    hasValidSelectionBinding(capability.reservationBinding, [
      'PINNED_REPLY',
      'EXPLICIT',
    ]) &&
    isCanonicalUuid(capability.reservationBinding.directReservationCapabilityId)
  );
};

const matchesSubmission = (
  input: BeginOutboundEmailSubmissionInput,
  receipt: OutboundEmailAttemptReceipt,
): boolean => {
  // SAFETY: source narrowing is driven by the trusted input before row fields are compared.
  const stored = receipt as unknown as Record<string, unknown>;
  const commonMatches =
    stored.source === input.source &&
    stored.attemptId === input.attemptId &&
    stored.workspaceId === input.workspaceId &&
    stored.connectedAccountId === input.connectedAccountId &&
    stored.messageChannelId === input.messageChannelId &&
    stored.provider === input.provider &&
    stored.normalizedSenderHandle === input.normalizedSenderHandle &&
    stored.normalizedRecipient === input.normalizedRecipient;

  if (!commonMatches) return false;

  if (input.source === 'CAMPAIGN_SEQUENCE') {
    const capability = input.submissionCapability;
    const context = capability.renderContext;

    return (
      stored.campaignId === input.campaignId &&
      stored.enrollmentId === input.enrollmentId &&
      stored.occurrenceId === input.occurrenceId &&
      stored.authorizationId === input.authorizationId &&
      stored.workflowVersionId === input.workflowVersionId &&
      stored.messageId === input.messageId &&
      stored.renderDigest === input.renderDigest &&
      matchesReservationBinding(stored, capability.reservationBinding) &&
      stored.attemptNumber === capability.reservationBinding.attemptNumber &&
      stored.senderPoolFingerprint ===
        capability.reservationBinding.senderPoolFingerprint &&
      capability.attemptId === input.attemptId &&
      capability.renderDigest === input.renderDigest &&
      context.workspaceId === input.workspaceId &&
      context.campaignId === input.campaignId &&
      context.enrollmentId === input.enrollmentId &&
      context.occurrenceId === input.occurrenceId &&
      context.authorizationId === input.authorizationId &&
      context.workflowVersionId === input.workflowVersionId &&
      context.messageId === input.messageId &&
      context.connectedAccountId === input.connectedAccountId &&
      context.messageChannelId === input.messageChannelId &&
      context.provider === input.provider &&
      context.normalizedSenderHandle === input.normalizedSenderHandle &&
      context.normalizedRecipient === input.normalizedRecipient
    );
  }

  if (input.source === 'CAMPAIGN_TEST') {
    const capability = input.submissionCapability;

    return (
      stored.campaignId === input.campaignId &&
      stored.workflowVersionId === input.workflowVersionId &&
      stored.messageId === input.messageId &&
      stored.testPreparationProofId === input.testPreparationProofId &&
      stored.requesterUserWorkspaceId === input.requesterUserWorkspaceId &&
      stored.renderDigest === input.renderDigest &&
      stored.previewDigest === input.previewDigest &&
      stored.testTransportDigest === input.testTransportDigest &&
      matchesReservationBinding(stored, capability.reservationBinding) &&
      stored.senderPoolFingerprint ===
        capability.reservationBinding.senderPoolFingerprint &&
      capability.attemptId === input.attemptId &&
      capability.testPreparationProofId === input.testPreparationProofId &&
      capability.workspaceId === input.workspaceId &&
      capability.campaignId === input.campaignId &&
      capability.workflowVersionId === input.workflowVersionId &&
      capability.messageId === input.messageId &&
      capability.requesterUserWorkspaceId === input.requesterUserWorkspaceId &&
      capability.normalizedRecipient === input.normalizedRecipient &&
      capability.connectedAccountId === input.connectedAccountId &&
      capability.messageChannelId === input.messageChannelId &&
      capability.provider === input.provider &&
      capability.normalizedSenderHandle === input.normalizedSenderHandle &&
      capability.renderDigest === input.renderDigest &&
      capability.previewDigest === input.previewDigest &&
      capability.testTransportDigest === input.testTransportDigest
    );
  }

  const capability = input.submissionCapability;

  return (
    stored.directReservationCapabilityId ===
      input.directReservationCapabilityId &&
    matchesReservationBinding(stored, capability.reservationBinding) &&
    stored.directReservationCapabilityId ===
      capability.reservationBinding.directReservationCapabilityId &&
    capability.attemptId === input.attemptId &&
    capability.directReservationCapabilityId ===
      input.directReservationCapabilityId &&
    capability.workspaceId === input.workspaceId &&
    capability.connectedAccountId === input.connectedAccountId &&
    capability.messageChannelId === input.messageChannelId &&
    capability.provider === input.provider &&
    capability.normalizedSenderHandle === input.normalizedSenderHandle &&
    capability.normalizedRecipient === input.normalizedRecipient &&
    capability.finalEvidenceDigest === input.finalEvidenceDigest
  );
};

const receiptUnknownAfter = (
  receipt: OutboundEmailAttemptReceipt,
): Date | null => {
  const milliseconds = toMillis(receipt.unknownAfter);

  return milliseconds === null ? null : new Date(milliseconds);
};

const isValidProcessingReceipt = (
  input: BeginOutboundEmailSubmissionInput,
  value: unknown,
): value is OutboundEmailAttemptReceipt => {
  if (value === null || typeof value !== 'object') return false;

  const receipt = value as OutboundEmailAttemptReceipt;
  const claimedAt = toMillis(receipt.claimedAt);
  const unknownAfter = toMillis(receipt.unknownAfter);

  return (
    receipt.attemptState === 'PROCESSING' &&
    receipt.capacityState === 'RESERVED' &&
    receipt.finalEvidenceDigest === input.finalEvidenceDigest &&
    isLocalDate(receipt.localDate) &&
    claimedAt !== null &&
    toMillis(receipt.slotAt) !== null &&
    unknownAfter !== null &&
    unknownAfter - claimedAt === OUTBOUND_EMAIL_UNKNOWN_AFTER_MS &&
    toMillis(receipt.createdAt) !== null &&
    toMillis(receipt.updatedAt) !== null &&
    matchesSubmission(input, receipt)
  );
};

@Injectable()
export class OutboundEmailAttemptService {
  async lockAttemptForReservation(
    input: OutboundEmailAttemptReservationIdentity,
    manager: EntityManager,
  ): Promise<
    | { status: 'NEW' }
    | { status: 'EXACT_REPLAY'; receipt: OutboundEmailAttemptReceipt }
    | { status: 'IDENTITY_CONFLICT' }
  > {
    const queryRunner = requireRunner(manager);
    const expected = requireReservationIdentity(input);

    await takeAttemptFence(queryRunner, input.attemptId);
    const receipt = await lockAttempt(queryRunner, input.attemptId);

    if (receipt === null) return { status: 'NEW' };

    return isExactPersistedIdentity(expected, receipt)
      ? { receipt, status: 'EXACT_REPLAY' }
      : { status: 'IDENTITY_CONFLICT' };
  }

  async insertReservedAttempt(
    input: OutboundEmailAttemptReservationIdentity,
    manager: EntityManager,
  ): Promise<OutboundEmailAttemptReceipt> {
    const queryRunner = requireRunner(manager);
    const identity = requireReservationIdentity(input);

    await takeAttemptFence(queryRunner, input.attemptId);
    if ((await lockAttempt(queryRunner, input.attemptId)) !== null) {
      throw new Error('Outbound email attempt already exists');
    }

    const rows = (await queryRunner.query(INSERT_RESERVED_SQL, [
      identity.attemptId,
      identity.workspaceId,
      identity.source,
      'RESERVED',
      'RESERVED',
      identity.connectedAccountId,
      identity.messageChannelId,
      identity.provider,
      identity.normalizedSenderHandle,
      identity.normalizedRecipient,
      identity.selectionConstraintKind,
      identity.priorAcceptedEvidenceId,
      identity.senderPoolFingerprint,
      identity.localDate,
      identity.claimedAt,
      identity.slotAt,
      identity.unknownAfter,
      identity.campaignId,
      identity.enrollmentId,
      identity.occurrenceId,
      identity.authorizationId,
      identity.workflowVersionId,
      identity.messageId,
      identity.attemptNumber,
      identity.renderDigest,
      identity.testPreparationProofId,
      identity.requesterUserWorkspaceId,
      identity.previewDigest,
      identity.testTransportDigest,
      identity.directReservationCapabilityId,
      null,
      null,
      null,
      null,
      null,
      null,
    ])) as OutboundEmailAttemptReceipt[];

    if (rows.length !== 1) {
      throw new Error('Outbound email attempt insert did not affect one row');
    }

    return rows[0];
  }

  async beginSubmission(
    input: BeginOutboundEmailSubmissionInput,
    manager: EntityManager,
  ): Promise<
    | { status: 'PROCESSING_ACQUIRED'; receipt: OutboundEmailAttemptReceipt }
    | {
        status: 'NOT_ACQUIRED';
        currentState: Exclude<OutboundEmailAttemptState, 'RESERVED'>;
        receipt: OutboundEmailAttemptReceipt;
      }
    | {
        status: 'RESERVATION_WINDOW_EXPIRED';
        currentState: 'RESERVED';
        receipt: OutboundEmailAttemptReceipt;
      }
    | { status: 'IDENTITY_CONFLICT' }
  > {
    const queryRunner = requireRunner(manager);

    if (!isValidSubmissionInput(input)) {
      throw new Error('Invalid outbound email submission input');
    }

    const receipt = await lockAttempt(queryRunner, input.attemptId);

    if (receipt === null || !matchesSubmission(input, receipt)) {
      return { status: 'IDENTITY_CONFLICT' };
    }

    if (receipt.attemptState !== 'RESERVED') {
      return {
        currentState: receipt.attemptState,
        receipt,
        status: 'NOT_ACQUIRED',
      };
    }

    const sampleRows = (await queryRunner.query(
      TIME_SAMPLE_SQL,
    )) as TimeSampleRow[];
    const observedAt =
      sampleRows.length === 1 ? toMillis(sampleRows[0].observedAt) : null;
    const unknownAfter = receiptUnknownAfter(receipt)?.getTime() ?? null;

    if (observedAt === null || unknownAfter === null) {
      throw new Error('Invalid outbound email attempt time sample');
    }

    if (
      observedAt + OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS >=
      unknownAfter
    ) {
      return {
        currentState: 'RESERVED',
        receipt,
        status: 'RESERVATION_WINDOW_EXPIRED',
      };
    }

    const result = await queryRunner.query(
      BEGIN_PROCESSING_SQL,
      [
        input.workspaceId,
        input.attemptId,
        input.finalEvidenceDigest,
        new Date(observedAt),
      ],
      true,
    );

    if (
      result === null ||
      typeof result !== 'object' ||
      result.affected !== 1 ||
      !Array.isArray(result.records) ||
      result.records.length !== 1 ||
      !isValidProcessingReceipt(input, result.records[0])
    ) {
      throw new Error(
        'Outbound email processing CAS did not affect one valid row',
      );
    }

    return { receipt: result.records[0], status: 'PROCESSING_ACQUIRED' };
  }

  async getReceipt(
    input: { workspaceId: string; attemptId: string },
    manager: EntityManager,
  ): Promise<OutboundEmailAttemptReceipt | null> {
    const queryRunner = requireRunner(manager);

    if (
      !isCanonicalUuid(input.workspaceId) ||
      !isCanonicalUuid(input.attemptId)
    ) {
      throw new Error('Invalid outbound email receipt input');
    }

    const rows = (await queryRunner.query(RECEIPT_READ_SQL, [
      input.workspaceId,
      input.attemptId,
    ])) as OutboundEmailAttemptReceipt[];

    if (rows.length > 1)
      throw new Error('Invalid outbound email receipt row count');

    return rows[0] ?? null;
  }
}
