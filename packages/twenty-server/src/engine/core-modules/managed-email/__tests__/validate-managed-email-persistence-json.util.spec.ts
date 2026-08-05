import { MANAGED_EMAIL_PRODUCT_DEFINITIONS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  managedEmailCorrelatedSubscriptionLinesTransformer,
  managedEmailExpectedLineItemsTransformer,
  managedEmailNullableProviderReceiptTransformer,
  managedEmailProviderReceiptTransformer,
  managedEmailResourceSnapshotTransformer,
  managedEmailNullableRenewalProjectionTransformer,
  managedEmailNullableSafeFactsTransformer,
  managedEmailSafeFactsTransformer,
} from 'src/engine/core-modules/managed-email/utils/validate-managed-email-persistence-json.util';
import {
  type ManagedEmailCorrelatedSubscriptionLine,
  type ManagedEmailExpectedLineItem,
  type ManagedEmailResourceSnapshot,
  type ManagedEmailProviderReceipt,
  type ManagedEmailRenewalProjection,
} from 'src/engine/core-modules/managed-email/types/managed-email-persistence.type';

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends Readonly<object>
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

const WORKSPACE_MEMBER_ID = '123e4567-e89b-42d3-a456-426614174000';

const safeFacts = () => ({
  schemaVersion: 1 as const,
  facts: [
    { name: 'mxReady', value: true },
    { name: 'observedAt', value: '2026-08-02T12:00:00.000Z' },
  ],
});

const providerReceipt = (): DeepMutable<ManagedEmailProviderReceipt> => ({
  domains: [
    {
      mailboxes: [
        {
          normalizedAddress: 'creator@example.com',
          providerMailboxId: 'provider-mailbox-1',
        },
      ],
      normalizedDomain: 'example.com',
      providerDomainId: 'provider-domain-1',
      providerOrderId: 'provider-order-1',
    },
  ],
  failedInventoryIds: [],
  orderIds: ['provider-order-1'],
  schemaVersion: 1,
  totalCostCents: null,
});

const resourceSnapshot = (): DeepMutable<ManagedEmailResourceSnapshot> => ({
  proposal: {
    createdAt: '2026-08-02T12:00:00.000Z',
    expiresAt: '2026-08-02T12:15:00.000Z',
    policyVersion: 'managed-email-quote-v1',
  },
  domains: [
    {
      domain: 'example.com',
      providerInventoryId: 'inventory-1',
      prewarmedProviderCosts: {
        domainPriceCents: 1000,
        mailboxPriceCents: 250,
      },
      mailboxes: ['creator@example.com'],
      providerQuote: {
        amountMinorUnits: 1000,
        currency: 'USD' as const,
        fingerprint: 'quote-fingerprint-1',
        observedAt: '2026-08-02T12:00:00.000Z',
        termCount: 1,
        termUnit: 'YEAR' as const,
      },
    },
  ],
  personas: [
    {
      address: 'creator@example.com',
      createdByWorkspaceMemberId: WORKSPACE_MEMBER_ID,
      firstName: 'Ada',
      lastName: 'Lovelace',
      localPart: 'creator',
      roleTitle: null,
      signature: 'Ada',
      version: 1,
    },
  ],
});

const expectedLineItem = (
  index: number,
  quantity = 1,
  unitPriceCents = 1000,
): DeepMutable<ManagedEmailExpectedLineItem> => ({
  productKey: MANAGED_EMAIL_PRODUCT_DEFINITIONS[index].key,
  productTag: MANAGED_EMAIL_PRODUCT_DEFINITIONS[index].metronomeProductTag,
  metronomeProductId: `123e4567-e89b-42d3-a456-42661417400${index}`,
  currency: 'USD' as const,
  quantity,
  unitPriceCents,
  totalCents: quantity * unitPriceCents,
  periodStart: '2026-08-02T00:00:00.000Z',
  periodEnd:
    index === 0 ? '2027-08-02T00:00:00.000Z' : '2026-09-02T00:00:00.000Z',
});

const expectedLineItems = (): DeepMutable<ManagedEmailExpectedLineItem>[] => [
  expectedLineItem(0),
  expectedLineItem(1),
  expectedLineItem(2),
];

const correlatedLine = (
  index = 0,
  quantity = 1,
  unitPrice = 1000,
): DeepMutable<ManagedEmailCorrelatedSubscriptionLine> => ({
  subscriptionId: `123e4567-e89b-42d3-a456-42661417401${index}`,
  productId: `123e4567-e89b-42d3-a456-42661417400${index}`,
  quantity,
  total: quantity * unitPrice,
  unitPrice,
  startingAt: '2026-08-02T00:00:00.000Z',
  endingBefore: '2026-09-02T00:00:00.000Z',
  isProrated: false,
});

describe('managed email persistence JSON validation', () => {
  it('validates nullable renewal projections and rejects duplicate targets', () => {
    const projection: DeepMutable<ManagedEmailRenewalProjection> = {
      receipt: {
        externalInvoiceId: 'invoice-1',
        externalPaymentId: 'payment-1',
        metronomeInvoiceId: 'invoice-2',
      },
      resources: [
        {
          kind: 'domain',
          resourceId: '123e4567-e89b-42d3-a456-426614174001',
          paidThrough: '2026-08-02T00:00:00.000Z',
        },
      ],
    };
    const duplicateProjection: DeepMutable<ManagedEmailRenewalProjection> = {
      ...projection,
      resources: [...projection.resources, { ...projection.resources[0] }],
    };
    expect(
      managedEmailNullableRenewalProjectionTransformer.to(projection),
    ).toBe(projection);
    expect(
      managedEmailNullableRenewalProjectionTransformer.to(null),
    ).toBeNull();
    expect(() =>
      managedEmailNullableRenewalProjectionTransformer.to(duplicateProjection),
    ).toThrow('Unsafe managed email persistence JSON');
  });
  it('accepts and deeply freezes bounded closed persistence shapes', () => {
    const facts = safeFacts();
    const resources = resourceSnapshot();
    const expectedLines = expectedLineItems();
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
    expect(Object.isFrozen(facts.facts[0])).toBe(true);
    expect(Object.isFrozen(resources.proposal)).toBe(true);
    expect(Object.isFrozen(resources.domains[0].providerQuote)).toBe(true);
    expect(Object.isFrozen(resources.domains[0].prewarmedProviderCosts)).toBe(
      true,
    );
    expect(Object.isFrozen(resources.personas[0])).toBe(true);
    expect(Object.isFrozen(expectedLines[0])).toBe(true);
    expect(Object.isFrozen(correlatedLines[0])).toBe(true);
  });

  it('deeply freezes validated children when the root is already frozen', () => {
    const resources = resourceSnapshot();

    Object.freeze(resources);

    expect(managedEmailResourceSnapshotTransformer.to(resources)).toBe(
      resources,
    );
    expect(Object.isFrozen(resources.proposal)).toBe(true);
    expect(Object.isFrozen(resources.domains[0].providerQuote)).toBe(true);
    expect(Object.isFrozen(resources.personas[0])).toBe(true);
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

  it.each([
    [
      'empty domains',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        snapshot.domains = [];
      },
    ],
    [
      'empty mailboxes',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        snapshot.domains[0].mailboxes = [];
        snapshot.personas = [];
      },
    ],
    [
      'non-normalized domain',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        snapshot.domains[0].domain = 'Example.com';
      },
    ],
    [
      'duplicate normalized mailbox',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        snapshot.domains[0].mailboxes.push('creator@example.com');
      },
    ],
    [
      'persona not bound to a mailbox',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        snapshot.personas[0].address = 'other@example.com';
      },
    ],
    [
      'invalid workspace-member UUID',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        snapshot.personas[0].createdByWorkspaceMemberId = 'member-1';
      },
    ],
    [
      'blank quote fingerprint',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        snapshot.domains[0].providerQuote.fingerprint = ' ';
      },
    ],
    [
      'quote observed after proposal creation',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        snapshot.domains[0].providerQuote.observedAt =
          '2026-08-02T12:01:00.000Z';
      },
    ],
    [
      'inventory identity without exact provider costs',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        delete snapshot.domains[0].prewarmedProviderCosts;
      },
    ],
    [
      'provider costs without inventory identity',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        delete snapshot.domains[0].providerInventoryId;
      },
    ],
    [
      'negative prewarmed provider cost',
      (snapshot: DeepMutable<ManagedEmailResourceSnapshot>) => {
        if (snapshot.domains[0].prewarmedProviderCosts !== undefined) {
          snapshot.domains[0].prewarmedProviderCosts.mailboxPriceCents = -1;
        }
      },
    ],
  ])('rejects resource snapshot with %s', (_name, mutate) => {
    const snapshot = resourceSnapshot();

    mutate(snapshot);

    expect(() => managedEmailResourceSnapshotTransformer.to(snapshot)).toThrow(
      'Unsafe managed email persistence JSON',
    );
  });

  it.each([
    [
      'missing canonical product',
      (lines: DeepMutable<ManagedEmailExpectedLineItem>[]) => lines.pop(),
    ],
    [
      'duplicate canonical product',
      (lines: DeepMutable<ManagedEmailExpectedLineItem>[]) => {
        lines[2].productKey = lines[1].productKey;
        lines[2].productTag = lines[1].productTag;
      },
    ],
    [
      'wrong canonical product tag',
      (lines: DeepMutable<ManagedEmailExpectedLineItem>[]) => {
        lines[1].productTag = 'wrong-tag';
      },
    ],
    [
      'contradictory line total',
      (lines: DeepMutable<ManagedEmailExpectedLineItem>[]) => {
        lines[1].totalCents += 1;
      },
    ],
    [
      'non-USD customer invoice line',
      (lines: DeepMutable<ManagedEmailExpectedLineItem>[]) => {
        lines[2].currency = 'EUR' as 'USD';
      },
    ],
    [
      'invalid Metronome product UUID',
      (lines: DeepMutable<ManagedEmailExpectedLineItem>[]) => {
        lines[0].metronomeProductId = 'product-1';
      },
    ],
  ])('rejects expected lines with %s', (_name, mutate) => {
    const lines = expectedLineItems();

    mutate(lines);

    expect(() => managedEmailExpectedLineItemsTransformer.to(lines)).toThrow(
      'Unsafe managed email persistence JSON',
    );
  });

  it.each([
    [
      'empty set',
      (_lines: DeepMutable<ManagedEmailCorrelatedSubscriptionLine>[]) => [],
    ],
    [
      'duplicate subscription',
      (lines: DeepMutable<ManagedEmailCorrelatedSubscriptionLine>[]) => [
        ...lines,
        correlatedLine(),
      ],
    ],
    [
      'contradictory total',
      (lines: DeepMutable<ManagedEmailCorrelatedSubscriptionLine>[]) => {
        lines[0].total += 1;

        return lines;
      },
    ],
  ])('rejects correlated lines with %s', (_name, mutate) => {
    const lines = mutate([correlatedLine()]);

    expect(() =>
      managedEmailCorrelatedSubscriptionLinesTransformer.to(lines),
    ).toThrow('Unsafe managed email persistence JSON');
  });

  it('rejects oversized collections and payloads', () => {
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
        ...resourceSnapshot(),
        domains: Array.from({ length: 101 }, (_, index) => ({
          ...resourceSnapshot().domains[0],
          domain: `domain-${index}.example`,
          mailboxes: [`creator@domain-${index}.example`],
        })),
      }),
    ).toThrow('Unsafe managed email persistence JSON');
    expect(() =>
      managedEmailResourceSnapshotTransformer.to({
        ...resourceSnapshot(),
        domains: [
          {
            ...resourceSnapshot().domains[0],
            mailboxes: Array.from(
              { length: 100 },
              (_, mailboxIndex) =>
                `${'m'.repeat(300)}-${mailboxIndex}@example.com`,
            ),
          },
        ],
      }),
    ).toThrow('Unsafe managed email persistence JSON');
  });

  it('accepts a bounded provider receipt and rejects credential fields', () => {
    const receipt = providerReceipt();
    expect(managedEmailProviderReceiptTransformer.to(receipt)).toBe(receipt);
    expect(Object.isFrozen(receipt.domains[0].mailboxes[0])).toBe(true);
    expect(() =>
      managedEmailProviderReceiptTransformer.to({
        ...providerReceipt(),
        password: 'secret',
      }),
    ).toThrow('Unsafe managed email persistence JSON');
  });

  it('preserves nullable receipt and correlation fields', () => {
    expect(managedEmailNullableSafeFactsTransformer.to(null)).toBeNull();
    expect(managedEmailNullableProviderReceiptTransformer.to(null)).toBeNull();
    expect(
      managedEmailCorrelatedSubscriptionLinesTransformer.from(null),
    ).toBeNull();
  });
});
