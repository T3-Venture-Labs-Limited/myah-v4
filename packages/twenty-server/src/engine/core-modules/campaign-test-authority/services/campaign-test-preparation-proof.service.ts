import { Injectable } from '@nestjs/common';
import { IANA_TIME_ZONES } from 'twenty-shared/constants';
import { emailSchema } from 'twenty-shared/utils';
import { type EntityManager, type QueryRunner } from 'typeorm';

import {
  type CampaignTestPreparationProof,
  type CampaignTestPreparationProofIdentity,
  type CampaignTestPreparationProofReadResult,
  type CampaignTestPreparationProofRequesterScope,
  type CreateCampaignTestPreparationProofInput,
  type CreateCampaignTestPreparationProofResult,
  type FinalizeCampaignTestPreparationProofInput,
  type FinalizeCampaignTestPreparationProofResult,
} from 'src/engine/core-modules/campaign-test-authority/types/campaign-test-authority.type';

const PROOF_ADVISORY_NAMESPACE = 320322;
const PROOF_ADVISORY_PREFIX = 'campaign-test-preparation-proof:';

const PROOF_ADVISORY_LOCK_SQL = `
  SELECT pg_advisory_xact_lock(hashtextextended($1, $2)) AS locked
`;

const CONFIRMATION_LOCK_SQL = `
  SELECT *
  FROM "core"."campaignTestPreparationProof"
  WHERE "confirmationId" = $1
  FOR UPDATE
`;

const INSERT_PROOF_SQL = `
  INSERT INTO "core"."campaignTestPreparationProof" (
    "testPreparationProofId", "confirmationId", "attemptId", "workspaceId",
    "campaignId", "campaignCreatorId", "workflowVersionId", "messageId",
    "requesterUserId", "requesterUserWorkspaceId", "normalizedRecipient",
    "connectedAccountId", "messageChannelId", "provider",
    "normalizedSenderHandle", "senderPoolFingerprint",
    "campaignCapacityTimeZone", "selectionConstraintKind",
    "priorAcceptedEvidenceId", "threadScopeKind", "plannedPriorMessageId",
    "threadEnrollmentId", "threadOccurrenceId", "renderDigest",
    "previewDigest", "testTransportDigest", "confirmationIssuedAt",
    "reservationEligibleUntil"
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
    $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
  )
  ON CONFLICT DO NOTHING
  RETURNING *
`;

const REQUESTER_READ_SQL = `
  SELECT *
  FROM "core"."campaignTestPreparationProof"
  WHERE "workspaceId" = $1
    AND "confirmationId" = $2
    AND "requesterUserId" = $3
    AND "requesterUserWorkspaceId" = $4
`;

const PROOF_IDENTITY_READ_SQL = `
  SELECT *
  FROM "core"."campaignTestPreparationProof"
  WHERE "workspaceId" = $1
    AND "attemptId" = $2
    AND "testPreparationProofId" = $3
`;

const FINALIZE_PROOF_SQL = `
  UPDATE "core"."campaignTestPreparationProof"
  SET "testSubmissionCapabilityId" = $4,
      "finalEvidenceDigest" = $5
  WHERE "workspaceId" = $1
    AND "attemptId" = $2
    AND "testPreparationProofId" = $3
    AND "testSubmissionCapabilityId" IS NULL
    AND "finalEvidenceDigest" IS NULL
  RETURNING *
`;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SUPPORTED_IANA_TIME_ZONES = new Set<string>(IANA_TIME_ZONES);

const isCanonicalUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && DIGEST_PATTERN.test(value);

const isNonblankText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isNormalizedText = (value: unknown): value is string =>
  isNonblankText(value) && value === value.trim().toLowerCase();

const isCanonicalEmail = (value: unknown): value is string =>
  isNormalizedText(value) && emailSchema.safeParse(value).success;

const isSupportedIanaTimeZone = (value: unknown): value is string =>
  typeof value === 'string' && SUPPORTED_IANA_TIME_ZONES.has(value);

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

const isActiveUnreleasedRunner = (
  queryRunner: unknown,
): queryRunner is QueryRunner =>
  queryRunner !== null &&
  typeof queryRunner === 'object' &&
  'isTransactionActive' in queryRunner &&
  queryRunner.isTransactionActive === true &&
  'isReleased' in queryRunner &&
  queryRunner.isReleased === false &&
  'query' in queryRunner &&
  typeof queryRunner.query === 'function';

const suppliedRunner = (manager: EntityManager): QueryRunner | null => {
  if (manager === null || typeof manager !== 'object') return null;

  const queryRunner = (manager as { queryRunner?: unknown }).queryRunner;

  return isActiveUnreleasedRunner(queryRunner) ? queryRunner : null;
};

const hasValidThreadAndSelectionShape = (
  proof: Pick<
    CampaignTestPreparationProof,
    | 'selectionConstraintKind'
    | 'priorAcceptedEvidenceId'
    | 'threadScopeKind'
    | 'plannedPriorMessageId'
    | 'threadEnrollmentId'
    | 'threadOccurrenceId'
  >,
): boolean => {
  const selectionValid =
    (proof.selectionConstraintKind === 'ROTATE' &&
      proof.priorAcceptedEvidenceId === null &&
      (proof.threadScopeKind === 'NEW_THREAD' ||
        proof.threadScopeKind === 'PLANNED_PRIOR_STEP')) ||
    (proof.selectionConstraintKind === 'PINNED_REPLY' &&
      isCanonicalUuid(proof.priorAcceptedEvidenceId) &&
      proof.threadScopeKind === 'EXISTING_EVIDENCE');

  if (!selectionValid) return false;

  if (proof.threadScopeKind === 'NEW_THREAD') {
    return (
      proof.plannedPriorMessageId === null &&
      proof.threadEnrollmentId === null &&
      proof.threadOccurrenceId === null
    );
  }

  if (proof.threadScopeKind === 'PLANNED_PRIOR_STEP') {
    return (
      isCanonicalUuid(proof.plannedPriorMessageId) &&
      proof.threadEnrollmentId === null &&
      proof.threadOccurrenceId === null
    );
  }

  return (
    proof.plannedPriorMessageId === null &&
    isCanonicalUuid(proof.threadEnrollmentId) &&
    isCanonicalUuid(proof.threadOccurrenceId) &&
    isCanonicalUuid(proof.priorAcceptedEvidenceId)
  );
};

const immutableUuidFields = [
  'testPreparationProofId',
  'confirmationId',
  'attemptId',
  'workspaceId',
  'campaignId',
  'campaignCreatorId',
  'workflowVersionId',
  'messageId',
  'requesterUserId',
  'requesterUserWorkspaceId',
  'connectedAccountId',
  'messageChannelId',
] as const satisfies readonly (keyof CreateCampaignTestPreparationProofInput)[];

const isValidCreateInput = (
  input: CreateCampaignTestPreparationProofInput,
): boolean =>
  input !== null &&
  typeof input === 'object' &&
  immutableUuidFields.every((field) => isCanonicalUuid(input[field])) &&
  isCanonicalEmail(input.normalizedRecipient) &&
  isCanonicalEmail(input.normalizedSenderHandle) &&
  isNormalizedText(input.provider) &&
  isNonblankText(input.senderPoolFingerprint) &&
  isSupportedIanaTimeZone(input.campaignCapacityTimeZone) &&
  isDigest(input.renderDigest) &&
  isDigest(input.previewDigest) &&
  isDigest(input.testTransportDigest) &&
  isValidDate(input.confirmationIssuedAt) &&
  isValidDate(input.reservationEligibleUntil) &&
  input.reservationEligibleUntil.getTime() >
    input.confirmationIssuedAt.getTime() &&
  hasValidThreadAndSelectionShape(input);

const isValidFinalizationPair = (
  proof: Pick<
    CampaignTestPreparationProof,
    'testSubmissionCapabilityId' | 'finalEvidenceDigest'
  >,
): boolean =>
  (proof.testSubmissionCapabilityId === null &&
    proof.finalEvidenceDigest === null) ||
  (isCanonicalUuid(proof.testSubmissionCapabilityId) &&
    isDigest(proof.finalEvidenceDigest));

const isValidPersistedProof = (
  value: unknown,
): value is CampaignTestPreparationProof => {
  if (value === null || typeof value !== 'object') return false;

  const proof = value as CampaignTestPreparationProof;

  return (
    isValidCreateInput(proof) &&
    isValidDate(proof.createdAt) &&
    isValidFinalizationPair(proof)
  );
};

const toMillis = (value: Date): number => value.getTime();

const IMMUTABLE_CREATE_FIELDS = Object.freeze([
  'testPreparationProofId',
  'confirmationId',
  'attemptId',
  'workspaceId',
  'campaignId',
  'campaignCreatorId',
  'workflowVersionId',
  'messageId',
  'requesterUserId',
  'requesterUserWorkspaceId',
  'normalizedRecipient',
  'connectedAccountId',
  'messageChannelId',
  'provider',
  'normalizedSenderHandle',
  'senderPoolFingerprint',
  'campaignCapacityTimeZone',
  'selectionConstraintKind',
  'priorAcceptedEvidenceId',
  'threadScopeKind',
  'plannedPriorMessageId',
  'threadEnrollmentId',
  'threadOccurrenceId',
  'renderDigest',
  'previewDigest',
  'testTransportDigest',
  'confirmationIssuedAt',
  'reservationEligibleUntil',
] as const satisfies readonly (keyof CreateCampaignTestPreparationProofInput)[]);

const isExactImmutableProof = (
  expected: CreateCampaignTestPreparationProofInput,
  actual: CampaignTestPreparationProof,
): boolean =>
  IMMUTABLE_CREATE_FIELDS.every((field) => {
    const expectedValue = expected[field];
    const actualValue = actual[field];

    if (
      field === 'confirmationIssuedAt' ||
      field === 'reservationEligibleUntil'
    ) {
      return (
        expectedValue instanceof Date &&
        actualValue instanceof Date &&
        toMillis(actualValue) === toMillis(expectedValue)
      );
    }

    return actualValue === expectedValue;
  });

const structuredRowsFrom = (value: unknown): unknown[] | null => {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('records' in value) ||
    !Array.isArray(value.records) ||
    !('affected' in value) ||
    typeof value.affected !== 'number' ||
    !Number.isInteger(value.affected) ||
    value.affected < 0 ||
    value.affected !== value.records.length
  ) {
    return null;
  }

  return value.records;
};

const oneOrNone = async (
  queryRunner: QueryRunner,
  sql: string,
  parameters: unknown[],
): Promise<
  { kind: 'NONE' } | { kind: 'ONE'; value: unknown } | { kind: 'INVALID' }
> => {
  const rows = structuredRowsFrom(
    await queryRunner.query(sql, parameters, true),
  );

  if (rows === null || rows.length > 1) return { kind: 'INVALID' };
  if (rows.length === 0) return { kind: 'NONE' };

  return { kind: 'ONE', value: rows[0] };
};

const proofInsertParameters = (
  input: CreateCampaignTestPreparationProofInput,
): unknown[] => [
  input.testPreparationProofId,
  input.confirmationId,
  input.attemptId,
  input.workspaceId,
  input.campaignId,
  input.campaignCreatorId,
  input.workflowVersionId,
  input.messageId,
  input.requesterUserId,
  input.requesterUserWorkspaceId,
  input.normalizedRecipient,
  input.connectedAccountId,
  input.messageChannelId,
  input.provider,
  input.normalizedSenderHandle,
  input.senderPoolFingerprint,
  input.campaignCapacityTimeZone,
  input.selectionConstraintKind,
  input.priorAcceptedEvidenceId,
  input.threadScopeKind,
  input.plannedPriorMessageId,
  input.threadEnrollmentId,
  input.threadOccurrenceId,
  input.renderDigest,
  input.previewDigest,
  input.testTransportDigest,
  input.confirmationIssuedAt,
  input.reservationEligibleUntil,
];

const isValidIdentity = (
  identity: CampaignTestPreparationProofIdentity,
): boolean =>
  identity !== null &&
  typeof identity === 'object' &&
  isCanonicalUuid(identity.workspaceId) &&
  isCanonicalUuid(identity.attemptId) &&
  isCanonicalUuid(identity.testPreparationProofId);

@Injectable()
export class CampaignTestPreparationProofService {
  async insertOrReplayInTransaction(
    input: CreateCampaignTestPreparationProofInput,
    manager: EntityManager,
  ): Promise<CreateCampaignTestPreparationProofResult> {
    const queryRunner = suppliedRunner(manager);

    if (queryRunner === null) return { status: 'TRANSACTION_REQUIRED' };
    if (!isValidCreateInput(input)) return { status: 'INVALID_INPUT' };

    const fence = await oneOrNone(queryRunner, PROOF_ADVISORY_LOCK_SQL, [
      `${PROOF_ADVISORY_PREFIX}${input.confirmationId}`,
      PROOF_ADVISORY_NAMESPACE,
    ]);

    if (fence.kind !== 'ONE') return { status: 'INVALID_PERSISTED_PROOF' };

    const existing = await oneOrNone(queryRunner, CONFIRMATION_LOCK_SQL, [
      input.confirmationId,
    ]);

    if (existing.kind === 'INVALID') {
      return { status: 'INVALID_PERSISTED_PROOF' };
    }
    if (existing.kind === 'ONE') {
      if (!isValidPersistedProof(existing.value)) {
        return { status: 'INVALID_PERSISTED_PROOF' };
      }

      return isExactImmutableProof(input, existing.value)
        ? { proof: existing.value, status: 'EXACT_REPLAY' }
        : { status: 'IDENTITY_CONFLICT' };
    }

    const inserted = await oneOrNone(
      queryRunner,
      INSERT_PROOF_SQL,
      proofInsertParameters(input),
    );

    if (inserted.kind === 'NONE') return { status: 'IDENTITY_CONFLICT' };
    if (inserted.kind === 'INVALID' || !isValidPersistedProof(inserted.value)) {
      return { status: 'INVALID_PERSISTED_PROOF' };
    }
    if (
      !isExactImmutableProof(input, inserted.value) ||
      inserted.value.testSubmissionCapabilityId !== null ||
      inserted.value.finalEvidenceDigest !== null
    ) {
      return { status: 'INVALID_PERSISTED_PROOF' };
    }

    return { proof: inserted.value, status: 'CREATED' };
  }

  async readByConfirmationInTransaction(
    scope: CampaignTestPreparationProofRequesterScope,
    manager: EntityManager,
  ): Promise<CampaignTestPreparationProofReadResult> {
    const queryRunner = suppliedRunner(manager);

    if (queryRunner === null) return { status: 'TRANSACTION_REQUIRED' };
    if (
      scope === null ||
      typeof scope !== 'object' ||
      !isCanonicalUuid(scope.workspaceId) ||
      !isCanonicalUuid(scope.confirmationId) ||
      !isCanonicalUuid(scope.requesterUserId) ||
      !isCanonicalUuid(scope.requesterUserWorkspaceId)
    ) {
      return { status: 'INVALID_INPUT' };
    }

    return this.readOne(queryRunner, REQUESTER_READ_SQL, [
      scope.workspaceId,
      scope.confirmationId,
      scope.requesterUserId,
      scope.requesterUserWorkspaceId,
    ]);
  }

  async readByProofIdentityInTransaction(
    identity: CampaignTestPreparationProofIdentity,
    manager: EntityManager,
  ): Promise<CampaignTestPreparationProofReadResult> {
    const queryRunner = suppliedRunner(manager);

    if (queryRunner === null) return { status: 'TRANSACTION_REQUIRED' };
    if (!isValidIdentity(identity)) return { status: 'INVALID_INPUT' };

    return this.readOne(queryRunner, PROOF_IDENTITY_READ_SQL, [
      identity.workspaceId,
      identity.attemptId,
      identity.testPreparationProofId,
    ]);
  }

  async finalizeInTransaction(
    input: FinalizeCampaignTestPreparationProofInput,
    manager: EntityManager,
  ): Promise<FinalizeCampaignTestPreparationProofResult> {
    const queryRunner = suppliedRunner(manager);

    if (queryRunner === null) return { status: 'TRANSACTION_REQUIRED' };
    if (
      !isValidIdentity(input) ||
      !isCanonicalUuid(input.testSubmissionCapabilityId) ||
      !isDigest(input.finalEvidenceDigest)
    ) {
      return { status: 'INVALID_INPUT' };
    }

    const updated = await oneOrNone(queryRunner, FINALIZE_PROOF_SQL, [
      input.workspaceId,
      input.attemptId,
      input.testPreparationProofId,
      input.testSubmissionCapabilityId,
      input.finalEvidenceDigest,
    ]);

    if (updated.kind === 'INVALID') {
      return { status: 'INVALID_PERSISTED_PROOF' };
    }
    if (updated.kind === 'ONE') {
      if (
        !isValidPersistedProof(updated.value) ||
        !this.matchesIdentity(input, updated.value) ||
        updated.value.testSubmissionCapabilityId !==
          input.testSubmissionCapabilityId ||
        updated.value.finalEvidenceDigest !== input.finalEvidenceDigest
      ) {
        return { status: 'INVALID_PERSISTED_PROOF' };
      }

      return { proof: updated.value, status: 'FINALIZED' };
    }

    const current = await oneOrNone(queryRunner, PROOF_IDENTITY_READ_SQL, [
      input.workspaceId,
      input.attemptId,
      input.testPreparationProofId,
    ]);

    if (current.kind === 'NONE') return { status: 'NOT_FOUND' };
    if (current.kind === 'INVALID' || !isValidPersistedProof(current.value)) {
      return { status: 'INVALID_PERSISTED_PROOF' };
    }

    return current.value.testSubmissionCapabilityId ===
      input.testSubmissionCapabilityId &&
      current.value.finalEvidenceDigest === input.finalEvidenceDigest
      ? { proof: current.value, status: 'EXACT_REPLAY' }
      : { status: 'FINALIZATION_CONFLICT' };
  }

  private async readOne(
    queryRunner: QueryRunner,
    sql: string,
    parameters: unknown[],
  ): Promise<CampaignTestPreparationProofReadResult> {
    const row = await oneOrNone(queryRunner, sql, parameters);

    if (row.kind === 'NONE') return { status: 'NOT_FOUND' };
    if (row.kind === 'INVALID' || !isValidPersistedProof(row.value)) {
      return { status: 'INVALID_PERSISTED_PROOF' };
    }

    return { proof: row.value, status: 'FOUND' };
  }

  private matchesIdentity(
    identity: CampaignTestPreparationProofIdentity,
    proof: CampaignTestPreparationProof,
  ): boolean {
    return (
      proof.workspaceId === identity.workspaceId &&
      proof.attemptId === identity.attemptId &&
      proof.testPreparationProofId === identity.testPreparationProofId
    );
  }
}
