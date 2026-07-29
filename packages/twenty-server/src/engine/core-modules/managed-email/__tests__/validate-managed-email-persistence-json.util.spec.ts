import { MANAGED_EMAIL_PRODUCT_KEYS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  managedEmailCorrelatedSubscriptionLinesTransformer,
  managedEmailExpectedLineItemsTransformer,
  managedEmailResourceSnapshotTransformer,
  managedEmailNullableSafeFactsTransformer,
  managedEmailSafeFactsTransformer,
} from 'src/engine/core-modules/managed-email/utils/validate-managed-email-persistence-json.util';

const safeFacts = () => ({
  schemaVersion: 1 as const,
  facts: [
    { name: 'mxReady', value: true },
    { name: 'observedAt', value: '2026-07-29T18:00:00.000Z' },
  ],
});

const resourceSnapshot = () => ({
  domains: [{ domain: 'example.com', mailboxes: ['creator@example.com'] }],
});

const expectedLineItem = () => ({
  productKey: MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH,
  productAlias: 'myah-managed-mailbox-month',
  quantity: 1,
  unitPriceCents: 1429,
  totalCents: 1429,
  periodStart: '2026-07-29T00:00:00.000Z',
  periodEnd: '2026-08-29T00:00:00.000Z',
});

const correlatedLine = () => ({
  subscriptionId: 'subscription-1',
  productId: 'product-1',
  quantity: 1,
  total: 14.29,
  unitPrice: 14.29,
  startingAt: '2026-07-29T00:00:00.000Z',
  endingBefore: '2026-08-29T00:00:00.000Z',
  isProrated: false,
});

describe('managed email persistence JSON validation', () => {
  it('accepts and deeply freezes bounded closed persistence shapes', () => {
    const facts = safeFacts();
    const resources = resourceSnapshot();
    const expectedLines = [expectedLineItem()];
    const correlatedLines = [correlatedLine()];

    expect(managedEmailSafeFactsTransformer.to(facts)).toBe(facts);
    expect(managedEmailSafeFactsTransformer.from(facts)).toBe(facts);
    expect(managedEmailResourceSnapshotTransformer.to(resources)).toBe(
      resources,
    );
    expect(managedEmailExpectedLineItemsTransformer.to(expectedLines)).toBe(
      expectedLines,
    );
    expect(
      managedEmailCorrelatedSubscriptionLinesTransformer.to(correlatedLines),
    ).toBe(correlatedLines);
    expect(Object.isFrozen(facts)).toBe(true);
    expect(Object.isFrozen(facts.facts)).toBe(true);
    expect(Object.isFrozen(facts.facts[0])).toBe(true);
    expect(Object.isFrozen(resources)).toBe(true);
    expect(Object.isFrozen(resources.domains)).toBe(true);
    expect(Object.isFrozen(resources.domains[0].mailboxes)).toBe(true);
    expect(Object.isFrozen(expectedLines)).toBe(true);
    expect(Object.isFrozen(expectedLines[0])).toBe(true);
    expect(Object.isFrozen(correlatedLines)).toBe(true);
    expect(Object.isFrozen(correlatedLines[0])).toBe(true);
  });

  it.each([
    ['password', 'secret'],
    ['rawResponse', 'accepted'],
    ['mailboxContent', 'hello'],
    ['providerStatus', '{"token":"secret"}'],
  ])('rejects sensitive or raw fact %s', (name, value) => {
    expect(() =>
      managedEmailSafeFactsTransformer.to({
        schemaVersion: 1,
        facts: [{ name, value }],
      }),
    ).toThrow('Unsafe managed email persistence JSON');
  });

  it('rejects unknown safe-facts envelope keys', () => {
    expect(() =>
      managedEmailSafeFactsTransformer.to({
        ...safeFacts(),
        rawProviderPayload: 'accepted',
      }),
    ).toThrow('Unsafe managed email persistence JSON');
  });

  it('rejects oversized fact and resource collections', () => {
    expect(() =>
      managedEmailSafeFactsTransformer.to({
        schemaVersion: 1,
        facts: Array.from({ length: 33 }, (_, index) => ({
          name: `metric${index}`,
          value: index,
        })),
      }),
    ).toThrow('Unsafe managed email persistence JSON');
    expect(() =>
      managedEmailResourceSnapshotTransformer.to({
        domains: Array.from({ length: 101 }, (_, index) => ({
          domain: `domain-${index}.example`,
          mailboxes: [],
        })),
      }),
    ).toThrow('Unsafe managed email persistence JSON');
  });

  it('rejects payloads over the serialized byte limit', () => {
    expect(() =>
      managedEmailResourceSnapshotTransformer.to({
        domains: Array.from({ length: 3 }, (_, domainIndex) => ({
          domain: `domain-${domainIndex}.example`,
          mailboxes: Array.from(
            { length: 100 },
            (_, mailboxIndex) =>
              `${'m'.repeat(300)}-${domainIndex}-${mailboxIndex}@example.com`,
          ),
        })),
      }),
    ).toThrow('Unsafe managed email persistence JSON');
  });

  it('rejects oversized expected and correlated line collections', () => {
    expect(() =>
      managedEmailExpectedLineItemsTransformer.to(
        Array.from({ length: 101 }, expectedLineItem),
      ),
    ).toThrow('Unsafe managed email persistence JSON');
    expect(() =>
      managedEmailCorrelatedSubscriptionLinesTransformer.to(
        Array.from({ length: 101 }, correlatedLine),
      ),
    ).toThrow('Unsafe managed email persistence JSON');
  });

  it('preserves nullable receipt and correlation fields', () => {
    expect(managedEmailNullableSafeFactsTransformer.to(null)).toBeNull();
    expect(
      managedEmailCorrelatedSubscriptionLinesTransformer.from(null),
    ).toBeNull();
  });
});
