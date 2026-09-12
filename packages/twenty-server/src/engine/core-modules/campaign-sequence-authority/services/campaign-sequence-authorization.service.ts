import { Injectable } from '@nestjs/common';
import { IANA_TIME_ZONES } from 'twenty-shared/constants';
import { parse as parseUuid, stringify as stringifyUuid } from 'uuid';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

import {
  CampaignSequenceAuthorizationRevocationReason,
  CampaignSequenceAuthorizationState,
} from 'src/engine/core-modules/campaign-sequence-authority/entities/campaign-sequence-authorization.entity';
import {
  type CampaignSequenceAuthorizationBinding,
  type CampaignSequenceAuthorizationCurrentProjection,
  type CampaignSequenceAuthorizationRecord,
  type CampaignSequenceAuthorizationRequest,
  type CampaignSequenceAuthorizationRequestLookupResult,
  type CampaignSequenceAuthorizationServiceDependencies,
  type CampaignSequenceAuthorizationStructureResult,
  type CampaignSequenceAuthorizationTransactionContext,
  type CreateCampaignSequenceAuthorizationResult,
  type RevokeCampaignSequenceAuthorizationResult,
} from 'src/engine/core-modules/campaign-sequence-authority/types/campaign-sequence-authorization.type';

const SHA_256_DIGEST = /^[0-9a-f]{64}$/;
const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const SUPPORTED_IANA_TIME_ZONES = new Set<string>(IANA_TIME_ZONES);

type JsonRecord = Record<string, unknown>;

const AUTHORIZATION_ROW_KEYS = [
  'authorizationId',
  'workspaceId',
  'campaignId',
  'campaignExecutionId',
  'generation',
  'startIdempotencyKey',
  'preparedFingerprint',
  'workflowId',
  'workflowVersionId',
  'initiatingUserWorkspaceId',
  'state',
  'authorizedAt',
  'revokedAt',
  'revocationReason',
  'binding',
  'createdAt',
  'updatedAt',
] as const;

const exactKeys = (value: JsonRecord, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();

  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
};

const isRecord = (value: unknown): value is JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const isPlainFiniteData = (
  value: unknown,
  ancestors: Set<object> = new Set(),
): boolean => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;

  const prototype = Object.getPrototypeOf(value);

  if (
    (Array.isArray(value) && prototype !== Array.prototype) ||
    (!Array.isArray(value) &&
      prototype !== Object.prototype &&
      prototype !== null)
  ) {
    return false;
  }

  ancestors.add(value);

  try {
    const keys = Reflect.ownKeys(value);

    if (keys.some((key) => typeof key !== 'string')) return false;

    if (Array.isArray(value)) {
      const elementKeys = keys.filter((key) => key !== 'length');

      if (
        elementKeys.length !== value.length ||
        elementKeys.some((key, index) => key !== String(index))
      ) {
        return false;
      }
    }

    return keys.every((key) => {
      if (Array.isArray(value) && key === 'length') return true;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      return (
        descriptor !== undefined &&
        'value' in descriptor &&
        descriptor.enumerable &&
        isPlainFiniteData(descriptor.value, ancestors)
      );
    });
  } finally {
    ancestors.delete(value);
  }
};

const isCanonicalUuid = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;

  try {
    return stringifyUuid(parseUuid(value)) === value;
  } catch {
    return false;
  }
};

const isDigest = (value: unknown): value is string =>
  typeof value === 'string' && SHA_256_DIGEST.test(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isSupportedIanaTimeZone = (value: unknown): value is string =>
  typeof value === 'string' && SUPPORTED_IANA_TIME_ZONES.has(value);

const toCanonicalInstant = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value !== 'string') return null;
  const date = new Date(value);

  return !Number.isNaN(date.getTime()) && date.toISOString() === value
    ? value
    : null;
};

const parseAttachmentProof = (value: unknown) => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'fileId',
      'filename',
      'contentType',
      'size',
      'contentDigest',
    ]) ||
    !isCanonicalUuid(value.fileId) ||
    !isNonEmptyString(value.filename) ||
    !isNonEmptyString(value.contentType) ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    !isDigest(value.contentDigest)
  ) {
    throw new Error('Invalid Campaign sequence authorization request');
  }

  return {
    fileId: value.fileId,
    filename: value.filename,
    contentType: value.contentType,
    size: value.size,
    contentDigest: value.contentDigest,
  };
};

const parseRequest = (value: unknown): CampaignSequenceAuthorizationRequest => {
  if (
    !isPlainFiniteData(value) ||
    !isRecord(value) ||
    !exactKeys(value, [
      'preparedProof',
      'reviewedWindow',
      'campaignCapacityTimeZone',
    ]) ||
    !isRecord(value.preparedProof) ||
    !isRecord(value.reviewedWindow) ||
    !isSupportedIanaTimeZone(value.campaignCapacityTimeZone)
  ) {
    throw new Error('Invalid Campaign sequence authorization request');
  }

  const proof = value.preparedProof;
  const expectedProofKeys = [
    'kind',
    'workspaceId',
    'campaignId',
    'workflowId',
    'workflowVersionId',
    'initiatingUserWorkspaceId',
    'initiatingUserId',
    'initiatingWorkspaceMemberId',
    'orderedMessageIds',
    'usedChannels',
    'sequenceDigest',
    'fixedMaterialDigest',
    'senderAuthorityDigest',
    'preparedFingerprint',
    'signatureDigest',
    'fixedMaterialProofs',
    'senderPoolFingerprint',
    'senderPoolSerializationRevision',
    'senderPoolRotationPolicyId',
  ];

  if (
    !exactKeys(proof, expectedProofKeys) ||
    proof.kind !== 'PREPARED' ||
    !isCanonicalUuid(proof.workspaceId) ||
    !isCanonicalUuid(proof.campaignId) ||
    !isCanonicalUuid(proof.workflowId) ||
    !isCanonicalUuid(proof.workflowVersionId) ||
    !isCanonicalUuid(proof.initiatingUserWorkspaceId) ||
    !isCanonicalUuid(proof.initiatingUserId) ||
    !isCanonicalUuid(proof.initiatingWorkspaceMemberId) ||
    !Array.isArray(proof.orderedMessageIds) ||
    proof.orderedMessageIds.length === 0 ||
    !proof.orderedMessageIds.every(isCanonicalUuid) ||
    new Set(proof.orderedMessageIds).size !== proof.orderedMessageIds.length ||
    !Array.isArray(proof.usedChannels) ||
    proof.usedChannels.length !== 1 ||
    proof.usedChannels[0] !== 'EMAIL' ||
    !isDigest(proof.sequenceDigest) ||
    !isDigest(proof.fixedMaterialDigest) ||
    !isDigest(proof.senderAuthorityDigest) ||
    !isDigest(proof.preparedFingerprint) ||
    !(proof.signatureDigest === null || isDigest(proof.signatureDigest)) ||
    !Array.isArray(proof.fixedMaterialProofs) ||
    proof.fixedMaterialProofs.length !== proof.orderedMessageIds.length ||
    !isDigest(proof.senderPoolFingerprint) ||
    !isNonEmptyString(proof.senderPoolSerializationRevision) ||
    !isNonEmptyString(proof.senderPoolRotationPolicyId)
  ) {
    throw new Error('Invalid Campaign sequence authorization request');
  }

  const orderedMessageIds = proof.orderedMessageIds as string[];
  const fixedMaterialProofs = proof.fixedMaterialProofs.map(
    (fixedProof, index) => {
      if (
        !isRecord(fixedProof) ||
        !exactKeys(fixedProof, ['messageId', 'orderedAttachmentProofs']) ||
        !isCanonicalUuid(fixedProof.messageId) ||
        fixedProof.messageId !== orderedMessageIds[index] ||
        !Array.isArray(fixedProof.orderedAttachmentProofs)
      ) {
        throw new Error('Invalid Campaign sequence authorization request');
      }

      return {
        messageId: fixedProof.messageId,
        orderedAttachmentProofs:
          fixedProof.orderedAttachmentProofs.map(parseAttachmentProof),
      };
    },
  );

  const window = value.reviewedWindow;

  if (
    !exactKeys(window, ['timeZone', 'startLocalTime', 'endLocalTime']) ||
    !isSupportedIanaTimeZone(window.timeZone) ||
    typeof window.startLocalTime !== 'string' ||
    !LOCAL_TIME.test(window.startLocalTime) ||
    typeof window.endLocalTime !== 'string' ||
    !LOCAL_TIME.test(window.endLocalTime) ||
    window.startLocalTime >= window.endLocalTime
  ) {
    throw new Error('Invalid Campaign sequence authorization request');
  }

  return {
    preparedProof: {
      kind: 'PREPARED',
      workspaceId: proof.workspaceId,
      campaignId: proof.campaignId,
      workflowId: proof.workflowId,
      workflowVersionId: proof.workflowVersionId,
      initiatingUserWorkspaceId: proof.initiatingUserWorkspaceId,
      initiatingUserId: proof.initiatingUserId,
      initiatingWorkspaceMemberId: proof.initiatingWorkspaceMemberId,
      orderedMessageIds: [...orderedMessageIds],
      usedChannels: ['EMAIL'],
      sequenceDigest: proof.sequenceDigest,
      fixedMaterialDigest: proof.fixedMaterialDigest,
      senderAuthorityDigest: proof.senderAuthorityDigest,
      preparedFingerprint: proof.preparedFingerprint,
      signatureDigest: proof.signatureDigest,
      fixedMaterialProofs,
      senderPoolFingerprint: proof.senderPoolFingerprint,
      senderPoolSerializationRevision: proof.senderPoolSerializationRevision,
      senderPoolRotationPolicyId: proof.senderPoolRotationPolicyId,
    },
    reviewedWindow: {
      timeZone: window.timeZone,
      startLocalTime: window.startLocalTime,
      endLocalTime: window.endLocalTime,
    },
    campaignCapacityTimeZone: value.campaignCapacityTimeZone,
  };
};

const parseBinding = (value: unknown): CampaignSequenceAuthorizationBinding => {
  if (
    !isPlainFiniteData(value) ||
    !isRecord(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'authorizationId',
      'generation',
      'startIdempotencyKey',
      'workspaceId',
      'campaignId',
      'campaignExecutionId',
      'workflowVersionId',
      'request',
      'futureEligibleCampaignCreatorsAuthorized',
      'authorizedAt',
    ]) ||
    value.schemaVersion !== 1 ||
    !isCanonicalUuid(value.authorizationId) ||
    typeof value.generation !== 'number' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation <= 0 ||
    !isCanonicalUuid(value.startIdempotencyKey) ||
    !isCanonicalUuid(value.workspaceId) ||
    !isCanonicalUuid(value.campaignId) ||
    !isCanonicalUuid(value.campaignExecutionId) ||
    !isCanonicalUuid(value.workflowVersionId) ||
    value.futureEligibleCampaignCreatorsAuthorized !== true
  ) {
    throw new Error('Invalid Campaign sequence authorization binding');
  }

  const authorizedAt = toCanonicalInstant(value.authorizedAt);
  const request = parseRequest(value.request);

  if (
    authorizedAt === null ||
    value.workspaceId !== request.preparedProof.workspaceId ||
    value.campaignId !== request.preparedProof.campaignId ||
    value.workflowVersionId !== request.preparedProof.workflowVersionId
  ) {
    throw new Error('Invalid Campaign sequence authorization binding');
  }

  return {
    schemaVersion: 1,
    authorizationId: value.authorizationId,
    generation: value.generation,
    startIdempotencyKey: value.startIdempotencyKey,
    workspaceId: value.workspaceId,
    campaignId: value.campaignId,
    campaignExecutionId: value.campaignExecutionId,
    workflowVersionId: value.workflowVersionId,
    request,
    futureEligibleCampaignCreatorsAuthorized: true,
    authorizedAt,
  };
};

const parseRecord = (value: unknown): CampaignSequenceAuthorizationRecord => {
  if (!isRecord(value) || !exactKeys(value, AUTHORIZATION_ROW_KEYS)) {
    throw new Error(
      'Campaign sequence authorization history integrity failure',
    );
  }

  const binding = parseBinding(value.binding);
  const authorizedAt = toCanonicalInstant(value.authorizedAt);
  const revokedAt =
    value.revokedAt === null ? null : toCanonicalInstant(value.revokedAt);
  const createdAt = toCanonicalInstant(value.createdAt);
  const updatedAt = toCanonicalInstant(value.updatedAt);

  if (
    !isCanonicalUuid(value.authorizationId) ||
    !isCanonicalUuid(value.workspaceId) ||
    !isCanonicalUuid(value.campaignId) ||
    !isCanonicalUuid(value.campaignExecutionId) ||
    typeof value.generation !== 'number' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation <= 0 ||
    !isCanonicalUuid(value.startIdempotencyKey) ||
    !isDigest(value.preparedFingerprint) ||
    !isCanonicalUuid(value.workflowId) ||
    !isCanonicalUuid(value.workflowVersionId) ||
    !isCanonicalUuid(value.initiatingUserWorkspaceId) ||
    authorizedAt === null ||
    createdAt === null ||
    updatedAt === null ||
    !(
      (value.state === CampaignSequenceAuthorizationState.ACTIVE &&
        value.revokedAt === null &&
        value.revocationReason === null) ||
      (value.state === CampaignSequenceAuthorizationState.REVOKED &&
        revokedAt !== null &&
        (value.revocationReason ===
          CampaignSequenceAuthorizationRevocationReason.CAMPAIGN_PAUSED ||
          value.revocationReason ===
            CampaignSequenceAuthorizationRevocationReason.CAMPAIGN_COMPLETED))
    ) ||
    binding.authorizationId !== value.authorizationId ||
    binding.workspaceId !== value.workspaceId ||
    binding.campaignId !== value.campaignId ||
    binding.campaignExecutionId !== value.campaignExecutionId ||
    binding.generation !== value.generation ||
    binding.startIdempotencyKey !== value.startIdempotencyKey ||
    binding.workflowVersionId !== value.workflowVersionId ||
    binding.authorizedAt !== authorizedAt ||
    binding.request.preparedProof.preparedFingerprint !==
      value.preparedFingerprint ||
    binding.request.preparedProof.workflowId !== value.workflowId ||
    binding.request.preparedProof.initiatingUserWorkspaceId !==
      value.initiatingUserWorkspaceId
  ) {
    throw new Error(
      'Campaign sequence authorization history integrity failure',
    );
  }

  return {
    authorizationId: value.authorizationId,
    workspaceId: value.workspaceId,
    campaignId: value.campaignId,
    campaignExecutionId: value.campaignExecutionId,
    generation: value.generation,
    startIdempotencyKey: value.startIdempotencyKey,
    preparedFingerprint: value.preparedFingerprint,
    workflowId: value.workflowId,
    workflowVersionId: value.workflowVersionId,
    initiatingUserWorkspaceId: value.initiatingUserWorkspaceId,
    state: value.state,
    authorizedAt,
    revokedAt,
    revocationReason: value.revocationReason,
    binding,
    createdAt,
    updatedAt,
  };
};

const parseProjection = (
  value: unknown,
): CampaignSequenceAuthorizationCurrentProjection => {
  if (
    !isPlainFiniteData(value) ||
    !isRecord(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'authorizationId',
      'generation',
      'state',
      'workflowVersionId',
      'preparedFingerprint',
      'authorizedAt',
      'revokedAt',
      'revocationReason',
    ]) ||
    value.schemaVersion !== 1 ||
    !isCanonicalUuid(value.authorizationId) ||
    typeof value.generation !== 'number' ||
    !Number.isSafeInteger(value.generation) ||
    value.generation <= 0 ||
    !isCanonicalUuid(value.workflowVersionId) ||
    !isDigest(value.preparedFingerprint)
  ) {
    throw new Error('Invalid Campaign sequence authorization projection');
  }

  const authorizedAt = toCanonicalInstant(value.authorizedAt);
  const revokedAt =
    value.revokedAt === null ? null : toCanonicalInstant(value.revokedAt);

  if (
    authorizedAt === null ||
    !(
      (value.state === CampaignSequenceAuthorizationState.ACTIVE &&
        value.revokedAt === null &&
        value.revocationReason === null) ||
      (value.state === CampaignSequenceAuthorizationState.REVOKED &&
        revokedAt !== null &&
        (value.revocationReason ===
          CampaignSequenceAuthorizationRevocationReason.CAMPAIGN_PAUSED ||
          value.revocationReason ===
            CampaignSequenceAuthorizationRevocationReason.CAMPAIGN_COMPLETED))
    )
  ) {
    throw new Error('Invalid Campaign sequence authorization projection');
  }

  return {
    schemaVersion: 1,
    authorizationId: value.authorizationId,
    generation: value.generation,
    state: value.state,
    workflowVersionId: value.workflowVersionId,
    preparedFingerprint: value.preparedFingerprint,
    authorizedAt,
    revokedAt,
    revocationReason: value.revocationReason,
  };
};

const projectionFor = (
  authorization: CampaignSequenceAuthorizationRecord,
): CampaignSequenceAuthorizationCurrentProjection => ({
  schemaVersion: 1,
  authorizationId: authorization.authorizationId,
  generation: authorization.generation,
  state: authorization.state,
  workflowVersionId: authorization.workflowVersionId,
  preparedFingerprint: authorization.preparedFingerprint,
  authorizedAt: authorization.authorizedAt,
  revokedAt: authorization.revokedAt,
  revocationReason: authorization.revocationReason,
});

const samePlainData = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const inconsistent = (
  blockerCode: string,
): CampaignSequenceAuthorizationStructureResult => ({
  kind: 'INCONSISTENT_CURRENT_AUTHORITY',
  blockerCode,
});

@Injectable()
export class CampaignSequenceAuthorizationService {
  constructor(
    private readonly dependencies: CampaignSequenceAuthorizationServiceDependencies,
  ) {}

  async inspectCurrentAuthorityInTransaction(
    context: CampaignSequenceAuthorizationTransactionContext,
  ): Promise<CampaignSequenceAuthorizationStructureResult> {
    this.assertContext(context);

    const rawRows = await context.manager.queryRunner!.query(
      `SELECT * FROM core."campaignSequenceAuthorization"
       WHERE "workspaceId" = $1 AND "campaignId" = $2
       ORDER BY "generation" ASC`,
      [context.workspaceId, context.campaignId],
    );

    if (!Array.isArray(rawRows)) return inconsistent('MALFORMED_HISTORY_READ');

    let history: CampaignSequenceAuthorizationRecord[];

    try {
      history = rawRows.map(parseRecord);
    } catch {
      return inconsistent('MALFORMED_AUTHORIZATION_HISTORY');
    }

    if (
      history.some(
        (authorization, index) =>
          authorization.workspaceId !== context.workspaceId ||
          authorization.campaignId !== context.campaignId ||
          (index > 0 &&
            authorization.generation <= history[index - 1].generation),
      )
    ) {
      return inconsistent('INVALID_AUTHORIZATION_SCOPE_OR_GENERATION');
    }

    const active = history.filter(
      ({ state }) => state === CampaignSequenceAuthorizationState.ACTIVE,
    );
    const latest = history[history.length - 1];

    if (latest === undefined) {
      if (
        context.lockedCampaign.lifecycleStatus !== 'ACTIVE' &&
        context.lockedCampaign.currentAuthorityProjection === null
      ) {
        return { kind: 'NO_CURRENT_AUTHORITY' };
      }

      return inconsistent('LIFECYCLE_OR_PROJECTION_WITHOUT_HISTORY');
    }

    let projection: CampaignSequenceAuthorizationCurrentProjection;

    try {
      projection = parseProjection(
        context.lockedCampaign.currentAuthorityProjection,
      );
    } catch {
      return inconsistent('MALFORMED_CURRENT_PROJECTION');
    }

    if (!samePlainData(projection, projectionFor(latest))) {
      return inconsistent('CURRENT_PROJECTION_NOT_LATEST');
    }

    if (context.lockedCampaign.lifecycleStatus === 'ACTIVE') {
      if (
        active.length !== 1 ||
        active[0].authorizationId !== latest.authorizationId ||
        latest.state !== CampaignSequenceAuthorizationState.ACTIVE
      ) {
        return inconsistent('ACTIVE_LIFECYCLE_AUTHORITY_MISMATCH');
      }

      return { kind: 'CURRENT_ACTIVE', authorization: latest };
    }

    if (
      active.length !== 0 ||
      latest.state !== CampaignSequenceAuthorizationState.REVOKED
    ) {
      return inconsistent('NON_ACTIVE_LIFECYCLE_HAS_ACTIVE_AUTHORITY');
    }

    return { kind: 'CURRENT_REVOKED', authorization: latest };
  }

  async lookupStartKeyInTransaction(
    context: CampaignSequenceAuthorizationTransactionContext,
    input: Readonly<{ startIdempotencyKey: string }>,
  ) {
    this.assertContext(context);
    const startIdempotencyKey = this.requireUuid(
      input.startIdempotencyKey,
      'start idempotency key',
    );
    const rawRows = await context.manager.queryRunner!.query(
      `SELECT * FROM core."campaignSequenceAuthorization"
       WHERE "workspaceId" = $1 AND "campaignId" = $2
         AND "startIdempotencyKey" = $3`,
      [context.workspaceId, context.campaignId, startIdempotencyKey],
    );

    if (!Array.isArray(rawRows) || rawRows.length > 1) {
      throw new Error(
        'Campaign sequence authorization history integrity failure',
      );
    }
    if (rawRows.length === 0) return { kind: 'NOT_FOUND' } as const;

    return { kind: 'FOUND', authorization: parseRecord(rawRows[0]) } as const;
  }

  async lookupStartRequestInTransaction(
    context: CampaignSequenceAuthorizationTransactionContext,
    input: Readonly<{
      startIdempotencyKey: string;
      request: CampaignSequenceAuthorizationRequest;
    }>,
  ): Promise<CampaignSequenceAuthorizationRequestLookupResult> {
    this.assertContext(context);
    const startIdempotencyKey = this.requireUuid(
      input.startIdempotencyKey,
      'start idempotency key',
    );
    const request = parseRequest(input.request);
    this.assertRequestScope(context, request);

    const rawRows = await context.manager.queryRunner!.query(
      `SELECT * FROM core."campaignSequenceAuthorization"
       WHERE "workspaceId" = $1 AND "campaignId" = $2
         AND "startIdempotencyKey" = $3`,
      [context.workspaceId, context.campaignId, startIdempotencyKey],
    );

    if (!Array.isArray(rawRows) || rawRows.length > 1) {
      throw new Error(
        'Campaign sequence authorization history integrity failure',
      );
    }
    if (rawRows.length === 0) return { kind: 'NOT_FOUND' };

    const authorization = parseRecord(rawRows[0]);

    return samePlainData(authorization.binding.request, request)
      ? { kind: 'EXACT_MATCH', authorization }
      : { kind: 'IDEMPOTENCY_KEY_CONFLICT' };
  }

  async createNewAuthorizationInTransaction(
    context: CampaignSequenceAuthorizationTransactionContext,
    input: Readonly<{
      startIdempotencyKey: string;
      campaignExecutionId: string;
      request: CampaignSequenceAuthorizationRequest;
    }>,
  ): Promise<CreateCampaignSequenceAuthorizationResult> {
    this.assertContext(context);
    const startIdempotencyKey = this.requireUuid(
      input.startIdempotencyKey,
      'start idempotency key',
    );
    const campaignExecutionId = this.requireUuid(
      input.campaignExecutionId,
      'Campaign execution ID',
    );
    const request = parseRequest(input.request);
    this.assertRequestScope(context, request);

    if (
      context.lockedCampaign.lifecycleStatus !== 'DRAFT' &&
      context.lockedCampaign.lifecycleStatus !== 'PAUSED'
    ) {
      throw new Error('Campaign lifecycle is not eligible for new authority');
    }

    const structure = await this.inspectCurrentAuthorityInTransaction(context);

    if (
      structure.kind !== 'NO_CURRENT_AUTHORITY' &&
      structure.kind !== 'CURRENT_REVOKED'
    ) {
      throw new Error('Campaign sequence authorization integrity failure');
    }

    const generation =
      structure.kind === 'CURRENT_REVOKED'
        ? structure.authorization.generation + 1
        : 1;

    if (!Number.isSafeInteger(generation) || generation <= 0) {
      throw new Error(
        'Campaign sequence authorization generation integrity failure',
      );
    }

    const authorizationId = this.requireUuid(
      this.dependencies.generateAuthorizationId(),
      'generated authorization ID',
    );
    const authorizedAt = this.requireGeneratedInstant(this.dependencies.now());
    const binding: CampaignSequenceAuthorizationBinding = {
      schemaVersion: 1,
      authorizationId,
      generation,
      startIdempotencyKey,
      workspaceId: context.workspaceId,
      campaignId: context.campaignId,
      campaignExecutionId,
      workflowVersionId: request.preparedProof.workflowVersionId,
      request,
      futureEligibleCampaignCreatorsAuthorized: true,
      authorizedAt,
    };

    const inserted = await context.manager.queryRunner!.query(
      `INSERT INTO core."campaignSequenceAuthorization" (
         "authorizationId", "workspaceId", "campaignId", "campaignExecutionId",
         "generation", "startIdempotencyKey", "preparedFingerprint", "workflowId",
         "workflowVersionId", "initiatingUserWorkspaceId", "state", "authorizedAt",
         "revokedAt", "revocationReason", "binding", "createdAt", "updatedAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', $11, NULL, NULL, $12::jsonb, $11, $11)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [
        authorizationId,
        context.workspaceId,
        context.campaignId,
        campaignExecutionId,
        generation,
        startIdempotencyKey,
        request.preparedProof.preparedFingerprint,
        request.preparedProof.workflowId,
        request.preparedProof.workflowVersionId,
        request.preparedProof.initiatingUserWorkspaceId,
        authorizedAt,
        JSON.stringify(binding),
      ],
      true,
    );

    if (inserted.affected !== 1 || inserted.records.length !== 1) {
      throw new Error(
        'Campaign sequence authorization insert integrity failure',
      );
    }

    const authorization = parseRecord(inserted.records[0]);
    const nextProjection = projectionFor(authorization);
    const workspaceSchema = getWorkspaceSchemaName(context.workspaceId);
    // pi-lens-ignore: ast-grep:no-sql-in-code
    // pi-lens-ignore: sql-injection
    const projected = await context.manager.queryRunner!.query(
      `UPDATE "${workspaceSchema}"."campaign"
       SET "sequenceAuthorization" = $1::jsonb
       WHERE "id" = $2
         AND "sequenceAuthorization" IS NOT DISTINCT FROM $3::jsonb
       RETURNING "id"`,
      [
        JSON.stringify(nextProjection),
        context.campaignId,
        context.lockedCampaign.currentAuthorityProjection === null
          ? null
          : JSON.stringify(context.lockedCampaign.currentAuthorityProjection),
      ],
      true,
    );

    if (projected.affected !== 1 || projected.records.length !== 1) {
      throw new Error(
        'Campaign sequence authorization projection CAS integrity failure',
      );
    }

    return { kind: 'CREATED', authorization };
  }

  async revokeCurrentAuthorizationInTransaction(
    context: CampaignSequenceAuthorizationTransactionContext,
    input: Readonly<{
      reason: 'CAMPAIGN_PAUSED' | 'CAMPAIGN_COMPLETED';
    }>,
  ): Promise<RevokeCampaignSequenceAuthorizationResult> {
    this.assertContext(context);

    if (
      input.reason !==
        CampaignSequenceAuthorizationRevocationReason.CAMPAIGN_PAUSED &&
      input.reason !==
        CampaignSequenceAuthorizationRevocationReason.CAMPAIGN_COMPLETED
    ) {
      throw new Error(
        'Invalid Campaign sequence authorization revocation reason',
      );
    }

    const structure = await this.inspectCurrentAuthorityInTransaction(context);

    if (structure.kind === 'NO_CURRENT_AUTHORITY') {
      return { kind: 'NO_CURRENT_AUTHORITY' };
    }
    if (structure.kind === 'INCONSISTENT_CURRENT_AUTHORITY') {
      throw new Error('Campaign sequence authorization integrity failure');
    }
    if (structure.kind === 'CURRENT_REVOKED') {
      const existingReason = structure.authorization.revocationReason;
      const preservesPausedCompletion =
        existingReason ===
          CampaignSequenceAuthorizationRevocationReason.CAMPAIGN_PAUSED &&
        input.reason ===
          CampaignSequenceAuthorizationRevocationReason.CAMPAIGN_COMPLETED;

      if (existingReason !== input.reason && !preservesPausedCompletion) {
        throw new Error('Campaign sequence authorization revocation conflict');
      }

      return {
        kind: 'ALREADY_REVOKED',
        authorization: structure.authorization,
      };
    }

    const revokedAt = this.requireGeneratedInstant(this.dependencies.now());
    const updated = await context.manager.queryRunner!.query(
      `UPDATE core."campaignSequenceAuthorization"
       SET "state" = 'REVOKED', "revokedAt" = $1,
           "revocationReason" = $2, "updatedAt" = $1
       WHERE "authorizationId" = $3 AND "workspaceId" = $4
         AND "campaignId" = $5 AND "generation" = $6
         AND "state" = 'ACTIVE'
       RETURNING *`,
      [
        revokedAt,
        input.reason,
        structure.authorization.authorizationId,
        context.workspaceId,
        context.campaignId,
        structure.authorization.generation,
      ],
      true,
    );

    if (updated.affected !== 1 || updated.records.length !== 1) {
      throw new Error(
        'Campaign sequence authorization revoke integrity failure',
      );
    }

    const authorization = parseRecord(updated.records[0]);
    const workspaceSchema = getWorkspaceSchemaName(context.workspaceId);
    // pi-lens-ignore: ast-grep:no-sql-in-code
    // pi-lens-ignore: sql-injection
    const projected = await context.manager.queryRunner!.query(
      `UPDATE "${workspaceSchema}"."campaign"
       SET "sequenceAuthorization" = $1::jsonb
       WHERE "id" = $2
         AND "sequenceAuthorization" IS NOT DISTINCT FROM $3::jsonb
       RETURNING "id"`,
      [
        JSON.stringify(projectionFor(authorization)),
        context.campaignId,
        JSON.stringify(context.lockedCampaign.currentAuthorityProjection),
      ],
      true,
    );

    if (projected.affected !== 1 || projected.records.length !== 1) {
      throw new Error(
        'Campaign sequence authorization projection CAS integrity failure',
      );
    }

    return { kind: 'REVOKED', authorization };
  }

  private assertContext(
    context: CampaignSequenceAuthorizationTransactionContext,
  ): void {
    const queryRunner = context.manager?.queryRunner;

    if (
      queryRunner === undefined ||
      queryRunner === null ||
      queryRunner.isReleased ||
      !queryRunner.isTransactionActive
    ) {
      throw new Error(
        'Campaign sequence authority requires an active caller-supplied transaction',
      );
    }

    if (
      !isCanonicalUuid(context.workspaceId) ||
      !isCanonicalUuid(context.campaignId) ||
      !isCanonicalUuid(context.lockedCampaign?.id) ||
      context.lockedCampaign.id !== context.campaignId ||
      !['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED'].includes(
        context.lockedCampaign.lifecycleStatus,
      )
    ) {
      throw new Error('Invalid locked Campaign sequence authority context');
    }
  }

  private assertRequestScope(
    context: CampaignSequenceAuthorizationTransactionContext,
    request: CampaignSequenceAuthorizationRequest,
  ): void {
    if (
      request.preparedProof.workspaceId !== context.workspaceId ||
      request.preparedProof.campaignId !== context.campaignId
    ) {
      throw new Error('Campaign sequence authorization request scope mismatch');
    }
  }

  private requireUuid(value: unknown, label: string): string {
    if (!isCanonicalUuid(value)) throw new Error(`Invalid ${label}`);

    return value;
  }

  private requireGeneratedInstant(value: Date): string {
    const instant = toCanonicalInstant(value);

    if (instant === null) {
      throw new Error(
        'Invalid generated Campaign sequence authority timestamp',
      );
    }

    return instant;
  }
}
