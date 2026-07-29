import { type ValueTransformer } from 'typeorm';

import { MANAGED_EMAIL_PRODUCT_KEYS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  type ManagedEmailCorrelatedSubscriptionLine,
  type ManagedEmailExpectedLineItem,
  type ManagedEmailResourceSnapshot,
  type ManagedEmailSafeFacts,
} from 'src/engine/core-modules/managed-email/types/managed-email-persistence.type';
import { validateSafeMetronomeEventProperties } from 'src/engine/core-modules/managed-provider-billing/utils/validate-safe-metronome-event-properties.util';

const MAX_COLLECTION_ITEMS = 100;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_DOMAIN_LENGTH = 253;
const MAX_MAILBOX_LENGTH = 320;
const MAX_IDENTIFIER_LENGTH = 256;
const PERSISTENCE_JSON_ERROR = 'Unsafe managed email persistence JSON';

const PRODUCT_KEYS: Record<string, true> = {
  [MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR]: true,
  [MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH]: true,
  [MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH]: true,
};

const fail = (): never => {
  throw new Error(PERSISTENCE_JSON_ERROR);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean => {
  const keys = Object.keys(value);

  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    )
  );
};

type AssertRecord = (
  value: unknown,
  expectedKeys: readonly string[],
) => asserts value is Record<string, unknown>;

const assertRecord: AssertRecord = (value, expectedKeys) => {
  if (!isRecord(value) || !hasExactKeys(value, expectedKeys)) {
    fail();
  }
};

type AssertArray = (
  value: unknown,
  maximumLength: number,
) => asserts value is unknown[];

const assertArray: AssertArray = (value, maximumLength) => {
  if (!Array.isArray(value) || value.length > maximumLength) {
    fail();
  }
};

const assertString = (value: unknown, maximumLength: number): void => {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.length > maximumLength
  ) {
    fail();
  }
};

const assertDateRange = (start: unknown, end: unknown): void => {
  assertString(start, MAX_IDENTIFIER_LENGTH);
  assertString(end, MAX_IDENTIFIER_LENGTH);

  const startInstant = Date.parse(start as string);
  const endInstant = Date.parse(end as string);

  if (
    Number.isNaN(startInstant) ||
    Number.isNaN(endInstant) ||
    endInstant <= startInstant
  ) {
    fail();
  }
};

const assertPositiveSafeInteger = (value: unknown): void => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    fail();
  }
};

const assertNonNegativeSafeInteger = (value: unknown): void => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    fail();
  }
};

const assertNonNegativeFiniteNumber = (value: unknown): void => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail();
  }
};

const assertBoundedJson = (value: unknown): void => {
  let serialized = '';

  try {
    const result = JSON.stringify(value);

    if (result === undefined) {
      fail();
    }

    serialized = result;
  } catch {
    fail();
  }

  if (Buffer.byteLength(serialized) > MAX_JSON_BYTES) {
    fail();
  }
};

const isStructuredJsonString = (value: string): boolean => {
  const trimmed = value.trim();

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);

    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
};

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return Object.isFrozen(value) ? value : Object.freeze(value);
};

const validateRequired = <T>(
  value: unknown,
  validate: (candidate: unknown) => T,
): T => {
  try {
    return deepFreeze(validate(value));
  } catch {
    return fail();
  }
};

const requiredTransformer = <T>(
  validate: (value: unknown) => T,
): ValueTransformer => ({
  from: (value: unknown) => validateRequired(value, validate),
  to: (value: unknown) => validateRequired(value, validate),
});

const nullableTransformer = <T>(
  validate: (value: unknown) => T,
): ValueTransformer => ({
  from: (value: unknown) =>
    value === null ? null : validateRequired(value, validate),
  to: (value: unknown) =>
    value === null ? null : validateRequired(value, validate),
});

const validateSafeFacts = (value: unknown): ManagedEmailSafeFacts => {
  assertRecord(value, ['schemaVersion', 'facts']);

  if (value.schemaVersion !== 1) {
    fail();
  }

  assertArray(value.facts, 32);

  for (const fact of value.facts) {
    assertRecord(fact, ['name', 'value']);
    assertString(fact.name, 64);

    validateSafeMetronomeEventProperties({
      [fact.name as string]: fact.value,
    });

    if (typeof fact.value === 'string' && isStructuredJsonString(fact.value)) {
      fail();
    }
  }

  assertBoundedJson(value);

  return value as ManagedEmailSafeFacts;
};

const validateResourceSnapshot = (
  value: unknown,
): ManagedEmailResourceSnapshot => {
  assertRecord(value, ['domains']);
  assertArray(value.domains, MAX_COLLECTION_ITEMS);

  for (const domain of value.domains) {
    assertRecord(domain, ['domain', 'mailboxes']);
    assertString(domain.domain, MAX_DOMAIN_LENGTH);
    assertArray(domain.mailboxes, MAX_COLLECTION_ITEMS);

    for (const mailbox of domain.mailboxes) {
      assertString(mailbox, MAX_MAILBOX_LENGTH);
    }
  }

  assertBoundedJson(value);

  return value as ManagedEmailResourceSnapshot;
};

const validateExpectedLineItems = (
  value: unknown,
): readonly ManagedEmailExpectedLineItem[] => {
  assertArray(value, MAX_COLLECTION_ITEMS);

  if (value.length === 0) {
    fail();
  }

  for (const line of value) {
    assertRecord(line, [
      'productKey',
      'productAlias',
      'quantity',
      'unitPriceCents',
      'totalCents',
      'periodStart',
      'periodEnd',
    ]);
    assertString(line.productKey, MAX_IDENTIFIER_LENGTH);
    assertString(line.productAlias, MAX_IDENTIFIER_LENGTH);

    if (PRODUCT_KEYS[line.productKey as string] !== true) {
      fail();
    }

    assertPositiveSafeInteger(line.quantity);
    assertNonNegativeSafeInteger(line.unitPriceCents);
    assertNonNegativeSafeInteger(line.totalCents);
    assertDateRange(line.periodStart, line.periodEnd);
  }

  assertBoundedJson(value);

  return value as readonly ManagedEmailExpectedLineItem[];
};

const validateCorrelatedSubscriptionLines = (
  value: unknown,
): readonly ManagedEmailCorrelatedSubscriptionLine[] => {
  assertArray(value, MAX_COLLECTION_ITEMS);

  for (const line of value) {
    assertRecord(line, [
      'subscriptionId',
      'productId',
      'quantity',
      'total',
      'unitPrice',
      'startingAt',
      'endingBefore',
      'isProrated',
    ]);
    assertString(line.subscriptionId, MAX_IDENTIFIER_LENGTH);
    assertString(line.productId, MAX_IDENTIFIER_LENGTH);
    assertPositiveSafeInteger(line.quantity);
    assertNonNegativeFiniteNumber(line.total);
    assertNonNegativeFiniteNumber(line.unitPrice);
    assertDateRange(line.startingAt, line.endingBefore);

    if (typeof line.isProrated !== 'boolean') {
      fail();
    }
  }

  assertBoundedJson(value);

  return value as readonly ManagedEmailCorrelatedSubscriptionLine[];
};

export const managedEmailSafeFactsTransformer =
  requiredTransformer(validateSafeFacts);

export const managedEmailNullableSafeFactsTransformer =
  nullableTransformer(validateSafeFacts);

export const managedEmailResourceSnapshotTransformer = requiredTransformer(
  validateResourceSnapshot,
);

export const managedEmailExpectedLineItemsTransformer = requiredTransformer(
  validateExpectedLineItems,
);

export const managedEmailCorrelatedSubscriptionLinesTransformer =
  nullableTransformer(validateCorrelatedSubscriptionLines);
