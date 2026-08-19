import { type ValueTransformer } from 'typeorm';

import {
  MANAGED_EMAIL_PRODUCT_DEFINITIONS,
  MANAGED_EMAIL_PRODUCT_KEYS,
} from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import { type ManagedEmailProductKey } from 'src/engine/core-modules/managed-email/types/managed-email-catalog.type';
import {
  type ManagedEmailCorrelatedSubscriptionLine,
  type ManagedEmailExpectedLineItem,
  type ManagedEmailPaymentReceipt,
  type ManagedEmailResourceSnapshot,
  type ManagedEmailProviderReceipt,
  type ManagedEmailRenewalProjection,
  type ManagedEmailSafeFacts,
} from 'src/engine/core-modules/managed-email/types/managed-email-persistence.type';
import { validateSafeMetronomeEventProperties } from 'src/engine/core-modules/managed-provider-billing/utils/validate-safe-metronome-event-properties.util';

const MAX_COLLECTION_ITEMS = 100;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_DOMAIN_LENGTH = 253;
const MAX_MAILBOX_LENGTH = 320;
const MAX_IDENTIFIER_LENGTH = 256;
const PERSISTENCE_JSON_ERROR = 'Unsafe managed email persistence JSON';
const MAX_PERSONA_NAME_LENGTH = 128;
const MAX_SIGNATURE_LENGTH = 4096;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const parseInstant = (value: unknown): number => {
  assertString(value, MAX_IDENTIFIER_LENGTH);

  const instant = Date.parse(value as string);

  if (!Number.isFinite(instant)) {
    fail();
  }

  return instant;
};

const assertDateRange = (start: unknown, end: unknown): void => {
  const startInstant = parseInstant(start);
  const endInstant = parseInstant(end);

  if (endInstant <= startInstant) {
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

const assertUuid = (value: unknown): void => {
  assertString(value, 36);

  if (!UUID_PATTERN.test(value as string)) {
    fail();
  }
};

const assertNormalizedDomain = (value: unknown): void => {
  assertString(value, MAX_DOMAIN_LENGTH);

  if (
    value !== (value as string).trim().toLowerCase() ||
    (value as string).includes('@') ||
    !(value as string).includes('.')
  ) {
    fail();
  }
};

const parseNormalizedAddress = (
  value: unknown,
): { domain: string; localPart: string } => {
  assertString(value, MAX_MAILBOX_LENGTH);

  if (value !== (value as string).trim().toLowerCase()) {
    fail();
  }

  const parts = (value as string).split('@');

  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
    fail();
  }

  assertNormalizedDomain(parts[1]);

  return { domain: parts[1], localPart: parts[0] };
};

const assertExactIntegerTotal = (
  quantity: unknown,
  unitPrice: unknown,
  total: unknown,
): void => {
  assertPositiveSafeInteger(quantity);
  assertPositiveSafeInteger(unitPrice);
  assertPositiveSafeInteger(total);

  const expectedTotal = (quantity as number) * (unitPrice as number);

  if (!Number.isSafeInteger(expectedTotal) || total !== expectedTotal) {
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

const validateProviderReceipt = (
  value: unknown,
): ManagedEmailProviderReceipt => {
  assertRecord(value, [
    'schemaVersion',
    'orderIds',
    'domains',
    'failedInventoryIds',
    'totalCostCents',
  ]);
  if (value.schemaVersion !== 1) {
    fail();
  }
  if (value.totalCostCents !== null) {
    assertNonNegativeSafeInteger(value.totalCostCents);
  }
  assertArray(value.orderIds, MAX_COLLECTION_ITEMS);
  assertArray(value.failedInventoryIds, MAX_COLLECTION_ITEMS);
  assertArray(value.domains, MAX_COLLECTION_ITEMS);
  const orderIds = new Set<string>();
  for (const orderId of value.orderIds) {
    assertString(orderId, MAX_IDENTIFIER_LENGTH);
    if (orderIds.has(orderId as string)) fail();
    orderIds.add(orderId as string);
  }
  const failedInventoryIds = new Set<string>();
  for (const inventoryId of value.failedInventoryIds) {
    assertString(inventoryId, MAX_IDENTIFIER_LENGTH);
    if (failedInventoryIds.has(inventoryId as string)) fail();
    failedInventoryIds.add(inventoryId as string);
  }
  const normalizedDomains = new Set<string>();
  const providerDomainIds = new Set<string>();
  const normalizedAddresses = new Set<string>();
  const providerMailboxIds = new Set<string>();
  let mailboxCount = 0;
  for (const domain of value.domains) {
    assertRecord(domain, [
      'normalizedDomain',
      'providerDomainId',
      'providerOrderId',
      'mailboxes',
    ]);
    assertNormalizedDomain(domain.normalizedDomain);
    assertString(domain.providerDomainId, MAX_IDENTIFIER_LENGTH);
    if (domain.providerOrderId !== null) {
      assertString(domain.providerOrderId, MAX_IDENTIFIER_LENGTH);
      if (!orderIds.has(domain.providerOrderId as string)) fail();
    }
    assertArray(domain.mailboxes, MAX_COLLECTION_ITEMS);
    if (
      normalizedDomains.has(domain.normalizedDomain as string) ||
      providerDomainIds.has(domain.providerDomainId as string)
    ) {
      fail();
    }
    normalizedDomains.add(domain.normalizedDomain as string);
    providerDomainIds.add(domain.providerDomainId as string);
    for (const mailbox of domain.mailboxes) {
      assertRecord(mailbox, ['normalizedAddress', 'providerMailboxId']);
      const { domain: mailboxDomain } = parseNormalizedAddress(
        mailbox.normalizedAddress,
      );
      assertString(mailbox.providerMailboxId, MAX_IDENTIFIER_LENGTH);
      if (
        mailboxDomain !== domain.normalizedDomain ||
        normalizedAddresses.has(mailbox.normalizedAddress as string) ||
        providerMailboxIds.has(mailbox.providerMailboxId as string)
      ) {
        fail();
      }
      normalizedAddresses.add(mailbox.normalizedAddress as string);
      providerMailboxIds.add(mailbox.providerMailboxId as string);
      mailboxCount += 1;
    }
  }
  if (mailboxCount > MAX_COLLECTION_ITEMS) {
    fail();
  }
  assertBoundedJson(value);
  return value as ManagedEmailProviderReceipt;
};

export const assertManagedEmailProviderReceiptPartition = (
  receipt: ManagedEmailProviderReceipt,
  snapshot: ManagedEmailResourceSnapshot,
): void => {
  const expectedDomains = new Set(snapshot.domains.map(({ domain }) => domain));
  const expectedInventoryIds = new Set(
    snapshot.domains.flatMap(({ providerInventoryId }) =>
      providerInventoryId === undefined ? [] : [providerInventoryId],
    ),
  );
  if (
    receipt.domains.some(
      ({ normalizedDomain }) => !expectedDomains.has(normalizedDomain),
    ) ||
    receipt.failedInventoryIds.some(
      (inventoryId) => !expectedInventoryIds.has(inventoryId),
    )
  ) {
    throw new Error(
      'Managed email provider receipt does not match resource snapshot',
    );
  }
  for (const expectedDomain of snapshot.domains) {
    const successful = receipt.domains.filter(
      ({ normalizedDomain }) => normalizedDomain === expectedDomain.domain,
    );
    const failed =
      expectedDomain.providerInventoryId === undefined
        ? false
        : receipt.failedInventoryIds.includes(
            expectedDomain.providerInventoryId,
          );
    if (successful.length + Number(failed) !== 1) {
      throw new Error(
        'Managed email provider receipt does not match resource snapshot',
      );
    }
    if (successful.length === 1) {
      const expectedAddresses = [...expectedDomain.mailboxes].sort();
      const actualAddresses = successful[0].mailboxes
        .map(({ normalizedAddress }) => normalizedAddress)
        .sort();
      if (
        JSON.stringify(actualAddresses) !== JSON.stringify(expectedAddresses)
      ) {
        throw new Error(
          'Managed email provider receipt does not match resource snapshot',
        );
      }
    }
  }
};

const validateResourceSnapshot = (
  value: unknown,
): ManagedEmailResourceSnapshot => {
  assertRecord(value, ['proposal', 'domains', 'personas']);
  assertRecord(value.proposal, ['createdAt', 'expiresAt', 'policyVersion']);
  assertDateRange(value.proposal.createdAt, value.proposal.expiresAt);
  assertString(value.proposal.policyVersion, MAX_IDENTIFIER_LENGTH);

  const proposalCreatedAt = parseInstant(value.proposal.createdAt);
  const proposalExpiresAt = parseInstant(value.proposal.expiresAt);

  assertArray(value.domains, MAX_COLLECTION_ITEMS);
  assertArray(value.personas, MAX_COLLECTION_ITEMS);

  if (value.domains.length === 0 || value.personas.length === 0) {
    fail();
  }

  const domains = new Set<string>();
  const mailboxes = new Set<string>();

  for (const domain of value.domains) {
    if (!isRecord(domain)) {
      fail();
    }

    const hasProviderInventoryId = Object.prototype.hasOwnProperty.call(
      domain,
      'providerInventoryId',
    );
    const hasPrewarmedProviderCosts = Object.prototype.hasOwnProperty.call(
      domain,
      'prewarmedProviderCosts',
    );

    if (hasProviderInventoryId !== hasPrewarmedProviderCosts) {
      fail();
    }
    const domainKeys = hasProviderInventoryId
      ? [
          'domain',
          'providerInventoryId',
          'prewarmedProviderCosts',
          'mailboxes',
          'providerQuote',
        ]
      : ['domain', 'mailboxes', 'providerQuote'];

    assertRecord(domain, domainKeys);
    assertNormalizedDomain(domain.domain);

    if (domains.has(domain.domain as string)) {
      fail();
    }
    domains.add(domain.domain as string);

    if (Object.prototype.hasOwnProperty.call(domain, 'providerInventoryId')) {
      assertString(domain.providerInventoryId, MAX_IDENTIFIER_LENGTH);
    }
    let prewarmedDomainPriceCents: number | null = null;
    if (hasPrewarmedProviderCosts) {
      const prewarmedProviderCosts = domain.prewarmedProviderCosts;

      assertRecord(prewarmedProviderCosts, [
        'domainPriceCents',
        'mailboxPriceCents',
      ]);
      assertPositiveSafeInteger(prewarmedProviderCosts.domainPriceCents);
      assertNonNegativeSafeInteger(prewarmedProviderCosts.mailboxPriceCents);
      prewarmedDomainPriceCents =
        prewarmedProviderCosts.domainPriceCents as number;
    }

    assertArray(domain.mailboxes, MAX_COLLECTION_ITEMS);

    if (domain.mailboxes.length === 0) {
      fail();
    }

    for (const mailbox of domain.mailboxes) {
      const parsedAddress = parseNormalizedAddress(mailbox);

      if (
        parsedAddress.domain !== domain.domain ||
        mailboxes.has(mailbox as string)
      ) {
        fail();
      }
      mailboxes.add(mailbox as string);
    }

    assertRecord(domain.providerQuote, [
      'amountMinorUnits',
      'currency',
      'fingerprint',
      'observedAt',
      'termCount',
      'termUnit',
    ]);
    assertPositiveSafeInteger(domain.providerQuote.amountMinorUnits);
    assertString(domain.providerQuote.fingerprint, MAX_IDENTIFIER_LENGTH);
    if (
      prewarmedDomainPriceCents !== null &&
      prewarmedDomainPriceCents !== domain.providerQuote.amountMinorUnits
    ) {
      fail();
    }

    const quoteObservedAt = parseInstant(domain.providerQuote.observedAt);

    if (
      domain.providerQuote.currency !== 'USD' ||
      domain.providerQuote.termCount !== 1 ||
      domain.providerQuote.termUnit !== 'YEAR' ||
      quoteObservedAt > proposalCreatedAt ||
      quoteObservedAt >= proposalExpiresAt
    ) {
      fail();
    }
  }

  const personaAddresses = new Set<string>();

  for (const persona of value.personas) {
    assertRecord(persona, [
      'address',
      'createdByWorkspaceMemberId',
      'firstName',
      'lastName',
      'localPart',
      'roleTitle',
      'signature',
      'version',
    ]);

    const parsedAddress = parseNormalizedAddress(persona.address);

    if (
      !mailboxes.has(persona.address as string) ||
      personaAddresses.has(persona.address as string) ||
      persona.localPart !== parsedAddress.localPart
    ) {
      fail();
    }
    personaAddresses.add(persona.address as string);

    assertUuid(persona.createdByWorkspaceMemberId);
    assertString(persona.firstName, MAX_PERSONA_NAME_LENGTH);
    assertString(persona.lastName, MAX_PERSONA_NAME_LENGTH);
    assertString(persona.localPart, MAX_MAILBOX_LENGTH);
    assertString(persona.signature, MAX_SIGNATURE_LENGTH);
    assertPositiveSafeInteger(persona.version);

    if (persona.roleTitle !== null) {
      assertString(persona.roleTitle, MAX_PERSONA_NAME_LENGTH);
    }
  }

  if (
    personaAddresses.size !== mailboxes.size ||
    [...mailboxes].some((mailbox) => !personaAddresses.has(mailbox))
  ) {
    fail();
  }

  assertBoundedJson(value);

  return value as ManagedEmailResourceSnapshot;
};

const validateExpectedLineItems = (
  value: unknown,
): readonly ManagedEmailExpectedLineItem[] => {
  assertArray(value, MANAGED_EMAIL_PRODUCT_DEFINITIONS.length);

  if (value.length !== MANAGED_EMAIL_PRODUCT_DEFINITIONS.length) {
    fail();
  }

  const definitions = new Map(
    MANAGED_EMAIL_PRODUCT_DEFINITIONS.map((definition) => [
      definition.key,
      definition,
    ]),
  );
  const productKeys = new Set<string>();

  for (const line of value) {
    assertRecord(line, [
      'billingFrequency',
      'productKey',
      'productTag',
      'metronomeProductId',
      'currency',
      'quantity',
      'unitPriceCents',
      'totalCents',
      'periodStart',
      'periodEnd',
    ]);
    assertString(line.productKey, MAX_IDENTIFIER_LENGTH);
    assertString(line.productTag, MAX_IDENTIFIER_LENGTH);
    assertUuid(line.metronomeProductId);

    const definition = definitions.get(
      line.productKey as ManagedEmailProductKey,
    );

    if (
      PRODUCT_KEYS[line.productKey as string] !== true ||
      definition === undefined ||
      definition.cadence !== line.billingFrequency ||
      definition.metronomeProductTag !== line.productTag ||
      productKeys.has(line.productKey as string) ||
      line.currency !== 'USD'
    ) {
      fail();
    }
    productKeys.add(line.productKey as string);

    assertExactIntegerTotal(
      line.quantity,
      line.unitPriceCents,
      line.totalCents,
    );
    assertDateRange(line.periodStart, line.periodEnd);
  }

  assertBoundedJson(value);

  return value as readonly ManagedEmailExpectedLineItem[];
};

const validateCorrelatedSubscriptionLines = (
  value: unknown,
): readonly ManagedEmailCorrelatedSubscriptionLine[] => {
  assertArray(value, MAX_COLLECTION_ITEMS);

  if (value.length === 0) {
    fail();
  }

  const subscriptionIds = new Set<string>();

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
    assertUuid(line.subscriptionId);
    assertUuid(line.productId);

    if (subscriptionIds.has(line.subscriptionId as string)) {
      fail();
    }
    subscriptionIds.add(line.subscriptionId as string);

    assertExactIntegerTotal(line.quantity, line.unitPrice, line.total);
    assertDateRange(line.startingAt, line.endingBefore);

    if (typeof line.isProrated !== 'boolean') {
      fail();
    }
  }

  assertBoundedJson(value);

  return value as readonly ManagedEmailCorrelatedSubscriptionLine[];
};
const validatePaymentReceipts = (
  value: unknown,
): readonly ManagedEmailPaymentReceipt[] => {
  assertArray(value, MAX_COLLECTION_ITEMS);
  if (value.length === 0) fail();

  const externalInvoiceIds = new Set<string>();
  const externalPaymentIds = new Set<string>();
  const metronomeInvoiceIds = new Set<string>();

  for (const receipt of value) {
    assertRecord(receipt, [
      'externalInvoiceId',
      'externalPaymentId',
      'metronomeInvoiceId',
    ]);
    assertString(receipt.externalInvoiceId, MAX_IDENTIFIER_LENGTH);
    assertString(receipt.externalPaymentId, MAX_IDENTIFIER_LENGTH);
    assertString(receipt.metronomeInvoiceId, MAX_IDENTIFIER_LENGTH);

    if (
      externalInvoiceIds.has(receipt.externalInvoiceId as string) ||
      externalPaymentIds.has(receipt.externalPaymentId as string) ||
      metronomeInvoiceIds.has(receipt.metronomeInvoiceId as string)
    ) {
      fail();
    }
    externalInvoiceIds.add(receipt.externalInvoiceId as string);
    externalPaymentIds.add(receipt.externalPaymentId as string);
    metronomeInvoiceIds.add(receipt.metronomeInvoiceId as string);
  }

  assertBoundedJson(value);

  return value as readonly ManagedEmailPaymentReceipt[];
};

const validateRenewalProjection = (
  value: unknown,
): ManagedEmailRenewalProjection => {
  assertRecord(value, ['receipts', 'resources']);
  validatePaymentReceipts(value.receipts);

  assertArray(value.resources, MAX_COLLECTION_ITEMS);
  if (value.resources.length === 0) {
    fail();
  }
  const targets = new Set<string>();
  for (const resource of value.resources) {
    assertRecord(resource, ['kind', 'resourceId', 'paidThrough']);
    if (
      resource.kind !== 'domain' &&
      resource.kind !== 'mailbox' &&
      resource.kind !== 'warmup'
    ) {
      fail();
    }
    assertUuid(resource.resourceId);
    assertString(resource.paidThrough, MAX_IDENTIFIER_LENGTH);
    parseInstant(resource.paidThrough);
    const target = `${resource.kind}:${resource.resourceId}`;
    if (targets.has(target)) {
      fail();
    }
    targets.add(target);
  }
  assertBoundedJson(value);
  return value as ManagedEmailRenewalProjection;
};

export const managedEmailSafeFactsTransformer =
  requiredTransformer(validateSafeFacts);

export const managedEmailNullableSafeFactsTransformer =
  nullableTransformer(validateSafeFacts);

export const managedEmailProviderReceiptTransformer = requiredTransformer(
  validateProviderReceipt,
);

export const managedEmailNullableProviderReceiptTransformer =
  nullableTransformer(validateProviderReceipt);

export const managedEmailResourceSnapshotTransformer = requiredTransformer(
  validateResourceSnapshot,
);

export const managedEmailExpectedLineItemsTransformer = requiredTransformer(
  validateExpectedLineItems,
);

export const managedEmailCorrelatedSubscriptionLinesTransformer =
  nullableTransformer(validateCorrelatedSubscriptionLines);

export const managedEmailPaymentReceiptsTransformer = nullableTransformer(
  validatePaymentReceipts,
);

export const managedEmailNullableRenewalProjectionTransformer =
  nullableTransformer(validateRenewalProjection);
