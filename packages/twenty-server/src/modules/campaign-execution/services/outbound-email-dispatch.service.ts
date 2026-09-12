import { types as nodeUtilTypes } from 'node:util';

import { isEmail } from 'class-validator';
import { type EntityManager } from 'typeorm';
import { ConnectedAccountProvider } from 'twenty-shared/types';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { type ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import {
  type AttemptOutcomeResult,
  type BeginOutboundEmailSubmissionInput,
  type OutboundEmailAttemptReceipt,
  type OutboundEmailAttemptReservationIdentity,
} from 'src/modules/campaign-execution/types/outbound-email-attempt.type';
import {
  type AcceptedOutboundEmailRecoveryEvidence,
  type AmbiguousOutboundEmailRecoveryEvidence,
  type DefinitelyUnacceptedOutboundEmailRecoveryEvidence,
  type DispatchTrustedOutboundEmailInput,
  type FinalSubmissionAuthorityRejectionReason,
  type FinalSubmissionAuthorityRevalidationResult,
  type FinalSubmissionAuthorityRevalidator,
  type OutboundEmailDispatchResult,
  type OutboundEmailDispatchTransactionPort,
  type RecoverOutboundEmailOutcomeInput,
  type SuspendAwareMonotonicClock,
} from 'src/modules/campaign-execution/types/outbound-email-dispatch.type';
import {
  OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
  OUTBOUND_EMAIL_UNKNOWN_AFTER_MS,
} from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { type SendMessageInput } from 'src/modules/messaging/message-outbound-manager/types/send-message-input.type';
import { classifyMessageOutboundError } from 'src/modules/messaging/message-outbound-manager/utils/classify-message-outbound-error.util';
import { resolveOutboundThreadExternalId } from 'src/modules/messaging/message-outbound-manager/utils/resolve-outbound-thread-external-id.util';

const intrinsicIsProxy = nodeUtilTypes.isProxy;
const intrinsicObjectGetPrototypeOf = Object.getPrototypeOf;
const intrinsicObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const intrinsicObjectGetOwnPropertyDescriptors =
  Object.getOwnPropertyDescriptors;
const intrinsicErrorStackDescriptor = intrinsicObjectGetOwnPropertyDescriptor(
  new Error(),
  'stack',
);
const intrinsicReflectApply = Reflect.apply;
const intrinsicReflectOwnKeys = Reflect.ownKeys;
const intrinsicDateGetTime = Date.prototype.getTime;
const intrinsicBufferAlloc = Buffer.alloc;
const intrinsicBufferIsBuffer = Buffer.isBuffer;
const intrinsicUint8ArraySet = Uint8Array.prototype.set;
const intrinsicTypedArrayPrototype = intrinsicObjectGetPrototypeOf(
  Uint8Array.prototype,
);
const intrinsicTypedArrayLengthGetter = intrinsicObjectGetOwnPropertyDescriptor(
  intrinsicTypedArrayPrototype,
  'length',
)?.get;
const intrinsicTypedArrayByteLengthGetter =
  intrinsicObjectGetOwnPropertyDescriptor(
    intrinsicTypedArrayPrototype,
    'byteLength',
  )?.get;

const SUPPORTED_EMAIL_PROVIDERS = new Set<ConnectedAccountProvider>([
  ConnectedAccountProvider.GOOGLE,
  ConnectedAccountProvider.MICROSOFT,
  ConnectedAccountProvider.IMAP_SMTP_CALDAV,
  ConnectedAccountProvider.EMAIL_GROUP,
]);

class UnsafeSnapshotError extends Error {}
class InvalidImapSmtpTransportMaterialError extends Error {}
class InvalidReservationBindingError extends Error {}

type DataRecord = Record<string, unknown>;

const unsafeSnapshot = (): never => {
  throw new UnsafeSnapshotError();
};

type TrapSafeObjectKind =
  | 'PLAIN_RECORD'
  | 'ARRAY'
  | 'DATE'
  | 'BUFFER'
  | 'ERROR'
  | 'OTHER';

type TrapSafeObjectClassification = {
  kind: TrapSafeObjectKind;
  prototype: object | null;
  value: object;
};

// This is the sole classifier for unknown object identities. It rejects both a
// Proxy value and a Proxy direct prototype before any brand check, reflection,
// traversal, coercion, or property access can occur.
const classifyTrapSafeObject = (
  value: unknown,
): TrapSafeObjectClassification => {
  if (value === null || typeof value !== 'object' || intrinsicIsProxy(value)) {
    return unsafeSnapshot();
  }
  const prototype = intrinsicObjectGetPrototypeOf(value);

  if (prototype !== null && intrinsicIsProxy(prototype)) {
    return unsafeSnapshot();
  }

  const kind: TrapSafeObjectKind =
    prototype === Object.prototype || prototype === null
      ? 'PLAIN_RECORD'
      : prototype === Array.prototype
        ? 'ARRAY'
        : prototype === Date.prototype
          ? 'DATE'
          : prototype === Buffer.prototype
            ? 'BUFFER'
            : prototype === Error.prototype
              ? 'ERROR'
              : 'OTHER';

  return { kind, prototype, value };
};

const hasExactDirectPrototype = (
  value: unknown,
  expectedPrototype: Error | WinnerTransactionExit,
): boolean => {
  try {
    return classifyTrapSafeObject(value).prototype === expectedPrototype;
  } catch {
    return false;
  }
};

const isIntrinsicErrorStackDescriptor = (
  descriptor: PropertyDescriptor,
): boolean =>
  intrinsicErrorStackDescriptor !== undefined &&
  !('value' in intrinsicErrorStackDescriptor) &&
  !('writable' in intrinsicErrorStackDescriptor) &&
  !('value' in descriptor) &&
  !('writable' in descriptor) &&
  descriptor.get === intrinsicErrorStackDescriptor.get &&
  descriptor.set === intrinsicErrorStackDescriptor.set &&
  descriptor.enumerable === intrinsicErrorStackDescriptor.enumerable &&
  descriptor.configurable === intrinsicErrorStackDescriptor.configurable;

const isTrapSafeClassifierInput = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return true;

  try {
    const classification = classifyTrapSafeObject(value);

    if (
      classification.kind !== 'PLAIN_RECORD' &&
      classification.kind !== 'ERROR'
    ) {
      return false;
    }
    const keys = intrinsicReflectOwnKeys(classification.value);
    const descriptors = intrinsicObjectGetOwnPropertyDescriptors(
      classification.value,
    );

    return keys.every((key) => {
      if (typeof key !== 'string') return false;
      const descriptor = descriptors[key];

      if (descriptor === undefined) return false;
      if (classification.kind === 'ERROR' && key === 'stack') {
        return isIntrinsicErrorStackDescriptor(descriptor);
      }

      return 'value' in descriptor;
    });
  } catch {
    return false;
  }
};

const readStrictRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  seen: WeakSet<object>,
): DataRecord => {
  const classification = classifyTrapSafeObject(value);

  if (classification.kind !== 'PLAIN_RECORD') {
    return unsafeSnapshot();
  }
  if (seen.has(classification.value)) return unsafeSnapshot();
  seen.add(classification.value);

  const keys = intrinsicReflectOwnKeys(classification.value);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);

  if (
    keys.some((key) => typeof key !== 'string' || !allowed.has(key)) ||
    requiredKeys.some((key) => !keys.includes(key))
  ) {
    return unsafeSnapshot();
  }

  const descriptors = intrinsicObjectGetOwnPropertyDescriptors(
    classification.value,
  );
  const result: DataRecord = {};

  for (const key of keys) {
    if (typeof key !== 'string') return unsafeSnapshot();
    const descriptor = descriptors[key];

    if (descriptor === undefined || !('value' in descriptor)) {
      return unsafeSnapshot();
    }
    result[key] = descriptor.value;
  }

  return result;
};

const snapshotDate = (value: unknown): Date => {
  const classification = classifyTrapSafeObject(value);

  if (
    classification.kind !== 'DATE' ||
    intrinsicReflectOwnKeys(classification.value).length !== 0
  ) {
    return unsafeSnapshot();
  }
  const milliseconds = intrinsicReflectApply(
    intrinsicDateGetTime,
    classification.value,
    [],
  );

  if (!Number.isFinite(milliseconds)) return unsafeSnapshot();

  return new Date(milliseconds);
};

const snapshotReceiptWindowDates = (
  value: unknown,
): { unknownAfter: Date; updatedAt: Date } => {
  const classification = classifyTrapSafeObject(value);

  if (classification.kind !== 'PLAIN_RECORD') return unsafeSnapshot();
  const descriptors = intrinsicObjectGetOwnPropertyDescriptors(
    classification.value,
  );
  const unknownAfter = descriptors.unknownAfter;
  const updatedAt = descriptors.updatedAt;

  if (
    unknownAfter === undefined ||
    !('value' in unknownAfter) ||
    updatedAt === undefined ||
    !('value' in updatedAt)
  ) {
    return unsafeSnapshot();
  }

  return {
    unknownAfter: snapshotDate(unknownAfter.value),
    updatedAt: snapshotDate(updatedAt.value),
  };
};

const snapshotArray = <Result>(
  value: unknown,
  seen: WeakSet<object>,
  snapshotItem: (item: unknown) => Result,
  classified?: TrapSafeObjectClassification,
): Result[] => {
  const classification = classified ?? classifyTrapSafeObject(value);

  if (classification.value !== value) return unsafeSnapshot();

  if (
    classification.kind !== 'ARRAY' ||
    !Array.isArray(classification.value) ||
    seen.has(classification.value)
  ) {
    return unsafeSnapshot();
  }
  seen.add(classification.value);
  const keys = intrinsicReflectOwnKeys(classification.value);
  const descriptors = intrinsicObjectGetOwnPropertyDescriptors(
    classification.value,
  );
  const lengthDescriptor = descriptors.length as PropertyDescriptor | undefined;

  if (
    lengthDescriptor === undefined ||
    !('value' in lengthDescriptor) ||
    typeof lengthDescriptor.value !== 'number' ||
    !Number.isInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.writable !== true ||
    lengthDescriptor.enumerable !== false ||
    lengthDescriptor.configurable !== false ||
    keys.length !== lengthDescriptor.value + 1
  ) {
    return unsafeSnapshot();
  }
  const length = lengthDescriptor.value;
  const result: Result[] = [];

  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (keys[index] !== key) return unsafeSnapshot();
    const descriptor = descriptors[key];

    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      descriptor.writable !== true ||
      descriptor.enumerable !== true ||
      descriptor.configurable !== true
    ) {
      return unsafeSnapshot();
    }
    result.push(snapshotItem(descriptor.value));
  }
  if (keys[length] !== 'length') return unsafeSnapshot();

  return result;
};

const snapshotProviderDeliveredRecipients = (
  value: unknown,
): { to: string[]; cc: string[]; bcc: string[] } => {
  const seen = new WeakSet<object>();
  const record = readStrictRecord(value, ['to', 'cc', 'bcc'], [], seen);
  const recipientList = (list: unknown): string[] =>
    snapshotArray(list, seen, (recipient) => {
      const normalized = snapshotString(recipient).trim();
      if (normalized.length === 0) return unsafeSnapshot();
      return normalized;
    });

  return {
    to: recipientList(record.to),
    cc: recipientList(record.cc),
    bcc: recipientList(record.bcc),
  };
};

const snapshotBuffer = (
  value: unknown,
  classified?: TrapSafeObjectClassification,
): Buffer => {
  const classification = classified ?? classifyTrapSafeObject(value);

  if (classification.value !== value) return unsafeSnapshot();

  if (
    classification.kind !== 'BUFFER' ||
    !intrinsicBufferIsBuffer(classification.value) ||
    intrinsicTypedArrayLengthGetter === undefined ||
    intrinsicTypedArrayByteLengthGetter === undefined
  ) {
    return unsafeSnapshot();
  }
  const length = intrinsicReflectApply(
    intrinsicTypedArrayLengthGetter,
    classification.value,
    [],
  );
  const byteLength = intrinsicReflectApply(
    intrinsicTypedArrayByteLengthGetter,
    classification.value,
    [],
  );

  if (
    typeof length !== 'number' ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    typeof byteLength !== 'number' ||
    !Number.isSafeInteger(byteLength) ||
    byteLength !== length
  ) {
    return unsafeSnapshot();
  }
  const keys = intrinsicReflectOwnKeys(classification.value);
  const descriptors = intrinsicObjectGetOwnPropertyDescriptors(
    classification.value,
  );

  if (keys.length !== length) return unsafeSnapshot();
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (keys[index] !== key) return unsafeSnapshot();
    const descriptor = descriptors[key];

    if (
      descriptor === undefined ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'number' ||
      !Number.isInteger(descriptor.value) ||
      descriptor.value < 0 ||
      descriptor.value > 255 ||
      descriptor.writable !== true ||
      descriptor.enumerable !== true ||
      descriptor.configurable !== true
    ) {
      return unsafeSnapshot();
    }
  }

  const copy = intrinsicReflectApply(intrinsicBufferAlloc, Buffer, [length]);
  intrinsicReflectApply(intrinsicUint8ArraySet, copy, [classification.value]);

  return copy;
};

const snapshotString = (value: unknown): string =>
  typeof value === 'string' ? value : unsafeSnapshot();

const snapshotPositiveInteger = (value: unknown): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : unsafeSnapshot();

const snapshotNullableString = (value: unknown): string | null =>
  value === null ? null : snapshotString(value);

const snapshotReservationString = (value: unknown): string => {
  try {
    return snapshotString(value);
  } catch {
    throw new InvalidReservationBindingError();
  }
};

const snapshotReservationBinding = (
  value: unknown,
  source: 'CAMPAIGN_SEQUENCE' | 'CAMPAIGN_TEST' | 'DIRECT',
  seen: WeakSet<object>,
): DataRecord => {
  const sourceKeys =
    source === 'CAMPAIGN_SEQUENCE'
      ? ['attemptNumber', 'senderPoolFingerprint']
      : source === 'CAMPAIGN_TEST'
        ? ['senderPoolFingerprint']
        : ['directReservationCapabilityId'];
  const record = readStrictRecord(
    value,
    [
      'localDate',
      'claimedAt',
      'slotAt',
      'unknownAfter',
      'selectionConstraintKind',
      'priorAcceptedEvidenceId',
      ...sourceKeys,
    ],
    [],
    seen,
  );
  const result: DataRecord = {
    claimedAt: snapshotDate(record.claimedAt),
    localDate: snapshotString(record.localDate),
    priorAcceptedEvidenceId: snapshotNullableString(
      record.priorAcceptedEvidenceId,
    ),
    selectionConstraintKind: snapshotString(record.selectionConstraintKind),
    slotAt: snapshotDate(record.slotAt),
    unknownAfter: snapshotDate(record.unknownAfter),
  };

  if (source === 'CAMPAIGN_SEQUENCE') {
    if (
      typeof record.attemptNumber !== 'number' ||
      !Number.isFinite(record.attemptNumber) ||
      !Number.isSafeInteger(record.attemptNumber) ||
      record.attemptNumber <= 0
    ) {
      throw new InvalidReservationBindingError();
    }

    return {
      ...result,
      attemptNumber: record.attemptNumber,
      senderPoolFingerprint: snapshotReservationString(
        record.senderPoolFingerprint,
      ),
    };
  }

  if (source === 'CAMPAIGN_TEST') {
    return {
      ...result,
      senderPoolFingerprint: snapshotReservationString(
        record.senderPoolFingerprint,
      ),
    };
  }

  return {
    ...result,
    directReservationCapabilityId: snapshotReservationString(
      record.directReservationCapabilityId,
    ),
  };
};

const snapshotRenderContext = (
  value: unknown,
  seen: WeakSet<object>,
): DataRecord => {
  const keys = [
    'workspaceId',
    'campaignId',
    'campaignExecutionId',
    'authorizationGeneration',
    'activationId',
    'enrollmentId',
    'occurrenceId',
    'authorizationId',
    'workflowVersionId',
    'messageId',
    'connectedAccountId',
    'messageChannelId',
    'provider',
    'normalizedSenderHandle',
    'normalizedRecipient',
  ] as const;
  const record = readStrictRecord(value, keys, [], seen);

  return Object.fromEntries(
    keys.map((key) => [
      key,
      key === 'authorizationGeneration'
        ? snapshotPositiveInteger(record[key])
        : snapshotString(record[key]),
    ]),
  );
};

const COMMON_SUBMISSION_KEYS = [
  'attemptId',
  'workspaceId',
  'connectedAccountId',
  'messageChannelId',
  'provider',
  'normalizedSenderHandle',
  'normalizedRecipient',
  'finalEvidenceDigest',
  'source',
  'submissionCapability',
] as const;

const snapshotSubmission = (
  value: unknown,
): BeginOutboundEmailSubmissionInput => {
  const seen = new WeakSet<object>();
  const sourceRecord = readStrictRecord(
    value,
    ['source'],
    [
      ...COMMON_SUBMISSION_KEYS.filter((key) => key !== 'source'),
      'campaignId',
      'campaignExecutionId',
      'authorizationGeneration',
      'activationId',
      'enrollmentId',
      'occurrenceId',
      'authorizationId',
      'workflowVersionId',
      'messageId',
      'renderDigest',
      'testPreparationProofId',
      'requesterUserWorkspaceId',
      'previewDigest',
      'testTransportDigest',
      'directReservationCapabilityId',
    ],
    new WeakSet<object>(),
  );
  const source = snapshotString(sourceRecord.source);
  const sourceSpecificKeys =
    source === 'CAMPAIGN_SEQUENCE'
      ? [
          'campaignId',
          'campaignExecutionId',
          'authorizationGeneration',
          'activationId',
          'enrollmentId',
          'occurrenceId',
          'authorizationId',
          'workflowVersionId',
          'messageId',
          'renderDigest',
        ]
      : source === 'CAMPAIGN_TEST'
        ? [
            'campaignId',
            'workflowVersionId',
            'messageId',
            'testPreparationProofId',
            'requesterUserWorkspaceId',
            'renderDigest',
            'previewDigest',
            'testTransportDigest',
          ]
        : source === 'INBOX' || source === 'AUTOMATED_REPLY'
          ? ['directReservationCapabilityId']
          : unsafeSnapshot();
  const record = readStrictRecord(
    value,
    [...COMMON_SUBMISSION_KEYS, ...sourceSpecificKeys],
    [],
    seen,
  );
  const common = Object.fromEntries(
    COMMON_SUBMISSION_KEYS.filter((key) => key !== 'submissionCapability').map(
      (key) => [key, snapshotString(record[key])],
    ),
  );

  if (source === 'CAMPAIGN_SEQUENCE') {
    const capability = readStrictRecord(
      record.submissionCapability,
      [
        'kind',
        'attemptId',
        'campaignExecutionId',
        'authorizationGeneration',
        'activationId',
        'renderDigest',
        'reservationBinding',
        'renderContext',
      ],
      [],
      seen,
    );

    // SAFETY: every common and Campaign-sequence-specific field was copied
    // from exact-key, trap-safe snapshots immediately above.
    return {
      ...common,
      activationId: snapshotString(record.activationId),
      authorizationGeneration: snapshotPositiveInteger(
        record.authorizationGeneration,
      ),
      authorizationId: snapshotString(record.authorizationId),
      campaignExecutionId: snapshotString(record.campaignExecutionId),
      campaignId: snapshotString(record.campaignId),
      enrollmentId: snapshotString(record.enrollmentId),
      messageId: snapshotString(record.messageId),
      occurrenceId: snapshotString(record.occurrenceId),
      renderDigest: snapshotString(record.renderDigest),
      source,
      submissionCapability: {
        activationId: snapshotString(capability.activationId),
        attemptId: snapshotString(capability.attemptId),
        authorizationGeneration: snapshotPositiveInteger(
          capability.authorizationGeneration,
        ),
        campaignExecutionId: snapshotString(capability.campaignExecutionId),
        kind: snapshotString(capability.kind) as 'CAMPAIGN_SEQUENCE_SUBMISSION',
        renderContext: snapshotRenderContext(
          capability.renderContext,
          seen,
        ) as never,
        renderDigest: snapshotString(capability.renderDigest),
        reservationBinding: snapshotReservationBinding(
          capability.reservationBinding,
          'CAMPAIGN_SEQUENCE',
          seen,
        ) as never,
      },
      workflowVersionId: snapshotString(record.workflowVersionId),
    } as unknown as BeginOutboundEmailSubmissionInput;
  }

  if (source === 'CAMPAIGN_TEST') {
    const capabilityKeys = [
      'kind',
      'testSubmissionCapabilityId',
      'attemptId',
      'testPreparationProofId',
      'workspaceId',
      'campaignId',
      'workflowVersionId',
      'messageId',
      'requesterUserWorkspaceId',
      'normalizedRecipient',
      'connectedAccountId',
      'messageChannelId',
      'provider',
      'normalizedSenderHandle',
      'reservationBinding',
      'renderDigest',
      'previewDigest',
      'testTransportDigest',
    ] as const;
    const capability = readStrictRecord(
      record.submissionCapability,
      capabilityKeys,
      [],
      seen,
    );
    const capabilitySnapshot = Object.fromEntries(
      capabilityKeys
        .filter((key) => key !== 'reservationBinding')
        .map((key) => [key, snapshotString(capability[key])]),
    );

    return {
      ...common,
      campaignId: snapshotString(record.campaignId),
      messageId: snapshotString(record.messageId),
      previewDigest: snapshotString(record.previewDigest),
      renderDigest: snapshotString(record.renderDigest),
      requesterUserWorkspaceId: snapshotString(record.requesterUserWorkspaceId),
      source,
      submissionCapability: {
        ...capabilitySnapshot,
        reservationBinding: snapshotReservationBinding(
          capability.reservationBinding,
          'CAMPAIGN_TEST',
          seen,
        ),
      },
      testPreparationProofId: snapshotString(record.testPreparationProofId),
      testTransportDigest: snapshotString(record.testTransportDigest),
      workflowVersionId: snapshotString(record.workflowVersionId),
    } as BeginOutboundEmailSubmissionInput;
  }

  const capabilityKeys = [
    'kind',
    'directSubmissionCapabilityId',
    'directReservationCapabilityId',
    'attemptId',
    'workspaceId',
    'connectedAccountId',
    'messageChannelId',
    'provider',
    'normalizedSenderHandle',
    'normalizedRecipient',
    'reservationBinding',
    'finalEvidenceDigest',
  ] as const;
  const capability = readStrictRecord(
    record.submissionCapability,
    capabilityKeys,
    [],
    seen,
  );
  const capabilitySnapshot = Object.fromEntries(
    capabilityKeys
      .filter((key) => key !== 'reservationBinding')
      .map((key) => [key, snapshotString(capability[key])]),
  );

  return {
    ...common,
    directReservationCapabilityId: snapshotString(
      record.directReservationCapabilityId,
    ),
    source,
    submissionCapability: {
      ...capabilitySnapshot,
      reservationBinding: snapshotReservationBinding(
        capability.reservationBinding,
        'DIRECT',
        seen,
      ),
    },
  } as BeginOutboundEmailSubmissionInput;
};

const assertSafeStrippedValue = (
  value: unknown,
  seen: WeakSet<object>,
): void => {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value !== 'object') return unsafeSnapshot();
  const classification = classifyTrapSafeObject(value);

  if (classification.kind === 'BUFFER') {
    snapshotBuffer(value, classification);
    return;
  }
  if (classification.kind === 'ARRAY') {
    snapshotArray(
      value,
      seen,
      (item) => {
        assertSafeStrippedValue(item, seen);
        return null;
      },
      classification,
    );
    return;
  }
  if (classification.kind !== 'PLAIN_RECORD') return unsafeSnapshot();
  if (seen.has(classification.value)) return unsafeSnapshot();
  seen.add(classification.value);
  const keys = intrinsicReflectOwnKeys(classification.value);

  if (keys.some((key) => typeof key !== 'string')) return unsafeSnapshot();
  const descriptors = intrinsicObjectGetOwnPropertyDescriptors(
    classification.value,
  );

  for (const key of keys) {
    if (typeof key !== 'string') return unsafeSnapshot();
    const descriptor = descriptors[key];

    if (descriptor === undefined || !('value' in descriptor)) {
      return unsafeSnapshot();
    }
    assertSafeStrippedValue(descriptor.value, seen);
  }
};

const snapshotProtocolParameters = (
  value: unknown,
  seen: WeakSet<object>,
): DataRecord => {
  const record = readStrictRecord(
    value,
    ['host', 'port', 'password', 'connectionSecurity'],
    ['username'],
    seen,
  );
  const host = snapshotString(record.host);
  const password = snapshotString(record.password);
  const connectionSecurity = snapshotString(record.connectionSecurity);
  const port = record.port;

  if (
    host.trim().length === 0 ||
    password.length === 0 ||
    typeof port !== 'number' ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65_535 ||
    !Object.values(EmailConnectionSecurity).includes(
      connectionSecurity as EmailConnectionSecurity,
    ) ||
    ('username' in record && typeof record.username !== 'string')
  ) {
    return unsafeSnapshot();
  }

  return {
    connectionSecurity,
    host,
    password,
    port,
    ...('username' in record
      ? { username: snapshotString(record.username) }
      : {}),
  };
};

const snapshotImapSmtpConnectionParameters = (value: unknown): DataRecord => {
  try {
    const seen = new WeakSet<object>();
    const record = readStrictRecord(value, ['IMAP', 'SMTP'], ['CALDAV'], seen);
    const result = {
      IMAP: snapshotProtocolParameters(record.IMAP, seen),
      SMTP: snapshotProtocolParameters(record.SMTP, seen),
    };

    if ('CALDAV' in record) {
      assertSafeStrippedValue(record.CALDAV, seen);
    }

    return result;
  } catch {
    throw new InvalidImapSmtpTransportMaterialError();
  }
};

const snapshotConnectedAccount = (value: unknown): ConnectedAccountEntity => {
  const classification = classifyTrapSafeObject(value);

  if (classification.kind !== 'PLAIN_RECORD') return unsafeSnapshot();
  const keys = intrinsicReflectOwnKeys(classification.value);

  if (keys.some((key) => typeof key !== 'string')) return unsafeSnapshot();
  const descriptors = intrinsicObjectGetOwnPropertyDescriptors(
    classification.value,
  );
  const required = ['id', 'workspaceId', 'handle', 'provider'] as const;

  if (required.some((key) => !(key in descriptors))) return unsafeSnapshot();
  const providerDescriptor = descriptors.provider;

  if (
    providerDescriptor === undefined ||
    !('value' in providerDescriptor) ||
    typeof providerDescriptor.value !== 'string'
  ) {
    return unsafeSnapshot();
  }
  const provider = providerDescriptor.value as ConnectedAccountProvider;
  let connectionParameters: DataRecord | undefined;

  try {
    const seen = new WeakSet<object>();
    seen.add(classification.value);

    for (const key of keys) {
      if (typeof key !== 'string') return unsafeSnapshot();
      const descriptor = descriptors[key];

      if (descriptor === undefined || !('value' in descriptor)) {
        return unsafeSnapshot();
      }
      assertSafeStrippedValue(descriptor.value, seen);
    }
    if (provider === ConnectedAccountProvider.IMAP_SMTP_CALDAV) {
      const descriptor = descriptors.connectionParameters;

      if (descriptor === undefined || !('value' in descriptor)) {
        throw new InvalidImapSmtpTransportMaterialError();
      }
      connectionParameters = snapshotImapSmtpConnectionParameters(
        descriptor.value,
      );
    }
  } catch (error) {
    if (provider === ConnectedAccountProvider.IMAP_SMTP_CALDAV) {
      throw new InvalidImapSmtpTransportMaterialError();
    }
    throw error;
  }

  return {
    handle: snapshotString(descriptors.handle.value),
    id: snapshotString(descriptors.id.value),
    provider,
    workspaceId: snapshotString(descriptors.workspaceId.value),
    ...(connectionParameters === undefined ? {} : { connectionParameters }),
  } as ConnectedAccountEntity;
};

const snapshotProviderConnectedAccount = (
  value: unknown,
): ConnectedAccountEntity => {
  const account = snapshotConnectedAccount(value);

  switch (account.provider) {
    case ConnectedAccountProvider.GOOGLE:
    case ConnectedAccountProvider.MICROSOFT:
      return {
        id: account.id,
        provider: account.provider,
      } as ConnectedAccountEntity;
    case ConnectedAccountProvider.IMAP_SMTP_CALDAV:
      return {
        connectionParameters: snapshotImapSmtpConnectionParameters(
          account.connectionParameters,
        ),
        handle: account.handle,
        id: account.id,
        provider: account.provider,
      } as ConnectedAccountEntity;
    case ConnectedAccountProvider.EMAIL_GROUP:
      return {
        handle: account.handle,
        provider: account.provider,
        workspaceId: account.workspaceId,
      } as ConnectedAccountEntity;
    default:
      return unsafeSnapshot();
  }
};

const snapshotAddress = (
  value: unknown,
  seen: WeakSet<object>,
): string | string[] =>
  typeof value === 'string'
    ? value
    : snapshotArray(value, seen, snapshotString);

const snapshotSendMessageInput = (value: unknown): SendMessageInput => {
  const seen = new WeakSet<object>();
  const record = readStrictRecord(
    value,
    ['body', 'subject', 'to', 'html'],
    ['cc', 'bcc', 'attachments', 'inReplyTo', 'threadExternalId', 'references'],
    seen,
  );
  const result: SendMessageInput = {
    body: snapshotString(record.body),
    html: snapshotString(record.html),
    subject: snapshotString(record.subject),
    to: snapshotAddress(record.to, seen),
  };

  for (const key of ['cc', 'bcc'] as const) {
    if (record[key] !== undefined) {
      result[key] = snapshotAddress(record[key], seen);
    }
  }
  for (const key of ['inReplyTo', 'threadExternalId'] as const) {
    if (record[key] !== undefined) result[key] = snapshotString(record[key]);
  }
  if (record.references !== undefined) {
    result.references = snapshotArray(record.references, seen, snapshotString);
  }
  if (record.attachments !== undefined) {
    result.attachments = snapshotArray(
      record.attachments,
      seen,
      (attachment) => {
        const attachmentRecord = readStrictRecord(
          attachment,
          ['filename', 'content', 'contentType'],
          [],
          seen,
        );

        return {
          content: snapshotBuffer(attachmentRecord.content),
          contentType: snapshotString(attachmentRecord.contentType),
          filename: snapshotString(attachmentRecord.filename),
        };
      },
    );
  }

  return result;
};

const deepFreezeSnapshot = <Value>(value: Value): Value => {
  if (value === null || typeof value !== 'object') return value;
  const classification = classifyTrapSafeObject(value);

  if (classification.kind === 'BUFFER') {
    if (!intrinsicBufferIsBuffer(classification.value)) {
      return unsafeSnapshot();
    }
    return value;
  }
  if (classification.kind === 'ARRAY' && !Array.isArray(classification.value)) {
    return unsafeSnapshot();
  }
  if (classification.kind === 'DATE') {
    intrinsicReflectApply(intrinsicDateGetTime, classification.value, []);
  } else if (
    classification.kind !== 'ARRAY' &&
    classification.kind !== 'PLAIN_RECORD'
  ) {
    return unsafeSnapshot();
  }
  const keys = intrinsicReflectOwnKeys(classification.value);
  const descriptors = intrinsicObjectGetOwnPropertyDescriptors(
    classification.value,
  );

  for (const key of keys) {
    if (typeof key !== 'string') return unsafeSnapshot();
    const descriptor = descriptors[key];

    if (descriptor === undefined || !('value' in descriptor)) {
      return unsafeSnapshot();
    }
    deepFreezeSnapshot(descriptor.value);
  }

  return Object.freeze(classification.value) as Value;
};

const snapshotDispatchInput = (
  value: unknown,
): {
  authority: DispatchTrustedOutboundEmailInput;
  providerAccount: ConnectedAccountEntity;
  providerInput: SendMessageInput;
} => {
  const input = readStrictRecord(
    value,
    ['kind', 'material', 'submission'],
    [],
    new WeakSet<object>(),
  );
  const material = readStrictRecord(
    input.material,
    ['connectedAccount', 'sendMessageInput', 'projectedMessageId'],
    [],
    new WeakSet<object>(),
  );
  const accountSnapshot = snapshotConnectedAccount(material.connectedAccount);
  const sendMessageSnapshot = snapshotSendMessageInput(
    material.sendMessageInput,
  );
  const providerInputSnapshot = snapshotSendMessageInput(sendMessageSnapshot);
  const authority = {
    kind: snapshotString(input.kind),
    material: {
      connectedAccount: {
        handle: accountSnapshot.handle,
        id: accountSnapshot.id,
        provider: accountSnapshot.provider,
        workspaceId: accountSnapshot.workspaceId,
      } as ConnectedAccountEntity,
      projectedMessageId: snapshotNullableString(material.projectedMessageId),
      sendMessageInput: sendMessageSnapshot,
    },
    submission: snapshotSubmission(input.submission),
  } as DispatchTrustedOutboundEmailInput;

  return {
    authority: deepFreezeSnapshot(authority),
    providerAccount: deepFreezeSnapshot(
      snapshotProviderConnectedAccount(accountSnapshot),
    ),
    providerInput: deepFreezeSnapshot(providerInputSnapshot),
  };
};

const snapshotAuthorityResult = (
  value: unknown,
): FinalSubmissionAuthorityRevalidationResult => {
  const statusOnly = readStrictRecord(
    value,
    ['status'],
    ['submission', 'projectedMessageId', 'reason'],
    new WeakSet<object>(),
  );
  const status = snapshotString(statusOnly.status);

  if (status === 'REJECTED') {
    const record = readStrictRecord(
      value,
      ['status', 'reason'],
      [],
      new WeakSet<object>(),
    );

    return {
      reason: snapshotString(record.reason) as never,
      status,
    };
  }
  if (status !== 'AUTHORIZED') return unsafeSnapshot();
  const record = readStrictRecord(
    value,
    ['status', 'submission', 'projectedMessageId'],
    [],
    new WeakSet<object>(),
  );

  return {
    projectedMessageId: snapshotNullableString(record.projectedMessageId),
    status,
    submission: snapshotSubmission(record.submission),
  };
};

const snapshotRecoveryEvidence = (
  value: unknown,
): RecoverOutboundEmailOutcomeInput => {
  const statusRecord = readStrictRecord(
    value,
    ['kind'],
    [
      'submission',
      'providerMessageId',
      'providerHeaderMessageId',
      'providerMessageExternalId',
      'providerThreadExternalId',
      'resolvedThreadExternalId',
      'providerDeliveredRecipients',
      'projectedMessageId',
      'projectedMessageThreadId',
      'safeOutcomeReason',
    ],
    new WeakSet<object>(),
  );
  const kind = snapshotString(statusRecord.kind);
  const keys =
    kind === 'ACCEPTED_EVIDENCE'
      ? [
          'kind',
          'submission',
          'providerMessageId',
          'providerHeaderMessageId',
          'providerMessageExternalId',
          'providerThreadExternalId',
          'resolvedThreadExternalId',
          'providerDeliveredRecipients',
          'projectedMessageId',
          'projectedMessageThreadId',
        ]
      : kind === 'DEFINITELY_UNACCEPTED_EVIDENCE'
        ? ['kind', 'submission', 'safeOutcomeReason']
        : kind === 'AMBIGUOUS_EVIDENCE'
          ? ['kind', 'submission']
          : unsafeSnapshot();
  const record = readStrictRecord(value, keys, [], new WeakSet<object>());
  const submission = snapshotSubmission(record.submission);

  if (kind === 'ACCEPTED_EVIDENCE') {
    return {
      kind,
      projectedMessageId: snapshotNullableString(record.projectedMessageId),
      projectedMessageThreadId: snapshotNullableString(
        record.projectedMessageThreadId,
      ),
      providerDeliveredRecipients:
        record.providerDeliveredRecipients === null
          ? null
          : (snapshotProviderDeliveredRecipients(
              record.providerDeliveredRecipients,
            ) as { to: string[]; cc: string[]; bcc: string[] }),
      providerHeaderMessageId: snapshotNullableString(
        record.providerHeaderMessageId,
      ),
      providerMessageExternalId: snapshotNullableString(
        record.providerMessageExternalId,
      ),
      providerMessageId: snapshotString(record.providerMessageId),
      providerThreadExternalId: snapshotNullableString(
        record.providerThreadExternalId,
      ),
      resolvedThreadExternalId: snapshotNullableString(
        record.resolvedThreadExternalId,
      ),
      submission,
    };
  }
  if (kind === 'DEFINITELY_UNACCEPTED_EVIDENCE') {
    return {
      kind,
      safeOutcomeReason: snapshotString(record.safeOutcomeReason) as never,
      submission,
    };
  }

  return { kind: 'AMBIGUOUS_EVIDENCE', submission };
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

const isNonemptyText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const FORBIDDEN_RECIPIENT_SYNTAX = /[,;:<>\s\u0000-\u001f\u007f]/u;

const isCanonicalRecipientMailbox = (value: unknown): value is string =>
  isNormalizedText(value) &&
  !FORBIDDEN_RECIPIENT_SYNTAX.test(value) &&
  isEmail(value, {
    allow_display_name: false,
    allow_utf8_local_part: true,
    require_display_name: false,
  });

const isExactArrayValue = (value: unknown): value is unknown[] => {
  try {
    const classification = classifyTrapSafeObject(value);

    return (
      classification.kind === 'ARRAY' && Array.isArray(classification.value)
    );
  } catch {
    return false;
  }
};

const isExactBufferValue = (value: unknown): value is Buffer => {
  try {
    const classification = classifyTrapSafeObject(value);

    return (
      classification.kind === 'BUFFER' &&
      intrinsicBufferIsBuffer(classification.value)
    );
  } catch {
    return false;
  }
};

const isFiniteDate = (value: unknown): value is Date => {
  try {
    const classification = classifyTrapSafeObject(value);

    return (
      classification.kind === 'DATE' &&
      intrinsicReflectOwnKeys(classification.value).length === 0 &&
      Number.isFinite(
        intrinsicReflectApply(intrinsicDateGetTime, classification.value, []),
      )
    );
  } catch {
    return false;
  }
};

const isLocalDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(intrinsicReflectApply(intrinsicDateGetTime, parsed, [])) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const exactValue = (left: unknown, right: unknown): boolean => {
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return left === right;
  }
  let leftClassification: TrapSafeObjectClassification;
  let rightClassification: TrapSafeObjectClassification;

  try {
    leftClassification = classifyTrapSafeObject(left);
    rightClassification = classifyTrapSafeObject(right);
  } catch {
    return false;
  }
  if (leftClassification.kind !== rightClassification.kind) return false;
  if (leftClassification.kind === 'DATE') {
    try {
      return (
        intrinsicReflectOwnKeys(leftClassification.value).length === 0 &&
        intrinsicReflectOwnKeys(rightClassification.value).length === 0 &&
        intrinsicReflectApply(
          intrinsicDateGetTime,
          leftClassification.value,
          [],
        ) ===
          intrinsicReflectApply(
            intrinsicDateGetTime,
            rightClassification.value,
            [],
          )
      );
    } catch {
      return false;
    }
  }
  if (leftClassification.kind === 'ARRAY') {
    if (
      !Array.isArray(leftClassification.value) ||
      !Array.isArray(rightClassification.value)
    ) {
      return false;
    }
    const leftArray = leftClassification.value as unknown[];
    const rightArray = rightClassification.value as unknown[];

    return (
      leftArray.length === rightArray.length &&
      leftArray.every((value, index) => exactValue(value, rightArray[index]))
    );
  }
  if (leftClassification.kind !== 'PLAIN_RECORD') return false;

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        exactValue(leftRecord[key], rightRecord[key]),
    )
  );
};

const validReservationBinding = (
  binding: Record<string, unknown>,
  allowedSelectionKinds: readonly string[],
): boolean =>
  isLocalDate(binding.localDate) &&
  isFiniteDate(binding.claimedAt) &&
  isFiniteDate(binding.slotAt) &&
  isFiniteDate(binding.unknownAfter) &&
  intrinsicReflectApply(
    intrinsicDateGetTime,
    binding.unknownAfter as Date,
    [],
  ) -
    intrinsicReflectApply(
      intrinsicDateGetTime,
      binding.claimedAt as Date,
      [],
    ) ===
    OUTBOUND_EMAIL_UNKNOWN_AFTER_MS &&
  typeof binding.selectionConstraintKind === 'string' &&
  allowedSelectionKinds.includes(binding.selectionConstraintKind) &&
  (binding.selectionConstraintKind === 'PINNED_REPLY'
    ? isCanonicalUuid(binding.priorAcceptedEvidenceId)
    : binding.priorAcceptedEvidenceId === null);

const validCommonSubmission = (
  submission: BeginOutboundEmailSubmissionInput,
): boolean =>
  [
    submission.attemptId,
    submission.workspaceId,
    submission.connectedAccountId,
    submission.messageChannelId,
  ].every(isCanonicalUuid) &&
  SUPPORTED_EMAIL_PROVIDERS.has(
    submission.provider as ConnectedAccountProvider,
  ) &&
  isNormalizedText(submission.normalizedSenderHandle) &&
  isCanonicalRecipientMailbox(submission.normalizedRecipient) &&
  isDigest(submission.finalEvidenceDigest);

const validSequenceSubmission = (
  submission: Extract<
    BeginOutboundEmailSubmissionInput,
    { source: 'CAMPAIGN_SEQUENCE' }
  >,
): boolean => {
  const capability = submission.submissionCapability;
  // SAFETY: this validator intentionally inspects the persisted binding by
  // canonical field names rather than trusting its nominal capability type.
  const binding = capability.reservationBinding as unknown as Record<
    string,
    unknown
  >;
  const context = capability.renderContext;

  return (
    [
      submission.campaignId,
      submission.campaignExecutionId,
      submission.activationId,
      submission.enrollmentId,
      submission.occurrenceId,
      submission.authorizationId,
      submission.workflowVersionId,
      submission.messageId,
    ].every(isCanonicalUuid) &&
    isDigest(submission.renderDigest) &&
    capability.kind === 'CAMPAIGN_SEQUENCE_SUBMISSION' &&
    Number.isSafeInteger(submission.authorizationGeneration) &&
    submission.authorizationGeneration > 0 &&
    capability.attemptId === submission.attemptId &&
    capability.campaignExecutionId === submission.campaignExecutionId &&
    capability.authorizationGeneration === submission.authorizationGeneration &&
    capability.activationId === submission.activationId &&
    capability.renderDigest === submission.renderDigest &&
    validReservationBinding(binding, ['ROTATE', 'PINNED_REPLY']) &&
    typeof binding.attemptNumber === 'number' &&
    Number.isSafeInteger(binding.attemptNumber) &&
    binding.attemptNumber > 0 &&
    isDigest(binding.senderPoolFingerprint) &&
    context.workspaceId === submission.workspaceId &&
    context.campaignId === submission.campaignId &&
    context.campaignExecutionId === submission.campaignExecutionId &&
    context.authorizationGeneration === submission.authorizationGeneration &&
    context.activationId === submission.activationId &&
    context.enrollmentId === submission.enrollmentId &&
    context.occurrenceId === submission.occurrenceId &&
    context.authorizationId === submission.authorizationId &&
    context.workflowVersionId === submission.workflowVersionId &&
    context.messageId === submission.messageId &&
    context.connectedAccountId === submission.connectedAccountId &&
    context.messageChannelId === submission.messageChannelId &&
    context.provider === submission.provider &&
    context.normalizedSenderHandle === submission.normalizedSenderHandle &&
    context.normalizedRecipient === submission.normalizedRecipient
  );
};

const validTestSubmission = (
  submission: Extract<
    BeginOutboundEmailSubmissionInput,
    { source: 'CAMPAIGN_TEST' }
  >,
): boolean => {
  const capability = submission.submissionCapability;
  // SAFETY: this validator intentionally inspects the persisted binding by
  // canonical field names rather than trusting its nominal capability type.
  const binding = capability.reservationBinding as unknown as Record<
    string,
    unknown
  >;

  return (
    [
      submission.campaignId,
      submission.workflowVersionId,
      submission.messageId,
      submission.testPreparationProofId,
      submission.requesterUserWorkspaceId,
      capability.testSubmissionCapabilityId,
    ].every(isCanonicalUuid) &&
    [
      submission.renderDigest,
      submission.previewDigest,
      submission.testTransportDigest,
    ].every(isDigest) &&
    capability.kind === 'CAMPAIGN_TEST_SUBMISSION' &&
    capability.attemptId === submission.attemptId &&
    capability.testPreparationProofId === submission.testPreparationProofId &&
    capability.workspaceId === submission.workspaceId &&
    capability.campaignId === submission.campaignId &&
    capability.workflowVersionId === submission.workflowVersionId &&
    capability.messageId === submission.messageId &&
    capability.requesterUserWorkspaceId ===
      submission.requesterUserWorkspaceId &&
    capability.normalizedRecipient === submission.normalizedRecipient &&
    capability.connectedAccountId === submission.connectedAccountId &&
    capability.messageChannelId === submission.messageChannelId &&
    capability.provider === submission.provider &&
    capability.normalizedSenderHandle === submission.normalizedSenderHandle &&
    capability.renderDigest === submission.renderDigest &&
    capability.previewDigest === submission.previewDigest &&
    capability.testTransportDigest === submission.testTransportDigest &&
    validReservationBinding(binding, ['ROTATE', 'PINNED_REPLY']) &&
    isDigest(binding.senderPoolFingerprint)
  );
};

const validDirectSubmission = (
  submission: Extract<
    BeginOutboundEmailSubmissionInput,
    { source: 'INBOX' | 'AUTOMATED_REPLY' }
  >,
): boolean => {
  const capability = submission.submissionCapability;
  // SAFETY: this validator intentionally inspects the persisted binding by
  // canonical field names rather than trusting its nominal capability type.
  const binding = capability.reservationBinding as unknown as Record<
    string,
    unknown
  >;

  return (
    isCanonicalUuid(submission.directReservationCapabilityId) &&
    isCanonicalUuid(capability.directSubmissionCapabilityId) &&
    capability.kind === 'DIRECT_SUBMISSION_CAPABILITY' &&
    capability.attemptId === submission.attemptId &&
    capability.directReservationCapabilityId ===
      submission.directReservationCapabilityId &&
    capability.workspaceId === submission.workspaceId &&
    capability.connectedAccountId === submission.connectedAccountId &&
    capability.messageChannelId === submission.messageChannelId &&
    capability.provider === submission.provider &&
    capability.normalizedSenderHandle === submission.normalizedSenderHandle &&
    capability.normalizedRecipient === submission.normalizedRecipient &&
    capability.finalEvidenceDigest === submission.finalEvidenceDigest &&
    validReservationBinding(binding, ['EXPLICIT', 'PINNED_REPLY']) &&
    binding.directReservationCapabilityId ===
      submission.directReservationCapabilityId
  );
};

const reservationIdentityFromSubmission = (
  submission: BeginOutboundEmailSubmissionInput,
): OutboundEmailAttemptReservationIdentity => {
  const binding = submission.submissionCapability.reservationBinding;
  const common = {
    attemptId: submission.attemptId,
    workspaceId: submission.workspaceId,
    connectedAccountId: submission.connectedAccountId,
    messageChannelId: submission.messageChannelId,
    provider: submission.provider,
    normalizedSenderHandle: submission.normalizedSenderHandle,
    normalizedRecipient: submission.normalizedRecipient,
    localDate: binding.localDate,
    claimedAt: binding.claimedAt,
    slotAt: binding.slotAt,
    unknownAfter: binding.unknownAfter,
    selectionConstraintKind: binding.selectionConstraintKind,
    priorAcceptedEvidenceId: binding.priorAcceptedEvidenceId,
  };
  if (submission.source === 'CAMPAIGN_SEQUENCE') {
    const sequenceBinding = submission.submissionCapability.reservationBinding;
    return {
      ...common,
      source: submission.source,
      campaignId: submission.campaignId,
      enrollmentId: submission.enrollmentId,
      occurrenceId: submission.occurrenceId,
      authorizationId: submission.authorizationId,
      workflowVersionId: submission.workflowVersionId,
      messageId: submission.messageId,
      attemptNumber: sequenceBinding.attemptNumber,
      senderPoolFingerprint: sequenceBinding.senderPoolFingerprint,
      renderDigest: submission.renderDigest,
      reservationEvidence: { kind: 'CAMPAIGN_SEQUENCE_RESERVATION' },
    } as OutboundEmailAttemptReservationIdentity;
  }
  if (submission.source === 'CAMPAIGN_TEST') {
    const testBinding = submission.submissionCapability.reservationBinding;
    return {
      ...common,
      source: submission.source,
      campaignId: submission.campaignId,
      workflowVersionId: submission.workflowVersionId,
      messageId: submission.messageId,
      senderPoolFingerprint: testBinding.senderPoolFingerprint,
      renderDigest: submission.renderDigest,
      previewDigest: submission.previewDigest,
      testTransportDigest: submission.testTransportDigest,
      requesterUserWorkspaceId: submission.requesterUserWorkspaceId,
      reservationEvidence: {
        kind: 'TEST_PREPARATION_PROOF',
        testPreparationProofId: submission.testPreparationProofId,
        maySubmit: false,
      },
    } as OutboundEmailAttemptReservationIdentity;
  }
  return {
    ...common,
    source: submission.source,
    directReservationCapabilityId: submission.directReservationCapabilityId,
    reservationEvidence: {
      kind: 'DIRECT_RESERVATION_CAPABILITY',
      directReservationCapabilityId: submission.directReservationCapabilityId,
    },
  } as OutboundEmailAttemptReservationIdentity;
};

const isValidSubmission = (
  submission: BeginOutboundEmailSubmissionInput,
): boolean => {
  if (
    submission === null ||
    typeof submission !== 'object' ||
    ![
      'CAMPAIGN_SEQUENCE',
      'CAMPAIGN_TEST',
      'INBOX',
      'AUTOMATED_REPLY',
    ].includes(submission.source) ||
    !validCommonSubmission(submission)
  ) {
    return false;
  }

  if (submission.source === 'CAMPAIGN_SEQUENCE') {
    return validSequenceSubmission(submission);
  }
  if (submission.source === 'CAMPAIGN_TEST') {
    return validTestSubmission(submission);
  }

  return validDirectSubmission(submission);
};

const recipientValues = (value: string | string[] | undefined): string[] =>
  value === undefined
    ? []
    : isExactArrayValue(value)
      ? (value as string[])
      : [value as string];

const isValidTransportInput = (
  input: SendMessageInput,
  normalizedRecipient: string,
): boolean => {
  const recipients = [
    ...recipientValues(input.to),
    ...recipientValues(input.cc),
    ...recipientValues(input.bcc),
  ];
  const attachmentsValid =
    input.attachments === undefined ||
    (isExactArrayValue(input.attachments) &&
      input.attachments.every(
        (attachment) =>
          isNonemptyText(attachment.filename) &&
          isNonemptyText(attachment.contentType) &&
          isExactBufferValue(attachment.content),
      ));
  const referencesValid =
    input.references === undefined ||
    (isExactArrayValue(input.references) &&
      input.references.every(isNonemptyText));

  return (
    isNonemptyText(input.subject) &&
    typeof input.body === 'string' &&
    typeof input.html === 'string' &&
    (input.body.trim().length > 0 || input.html.trim().length > 0) &&
    recipients.length === 1 &&
    recipients[0] === normalizedRecipient &&
    isCanonicalRecipientMailbox(recipients[0]) &&
    attachmentsValid &&
    referencesValid &&
    (input.inReplyTo === undefined || isNonemptyText(input.inReplyTo)) &&
    (input.threadExternalId === undefined ||
      isNonemptyText(input.threadExternalId))
  );
};

const isValidDispatchInput = (
  input: DispatchTrustedOutboundEmailInput,
): boolean => {
  const { connectedAccount, projectedMessageId, sendMessageInput } =
    input.material;
  const { submission } = input;
  const kindMatches =
    (input.kind === 'CAMPAIGN_SEQUENCE_FINAL' &&
      submission.source === 'CAMPAIGN_SEQUENCE') ||
    (input.kind === 'CAMPAIGN_TEST_FINAL' &&
      submission.source === 'CAMPAIGN_TEST') ||
    (input.kind === 'DIRECT_FINAL' &&
      (submission.source === 'INBOX' ||
        submission.source === 'AUTOMATED_REPLY'));

  return (
    kindMatches &&
    isValidSubmission(submission) &&
    isCanonicalUuid(connectedAccount.id) &&
    isCanonicalUuid(connectedAccount.workspaceId) &&
    connectedAccount.id === submission.connectedAccountId &&
    connectedAccount.workspaceId === submission.workspaceId &&
    connectedAccount.provider === submission.provider &&
    connectedAccount.handle === submission.normalizedSenderHandle &&
    isNormalizedText(connectedAccount.handle) &&
    (projectedMessageId === null || isCanonicalUuid(projectedMessageId)) &&
    isValidTransportInput(sendMessageInput, submission.normalizedRecipient)
  );
};

class WinnerTransactionExit {
  constructor(readonly result: OutboundEmailDispatchResult) {}
}

const snapshotValidReservationSubmissionFromDispatchInput = (
  value: unknown,
): BeginOutboundEmailSubmissionInput | null => {
  try {
    const envelope = readStrictRecord(
      value,
      ['kind', 'material', 'submission'],
      [],
      new WeakSet<object>(),
    );
    const submission = snapshotSubmission(envelope.submission);

    if (!isValidSubmission(submission)) return null;
    reservationIdentityFromSubmission(submission);

    return deepFreezeSnapshot(submission);
  } catch {
    return null;
  }
};

const isRecorded = (
  result: AttemptOutcomeResult,
): result is Extract<
  AttemptOutcomeResult,
  { status: 'RECORDED' | 'EXACT_REPLAY' }
> => result.status === 'RECORDED' || result.status === 'EXACT_REPLAY';

const FINAL_AUTHORITY_REJECTION_REASONS =
  new Set<FinalSubmissionAuthorityRejectionReason>([
    'WORKSPACE_NOT_ACTIVE',
    'CAMPAIGN_PAUSED',
    'CAMPAIGN_STOPPED',
    'AUTHORIZATION_STALE',
    'ENROLLMENT_REPLIED',
    'OCCURRENCE_CANCELLED',
    'RECIPIENT_SUPPRESSED',
    'AUDIENCE_DUPLICATE',
    'AUDIENCE_STAGE_INVALID',
    'AUDIENCE_CONTACT_INVALID',
    'MATERIAL_STALE',
    'SENDER_NOT_READY',
    'THREAD_EVIDENCE_INVALID',
    'DISPATCH_CONTRACT_CONFLICT',
  ]);

export class OutboundEmailDispatchService {
  constructor(
    private readonly transactionPort: OutboundEmailDispatchTransactionPort,
    private readonly authorityRevalidator: FinalSubmissionAuthorityRevalidator,
    private readonly elapsedClock: SuspendAwareMonotonicClock,
    private readonly attemptService: OutboundEmailAttemptService,
    private readonly outboundService: MessagingMessageOutboundService,
  ) {}

  async dispatch(
    input: DispatchTrustedOutboundEmailInput,
  ): Promise<OutboundEmailDispatchResult> {
    let baseline: DispatchTrustedOutboundEmailInput;
    let providerAccount: ConnectedAccountEntity | null;
    let providerInput: SendMessageInput | null;
    const reservationSubmission =
      snapshotValidReservationSubmissionFromDispatchInput(input);

    try {
      const snapshot = snapshotDispatchInput(input);
      baseline = snapshot.authority;
      providerAccount = snapshot.providerAccount;
      providerInput = snapshot.providerInput;
      if (!isValidDispatchInput(baseline)) {
        return { status: 'CONTRACT_CONFLICT' };
      }
    } catch (error) {
      try {
        if (
          hasExactDirectPrototype(
            error,
            InvalidImapSmtpTransportMaterialError.prototype,
          )
        ) {
          const blockedResult = {
            reason: 'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL' as const,
            status: 'BLOCKED' as const,
          };

          return reservationSubmission === null
            ? blockedResult
            : this.blockReservedInNewTransaction(
                reservationSubmission,
                'INVALID_IMAP_SMTP_TRANSPORT_MATERIAL',
                blockedResult,
              );
        }
        if (
          hasExactDirectPrototype(
            error,
            InvalidReservationBindingError.prototype,
          )
        ) {
          return {
            reason: 'INVALID_RESERVATION_BINDING',
            status: 'BLOCKED',
          };
        }
      } catch {
        // Malformed snapshot failures remain sanitized contract conflicts.
      }

      return { status: 'CONTRACT_CONFLICT' };
    }

    try {
      if (
        this.outboundService.getProviderRequestTimeoutMs({
          provider: baseline.material.connectedAccount.provider,
        } as ConnectedAccountEntity) !==
        OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS
      ) {
        return this.blockReservedInNewTransaction(
          baseline.submission,
          'DISPATCH_CONTRACT_CONFLICT',
          { status: 'CONTRACT_CONFLICT' },
        );
      }
    } catch {
      return this.blockReservedInNewTransaction(
        baseline.submission,
        'DISPATCH_CONTRACT_CONFLICT',
        { status: 'CONTRACT_CONFLICT' },
      );
    }

    let monotonicBeforeBegin: number;

    try {
      monotonicBeforeBegin = this.elapsedClock.now();
    } catch {
      return this.blockReservedInNewTransaction(
        baseline.submission,
        'DISPATCH_CONTRACT_CONFLICT',
        { status: 'CONTRACT_CONFLICT' },
      );
    }
    if (!Number.isFinite(monotonicBeforeBegin)) {
      return this.blockReservedInNewTransaction(
        baseline.submission,
        'DISPATCH_CONTRACT_CONFLICT',
        { status: 'CONTRACT_CONFLICT' },
      );
    }

    let winner:
      | { status: 'PROCESSING_ACQUIRED'; receipt: OutboundEmailAttemptReceipt }
      | OutboundEmailDispatchResult;

    try {
      winner = await this.transactionPort.runInTransaction(async (manager) => {
        const blockReserved = async (
          reason: Parameters<
            OutboundEmailAttemptService['blockReservedAttemptBeforeProvider']
          >[0]['reason'],
          result: OutboundEmailDispatchResult,
        ): Promise<OutboundEmailDispatchResult> => {
          const blocked =
            await this.attemptService.blockReservedAttemptBeforeProvider(
              {
                reason,
                reservation: reservationIdentityFromSubmission(
                  baseline.submission,
                ),
              },
              manager,
            );
          return blocked.status === 'RECORDED' ||
            blocked.status === 'EXACT_REPLAY'
            ? result
            : { status: 'CONTRACT_CONFLICT' };
        };
        let authority: FinalSubmissionAuthorityRevalidationResult;

        try {
          authority = snapshotAuthorityResult(
            await this.authorityRevalidator.revalidate(
              deepFreezeSnapshot({
                kind: baseline.kind,
                materialEvidence: {
                  projectedMessageId: baseline.material.projectedMessageId,
                  sendMessageInput: baseline.material.sendMessageInput,
                },
                submission: deepFreezeSnapshot(
                  snapshotSubmission(baseline.submission),
                ),
              }),
              manager,
            ),
          );
        } catch {
          return blockReserved('DISPATCH_CONTRACT_CONFLICT', {
            status: 'CONTRACT_CONFLICT',
          });
        }

        if (authority.status === 'REJECTED') {
          if (!FINAL_AUTHORITY_REJECTION_REASONS.has(authority.reason)) {
            return blockReserved('DISPATCH_CONTRACT_CONFLICT', {
              status: 'CONTRACT_CONFLICT',
            });
          }
          return blockReserved(authority.reason, {
            reason: authority.reason,
            status: 'AUTHORITY_REJECTED',
          });
        }
        if (
          !exactValue(authority.submission, baseline.submission) ||
          authority.projectedMessageId !== baseline.material.projectedMessageId
        ) {
          return blockReserved('DISPATCH_CONTRACT_CONFLICT', {
            status: 'CONTRACT_CONFLICT',
          });
        }

        const begin = await this.attemptService.beginSubmission(
          deepFreezeSnapshot(snapshotSubmission(baseline.submission)),
          manager,
        );

        if (begin.status === 'PROCESSING_ACQUIRED') return begin;
        if (begin.status === 'NOT_ACQUIRED') {
          return {
            receipt: begin.receipt,
            status: 'NOT_PROCESSING_WINNER' as const,
          };
        }
        if (begin.status === 'RESERVATION_WINDOW_EXPIRED') {
          return blockReserved('RESERVATION_EXPIRED', {
            receipt: begin.receipt,
            status: 'RESERVATION_WINDOW_EXPIRED' as const,
          });
        }

        return blockReserved('DISPATCH_CONTRACT_CONFLICT', {
          status: 'CONTRACT_CONFLICT',
        });
      });
    } catch (error) {
      try {
        if (hasExactDirectPrototype(error, WinnerTransactionExit.prototype)) {
          const resultDescriptor = intrinsicObjectGetOwnPropertyDescriptor(
            error,
            'result',
          );

          if (resultDescriptor !== undefined && 'value' in resultDescriptor) {
            return resultDescriptor.value as OutboundEmailDispatchResult;
          }
        }
      } catch {
        // A malformed transaction error is always a sanitized contract failure.
      }

      return { status: 'CONTRACT_CONFLICT' };
    }

    if (winner.status !== 'PROCESSING_ACQUIRED') return winner;

    const ambiguousCommittedFence = (): OutboundEmailDispatchResult => ({
      evidence: this.snapshotAmbiguousEvidence(baseline.submission),
      status: 'UNKNOWN_PENDING_DEADLINE',
    });
    try {
      const committedWindow = snapshotReceiptWindowDates(winner.receipt);
      if (
        intrinsicReflectApply(
          intrinsicDateGetTime,
          committedWindow.unknownAfter,
          [],
        ) -
          intrinsicReflectApply(
            intrinsicDateGetTime,
            committedWindow.updatedAt,
            [],
          ) <
        0
      )
        return ambiguousCommittedFence();
    } catch {
      return ambiguousCommittedFence();
    }

    let preProviderWindow!: Awaited<
      ReturnType<
        OutboundEmailAttemptService['recheckProcessingWindowBeforeProvider']
      >
    >;
    try {
      const runPreProvider =
        this.transactionPort.runPreProviderTransaction?.bind(
          this.transactionPort,
        ) ?? this.transactionPort.runInTransaction.bind(this.transactionPort);
      preProviderWindow = await runPreProvider((manager: EntityManager) =>
        this.attemptService.recheckProcessingWindowBeforeProvider(
          deepFreezeSnapshot(snapshotSubmission(baseline.submission)),
          manager,
        ),
      );
    } catch {
      return ambiguousCommittedFence();
    }
    if (preProviderWindow.status === 'IDENTITY_CONFLICT') {
      return ambiguousCommittedFence();
    }
    if (preProviderWindow.status === 'UNSAFE') {
      return this.persistDefiniteOutcome({
        kind: 'DEFINITELY_UNACCEPTED_EVIDENCE',
        safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
        submission: baseline.submission,
      });
    }
    winner = {
      status: 'PROCESSING_ACQUIRED',
      receipt: preProviderWindow.receipt,
    };

    let reservationWindowMs: number;

    try {
      const receiptWindow = snapshotReceiptWindowDates(winner.receipt);
      const unknownAfterMs = intrinsicReflectApply(
        intrinsicDateGetTime,
        receiptWindow.unknownAfter,
        [],
      );
      const updatedAtMs = intrinsicReflectApply(
        intrinsicDateGetTime,
        receiptWindow.updatedAt,
        [],
      );
      reservationWindowMs = unknownAfterMs - updatedAtMs;
    } catch {
      return ambiguousCommittedFence();
    }
    if (!Number.isFinite(reservationWindowMs) || reservationWindowMs < 0) {
      return ambiguousCommittedFence();
    }

    let entrySample: unknown;

    try {
      entrySample = this.elapsedClock.now();
    } catch {
      return ambiguousCommittedFence();
    }
    if (typeof entrySample !== 'number' || !Number.isFinite(entrySample)) {
      return ambiguousCommittedFence();
    }
    const elapsed = entrySample - monotonicBeforeBegin;

    if (!Number.isFinite(elapsed) || elapsed < 0) {
      return ambiguousCommittedFence();
    }
    const remainingAtEntry = reservationWindowMs - elapsed;

    if (!Number.isFinite(remainingAtEntry)) {
      return ambiguousCommittedFence();
    }
    if (remainingAtEntry < OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS) {
      return this.persistDefiniteOutcome({
        kind: 'DEFINITELY_UNACCEPTED_EVIDENCE',
        safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
        submission: baseline.submission,
      });
    }

    let providerResult: unknown;

    try {
      providerResult = await this.outboundService.sendMessage(
        providerInput,
        providerAccount,
      );
    } catch (error) {
      let rejected = false;

      try {
        rejected =
          isTrapSafeClassifierInput(error) &&
          classifyMessageOutboundError(error).kind === 'rejected';
      } catch {
        rejected = false;
      }
      if (rejected) {
        return this.persistDefiniteOutcome({
          kind: 'DEFINITELY_UNACCEPTED_EVIDENCE',
          safeOutcomeReason: 'DEFINITELY_UNACCEPTED_RETRYABLE',
          submission: baseline.submission,
        });
      }

      return {
        evidence: this.snapshotAmbiguousEvidence(baseline.submission),
        status: 'UNKNOWN_PENDING_DEADLINE',
      };
    } finally {
      providerInput = null;
      providerAccount = null;
    }

    const providerEvidence = this.readFulfilledProviderEvidence(
      providerResult,
      baseline.material.sendMessageInput,
    );

    if (providerEvidence === null) {
      return {
        evidence: deepFreezeSnapshot({
          attemptId: baseline.submission.attemptId,
          kind: 'UNPERSISTABLE_ACCEPTANCE_EVIDENCE' as const,
          source: baseline.submission.source,
          workspaceId: baseline.submission.workspaceId,
        }),
        severity: 'HIGH',
        status: 'OUTCOME_RECOVERY_REQUIRED',
      };
    }

    return this.persistAcceptedOutcome({
      kind: 'ACCEPTED_EVIDENCE',
      ...providerEvidence,
      projectedMessageId: null,
      projectedMessageThreadId: null,
      submission: baseline.submission,
    });
  }

  async recover(
    evidence: RecoverOutboundEmailOutcomeInput,
  ): Promise<OutboundEmailDispatchResult> {
    let baseline: RecoverOutboundEmailOutcomeInput;

    try {
      baseline = deepFreezeSnapshot(snapshotRecoveryEvidence(evidence));
      if (!this.isValidRecoveryEvidence(baseline)) {
        return { status: 'CONTRACT_CONFLICT' };
      }
    } catch {
      return { status: 'CONTRACT_CONFLICT' };
    }

    if (baseline.kind === 'ACCEPTED_EVIDENCE') {
      return this.persistAcceptedOutcome(baseline);
    }
    if (baseline.kind === 'DEFINITELY_UNACCEPTED_EVIDENCE') {
      return this.persistDefiniteOutcome(baseline);
    }

    try {
      const result = await this.transactionPort.runInTransaction((manager) =>
        this.attemptService.markUnknownAfterDeadline(
          deepFreezeSnapshot(snapshotSubmission(baseline.submission)),
          manager,
        ),
      );

      if (result.status === 'NOT_DUE') {
        return {
          evidence: this.snapshotAmbiguousEvidence(baseline.submission),
          status: 'UNKNOWN_PENDING_DEADLINE',
        };
      }
      if (result.status === 'RECORDED' || result.status === 'EXACT_REPLAY') {
        return { receipt: result.receipt, status: 'UNKNOWN_RECORDED' };
      }

      return this.recoveryRequired(baseline);
    } catch {
      return this.recoveryRequired(baseline);
    }
  }

  private async persistAcceptedOutcome(
    evidence: AcceptedOutboundEmailRecoveryEvidence,
  ): Promise<OutboundEmailDispatchResult> {
    let baseline: AcceptedOutboundEmailRecoveryEvidence;

    try {
      const snapshot = deepFreezeSnapshot(snapshotRecoveryEvidence(evidence));

      if (snapshot.kind !== 'ACCEPTED_EVIDENCE') {
        return { status: 'CONTRACT_CONFLICT' };
      }
      baseline = snapshot;
    } catch {
      return { status: 'CONTRACT_CONFLICT' };
    }

    try {
      const result = await this.transactionPort.runInTransaction(
        async (manager) => {
          const processingResult = await this.attemptService.recordAccepted(
            deepFreezeSnapshot({
              ...snapshotSubmission(baseline.submission),
              projectedMessageId: baseline.projectedMessageId,
              projectedMessageThreadId: baseline.projectedMessageThreadId,
              providerDeliveredRecipients: baseline.providerDeliveredRecipients,
              providerHeaderMessageId: baseline.providerHeaderMessageId,
              providerMessageExternalId: baseline.providerMessageExternalId,
              providerMessageId: baseline.providerMessageId,
              providerThreadExternalId: baseline.providerThreadExternalId,
              resolvedThreadExternalId: baseline.resolvedThreadExternalId,
            }),
            manager,
          );

          if (
            processingResult.status === 'INCOMPATIBLE_STATE' &&
            processingResult.receipt.attemptState === 'UNKNOWN'
          ) {
            return this.attemptService.resolveUnknownAccepted(
              deepFreezeSnapshot({
                ...snapshotSubmission(baseline.submission),
                projectedMessageId: baseline.projectedMessageId,
                projectedMessageThreadId: baseline.projectedMessageThreadId,
                providerDeliveredRecipients:
                  baseline.providerDeliveredRecipients,
                providerHeaderMessageId: baseline.providerHeaderMessageId,
                providerMessageExternalId: baseline.providerMessageExternalId,
                providerMessageId: baseline.providerMessageId,
                providerThreadExternalId: baseline.providerThreadExternalId,
                resolvedThreadExternalId: baseline.resolvedThreadExternalId,
              }),
              manager,
            );
          }

          return processingResult;
        },
      );

      return isRecorded(result)
        ? { receipt: result.receipt, status: 'ACCEPTED_RECORDED' }
        : this.recoveryRequired(baseline);
    } catch {
      return this.recoveryRequired(baseline);
    }
  }

  private async persistDefiniteOutcome(
    evidence: DefinitelyUnacceptedOutboundEmailRecoveryEvidence,
  ): Promise<OutboundEmailDispatchResult> {
    let baseline: DefinitelyUnacceptedOutboundEmailRecoveryEvidence;

    try {
      const snapshot = deepFreezeSnapshot(snapshotRecoveryEvidence(evidence));

      if (snapshot.kind !== 'DEFINITELY_UNACCEPTED_EVIDENCE') {
        return { status: 'CONTRACT_CONFLICT' };
      }
      baseline = snapshot;
    } catch {
      return { status: 'CONTRACT_CONFLICT' };
    }

    try {
      const result = await this.transactionPort.runInTransaction(
        async (manager) => {
          const processingResult =
            await this.attemptService.recordDefinitelyUnaccepted(
              deepFreezeSnapshot({
                ...snapshotSubmission(baseline.submission),
                safeOutcomeReason: baseline.safeOutcomeReason,
              }),
              manager,
            );

          if (
            processingResult.status === 'INCOMPATIBLE_STATE' &&
            processingResult.receipt.attemptState === 'UNKNOWN'
          ) {
            return this.attemptService.resolveUnknownDefinitelyUnaccepted(
              deepFreezeSnapshot({
                ...snapshotSubmission(baseline.submission),
                safeOutcomeReason: baseline.safeOutcomeReason,
              }),
              manager,
            );
          }

          return processingResult;
        },
      );

      return isRecorded(result)
        ? {
            receipt: result.receipt,
            status: 'DEFINITELY_UNACCEPTED_RECORDED',
          }
        : this.recoveryRequired(baseline);
    } catch {
      return this.recoveryRequired(baseline);
    }
  }

  private async blockReservedInNewTransaction(
    submission: BeginOutboundEmailSubmissionInput,
    reason: Parameters<
      OutboundEmailAttemptService['blockReservedAttemptBeforeProvider']
    >[0]['reason'],
    result: OutboundEmailDispatchResult,
  ): Promise<OutboundEmailDispatchResult> {
    try {
      return await this.transactionPort.runInTransaction(async (manager) => {
        const blocked =
          await this.attemptService.blockReservedAttemptBeforeProvider(
            {
              reason,
              reservation: reservationIdentityFromSubmission(submission),
            },
            manager,
          );

        return blocked.status === 'RECORDED' ||
          blocked.status === 'EXACT_REPLAY'
          ? result
          : { status: 'CONTRACT_CONFLICT' };
      });
    } catch {
      return { status: 'CONTRACT_CONFLICT' };
    }
  }

  private snapshotAmbiguousEvidence(
    submission: BeginOutboundEmailSubmissionInput,
  ): AmbiguousOutboundEmailRecoveryEvidence {
    return deepFreezeSnapshot({
      kind: 'AMBIGUOUS_EVIDENCE',
      submission: snapshotSubmission(submission),
    });
  }

  private recoveryRequired(
    evidence:
      | AcceptedOutboundEmailRecoveryEvidence
      | DefinitelyUnacceptedOutboundEmailRecoveryEvidence
      | AmbiguousOutboundEmailRecoveryEvidence,
  ): OutboundEmailDispatchResult {
    return {
      evidence: deepFreezeSnapshot(snapshotRecoveryEvidence(evidence)),
      severity: 'HIGH',
      status: 'OUTCOME_RECOVERY_REQUIRED',
    };
  }

  private readFulfilledProviderEvidence(
    value: unknown,
    sendInput: SendMessageInput,
  ): null | {
    providerMessageId: string;
    providerHeaderMessageId: string | null;
    providerMessageExternalId: string | null;
    providerThreadExternalId: string | null;
    resolvedThreadExternalId: string;
    providerDeliveredRecipients: {
      to: string[];
      cc: string[];
      bcc: string[];
    } | null;
  } {
    try {
      const record = readStrictRecord(
        value,
        ['headerMessageId'],
        ['messageExternalId', 'threadExternalId', 'deliveredRecipients'],
        new WeakSet<object>(),
      );
      const optionalText = (candidate: unknown): string | null => {
        if (candidate === undefined) return null;
        const normalized = snapshotString(candidate).trim();
        return normalized.length === 0 ? null : normalized;
      };
      const providerHeaderMessageId = optionalText(record.headerMessageId);
      const providerMessageExternalId = optionalText(record.messageExternalId);
      const providerThreadExternalId = optionalText(record.threadExternalId);
      const providerMessageId =
        providerMessageExternalId ?? providerHeaderMessageId;
      if (providerMessageId === null) return null;
      const resolvedThreadExternalId = resolveOutboundThreadExternalId({
        sendResult: {
          headerMessageId: providerHeaderMessageId ?? '',
          messageExternalId: providerMessageExternalId ?? undefined,
          threadExternalId: providerThreadExternalId ?? undefined,
        },
        parentThreadExternalId: sendInput.threadExternalId,
        inReplyTo: sendInput.inReplyTo,
      }).trim();
      if (resolvedThreadExternalId.length === 0) return null;

      return {
        providerDeliveredRecipients:
          record.deliveredRecipients === undefined
            ? null
            : snapshotProviderDeliveredRecipients(record.deliveredRecipients),
        providerHeaderMessageId,
        providerMessageExternalId,
        providerMessageId,
        providerThreadExternalId,
        resolvedThreadExternalId,
      };
    } catch {
      return null;
    }
  }

  private isValidRecoveryEvidence(
    evidence: RecoverOutboundEmailOutcomeInput,
  ): boolean {
    if (!isValidSubmission(evidence.submission)) return false;
    if (evidence.kind === 'ACCEPTED_EVIDENCE') {
      return (
        isNonemptyText(evidence.providerMessageId) &&
        evidence.providerMessageId === evidence.providerMessageId.trim() &&
        (evidence.projectedMessageId === null ||
          isCanonicalUuid(evidence.projectedMessageId))
      );
    }
    if (evidence.kind === 'DEFINITELY_UNACCEPTED_EVIDENCE') {
      return (
        evidence.safeOutcomeReason === 'DEFINITELY_UNACCEPTED_RETRYABLE' ||
        evidence.safeOutcomeReason === 'DEFINITELY_UNACCEPTED_NON_RETRYABLE'
      );
    }

    return evidence.kind === 'AMBIGUOUS_EVIDENCE';
  }
}
