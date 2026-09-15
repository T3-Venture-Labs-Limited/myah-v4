import { types as nodeUtilTypes } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';
import { IANA_TIME_ZONES } from 'twenty-shared/constants';
import { validate as uuidValidate } from 'uuid';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  CAMPAIGN_CAPACITY_TIME_ZONE_READER_PORT,
  CAMPAIGN_EXECUTION_HISTORY_PORT,
  CAMPAIGN_EXECUTION_IDENTITY_PORT,
  CAMPAIGN_EXECUTION_PERSISTENCE_PORT,
  CAMPAIGN_EXECUTION_PLAN_READER_PORT,
  CAMPAIGN_INITIAL_DUE_TIME_PORT,
  CAMPAIGN_NEW_ACTIVATION_REVIEW_PORT,
  CAMPAIGN_SEQUENCE_AUTHORITY_PORT,
} from 'src/modules/campaign-execution/constants/campaign-execution-di-tokens';
import { CampaignLifecycleTransactionService } from 'src/modules/campaign-execution/services/campaign-lifecycle-transaction.service';
import { type LockedCampaignLifecycleContext } from 'src/modules/campaign-execution/types/campaign-lifecycle-transaction.type';
import {
  type CampaignActivationGraph,
  type CampaignActivationRecord,
  type CampaignActivationResult,
  type CampaignCapacityTimeZoneReaderPort,
  type CampaignEligibleCreator,
  type CampaignExecutionHistoryPort,
  type CampaignExecutionIdentityPort,
  type CampaignExecutionPersistencePort,
  type CampaignExecutionPlanReaderPort,
  type CampaignExecutionRecord,
  type CampaignExecutionScopeInput,
  type CampaignInitialDueTimePort,
  type CampaignNewActivationReviewPort,
  type LookupStartReplayInput,
  type CampaignPlannedEnrollment,
  type CampaignSendingWindow,
  type CampaignSequenceAuthorizationRecord,
  type CampaignSequenceAuthorizationRequest,
  type CampaignSequenceAuthorityPort,
  type CampaignSequenceAuthorityStructureResult,
  type CampaignSequenceAuthorityTransactionContext,
  type CampaignSequenceExecutionPlan,
  type CompleteCampaignResult,
  type PauseCampaignResult,
  type StartCampaignInput,
  type StartCampaignResult,
  type UpdateCampaignSendingWindowInput,
  type UpdateCampaignSendingWindowResult,
} from 'src/modules/campaign-execution/types/campaign-execution.type';
import { type CampaignProgressionHistoryResult } from 'src/modules/campaign-execution/types/campaign-progression-history-reader.type';

const SUPPORTED_TIME_ZONES = new Set<string>(IANA_TIME_ZONES);
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_SAFE_DELAY_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1000);

type DataRecord = Readonly<Record<string, unknown>>;

type PreparedEnrollment = Readonly<{
  campaignCreatorId: string;
  creatorId: string;
  authoredMessageCount: number;
  nextAuthoredMessageIndex: number;
  terminal: boolean;
  messageId: string | null;
  anchorAt: string | null;
  delaySeconds: number;
}>;

class CampaignChangedVersionStartRollbackError extends Error {}

type ConsistentLifecycle = Readonly<{
  structure: CampaignSequenceAuthorityStructureResult;
  execution: CampaignExecutionRecord | null;
}>;

const readDataRecord = (value: unknown): DataRecord | null => {
  if (
    value === null ||
    typeof value !== 'object' ||
    nodeUtilTypes.isProxy(value) ||
    Array.isArray(value)
  ) {
    return null;
  }

  let descriptors: PropertyDescriptorMap;

  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }

  const record = Object.create(null) as Record<string, unknown>;

  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key as keyof PropertyDescriptorMap];

    if (
      typeof key !== 'string' ||
      DANGEROUS_KEYS.has(key) ||
      !descriptor?.enumerable ||
      !('value' in descriptor)
    ) {
      return null;
    }

    Object.defineProperty(record, key, {
      configurable: false,
      enumerable: true,
      value: descriptor.value,
      writable: false,
    });
  }

  return Object.freeze(record);
};

const readExactRecord = (
  value: unknown,
  expectedKeys: readonly string[],
): DataRecord | null => {
  const record = readDataRecord(value);

  if (record === null) {
    return null;
  }

  const keys = Object.keys(record);

  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(record, key),
    )
  ) {
    return null;
  }

  return record;
};

const readDenseArray = (value: unknown): readonly unknown[] | null => {
  if (nodeUtilTypes.isProxy(value) || !Array.isArray(value)) {
    return null;
  }

  let descriptors: PropertyDescriptorMap;

  try {
    descriptors = Object.getOwnPropertyDescriptors(
      value,
    ) as unknown as PropertyDescriptorMap;
  } catch {
    return null;
  }

  const lengthDescriptor = descriptors.length;
  const length = lengthDescriptor?.value;

  if (
    !lengthDescriptor ||
    lengthDescriptor.enumerable ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    Reflect.ownKeys(descriptors).length !== length + 1
  ) {
    return null;
  }

  const items: unknown[] = [];

  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];

    if (!descriptor?.enumerable || !('value' in descriptor)) {
      return null;
    }

    items.push(descriptor.value);
  }

  return Object.freeze(items);
};

const snapshotJson = (
  value: unknown,
  errorMessage: string,
  seen = new WeakSet<object>(),
): unknown => {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }

  if (
    typeof value !== 'object' ||
    nodeUtilTypes.isProxy(value) ||
    seen.has(value)
  ) {
    throw new Error(errorMessage);
  }
  seen.add(value);

  const array = readDenseArray(value);

  if (array !== null) {
    return Object.freeze(
      array.map((item) => snapshotJson(item, errorMessage, seen)),
    );
  }

  let prototype: object | null;

  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    throw new Error(errorMessage);
  }

  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(errorMessage);
  }

  const record = readDataRecord(value);

  if (record === null) {
    throw new Error(errorMessage);
  }

  const clone = Object.create(null) as Record<string, unknown>;

  for (const [key, item] of Object.entries(record)) {
    Object.defineProperty(clone, key, {
      configurable: false,
      enumerable: true,
      value: snapshotJson(item, errorMessage, seen),
      writable: false,
    });
  }

  return Object.freeze(clone);
};

const isCanonicalUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  uuidValidate(value) &&
  value === value.toLowerCase();

const isNormalizedText = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value === value.trim().toLowerCase();

const isNonBlankText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isCanonicalInstant = (value: unknown): value is string => {
  if (typeof value !== 'string' || !ISO_INSTANT_PATTERN.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);

  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
};

const isSendingWindow = (value: unknown): value is CampaignSendingWindow => {
  const record = readExactRecord(value, [
    'timeZone',
    'startLocalTime',
    'endLocalTime',
  ]);

  return (
    record !== null &&
    typeof record.timeZone === 'string' &&
    SUPPORTED_TIME_ZONES.has(record.timeZone) &&
    typeof record.startLocalTime === 'string' &&
    LOCAL_TIME_PATTERN.test(record.startLocalTime) &&
    typeof record.endLocalTime === 'string' &&
    LOCAL_TIME_PATTERN.test(record.endLocalTime) &&
    record.startLocalTime < record.endLocalTime
  );
};

const jsonEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }

  const leftArray = readDenseArray(left);
  const rightArray = readDenseArray(right);

  if (leftArray !== null || rightArray !== null) {
    return (
      leftArray !== null &&
      rightArray !== null &&
      leftArray.length === rightArray.length &&
      leftArray.every((item, index) => jsonEqual(item, rightArray[index]))
    );
  }

  const leftRecord = readDataRecord(left);
  const rightRecord = readDataRecord(right);

  if (leftRecord === null || rightRecord === null) {
    return false;
  }

  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonEqual(leftRecord[key], rightRecord[key]),
    )
  );
};

const assertPreparedProof = (value: unknown): void => {
  const proof = readExactRecord(value, [
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
  ]);
  const orderedMessageIds = readDenseArray(proof?.orderedMessageIds);
  const usedChannels = readDenseArray(proof?.usedChannels);
  const fixedMaterialProofs = readDenseArray(proof?.fixedMaterialProofs);

  if (
    proof === null ||
    proof.kind !== 'PREPARED' ||
    !isCanonicalUuid(proof.workspaceId) ||
    !isCanonicalUuid(proof.campaignId) ||
    !isCanonicalUuid(proof.workflowId) ||
    !isCanonicalUuid(proof.workflowVersionId) ||
    !isCanonicalUuid(proof.initiatingUserWorkspaceId) ||
    !isCanonicalUuid(proof.initiatingUserId) ||
    !isCanonicalUuid(proof.initiatingWorkspaceMemberId) ||
    orderedMessageIds === null ||
    orderedMessageIds.length === 0 ||
    orderedMessageIds.some((messageId) => !isCanonicalUuid(messageId)) ||
    new Set(orderedMessageIds).size !== orderedMessageIds.length ||
    usedChannels?.length !== 1 ||
    usedChannels[0] !== 'EMAIL' ||
    fixedMaterialProofs === null ||
    typeof proof.sequenceDigest !== 'string' ||
    proof.sequenceDigest.length === 0 ||
    typeof proof.fixedMaterialDigest !== 'string' ||
    proof.fixedMaterialDigest.length === 0 ||
    typeof proof.senderAuthorityDigest !== 'string' ||
    proof.senderAuthorityDigest.length === 0 ||
    typeof proof.preparedFingerprint !== 'string' ||
    proof.preparedFingerprint.length === 0 ||
    (proof.signatureDigest !== null &&
      (typeof proof.signatureDigest !== 'string' ||
        proof.signatureDigest.length === 0)) ||
    typeof proof.senderPoolFingerprint !== 'string' ||
    proof.senderPoolFingerprint.length === 0 ||
    typeof proof.senderPoolSerializationRevision !== 'string' ||
    proof.senderPoolSerializationRevision.length === 0 ||
    typeof proof.senderPoolRotationPolicyId !== 'string' ||
    proof.senderPoolRotationPolicyId.length === 0
  ) {
    throw new Error('Campaign Start input was invalid');
  }
};

const snapshotAuthorizationRequest = (
  value: unknown,
): CampaignSequenceAuthorizationRequest => {
  const snapshot = snapshotJson(
    value,
    'Campaign Start input was invalid',
  ) as CampaignSequenceAuthorizationRequest;
  const request = readExactRecord(snapshot, [
    'preparedProof',
    'reviewedWindow',
    'campaignCapacityTimeZone',
  ]);

  if (
    request === null ||
    !isSendingWindow(request.reviewedWindow) ||
    typeof request.campaignCapacityTimeZone !== 'string' ||
    !SUPPORTED_TIME_ZONES.has(request.campaignCapacityTimeZone)
  ) {
    throw new Error('Campaign Start input was invalid');
  }

  assertPreparedProof(request.preparedProof);

  return snapshot;
};

const snapshotScope = (
  value: CampaignExecutionScopeInput,
  errorMessage: string,
): CampaignExecutionScopeInput => {
  const record = readExactRecord(value, [
    'workspaceId',
    'campaignId',
    'authContext',
  ]);

  if (
    record === null ||
    !isCanonicalUuid(record.workspaceId) ||
    !isCanonicalUuid(record.campaignId)
  ) {
    throw new Error(errorMessage);
  }

  return Object.freeze({
    workspaceId: record.workspaceId,
    campaignId: record.campaignId,
    authContext: record.authContext as WorkspaceAuthContext,
  });
};

const snapshotStartInput = (input: StartCampaignInput): StartCampaignInput => {
  const record = readExactRecord(input, [
    'workspaceId',
    'campaignId',
    'authContext',
    'startIdempotencyKey',
    'request',
  ]);

  if (
    record === null ||
    !isCanonicalUuid(record.workspaceId) ||
    !isCanonicalUuid(record.campaignId) ||
    !isCanonicalUuid(record.startIdempotencyKey)
  ) {
    throw new Error('Campaign Start input was invalid');
  }

  const request = snapshotAuthorizationRequest(record.request);

  if (
    request.preparedProof.workspaceId !== record.workspaceId ||
    request.preparedProof.campaignId !== record.campaignId
  ) {
    throw new Error('Campaign Start input was invalid');
  }

  return Object.freeze({
    workspaceId: record.workspaceId,
    campaignId: record.campaignId,
    authContext: record.authContext as WorkspaceAuthContext,
    startIdempotencyKey: record.startIdempotencyKey,
    request,
  });
};

const snapshotWindowInput = (
  input: UpdateCampaignSendingWindowInput,
): UpdateCampaignSendingWindowInput => {
  const record = readExactRecord(input, [
    'workspaceId',
    'campaignId',
    'authContext',
    'window',
  ]);

  if (
    record === null ||
    !isCanonicalUuid(record.workspaceId) ||
    !isCanonicalUuid(record.campaignId) ||
    !isSendingWindow(record.window)
  ) {
    throw new Error('Campaign sending window input was invalid');
  }

  return Object.freeze({
    workspaceId: record.workspaceId,
    campaignId: record.campaignId,
    authContext: record.authContext as WorkspaceAuthContext,
    window: Object.freeze({
      timeZone: record.window.timeZone,
      startLocalTime: record.window.startLocalTime,
      endLocalTime: record.window.endLocalTime,
    }),
  });
};

const lifecycleState = (
  context: LockedCampaignLifecycleContext,
): 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | null => {
  const value = context.campaign.lifecycleStatus;

  return value === 'DRAFT' ||
    value === 'ACTIVE' ||
    value === 'PAUSED' ||
    value === 'COMPLETED'
    ? value
    : null;
};

const authorityContext = (
  context: LockedCampaignLifecycleContext,
): CampaignSequenceAuthorityTransactionContext =>
  Object.freeze({
    manager: context.manager,
    workspaceId: context.workspaceId,
    campaignId: context.campaignId,
    lockedCampaign: Object.freeze({
      id: context.campaign.id,
      lifecycleStatus: lifecycleState(context) ?? 'DRAFT',
      currentAuthorityProjection: context.campaign.sequenceAuthorization,
    }),
  });

const parseExecution = (
  value: unknown,
  context: LockedCampaignLifecycleContext,
): CampaignExecutionRecord | null => {
  const snapshot = snapshotJson(
    value,
    'Campaign execution projection was malformed',
  ) as CampaignExecutionRecord;
  const record = readExactRecord(snapshot, [
    'campaignExecutionId',
    'workspaceId',
    'campaignId',
    'window',
    'campaignCapacityTimeZone',
  ]);

  if (
    record === null ||
    !isCanonicalUuid(record.campaignExecutionId) ||
    record.workspaceId !== context.workspaceId ||
    record.campaignId !== context.campaignId ||
    !isSendingWindow(record.window) ||
    (record.campaignCapacityTimeZone !== null &&
      (typeof record.campaignCapacityTimeZone !== 'string' ||
        !SUPPORTED_TIME_ZONES.has(record.campaignCapacityTimeZone)))
  ) {
    return null;
  }

  return snapshot;
};

const parseAuthority = (
  value: unknown,
  context: LockedCampaignLifecycleContext,
): CampaignSequenceAuthorizationRecord | null => {
  let snapshot: CampaignSequenceAuthorizationRecord;

  try {
    snapshot = snapshotJson(
      value,
      'Campaign authority projection was malformed',
    ) as CampaignSequenceAuthorizationRecord;
  } catch {
    return null;
  }

  const record = readExactRecord(snapshot, [
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
  ]);
  const binding = readExactRecord(record?.binding, [
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
  ]);
  let bindingRequest: CampaignSequenceAuthorizationRequest | null = null;

  if (binding !== null) {
    try {
      bindingRequest = snapshotAuthorizationRequest(binding.request);
    } catch {
      bindingRequest = null;
    }
  }

  if (
    record === null ||
    binding === null ||
    bindingRequest === null ||
    !isCanonicalUuid(record.authorizationId) ||
    record.workspaceId !== context.workspaceId ||
    record.campaignId !== context.campaignId ||
    !isCanonicalUuid(record.campaignExecutionId) ||
    !Number.isSafeInteger(record.generation) ||
    (record.generation as number) <= 0 ||
    !isCanonicalUuid(record.startIdempotencyKey) ||
    typeof record.preparedFingerprint !== 'string' ||
    record.preparedFingerprint.length === 0 ||
    !isCanonicalUuid(record.workflowId) ||
    !isCanonicalUuid(record.workflowVersionId) ||
    !isCanonicalUuid(record.initiatingUserWorkspaceId) ||
    (record.state !== 'ACTIVE' && record.state !== 'REVOKED') ||
    !isCanonicalInstant(record.authorizedAt) ||
    (record.revokedAt !== null && !isCanonicalInstant(record.revokedAt)) ||
    (record.revocationReason !== null &&
      record.revocationReason !== 'CAMPAIGN_PAUSED' &&
      record.revocationReason !== 'CAMPAIGN_COMPLETED') ||
    (record.state === 'ACTIVE' &&
      (record.revokedAt !== null || record.revocationReason !== null)) ||
    (record.state === 'REVOKED' &&
      (record.revokedAt === null || record.revocationReason === null)) ||
    !isCanonicalInstant(record.createdAt) ||
    !isCanonicalInstant(record.updatedAt) ||
    binding.schemaVersion !== 1 ||
    binding.authorizationId !== record.authorizationId ||
    binding.generation !== record.generation ||
    binding.startIdempotencyKey !== record.startIdempotencyKey ||
    binding.workspaceId !== record.workspaceId ||
    binding.campaignId !== record.campaignId ||
    binding.campaignExecutionId !== record.campaignExecutionId ||
    binding.workflowVersionId !== record.workflowVersionId ||
    binding.futureEligibleCampaignCreatorsAuthorized !== true ||
    binding.authorizedAt !== record.authorizedAt ||
    bindingRequest.preparedProof.workflowId !== record.workflowId ||
    bindingRequest.preparedProof.workflowVersionId !==
      record.workflowVersionId ||
    bindingRequest.preparedProof.initiatingUserWorkspaceId !==
      record.initiatingUserWorkspaceId ||
    bindingRequest.preparedProof.preparedFingerprint !==
      record.preparedFingerprint
  ) {
    return null;
  }

  return snapshot;
};

const parseAuthorityStructure = (
  value: unknown,
  context: LockedCampaignLifecycleContext,
): CampaignSequenceAuthorityStructureResult | null => {
  const record = readDataRecord(value);

  if (record?.kind === 'NO_CURRENT_AUTHORITY') {
    return readExactRecord(value, ['kind']) === null
      ? null
      : Object.freeze({ kind: 'NO_CURRENT_AUTHORITY' });
  }

  if (record?.kind === 'INCONSISTENT_CURRENT_AUTHORITY') {
    const exact = readExactRecord(value, ['kind', 'blockerCode']);

    return exact !== null && typeof exact.blockerCode === 'string'
      ? Object.freeze({
          kind: 'INCONSISTENT_CURRENT_AUTHORITY',
          blockerCode: exact.blockerCode,
        })
      : null;
  }

  if (record?.kind === 'CURRENT_ACTIVE' || record?.kind === 'CURRENT_REVOKED') {
    const exact = readExactRecord(value, ['kind', 'authorization']);
    const authorization = parseAuthority(exact?.authorization, context);

    if (exact === null || authorization === null) {
      return null;
    }

    return exact.kind === 'CURRENT_ACTIVE'
      ? Object.freeze({ kind: 'CURRENT_ACTIVE', authorization })
      : Object.freeze({ kind: 'CURRENT_REVOKED', authorization });
  }

  return null;
};

const parseAuthorityLookup = (
  value: unknown,
  context: LockedCampaignLifecycleContext,
):
  | Readonly<{ kind: 'NOT_FOUND' | 'IDEMPOTENCY_KEY_CONFLICT' }>
  | Readonly<{
      kind: 'EXACT_MATCH';
      authorization: CampaignSequenceAuthorizationRecord;
    }>
  | null => {
  const record = readDataRecord(value);

  if (
    record?.kind === 'NOT_FOUND' ||
    record?.kind === 'IDEMPOTENCY_KEY_CONFLICT'
  ) {
    return readExactRecord(value, ['kind']) === null
      ? null
      : Object.freeze({ kind: record.kind });
  }

  if (record?.kind === 'EXACT_MATCH') {
    const exact = readExactRecord(value, ['kind', 'authorization']);
    const authorization = parseAuthority(exact?.authorization, context);

    return exact !== null && authorization !== null
      ? Object.freeze({ kind: 'EXACT_MATCH', authorization })
      : null;
  }

  return null;
};

const parseActivation = (
  value: unknown,
  context: LockedCampaignLifecycleContext,
): CampaignActivationRecord | null => {
  let snapshot: CampaignActivationRecord;

  try {
    snapshot = snapshotJson(
      value,
      'Campaign activation projection was malformed',
    ) as CampaignActivationRecord;
  } catch {
    return null;
  }

  const record = readExactRecord(snapshot, [
    'workspaceId',
    'campaignId',
    'campaignExecutionId',
    'activationId',
    'authorizationId',
    'authorizationGeneration',
    'workflowVersionId',
    'activatedAt',
    'createdEnrollmentCount',
    'createdOccurrenceCount',
  ]);

  if (
    record === null ||
    record.workspaceId !== context.workspaceId ||
    record.campaignId !== context.campaignId ||
    !isCanonicalUuid(record.campaignExecutionId) ||
    !isCanonicalUuid(record.activationId) ||
    !isCanonicalUuid(record.authorizationId) ||
    !Number.isSafeInteger(record.authorizationGeneration) ||
    (record.authorizationGeneration as number) <= 0 ||
    !isCanonicalUuid(record.workflowVersionId) ||
    !isCanonicalInstant(record.activatedAt) ||
    !Number.isSafeInteger(record.createdEnrollmentCount) ||
    (record.createdEnrollmentCount as number) < 0 ||
    !Number.isSafeInteger(record.createdOccurrenceCount) ||
    (record.createdOccurrenceCount as number) < 0
  ) {
    return null;
  }

  return snapshot;
};

const parseCapacityTimeZone = (
  value: unknown,
  context: LockedCampaignLifecycleContext,
): string | null => {
  const record = readDataRecord(value);

  if (record?.status !== 'CONFIGURED') {
    return null;
  }

  const exact = readExactRecord(value, ['status', 'campaignCapacityTimeZone']);

  return exact !== null &&
    typeof exact.campaignCapacityTimeZone === 'string' &&
    SUPPORTED_TIME_ZONES.has(exact.campaignCapacityTimeZone) &&
    exact.campaignCapacityTimeZone ===
      context.workspace.campaignCapacityTimeZone
    ? exact.campaignCapacityTimeZone
    : null;
};

const activationResult = (
  activation: CampaignActivationRecord,
): CampaignActivationResult =>
  Object.freeze({
    campaignExecutionId: activation.campaignExecutionId,
    activationId: activation.activationId,
    authorizationId: activation.authorizationId,
    authorizationGeneration: activation.authorizationGeneration,
    workflowVersionId: activation.workflowVersionId,
    activatedAt: activation.activatedAt,
    lifecycleStatus: 'ACTIVE',
    createdEnrollmentCount: activation.createdEnrollmentCount,
    createdOccurrenceCount: activation.createdOccurrenceCount,
  });

const sameImmutableAuthority = (
  inspected: CampaignSequenceAuthorizationRecord,
  revoked: CampaignSequenceAuthorizationRecord,
): boolean =>
  inspected.authorizationId === revoked.authorizationId &&
  inspected.workspaceId === revoked.workspaceId &&
  inspected.campaignId === revoked.campaignId &&
  inspected.campaignExecutionId === revoked.campaignExecutionId &&
  inspected.generation === revoked.generation &&
  inspected.startIdempotencyKey === revoked.startIdempotencyKey &&
  inspected.preparedFingerprint === revoked.preparedFingerprint &&
  inspected.workflowId === revoked.workflowId &&
  inspected.workflowVersionId === revoked.workflowVersionId &&
  inspected.initiatingUserWorkspaceId === revoked.initiatingUserWorkspaceId &&
  inspected.authorizedAt === revoked.authorizedAt &&
  inspected.createdAt === revoked.createdAt &&
  jsonEqual(inspected.binding, revoked.binding);

const authorityMatchesActivation = (
  authority: CampaignSequenceAuthorizationRecord,
  activation: CampaignActivationRecord,
  execution: CampaignExecutionRecord,
): boolean =>
  authority.campaignExecutionId === execution.campaignExecutionId &&
  activation.campaignExecutionId === execution.campaignExecutionId &&
  activation.authorizationId === authority.authorizationId &&
  activation.authorizationGeneration === authority.generation &&
  activation.workflowVersionId === authority.workflowVersionId &&
  activation.activatedAt === authority.authorizedAt;

const parsePlan = (
  value: unknown,
  input: StartCampaignInput,
): CampaignSequenceExecutionPlan | null => {
  let snapshot: CampaignSequenceExecutionPlan;

  try {
    snapshot = snapshotJson(
      value,
      'Campaign execution plan was malformed',
    ) as CampaignSequenceExecutionPlan;
  } catch {
    return null;
  }

  const record = readExactRecord(snapshot, [
    'kind',
    'workspaceId',
    'campaignId',
    'workflowId',
    'workflowVersionId',
    'nodes',
    'delaysSeconds',
  ]);
  const nodes = readDenseArray(record?.nodes);
  const delays = readDenseArray(record?.delaysSeconds);

  if (
    record === null ||
    record.kind !== 'READY' ||
    record.workspaceId !== input.workspaceId ||
    record.campaignId !== input.campaignId ||
    record.workflowId !== input.request.preparedProof.workflowId ||
    record.workflowVersionId !==
      input.request.preparedProof.workflowVersionId ||
    nodes === null ||
    nodes.length === 0 ||
    delays === null ||
    delays.length !== nodes.length - 1 ||
    delays.some(
      (delay) =>
        !Number.isSafeInteger(delay) ||
        (delay as number) < 0 ||
        (delay as number) > MAX_SAFE_DELAY_SECONDS,
    )
  ) {
    return null;
  }

  const messageIds = new Set<string>();

  for (const node of nodes) {
    const recordNode = readDataRecord(node);
    const channel = recordNode?.channel;
    const expectedKeys =
      channel === 'EMAIL'
        ? ['messageId', 'channel', 'replyToThread']
        : ['messageId', 'channel'];
    const exactNode = readExactRecord(node, expectedKeys);

    if (
      exactNode === null ||
      !isCanonicalUuid(exactNode.messageId) ||
      messageIds.has(exactNode.messageId) ||
      (channel !== 'EMAIL' && channel !== 'INSTAGRAM') ||
      (channel === 'EMAIL' && typeof exactNode.replyToThread !== 'boolean')
    ) {
      return null;
    }

    messageIds.add(exactNode.messageId);
  }

  const orderedMessageIds = input.request.preparedProof.orderedMessageIds;

  if (
    orderedMessageIds.length !== nodes.length ||
    nodes.some(
      (node, index) =>
        (node as CampaignSequenceExecutionPlan['nodes'][number]).messageId !==
        orderedMessageIds[index],
    )
  ) {
    return null;
  }

  return snapshot;
};

const parseEligibleCreators = (
  value: unknown,
  plan: CampaignSequenceExecutionPlan,
): readonly CampaignEligibleCreator[] | null => {
  const rows = readDenseArray(value);

  if (rows === null) {
    return null;
  }

  const messageIds = new Set(plan.nodes.map((node) => node.messageId));
  const creatorIds = new Set<string>();
  const campaignCreatorIds = new Set<string>();
  const creators: CampaignEligibleCreator[] = [];

  for (const valueCreator of rows) {
    const creator = readExactRecord(valueCreator, [
      'campaignCreatorId',
      'creatorId',
      'usableMessageIds',
    ]);
    const usableMessageIds = readDenseArray(creator?.usableMessageIds);

    if (
      creator === null ||
      !isCanonicalUuid(creator.campaignCreatorId) ||
      !isCanonicalUuid(creator.creatorId) ||
      creatorIds.has(creator.creatorId) ||
      campaignCreatorIds.has(creator.campaignCreatorId) ||
      usableMessageIds === null ||
      usableMessageIds.some(
        (messageId) =>
          !isCanonicalUuid(messageId) || !messageIds.has(messageId),
      ) ||
      new Set(usableMessageIds).size !== usableMessageIds.length
    ) {
      return null;
    }

    creatorIds.add(creator.creatorId);
    campaignCreatorIds.add(creator.campaignCreatorId);
    creators.push(
      Object.freeze({
        campaignCreatorId: creator.campaignCreatorId,
        creatorId: creator.creatorId,
        usableMessageIds: Object.freeze(usableMessageIds as string[]),
      }),
    );
  }

  return Object.freeze(
    creators.sort((left, right) =>
      left.creatorId.localeCompare(right.creatorId),
    ),
  );
};

const prepareEnrollment = (
  creator: CampaignEligibleCreator,
  plan: CampaignSequenceExecutionPlan,
  history: CampaignProgressionHistoryResult,
): PreparedEnrollment | null => {
  const historyRecord = readExactRecord(history, [
    'status',
    'entries',
    'lastProviderAcceptedAt',
  ]);
  const entries = readDenseArray(historyRecord?.entries);

  if (historyRecord?.status !== 'COMPLETE' || entries === null) {
    return null;
  }

  const planByMessage = new Map(
    plan.nodes.map((node, index) => [node.messageId, index]),
  );
  const suppressed = new Set<number>();
  const accepted: { index: number; acceptedAt: string }[] = [];

  for (const rawEntry of entries) {
    const shape = readDataRecord(rawEntry);
    const entry =
      shape?.kind === 'ACCEPTED'
        ? readExactRecord(rawEntry, [
            'kind',
            'workspaceId',
            'campaignId',
            'authorizationId',
            'enrollmentId',
            'occurrenceId',
            'attemptId',
            'acceptedEvidenceId',
            'workflowVersionId',
            'messageId',
            'authoredMessageIndex',
            'connectedAccountId',
            'messageChannelId',
            'provider',
            'normalizedSenderHandle',
            'normalizedRecipient',
            'providerMessageId',
            'providerAcceptedAt',
          ])
        : shape?.kind === 'MATERIALIZED_TERMINAL'
          ? readExactRecord(rawEntry, [
              'kind',
              'authorizationId',
              'enrollmentId',
              'occurrenceId',
              'workflowVersionId',
              'messageId',
              'authoredMessageIndex',
              'occurrenceState',
              'terminalReason',
              'terminalAt',
            ])
          : null;

    if (
      entry === null ||
      !Number.isSafeInteger(entry.authoredMessageIndex) ||
      (entry.authoredMessageIndex as number) < 0 ||
      !isCanonicalUuid(entry.authorizationId) ||
      !isCanonicalUuid(entry.enrollmentId) ||
      !isCanonicalUuid(entry.occurrenceId)
    ) {
      return null;
    }

    if (
      entry.kind === 'MATERIALIZED_TERMINAL' &&
      ((entry.occurrenceState !== 'SKIPPED' &&
        entry.occurrenceState !== 'CANCELLED') ||
        typeof entry.terminalReason !== 'string' ||
        entry.terminalReason.length === 0 ||
        !isCanonicalInstant(entry.terminalAt))
    ) {
      return null;
    }

    const expectedIndex =
      typeof entry.messageId === 'string'
        ? planByMessage.get(entry.messageId)
        : undefined;

    if (
      entry.workflowVersionId !== plan.workflowVersionId ||
      expectedIndex === undefined ||
      expectedIndex !== entry.authoredMessageIndex ||
      suppressed.has(expectedIndex)
    ) {
      return null;
    }

    suppressed.add(expectedIndex);

    if (entry.kind === 'ACCEPTED') {
      if (
        entry.workspaceId !== plan.workspaceId ||
        entry.campaignId !== plan.campaignId ||
        !isCanonicalUuid(entry.attemptId) ||
        !isCanonicalUuid(entry.acceptedEvidenceId) ||
        entry.acceptedEvidenceId !== entry.attemptId ||
        !isCanonicalUuid(entry.connectedAccountId) ||
        !isCanonicalUuid(entry.messageChannelId) ||
        !isNormalizedText(entry.provider) ||
        !isNormalizedText(entry.normalizedSenderHandle) ||
        !isNormalizedText(entry.normalizedRecipient) ||
        !isNonBlankText(entry.providerMessageId) ||
        !isCanonicalInstant(entry.providerAcceptedAt)
      ) {
        return null;
      }

      accepted.push({
        index: entry.authoredMessageIndex,
        acceptedAt: entry.providerAcceptedAt,
      });
    }
  }

  const acceptedTimestamps = accepted
    .map(({ acceptedAt }) => acceptedAt)
    .sort();
  const expectedLastAccepted =
    acceptedTimestamps[acceptedTimestamps.length - 1] ?? null;

  if (expectedLastAccepted !== historyRecord.lastProviderAcceptedAt) {
    return null;
  }

  const usable = new Set(creator.usableMessageIds);
  const nextIndex = plan.nodes.findIndex(
    (node, index) => usable.has(node.messageId) && !suppressed.has(index),
  );

  if (nextIndex === -1) {
    return Object.freeze({
      campaignCreatorId: creator.campaignCreatorId,
      creatorId: creator.creatorId,
      authoredMessageCount: plan.nodes.length,
      nextAuthoredMessageIndex: plan.nodes.length,
      terminal: true,
      messageId: null,
      anchorAt: null,
      delaySeconds: 0,
    });
  }

  const acceptedBefore = accepted.filter(({ index }) => index < nextIndex);
  const hasAcceptedAfter = accepted.some(({ index }) => index >= nextIndex);
  let anchorAt: string | null = null;
  let delaySeconds = 0;

  if (acceptedBefore.length > 0 && !hasAcceptedAfter) {
    const anchorIndex = Math.max(...acceptedBefore.map(({ index }) => index));

    anchorAt = expectedLastAccepted;

    for (let index = anchorIndex; index < nextIndex; index += 1) {
      const delay = plan.delaysSeconds[index];

      if (
        delay === undefined ||
        delaySeconds > MAX_SAFE_DELAY_SECONDS - delay
      ) {
        return null;
      }

      delaySeconds += delay;
    }
  }

  return Object.freeze({
    campaignCreatorId: creator.campaignCreatorId,
    creatorId: creator.creatorId,
    authoredMessageCount: plan.nodes.length,
    nextAuthoredMessageIndex: nextIndex,
    terminal: false,
    messageId: plan.nodes[nextIndex].messageId,
    anchorAt,
    delaySeconds,
  });
};

@Injectable()
export class CampaignExecutionService {
  constructor(
    private readonly transaction: CampaignLifecycleTransactionService,
    @Inject(CAMPAIGN_SEQUENCE_AUTHORITY_PORT)
    private readonly authority: CampaignSequenceAuthorityPort,
    @Inject(CAMPAIGN_EXECUTION_PERSISTENCE_PORT)
    private readonly persistence: CampaignExecutionPersistencePort,
    @Inject(CAMPAIGN_CAPACITY_TIME_ZONE_READER_PORT)
    private readonly capacityTimeZone: CampaignCapacityTimeZoneReaderPort,
    @Inject(CAMPAIGN_EXECUTION_PLAN_READER_PORT)
    private readonly planReader: CampaignExecutionPlanReaderPort,
    @Inject(CAMPAIGN_NEW_ACTIVATION_REVIEW_PORT)
    private readonly review: CampaignNewActivationReviewPort,
    @Inject(CAMPAIGN_EXECUTION_HISTORY_PORT)
    private readonly history: CampaignExecutionHistoryPort,
    @Inject(CAMPAIGN_INITIAL_DUE_TIME_PORT)
    private readonly dueTime: CampaignInitialDueTimePort,
    @Inject(CAMPAIGN_EXECUTION_IDENTITY_PORT)
    private readonly identity: CampaignExecutionIdentityPort,
  ) {}

  async lookupStartReplay(
    input: LookupStartReplayInput,
  ): Promise<StartCampaignResult | null> {
    const raw = readExactRecord(input, [
      'workspaceId',
      'campaignId',
      'authContext',
      'startIdempotencyKey',
    ]);
    if (
      raw === null ||
      typeof raw.workspaceId !== 'string' ||
      typeof raw.campaignId !== 'string' ||
      typeof raw.startIdempotencyKey !== 'string' ||
      !isCanonicalUuid(raw.startIdempotencyKey)
    ) {
      throw new Error('Campaign Start replay lookup input was invalid');
    }

    const startIdempotencyKey = raw.startIdempotencyKey;
    return this.transaction.run(
      {
        workspaceId: raw.workspaceId,
        campaignId: raw.campaignId,
        authContext: raw.authContext as WorkspaceAuthContext,
      },
      async (context) => {
        const lifecycle = lifecycleState(context);
        if (lifecycle === null) {
          return Object.freeze({
            status: 'BLOCKED',
            reason: 'INCONSISTENT_CURRENT_AUTHORITY',
          });
        }
        const consistency = await this.inspectLifecycle(context, lifecycle);
        if (consistency === null) {
          return Object.freeze({
            status: 'BLOCKED',
            reason: 'INCONSISTENT_CURRENT_AUTHORITY',
          });
        }
        const lookup = readDataRecord(
          await this.authority.lookupStartKeyInTransaction(
            authorityContext(context),
            Object.freeze({ startIdempotencyKey }),
          ),
        );
        if (lookup?.kind === 'NOT_FOUND' && Object.keys(lookup).length === 1)
          return null;
        if (lookup?.kind !== 'FOUND' || Object.keys(lookup).length !== 2) {
          throw new Error('Campaign Start replay lookup was inconsistent');
        }
        const matchedAuthority = parseAuthority(lookup.authorization, context);
        if (
          matchedAuthority === null ||
          matchedAuthority.startIdempotencyKey !== startIdempotencyKey
        ) {
          throw new Error('Campaign Start replay authority was inconsistent');
        }
        const activation = parseActivation(
          await this.persistence.loadActivationByAuthorizationInTransaction(
            context,
            matchedAuthority.authorizationId,
          ),
          context,
        );
        const execution =
          consistency.execution ??
          parseExecution(
            await this.persistence.loadExecutionInTransaction(context),
            context,
          );
        if (
          activation === null ||
          execution === null ||
          !authorityMatchesActivation(matchedAuthority, activation, execution)
        ) {
          return Object.freeze({
            status: 'BLOCKED',
            reason: 'INCONSISTENT_CURRENT_AUTHORITY',
          });
        }
        const currentAuthority =
          consistency.structure.kind === 'CURRENT_ACTIVE'
            ? consistency.structure.authorization
            : null;
        const sameCurrentAuthorization =
          lifecycle === 'ACTIVE' &&
          currentAuthority?.authorizationId ===
            matchedAuthority.authorizationId;
        if (
          sameCurrentAuthorization &&
          !jsonEqual(currentAuthority, matchedAuthority)
        ) {
          return Object.freeze({
            status: 'BLOCKED',
            reason: 'INCONSISTENT_CURRENT_AUTHORITY',
          });
        }
        return Object.freeze({
          status: 'REPLAYED',
          mayActivate: sameCurrentAuthorization,
          activation: activationResult(activation),
        });
      },
    );
  }

  async startCampaign(input: StartCampaignInput): Promise<StartCampaignResult> {
    const detachedInput = snapshotStartInput(input);

    try {
      return await this.transaction.run(
        {
          workspaceId: detachedInput.workspaceId,
          campaignId: detachedInput.campaignId,
          authContext: detachedInput.authContext,
        },
        async (context) => this.startInTransaction(detachedInput, context),
      );
    } catch (error) {
      if (error instanceof CampaignChangedVersionStartRollbackError) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'CHANGED_WORKFLOW_VERSION_UNMAPPED',
        });
      }
      throw error;
    }
  }

  async pauseCampaign(
    input: CampaignExecutionScopeInput,
  ): Promise<PauseCampaignResult> {
    const detachedInput = snapshotScope(
      input,
      'Campaign pause input was invalid',
    );

    return this.transaction.run(detachedInput, async (context) => {
      const lifecycle = lifecycleState(context);

      if (
        lifecycle === 'DRAFT' ||
        lifecycle === 'COMPLETED' ||
        lifecycle === null
      ) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'INVALID_LIFECYCLE_TRANSITION',
        });
      }

      const consistency = await this.inspectLifecycle(context, lifecycle);

      if (consistency === null) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'INCONSISTENT_CURRENT_AUTHORITY',
        });
      }

      const execution =
        consistency.execution ??
        parseExecution(
          await this.persistence.loadExecutionInTransaction(context),
          context,
        );

      if (execution === null) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'MISSING_EXECUTION',
        });
      }

      if (lifecycle === 'ACTIVE') {
        const revoked = readExactRecord(
          await this.authority.revokeCurrentAuthorizationInTransaction(
            authorityContext(context),
            Object.freeze({ reason: 'CAMPAIGN_PAUSED' }),
          ),
          ['kind', 'authorization'],
        );

        const revokedAuthority = parseAuthority(
          revoked?.authorization,
          context,
        );
        const inspectedAuthority =
          consistency.structure.kind === 'CURRENT_ACTIVE'
            ? consistency.structure.authorization
            : null;

        if (
          revoked?.kind !== 'REVOKED' ||
          revokedAuthority?.revocationReason !== 'CAMPAIGN_PAUSED' ||
          inspectedAuthority === null ||
          !sameImmutableAuthority(inspectedAuthority, revokedAuthority)
        ) {
          throw new Error('Campaign pause revocation was inconsistent');
        }

        await this.persistence.transitionLifecycleInTransaction(
          context,
          Object.freeze({ from: 'ACTIVE', to: 'PAUSED' }),
        );
      }

      const inFlightCount =
        await this.persistence.countInFlightAttemptsInTransaction(context);

      if (!Number.isSafeInteger(inFlightCount) || inFlightCount < 0) {
        throw new Error('Campaign in-flight count was inconsistent');
      }

      return Object.freeze({
        status: 'PAUSED',
        changed: lifecycle === 'ACTIVE',
        campaignExecutionId: execution.campaignExecutionId,
        lifecycleStatus: 'PAUSED',
        inFlightCount,
      });
    });
  }

  async completeCampaign(
    input: CampaignExecutionScopeInput,
  ): Promise<CompleteCampaignResult> {
    const detachedInput = snapshotScope(
      input,
      'Campaign completion input was invalid',
    );

    return this.transaction.run(detachedInput, async (context) => {
      const lifecycle = lifecycleState(context);

      if (lifecycle === 'DRAFT' || lifecycle === null) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'INVALID_LIFECYCLE_TRANSITION',
        });
      }

      const consistency = await this.inspectLifecycle(context, lifecycle);

      if (consistency === null) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'INCONSISTENT_CURRENT_AUTHORITY',
        });
      }

      const execution =
        consistency.execution ??
        parseExecution(
          await this.persistence.loadExecutionInTransaction(context),
          context,
        );

      if (execution === null) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'MISSING_EXECUTION',
        });
      }

      if (lifecycle === 'ACTIVE') {
        const revoked = readExactRecord(
          await this.authority.revokeCurrentAuthorizationInTransaction(
            authorityContext(context),
            Object.freeze({ reason: 'CAMPAIGN_COMPLETED' }),
          ),
          ['kind', 'authorization'],
        );

        const revokedAuthority = parseAuthority(
          revoked?.authorization,
          context,
        );
        const inspectedAuthority =
          consistency.structure.kind === 'CURRENT_ACTIVE'
            ? consistency.structure.authorization
            : null;

        if (
          revoked?.kind !== 'REVOKED' ||
          revokedAuthority?.revocationReason !== 'CAMPAIGN_COMPLETED' ||
          inspectedAuthority === null ||
          !sameImmutableAuthority(inspectedAuthority, revokedAuthority)
        ) {
          throw new Error('Campaign completion revocation was inconsistent');
        }
      }

      if (lifecycle !== 'COMPLETED') {
        await this.persistence.transitionLifecycleInTransaction(
          context,
          Object.freeze({ from: lifecycle, to: 'COMPLETED' }),
        );
      }

      return Object.freeze({
        status: 'COMPLETED',
        changed: lifecycle !== 'COMPLETED',
        campaignExecutionId: execution.campaignExecutionId,
        lifecycleStatus: 'COMPLETED',
      });
    });
  }

  async updateSendingWindow(
    input: UpdateCampaignSendingWindowInput,
  ): Promise<UpdateCampaignSendingWindowResult> {
    const detachedInput = snapshotWindowInput(input);

    return this.transaction.run(
      {
        workspaceId: detachedInput.workspaceId,
        campaignId: detachedInput.campaignId,
        authContext: detachedInput.authContext,
      },
      async (context) => {
        const lifecycle = lifecycleState(context);

        if (lifecycle !== 'DRAFT' && lifecycle !== 'PAUSED') {
          return Object.freeze({
            status: 'BLOCKED',
            reason: 'INVALID_LIFECYCLE_TRANSITION',
          });
        }

        const capacity = parseCapacityTimeZone(
          await this.capacityTimeZone.readCampaignCapacityTimeZoneInTransaction(
            Object.freeze({ workspaceId: context.workspaceId }),
            context.manager,
          ),
          context,
        );

        if (capacity === null) {
          return Object.freeze({
            status: 'BLOCKED',
            reason: 'WORKSPACE_CAPACITY_TIMEZONE_UNAVAILABLE',
          });
        }

        const rawExistingExecution =
          await this.persistence.loadExecutionInTransaction(context);
        const existingExecution =
          rawExistingExecution === null
            ? null
            : parseExecution(rawExistingExecution, context);

        if (rawExistingExecution !== null && existingExecution === null) {
          throw new Error('Campaign sending window state was inconsistent');
        }

        const result = readExactRecord(
          await this.persistence.writeSendingWindowInTransaction(
            context,
            Object.freeze({
              window: detachedInput.window,
              campaignCapacityTimeZone: capacity,
            }),
          ),
          ['status', 'createdExecution', 'execution'],
        );
        const execution = parseExecution(result?.execution, context);

        if (
          result === null ||
          execution === null ||
          (result.status !== 'UPDATED' && result.status !== 'UNCHANGED') ||
          typeof result.createdExecution !== 'boolean' ||
          (existingExecution === null &&
            (result.status !== 'UPDATED' || !result.createdExecution)) ||
          (existingExecution !== null &&
            (result.createdExecution ||
              execution.campaignExecutionId !==
                existingExecution.campaignExecutionId)) ||
          (result.status === 'UNCHANGED' && result.createdExecution) ||
          !jsonEqual(execution.window, detachedInput.window) ||
          execution.campaignCapacityTimeZone !== capacity
        ) {
          throw new Error('Campaign sending window write was inconsistent');
        }

        return Object.freeze({
          status: result.status,
          createdExecution: result.createdExecution,
          campaignExecutionId: execution.campaignExecutionId,
          window: execution.window,
        });
      },
    );
  }

  private async startInTransaction(
    input: StartCampaignInput,
    context: LockedCampaignLifecycleContext,
  ): Promise<StartCampaignResult> {
    const lifecycle = lifecycleState(context);

    if (lifecycle === null) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'INCONSISTENT_CURRENT_AUTHORITY',
      });
    }

    const consistency = await this.inspectLifecycle(context, lifecycle);

    if (consistency === null) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'INCONSISTENT_CURRENT_AUTHORITY',
      });
    }

    const lookup = parseAuthorityLookup(
      await this.authority.lookupStartRequestInTransaction(
        authorityContext(context),
        Object.freeze({
          startIdempotencyKey: input.startIdempotencyKey,
          request: input.request,
        }),
      ),
      context,
    );

    if (lookup === null) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'INCONSISTENT_CURRENT_AUTHORITY',
      });
    }

    if (lookup.kind === 'IDEMPOTENCY_KEY_CONFLICT') {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'IDEMPOTENCY_KEY_CONFLICT',
      });
    }

    if (lookup.kind === 'EXACT_MATCH') {
      const matchedAuthority = parseAuthority(lookup.authorization, context);

      if (
        matchedAuthority === null ||
        matchedAuthority.startIdempotencyKey !== input.startIdempotencyKey ||
        !jsonEqual(matchedAuthority.binding.request, input.request)
      ) {
        throw new Error('Campaign Start replay authority was inconsistent');
      }

      const activation = parseActivation(
        await this.persistence.loadActivationByAuthorizationInTransaction(
          context,
          matchedAuthority.authorizationId,
        ),
        context,
      );
      const execution =
        consistency.execution ??
        parseExecution(
          await this.persistence.loadExecutionInTransaction(context),
          context,
        );

      if (
        activation === null ||
        execution === null ||
        !authorityMatchesActivation(matchedAuthority, activation, execution)
      ) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'INCONSISTENT_CURRENT_AUTHORITY',
        });
      }

      const currentAuthority =
        consistency.structure.kind === 'CURRENT_ACTIVE'
          ? consistency.structure.authorization
          : null;
      const sameCurrentAuthorization =
        lifecycle === 'ACTIVE' &&
        currentAuthority?.authorizationId === matchedAuthority.authorizationId;

      if (
        sameCurrentAuthorization &&
        !jsonEqual(currentAuthority, matchedAuthority)
      ) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'INCONSISTENT_CURRENT_AUTHORITY',
        });
      }

      const mayActivate = sameCurrentAuthorization;

      return Object.freeze({
        status: 'REPLAYED',
        mayActivate,
        activation: activationResult(activation),
      });
    }

    if (lifecycle === 'ACTIVE') {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'CAMPAIGN_ALREADY_ACTIVE',
      });
    }

    if (lifecycle === 'COMPLETED') {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'CAMPAIGN_COMPLETED',
      });
    }

    const changedPriorVersionId =
      lifecycle === 'PAUSED' &&
      consistency.structure.kind === 'CURRENT_REVOKED' &&
      consistency.structure.authorization.workflowVersionId !==
        input.request.preparedProof.workflowVersionId
        ? consistency.structure.authorization.workflowVersionId
        : null;

    const execution = parseExecution(
      await this.persistence.loadExecutionInTransaction(context),
      context,
    );

    if (execution === null) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'MISSING_SENDING_WINDOW',
      });
    }

    const capacity = parseCapacityTimeZone(
      await this.capacityTimeZone.readCampaignCapacityTimeZoneInTransaction(
        Object.freeze({ workspaceId: context.workspaceId }),
        context.manager,
      ),
      context,
    );

    if (capacity === null) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'WORKSPACE_CAPACITY_TIMEZONE_UNAVAILABLE',
      });
    }

    if (
      execution.campaignCapacityTimeZone !== capacity ||
      input.request.campaignCapacityTimeZone !== capacity ||
      !jsonEqual(execution.window, input.request.reviewedWindow)
    ) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'CURRENT_REVIEW_INVALID',
      });
    }

    const loadedPlan = await this.planReader.loadExecutionPlanInTransaction(
      Object.freeze({
        workspaceId: context.workspaceId,
        campaignId: context.campaignId,
        workflowVersionId: input.request.preparedProof.workflowVersionId,
      }),
      context.manager,
    );
    const plan = parsePlan(loadedPlan, input);

    if (plan === null) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'SEQUENCE_UNAVAILABLE',
      });
    }

    const reviewed = readExactRecord(
      await this.review.revalidateNewActivationInTransaction(
        Object.freeze({
          context,
          execution,
          request: input.request,
          plan,
          campaignCapacityTimeZone: capacity,
        }),
      ),
      ['status', 'eligibleCreators'],
    );

    if (reviewed?.status !== 'READY') {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'CURRENT_REVIEW_INVALID',
      });
    }

    const creators = parseEligibleCreators(reviewed.eligibleCreators, plan);

    if (creators === null) {
      return Object.freeze({
        status: 'BLOCKED',
        reason: 'CURRENT_REVIEW_INVALID',
      });
    }

    const preparedEnrollments: PreparedEnrollment[] = [];

    for (const creator of creators) {
      const rawHistory =
        await this.history.readSameWorkflowVersionHistoryInTransaction(
          Object.freeze({
            workspaceId: context.workspaceId,
            campaignId: context.campaignId,
            creatorId: creator.creatorId,
            workflowVersionId: plan.workflowVersionId,
          }),
          context.manager,
        );
      let detachedHistory: CampaignProgressionHistoryResult;

      try {
        detachedHistory = snapshotJson(
          rawHistory,
          'Campaign progression history was malformed',
        ) as CampaignProgressionHistoryResult;
      } catch {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'PROGRESSION_HISTORY_UNAVAILABLE',
        });
      }

      const prepared = prepareEnrollment(creator, plan, detachedHistory);

      if (prepared === null) {
        return Object.freeze({
          status: 'BLOCKED',
          reason: 'PROGRESSION_HISTORY_UNAVAILABLE',
        });
      }

      preparedEnrollments.push(prepared);
    }

    let supersessionStarted = false;

    try {
      if (changedPriorVersionId !== null) {
        const supersession =
          await this.history.preparePriorVersionSupersessionInTransaction(
            Object.freeze({
              workspaceId: context.workspaceId,
              campaignId: context.campaignId,
              targetWorkflowVersionId: plan.workflowVersionId,
            }),
            context.manager,
          );
        if (
          supersession.status !== 'READY' ||
          !Array.isArray(supersession.pendingOccurrenceIds) ||
          supersession.pendingOccurrenceIds.some((id) => !isCanonicalUuid(id))
        ) {
          return Object.freeze({
            status: 'BLOCKED',
            reason: 'CHANGED_WORKFLOW_VERSION_UNMAPPED',
          });
        }
        supersessionStarted = true;
        await this.history.applyPriorVersionSupersessionInTransaction(
          Object.freeze({
            workspaceId: context.workspaceId,
            campaignId: context.campaignId,
            targetWorkflowVersionId: plan.workflowVersionId,
            pendingOccurrenceIds: Object.freeze([
              ...supersession.pendingOccurrenceIds,
            ]),
          }),
          context.manager,
        );
      }

      const created = readExactRecord(
        await this.authority.createNewAuthorizationInTransaction(
          authorityContext(context),
          Object.freeze({
            startIdempotencyKey: input.startIdempotencyKey,
            campaignExecutionId: execution.campaignExecutionId,
            request: input.request,
          }),
        ),
        ['kind', 'authorization'],
      );
      const createdAuthority =
        created?.kind === 'CREATED'
          ? parseAuthority(created.authorization, context)
          : null;

      if (
        createdAuthority === null ||
        createdAuthority.state !== 'ACTIVE' ||
        createdAuthority.campaignExecutionId !==
          execution.campaignExecutionId ||
        createdAuthority.startIdempotencyKey !== input.startIdempotencyKey ||
        createdAuthority.workflowVersionId !== plan.workflowVersionId ||
        !jsonEqual(createdAuthority.binding.request, input.request)
      ) {
        throw new Error('Created Campaign authority was inconsistent');
      }

      const graph = this.buildActivationGraph(
        context,
        execution,
        createdAuthority,
        plan,
        preparedEnrollments,
      );
      const persisted =
        await this.persistence.createActivationGraphInTransaction(
          context,
          graph,
        );

      if (!jsonEqual(persisted, graph)) {
        throw new Error('Created Campaign activation graph was inconsistent');
      }

      return Object.freeze({
        status: 'ACTIVATED',
        mayActivate: true,
        activation: activationResult(graph.activation),
      });
    } catch (error) {
      if (supersessionStarted) {
        throw new CampaignChangedVersionStartRollbackError(
          `Changed-version Start rolled back after supersession: ${error instanceof Error ? error.message : 'unknown failure'}`,
        );
      }
      throw error;
    }
  }

  private async inspectLifecycle(
    context: LockedCampaignLifecycleContext,
    lifecycle: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED',
  ): Promise<ConsistentLifecycle | null> {
    const structure = parseAuthorityStructure(
      await this.authority.inspectCurrentAuthorityInTransaction(
        authorityContext(context),
      ),
      context,
    );

    if (
      structure === null ||
      structure.kind === 'INCONSISTENT_CURRENT_AUTHORITY' ||
      (lifecycle === 'DRAFT' && structure.kind !== 'NO_CURRENT_AUTHORITY') ||
      (lifecycle === 'ACTIVE' && structure.kind !== 'CURRENT_ACTIVE') ||
      ((lifecycle === 'PAUSED' || lifecycle === 'COMPLETED') &&
        structure.kind !== 'CURRENT_REVOKED')
    ) {
      return null;
    }

    if (structure.kind === 'NO_CURRENT_AUTHORITY') {
      return Object.freeze({ structure, execution: null });
    }

    const authority = parseAuthority(structure.authorization, context);

    if (
      authority === null ||
      (structure.kind === 'CURRENT_ACTIVE' && authority.state !== 'ACTIVE') ||
      (structure.kind === 'CURRENT_REVOKED' && authority.state !== 'REVOKED') ||
      (lifecycle === 'PAUSED' &&
        authority.revocationReason !== 'CAMPAIGN_PAUSED') ||
      (lifecycle === 'COMPLETED' &&
        authority.revocationReason !== 'CAMPAIGN_PAUSED' &&
        authority.revocationReason !== 'CAMPAIGN_COMPLETED')
    ) {
      return null;
    }

    const execution = parseExecution(
      await this.persistence.loadExecutionInTransaction(context),
      context,
    );
    const activation = parseActivation(
      await this.persistence.loadActivationByAuthorizationInTransaction(
        context,
        authority.authorizationId,
      ),
      context,
    );

    if (
      execution === null ||
      activation === null ||
      !authorityMatchesActivation(authority, activation, execution)
    ) {
      return null;
    }

    return Object.freeze({ structure, execution });
  }

  private buildActivationGraph(
    context: LockedCampaignLifecycleContext,
    execution: CampaignExecutionRecord,
    authority: CampaignSequenceAuthorizationRecord,
    plan: CampaignSequenceExecutionPlan,
    preparedEnrollments: readonly PreparedEnrollment[],
  ): CampaignActivationGraph {
    const usedIds = new Set<string>();
    const nextId = (generate: () => string): string => {
      const id = generate();

      if (!isCanonicalUuid(id) || usedIds.has(id)) {
        throw new Error(
          'Campaign execution identity generation was inconsistent',
        );
      }

      usedIds.add(id);

      return id;
    };
    const generatedActivationId = nextId(() =>
      this.identity.generateActivationId(),
    );
    let createdOccurrenceCount = 0;
    const enrollments: CampaignPlannedEnrollment[] = preparedEnrollments.map(
      (prepared) => {
        const generatedEnrollmentId = nextId(() =>
          this.identity.generateEnrollmentId(),
        );
        const occurrence = prepared.terminal
          ? null
          : Object.freeze({
              occurrenceId: nextId(() => this.identity.generateOccurrenceId()),
              workspaceId: context.workspaceId,
              campaignId: context.campaignId,
              enrollmentId: generatedEnrollmentId,
              workflowVersionId: plan.workflowVersionId,
              messageId: prepared.messageId!,
              authoredMessageIndex: prepared.nextAuthoredMessageIndex,
              state: 'PENDING' as const,
              dueAt: this.dueTime.adjustInitialDueAt(
                Object.freeze({
                  anchorAt: prepared.anchorAt ?? authority.authorizedAt,
                  delaySeconds: prepared.delaySeconds,
                  window: execution.window,
                }),
              ),
            });

        if (occurrence !== null) {
          if (!isCanonicalInstant(occurrence.dueAt)) {
            throw new Error('Campaign initial due time was inconsistent');
          }
          createdOccurrenceCount += 1;
        }

        return Object.freeze({
          enrollmentId: generatedEnrollmentId,
          workspaceId: context.workspaceId,
          campaignId: context.campaignId,
          campaignExecutionId: execution.campaignExecutionId,
          authorizationId: authority.authorizationId,
          authorizationGeneration: authority.generation,
          campaignCreatorId: prepared.campaignCreatorId,
          creatorId: prepared.creatorId,
          authoredMessageCount: prepared.authoredMessageCount,
          nextAuthoredMessageIndex: prepared.nextAuthoredMessageIndex,
          state: prepared.terminal
            ? ('FINISHED' as const)
            : ('ACTIVE' as const),
          terminalReason: prepared.terminal
            ? ('NO_USABLE_AUTHORED_MESSAGE' as const)
            : null,
          terminalAt: prepared.terminal ? authority.authorizedAt : null,
          enrolledAt: authority.authorizedAt,
          occurrence,
        });
      },
    );
    const activation: CampaignActivationRecord = Object.freeze({
      workspaceId: context.workspaceId,
      campaignId: context.campaignId,
      campaignExecutionId: execution.campaignExecutionId,
      activationId: generatedActivationId,
      authorizationId: authority.authorizationId,
      authorizationGeneration: authority.generation,
      workflowVersionId: authority.workflowVersionId,
      activatedAt: authority.authorizedAt,
      createdEnrollmentCount: enrollments.length,
      createdOccurrenceCount,
    });

    return Object.freeze({
      activation,
      enrollments: Object.freeze(enrollments),
    });
  }
}
