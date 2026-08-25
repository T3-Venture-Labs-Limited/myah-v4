import { i18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import {
  applyManagedEmailDesignSubscriptionCancellation,
  applyManagedEmailDesignSubscriptionQuantityChange,
  createManagedDomainReview,
  createManagedEmailDesignAcquisitionOperation,
  createManagedEmailDesignMailbox,
  createManagedEmailDesignPrewarmedOffer,
  createManagedMailboxReview,
  createPrewarmedBundleReview,
  createManagedEmailDesignQuote,
  createManagedEmailDesignRecurringSubscription,
  formatManagedEmailDesignUsd,
  getManagedEmailDesignAcquisitionRetryOrder,
  getManagedEmailDesignAcquisitionStatus,
  getManagedEmailDesignAssignedWarmupCount,
  getManagedEmailDesignAvailableWarmupCount,
  getManagedEmailDesignBundleConflictMessage,
  getManagedEmailDesignDomainValidationMessage,
  getManagedEmailDesignEffectiveSubscriptionQuantity,
  getManagedEmailDesignMailboxConnectionSafeDiagnosticMessage,
  getManagedEmailDesignMailboxPoolCapacity,
  getManagedEmailDesignMailboxSendingCapabilityReasonMessage,
  getManagedEmailDesignMailboxValidationMessage,
  isManagedEmailDesignQuoteCompletable,
  managedEmailDesignDnsRecords,
  managedEmailDesignMailboxConnectionSafeDiagnostics,
  managedEmailDesignPricing,
  mixedWorkspace,
  requestManagedEmailDesignSubscriptionCancellation,
  resolveManagedEmailDesignMailboxPoolAcquisition,
  resolveManagedEmailDesignWarmupCapacityAcquisition,
  scheduleManagedEmailDesignSubscriptionQuantityChange,
  undoManagedEmailDesignSubscriptionCancellation,
  type ManagedEmailDesignAcquisitionLine,
  type ManagedEmailDesignAcquisitionOperation,
  type ManagedEmailDesignAcquisitionSource,
  type ManagedEmailDesignAcquisitionSubscriptionOperation,
  type ManagedEmailDesignDnsCheckOperation,
  type ManagedEmailDesignDnsRecord,
  type ManagedEmailDesignMailbox,
  type ManagedEmailDesignMailboxConnectionOperation,
  type ManagedEmailDesignPrewarmedBundle,
  type ManagedEmailDesignQuote,
  type ManagedEmailDesignQuoteLine,
  type ManagedEmailDesignRecurringSubscription,
  type ManagedEmailDesignResourceSnapshot,
  type ManagedEmailDesignSubscriptionIntent,
} from './ManagedEmailDesign.fixtures';

const fixtureNow = '2027-01-10T12:00:00.000Z';
const fixtureExpiry = '2027-01-10T12:15:00.000Z';
const workspaceId = 'workspace-managed-email-design';

const domainSnapshot = (
  id = 'snapshot-domain-northstar',
  label = 'northstar-outreach.com',
): ManagedEmailDesignResourceSnapshot => ({
  id,
  kind: 'domain',
  label,
});

const mailboxSnapshot = (
  id = 'snapshot-mailbox-mira',
  label = 'Mira Chen <mira@northstar-outreach.com>',
): ManagedEmailDesignResourceSnapshot => ({
  id,
  kind: 'mailbox',
  label,
});

const warmupCapacitySnapshot = (
  id = 'snapshot-warmup-capacity-1',
  label = 'Warmup capacity slot 1',
): ManagedEmailDesignResourceSnapshot => ({
  id,
  kind: 'warmup-capacity',
  label,
});

const mailbox = (
  overrides: Partial<ManagedEmailDesignMailbox> = {},
): ManagedEmailDesignMailbox =>
  ({
    id: 'mailbox-mira',
    identity: 'Mira Chen',
    address: 'mira@northstar-outreach.com',
    domain: 'northstar-outreach.com',
    source: 'managed',
    subscriptionId: 'subscription-managed-mailbox',
    readiness: 'not-ready',
    warmupState: {
      assignment: 'unassigned',
      lastConfirmedProviderState: 'inactive',
      operation: { status: 'idle' },
    },
    ...overrides,
  }) as ManagedEmailDesignMailbox;

type ManagedDomainSubscription = Extract<
  ManagedEmailDesignRecurringSubscription,
  { product: 'managed-domain' }
>;
type ManagedQuantitySubscription = Extract<
  ManagedEmailDesignRecurringSubscription,
  { product: 'managed-mailbox' | 'managed-warmup' }
>;
type ManagedMailboxSubscription = ManagedQuantitySubscription & {
  product: 'managed-mailbox';
};
type ManagedWarmupSubscription = ManagedQuantitySubscription & {
  product: 'managed-warmup';
};

const managedDomainSubscription = (
  overrides: Partial<ManagedDomainSubscription> = {},
): ManagedDomainSubscription =>
  createManagedEmailDesignRecurringSubscription({
    id: 'subscription-managed-domain',
    workspaceId,
    product: 'managed-domain',
    cadence: 'annual',
    quantity: 1,
    unitPriceCents: 1429,
    linkedResources: [domainSnapshot()],
    status: 'active',
    renewsAt: '2028-01-10T12:00:00.000Z',
    ...overrides,
  } as ManagedDomainSubscription) as ManagedDomainSubscription;

const managedMailboxSubscription = (
  overrides: Partial<ManagedMailboxSubscription> = {},
): ManagedMailboxSubscription =>
  createManagedEmailDesignRecurringSubscription({
    id: 'subscription-managed-mailbox',
    workspaceId,
    product: 'managed-mailbox',
    cadence: 'monthly',
    quantity: 3,
    unitPriceCents: 500,
    linkedResources: [mailboxSnapshot()],
    status: 'active',
    renewsAt: '2027-02-10T12:00:00.000Z',
    ...overrides,
  } as ManagedMailboxSubscription) as ManagedMailboxSubscription;

const managedWarmupSubscription = (
  overrides: Partial<ManagedWarmupSubscription> = {},
): ManagedWarmupSubscription => {
  const quantity = overrides.quantity ?? 3;
  const linkedResources =
    overrides.linkedResources ??
    (Number.isInteger(quantity) && quantity > 0
      ? Array.from({ length: quantity }, (_, index) =>
          warmupCapacitySnapshot(
            `snapshot-warmup-capacity-${index + 1}`,
            `Warmup capacity slot ${index + 1}`,
          ),
        )
      : [warmupCapacitySnapshot()]);

  return createManagedEmailDesignRecurringSubscription({
    id: 'subscription-managed-warmup',
    workspaceId,
    product: 'managed-warmup',
    cadence: 'monthly',
    quantity,
    unitPriceCents: 299,
    linkedResources,
    status: 'active',
    renewsAt: '2027-02-10T12:00:00.000Z',
    ...overrides,
  } as ManagedWarmupSubscription) as ManagedWarmupSubscription;
};

const domainQuoteLine = (
  overrides: Partial<ManagedEmailDesignQuoteLine> = {},
): ManagedEmailDesignQuoteLine =>
  ({
    id: 'quote-line-domain',
    resourceLabel: 'northstar-outreach.com',
    unitPriceCents: 1429,
    amountCents: 1429,
    startsAt: fixtureNow,
    renewsAt: '2028-01-10T12:00:00.000Z',
    product: 'managed-domain',
    cadence: 'annual',
    quantity: 1,
    ...overrides,
  }) as ManagedEmailDesignQuoteLine;

const mailboxQuoteLine = ({
  id = 'quote-line-mailbox',
  resourceLabel = 'Mira Chen <mira@northstar-outreach.com>',
  unitPriceCents = 500,
  quantity = 1,
  startsAt = fixtureNow,
  renewsAt = '2027-02-10T12:00:00.000Z',
}: {
  id?: string;
  resourceLabel?: string;
  unitPriceCents?: number;
  quantity?: number;
  startsAt?: string;
  renewsAt?: string;
} = {}): ManagedEmailDesignQuoteLine => ({
  id,
  resourceLabel,
  unitPriceCents,
  amountCents: unitPriceCents * quantity,
  startsAt,
  renewsAt,
  product: 'managed-mailbox',
  cadence: 'monthly',
  quantity,
});

const warmupQuoteLine = ({
  id = 'quote-line-warmup',
  resourceLabel = 'Warmup capacity',
  unitPriceCents = 299,
  quantity = 1,
  startsAt = fixtureNow,
  renewsAt = '2027-02-10T12:00:00.000Z',
}: {
  id?: string;
  resourceLabel?: string;
  unitPriceCents?: number;
  quantity?: number;
  startsAt?: string;
  renewsAt?: string;
} = {}): ManagedEmailDesignQuoteLine => ({
  id,
  resourceLabel,
  unitPriceCents,
  amountCents: unitPriceCents * quantity,
  startsAt,
  renewsAt,
  product: 'managed-warmup',
  cadence: 'monthly',
  quantity,
});

const totalsFor = (lines: ManagedEmailDesignQuoteLine[], now = fixtureNow) => ({
  dueTodayCents: lines
    .filter((line) => line.startsAt === now)
    .reduce((total, line) => total + line.amountCents, 0),
  monthlyRecurringCents: lines
    .filter((line) => line.cadence === 'monthly')
    .reduce((total, line) => total + line.amountCents, 0),
  annualRecurringCents: lines
    .filter((line) => line.cadence === 'annual')
    .reduce((total, line) => total + line.amountCents, 0),
});

const quoteDraft = ({
  id = 'quote-managed-email',
  expiresAt = fixtureExpiry,
  acceptedQuoteId = id,
  lines,
  totals = totalsFor(lines),
}: {
  id?: string;
  expiresAt?: string;
  acceptedQuoteId?: string | null;
  lines: ManagedEmailDesignQuoteLine[];
  totals?: ManagedEmailDesignQuote['totals'];
}): ManagedEmailDesignQuote =>
  ({
    id,
    expiresAt,
    acceptedQuoteId,
    lines,
    totals,
    status: 'valid',
  }) as ManagedEmailDesignQuote;

const quote = (
  draft: ManagedEmailDesignQuote,
  now = fixtureNow,
): ManagedEmailDesignQuote =>
  createManagedEmailDesignQuote({ quote: draft, fixtureNow: now });

const domainIntent = (
  overrides: Partial<ManagedEmailDesignSubscriptionIntent> = {},
): ManagedEmailDesignSubscriptionIntent =>
  ({
    product: 'managed-domain',
    mode: 'create',
    targetSubscriptionId: 'subscription-managed-domain',
    quantityDelta: 1,
    resourceSnapshotIds: [domainSnapshot().id],
    ...overrides,
  }) as ManagedEmailDesignSubscriptionIntent;

const mailboxIntent = ({
  mode = 'create',
  targetSubscriptionId = 'subscription-managed-mailbox',
  quantityDelta = 2,
  resourceSnapshotIds = [
    mailboxSnapshot('snapshot-mailbox-mira').id,
    mailboxSnapshot(
      'snapshot-mailbox-jordan',
      'Jordan Lee <jordan@northstar-outreach.com>',
    ).id,
  ],
}: {
  mode?: 'create' | 'increment-existing' | 'attach-existing-capacity';
  targetSubscriptionId?: string;
  quantityDelta?: number;
  resourceSnapshotIds?: [string, ...string[]];
} = {}): ManagedEmailDesignSubscriptionIntent => ({
  product: 'managed-mailbox',
  mode,
  targetSubscriptionId,
  quantityDelta,
  resourceSnapshotIds,
});

const warmupIntent = ({
  mode = 'create',
  targetSubscriptionId = 'subscription-managed-warmup',
  quantityDelta = 2,
  resourceSnapshotIds = [
    warmupCapacitySnapshot('snapshot-warmup-capacity-1').id,
    warmupCapacitySnapshot(
      'snapshot-warmup-capacity-2',
      'Warmup capacity slot 2',
    ).id,
  ],
}: {
  mode?: 'create' | 'increment-existing';
  targetSubscriptionId?: string;
  quantityDelta?: number;
  resourceSnapshotIds?: [string, ...string[]];
} = {}): ManagedEmailDesignSubscriptionIntent => ({
  product: 'managed-warmup',
  mode,
  targetSubscriptionId,
  quantityDelta,
  resourceSnapshotIds,
});

const acquisitionLine = (
  overrides: Partial<ManagedEmailDesignAcquisitionLine> = {},
): ManagedEmailDesignAcquisitionLine =>
  ({
    id: 'acquisition-line-domain',
    quoteLineId: 'quote-line-domain',
    resourceSnapshotId: 'snapshot-domain-northstar',
    dependsOnLineIds: [],
    resourceOperationId: 'resource-operation-domain',
    subscriptionOperationId: 'subscription-operation-domain',
    paymentEvidenceId: 'payment-domain',
    resourceOutcome: 'completed',
    paymentOutcome: 'completed',
    ...overrides,
  }) as ManagedEmailDesignAcquisitionLine;

const acquisitionLineWithResourceSnapshot = (
  resourceSnapshotId: string,
  overrides: Partial<ManagedEmailDesignAcquisitionLine> = {},
): ManagedEmailDesignAcquisitionLine & { resourceSnapshotId: string } => ({
  ...acquisitionLine(overrides),
  resourceSnapshotId,
});

const subscriptionOperation = (
  overrides: Partial<ManagedEmailDesignAcquisitionSubscriptionOperation> = {},
): ManagedEmailDesignAcquisitionSubscriptionOperation =>
  ({
    id: 'subscription-operation-domain',
    intent: domainIntent(),
    outcome: 'completed',
    ...overrides,
  }) as ManagedEmailDesignAcquisitionSubscriptionOperation;

const acquisitionResourceSnapshots = [
  domainSnapshot(),
  mailboxSnapshot('snapshot-mailbox-mira'),
  mailboxSnapshot(
    'snapshot-mailbox-jordan',
    'Jordan Lee <jordan@northstar-outreach.com>',
  ),
  warmupCapacitySnapshot('snapshot-warmup-capacity-1'),
  warmupCapacitySnapshot(
    'snapshot-warmup-capacity-2',
    'Warmup capacity slot 2',
  ),
];

type ManagedEmailDesignNonIdleAcquisitionOperation = Exclude<
  ManagedEmailDesignAcquisitionOperation,
  { status: 'idle' }
>;

const acquisitionOperation = ({
  status = 'succeeded',
  id = 'acquisition-managed-email',
  acceptedQuoteId = 'quote-managed-email',
  source = 'managed-domain',
  lines = [acquisitionLine()],
  subscriptionOperations = [subscriptionOperation()],
}: {
  status?: ManagedEmailDesignNonIdleAcquisitionOperation['status'];
  id?: string;
  acceptedQuoteId?: string;
  source?: ManagedEmailDesignAcquisitionSource;
  lines?: ManagedEmailDesignAcquisitionLine[];
  subscriptionOperations?: ManagedEmailDesignAcquisitionSubscriptionOperation[];
} = {}): ManagedEmailDesignNonIdleAcquisitionOperation =>
  ({
    status,
    id,
    acceptedQuoteId,
    source,
    lines,
    subscriptionOperations,
  }) as ManagedEmailDesignNonIdleAcquisitionOperation;

const createAcquisition = ({
  operation,
  acquisitionQuote,
  resourceSnapshots = acquisitionResourceSnapshots,
}: {
  operation: ManagedEmailDesignAcquisitionOperation;
  acquisitionQuote: ManagedEmailDesignQuote;
  resourceSnapshots?: ManagedEmailDesignResourceSnapshot[];
}) =>
  createManagedEmailDesignAcquisitionOperation({
    operation,
    quote: acquisitionQuote,
    resourceSnapshots,
    fixtureNow,
  });

const composeCapacityAcquisition = ({
  intent,
  acquisitionQuote,
  resourceSnapshots,
}: {
  intent: Extract<
    ManagedEmailDesignSubscriptionIntent,
    { product: 'managed-mailbox' | 'managed-warmup' }
  >;
  acquisitionQuote: ManagedEmailDesignQuote;
  resourceSnapshots: ManagedEmailDesignResourceSnapshot[];
}) => {
  const quoteLine = acquisitionQuote.lines[0];

  return createAcquisition({
    acquisitionQuote,
    resourceSnapshots,
    operation: acquisitionOperation({
      id: `acquisition-capacity-${intent.targetSubscriptionId}`,
      acceptedQuoteId: acquisitionQuote.id,
      source: intent.product,
      lines: [
        acquisitionLine({
          id: `acquisition-line-${intent.targetSubscriptionId}`,
          quoteLineId: quoteLine.id,
          resourceSnapshotId: intent.resourceSnapshotIds[0],
          resourceOperationId: `resource-operation-${intent.targetSubscriptionId}`,
          subscriptionOperationId: `subscription-operation-${intent.targetSubscriptionId}`,
          paymentEvidenceId: `payment-${intent.targetSubscriptionId}`,
        }),
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: `subscription-operation-${intent.targetSubscriptionId}`,
          intent,
        }),
      ],
    }),
  });
};

describe('ManagedEmailDesign fixture lifecycle and commercial model', () => {
  it('creates the three recurring products with their only valid commercial identities', () => {
    const subscriptions = [
      managedDomainSubscription(),
      managedMailboxSubscription({ quantity: 2 }),
      managedWarmupSubscription({ quantity: 3 }),
    ];
    const lines = [
      domainQuoteLine(),
      mailboxQuoteLine({ quantity: 2 }),
      warmupQuoteLine({ quantity: 3 }),
    ];
    const commercialQuote = quote(
      quoteDraft({
        lines,
        totals: {
          dueTodayCents: 3326,
          monthlyRecurringCents: 1897,
          annualRecurringCents: 1429,
        },
      }),
    );

    expect(
      subscriptions.map(({ product, cadence, quantity }) => ({
        product,
        cadence,
        quantity,
      })),
    ).toEqual([
      { product: 'managed-domain', cadence: 'annual', quantity: 1 },
      { product: 'managed-mailbox', cadence: 'monthly', quantity: 2 },
      { product: 'managed-warmup', cadence: 'monthly', quantity: 3 },
    ]);
    expect(
      commercialQuote.lines.map(
        ({ product, cadence, quantity, unitPriceCents, amountCents }) => ({
          product,
          cadence,
          quantity,
          unitPriceCents,
          amountCents,
        }),
      ),
    ).toEqual([
      {
        product: 'managed-domain',
        cadence: 'annual',
        quantity: 1,
        unitPriceCents: 1429,
        amountCents: 1429,
      },
      {
        product: 'managed-mailbox',
        cadence: 'monthly',
        quantity: 2,
        unitPriceCents: 500,
        amountCents: 1000,
      },
      {
        product: 'managed-warmup',
        cadence: 'monthly',
        quantity: 3,
        unitPriceCents: 299,
        amountCents: 897,
      },
    ]);
    expect(commercialQuote.totals).toEqual({
      dueTodayCents: 3326,
      monthlyRecurringCents: 1897,
      annualRecurringCents: 1429,
    });
  });

  it('counts due-today charges from the injected start time while retaining recurring totals', () => {
    const totals = quote(
      quoteDraft({
        lines: [
          domainQuoteLine(),
          mailboxQuoteLine({
            id: 'quote-line-mailbox-future',
            startsAt: '2027-02-10T12:00:00.000Z',
            renewsAt: '2027-03-10T12:00:00.000Z',
          }),
        ],
        totals: {
          dueTodayCents: 1429,
          monthlyRecurringCents: 500,
          annualRecurringCents: 1429,
        },
      }),
    );

    expect(totals.totals).toEqual({
      dueTodayCents: 1429,
      monthlyRecurringCents: 500,
      annualRecurringCents: 1429,
    });
  });

  it('allows only the lifecycle branches that belong to each recurring product', () => {
    const domainPendingCancellation = managedDomainSubscription({
      status: 'pending-cancel',
      cancelAt: '2028-01-10T12:00:00.000Z',
    });
    const mailboxPendingChange = managedMailboxSubscription({
      status: 'pending-change',
      pendingQuantity: 2,
      changeEffectiveAt: '2027-02-10T12:00:00.000Z',
    });
    const warmupCancellation = managedWarmupSubscription({
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-02-10T12:00:00.000Z',
    });

    expect([
      domainPendingCancellation.status,
      mailboxPendingChange.status,
      warmupCancellation.status,
    ]).toEqual(['pending-cancel', 'pending-change', 'canceled']);
  });

  it('uses the lower future quantity and zero cancellation capacity for both pooled products', () => {
    const mailboxPendingReduction = managedMailboxSubscription({
      quantity: 3,
      status: 'pending-change',
      pendingQuantity: 2,
      changeEffectiveAt: '2027-02-10T12:00:00.000Z',
    });
    const warmupPendingReduction = managedWarmupSubscription({
      quantity: 3,
      status: 'pending-change',
      pendingQuantity: 2,
      changeEffectiveAt: '2027-02-10T12:00:00.000Z',
    });
    const mailboxPendingCancellation = managedMailboxSubscription({
      status: 'pending-cancel',
      cancelAt: '2027-02-10T12:00:00.000Z',
    });
    const warmupCanceled = managedWarmupSubscription({
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-02-10T12:00:00.000Z',
    });

    expect([
      getManagedEmailDesignEffectiveSubscriptionQuantity(
        mailboxPendingReduction,
      ),
      getManagedEmailDesignEffectiveSubscriptionQuantity(
        warmupPendingReduction,
      ),
      getManagedEmailDesignEffectiveSubscriptionQuantity(
        mailboxPendingCancellation,
      ),
      getManagedEmailDesignEffectiveSubscriptionQuantity(warmupCanceled),
    ]).toEqual([2, 2, 0, 0]);

    const assignedMailboxes = [
      mailbox({
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      mailbox({
        id: 'mailbox-jordan',
        address: 'jordan@northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'paused',
          operation: { status: 'idle' },
        },
      }),
    ];

    expect(
      getManagedEmailDesignAvailableWarmupCount({
        subscriptions: [warmupPendingReduction],
        mailboxes: assignedMailboxes,
      }),
    ).toBe(0);
  });

  it('makes annual-domain quantity changes unrepresentable and rejects them at the builder boundary', () => {
    // @ts-expect-error Managed domains use the non-quantity lifecycle.
    const invalidDomainPendingChange: ManagedEmailDesignRecurringSubscription =
      {
        id: 'subscription-invalid-domain-change',
        workspaceId,
        product: 'managed-domain',
        cadence: 'annual',
        quantity: 1,
        unitPriceCents: 1429,
        linkedResources: [domainSnapshot()],
        status: 'pending-change',
        renewsAt: '2028-01-10T12:00:00.000Z',
        pendingQuantity: 2,
        changeEffectiveAt: '2027-02-10T12:00:00.000Z',
      };

    expect(() =>
      createManagedEmailDesignRecurringSubscription(
        invalidDomainPendingChange as unknown as ManagedEmailDesignRecurringSubscription,
      ),
    ).toThrow();
  });

  it('permits only strict monthly quantity reductions at the builder and scheduling boundaries', () => {
    const effectiveAt = '2027-02-10T12:00:00.000Z';
    const monthlySubscriptions = [
      managedMailboxSubscription({ quantity: 3 }),
      managedWarmupSubscription({ quantity: 3 }),
    ];

    for (const subscription of monthlySubscriptions) {
      for (const pendingQuantity of [
        subscription.quantity,
        subscription.quantity + 1,
      ]) {
        const invalidPendingChange = {
          ...subscription,
          status: 'pending-change',
          pendingQuantity,
          changeEffectiveAt: effectiveAt,
        } as ManagedEmailDesignRecurringSubscription;

        expect(() =>
          createManagedEmailDesignRecurringSubscription(invalidPendingChange),
        ).toThrow();
        expect(() =>
          scheduleManagedEmailDesignSubscriptionQuantityChange({
            subscription,
            quantity: pendingQuantity,
            effectiveAt,
            mailboxes: [],
          }),
        ).toThrow();
      }

      const reducedQuantity = subscription.quantity - 1;
      expect(
        createManagedEmailDesignRecurringSubscription({
          ...subscription,
          status: 'pending-change',
          pendingQuantity: reducedQuantity,
          changeEffectiveAt: effectiveAt,
        } as ManagedEmailDesignRecurringSubscription),
      ).toMatchObject({
        status: 'pending-change',
        pendingQuantity: reducedQuantity,
      });
      expect(
        scheduleManagedEmailDesignSubscriptionQuantityChange({
          subscription,
          quantity: reducedQuantity,
          effectiveAt,
          mailboxes: [],
        }),
      ).toMatchObject({
        status: 'scheduled',
        subscription: {
          status: 'pending-change',
          pendingQuantity: reducedQuantity,
        },
      });
    }
  });

  describe('commercial and lifecycle rejection boundaries', () => {
    const validMailboxLine = mailboxQuoteLine();
    const invalidCases: Array<[string, () => unknown]> = [
      [
        'duplicate retained snapshot ids',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedMailboxSubscription(),
            linkedResources: [
              mailboxSnapshot('duplicate-snapshot'),
              mailboxSnapshot(
                'duplicate-snapshot',
                'Jordan Lee <jordan@example.com>',
              ),
            ],
          } as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a domain backed by a mailbox snapshot',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedDomainSubscription(),
            linkedResources: [mailboxSnapshot()],
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a mailbox backed by warmup capacity',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedMailboxSubscription(),
            linkedResources: [warmupCapacitySnapshot()],
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a monthly domain subscription',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedDomainSubscription(),
            cadence: 'monthly',
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'an annual mailbox subscription',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedMailboxSubscription(),
            cadence: 'annual',
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a non-unit annual domain subscription',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedDomainSubscription(),
            quantity: 2,
            linkedResources: [
              domainSnapshot('snapshot-domain-northstar'),
              domainSnapshot('snapshot-domain-second', 'second-domain.test'),
            ],
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a non-positive subscription quantity',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedMailboxSubscription(),
            quantity: 0,
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a fractional subscription quantity',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedWarmupSubscription(),
            quantity: 1.5,
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a non-positive pending quantity',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedMailboxSubscription(),
            status: 'pending-change',
            pendingQuantity: 0,
            changeEffectiveAt: '2027-02-10T12:00:00.000Z',
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'negative commercial values',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedDomainSubscription(),
            unitPriceCents: -1,
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a canceled record with a renewal',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedMailboxSubscription(),
            status: 'canceled',
            renewsAt: '2027-02-10T12:00:00.000Z',
            canceledAt: '2027-02-10T12:00:00.000Z',
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'an active record carrying a cancellation date',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedMailboxSubscription(),
            cancelAt: '2027-02-10T12:00:00.000Z',
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a pending cancellation without its cancellation date',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedMailboxSubscription(),
            status: 'pending-cancel',
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a pending quantity change without its effective date',
        () =>
          createManagedEmailDesignRecurringSubscription({
            ...managedMailboxSubscription(),
            status: 'pending-change',
            pendingQuantity: 2,
          } as unknown as ManagedEmailDesignRecurringSubscription),
      ],
      [
        'a monthly domain quote line',
        () => {
          const invalidQuote = {
            ...quoteDraft({ lines: [domainQuoteLine()] }),
            lines: [{ ...domainQuoteLine(), cadence: 'monthly' }],
          };

          return createManagedEmailDesignQuote({
            fixtureNow,
            quote: invalidQuote as unknown as ManagedEmailDesignQuote,
          });
        },
      ],
      [
        'an annual mailbox quote line',
        () => {
          const invalidQuote = {
            ...quoteDraft({ lines: [validMailboxLine] }),
            lines: [{ ...validMailboxLine, cadence: 'annual' }],
          };

          return createManagedEmailDesignQuote({
            fixtureNow,
            quote: invalidQuote as unknown as ManagedEmailDesignQuote,
          });
        },
      ],
      [
        'a quote amount that is not unit price times quantity',
        () => {
          const invalidQuote = {
            ...quoteDraft({ lines: [validMailboxLine] }),
            lines: [{ ...validMailboxLine, amountCents: 999 }],
          };

          return createManagedEmailDesignQuote({
            fixtureNow,
            quote: invalidQuote as unknown as ManagedEmailDesignQuote,
          });
        },
      ],
      [
        'negative quote quantities or amounts',
        () => {
          const invalidQuote = {
            ...quoteDraft({ lines: [validMailboxLine] }),
            lines: [
              {
                ...validMailboxLine,
                quantity: -1,
                amountCents: -500,
              },
            ],
          };

          return createManagedEmailDesignQuote({
            fixtureNow,
            quote: invalidQuote as unknown as ManagedEmailDesignQuote,
          });
        },
      ],
      [
        'a negative quote unit price',
        () => {
          const invalidQuote = {
            ...quoteDraft({ lines: [validMailboxLine] }),
            lines: [
              {
                ...validMailboxLine,
                unitPriceCents: -500,
                amountCents: -500,
              },
            ],
          };

          return createManagedEmailDesignQuote({
            fixtureNow,
            quote: invalidQuote as unknown as ManagedEmailDesignQuote,
          });
        },
      ],
      [
        'stored quote totals that do not match its lines',
        () => {
          const invalidQuote = {
            ...quoteDraft({ lines: [validMailboxLine] }),
            totals: {
              dueTodayCents: 0,
              monthlyRecurringCents: 0,
              annualRecurringCents: 0,
            },
          };

          return createManagedEmailDesignQuote({
            fixtureNow,
            quote: invalidQuote as unknown as ManagedEmailDesignQuote,
          });
        },
      ],
    ];

    for (const [description, build] of invalidCases) {
      it(`rejects ${description}`, () => {
        expect(build).toThrow();
      });
    }
  });

  it('rejects unsafe integer cents and quantities at public subscription and quote boundaries', () => {
    const unsafeInteger = Number.MAX_SAFE_INTEGER + 1;
    const safeHalf = unsafeInteger / 2;
    const unsafeLineAmount = mailboxQuoteLine({
      id: 'quote-line-unsafe-amount',
      unitPriceCents: 2,
      quantity: safeHalf,
    });
    const unsafeTotalLines = [
      mailboxQuoteLine({
        id: 'quote-line-unsafe-total-a',
        unitPriceCents: 1,
        quantity: safeHalf,
      }),
      mailboxQuoteLine({
        id: 'quote-line-unsafe-total-b',
        unitPriceCents: 1,
        quantity: safeHalf,
      }),
    ];
    const invalidBoundaries: Array<() => unknown> = [
      () =>
        createManagedEmailDesignRecurringSubscription({
          ...managedMailboxSubscription(),
          quantity: unsafeInteger,
        } as ManagedEmailDesignRecurringSubscription),
      () =>
        createManagedEmailDesignRecurringSubscription({
          ...managedMailboxSubscription(),
          unitPriceCents: unsafeInteger,
        } as ManagedEmailDesignRecurringSubscription),
      () =>
        createManagedEmailDesignQuote({
          fixtureNow,
          quote: quoteDraft({
            lines: [
              mailboxQuoteLine({
                id: 'quote-line-unsafe-quantity',
                unitPriceCents: 0,
                quantity: unsafeInteger,
              }),
            ],
          }),
        }),
      () =>
        createManagedEmailDesignQuote({
          fixtureNow,
          quote: quoteDraft({
            lines: [
              mailboxQuoteLine({
                id: 'quote-line-unsafe-unit-price',
                unitPriceCents: unsafeInteger,
                quantity: 0,
              }),
            ],
          }),
        }),
      () =>
        createManagedEmailDesignQuote({
          fixtureNow,
          quote: quoteDraft({ lines: [unsafeLineAmount] }),
        }),
      () =>
        createManagedEmailDesignQuote({
          fixtureNow,
          quote: quoteDraft({ lines: unsafeTotalLines }),
        }),
    ];

    invalidBoundaries.forEach((build) => {
      expect(build).toThrow();
    });
  });

  it('keeps a zero-delta mailbox quote line commercial while every recurring line remains positive', () => {
    const coveredMailboxLine = mailboxQuoteLine({
      id: 'quote-line-covered-mailbox',
      quantity: 0,
    });
    const coveredQuote = quote(
      quoteDraft({
        lines: [coveredMailboxLine],
        totals: {
          dueTodayCents: 0,
          monthlyRecurringCents: 0,
          annualRecurringCents: 0,
        },
      }),
    );

    expect(coveredQuote.lines[0]).toMatchObject({
      product: 'managed-mailbox',
      quantity: 0,
      unitPriceCents: 500,
      amountCents: 0,
    });
    expect(managedMailboxSubscription().quantity).toBeGreaterThan(0);
  });

  it('builds a prewarmed offer from one annual domain and one monthly line per mailbox', () => {
    const bundle = {
      id: 'prewarmed-northstar',
      domain: 'northstar-outreach.com',
      mailboxIdentities: [
        {
          identity: 'Mira Chen',
          address: 'mira@northstar-outreach.com',
        },
        {
          identity: 'Jordan Lee',
          address: 'jordan@northstar-outreach.com',
        },
      ],
    } satisfies ManagedEmailDesignPrewarmedBundle;

    const offer = createManagedEmailDesignPrewarmedOffer({
      bundle,
      fixtureNow,
      expiresAt: fixtureExpiry,
    });

    expect(offer.quote.acceptedQuoteId).toBeNull();
    expect(
      offer.quote.lines.map(
        ({
          product,
          resourceLabel,
          cadence,
          quantity,
          unitPriceCents,
          amountCents,
          renewsAt,
        }) => ({
          product,
          resourceLabel,
          cadence,
          quantity,
          unitPriceCents,
          amountCents,
          renewsAt,
        }),
      ),
    ).toEqual([
      {
        product: 'managed-domain',
        resourceLabel: 'northstar-outreach.com',
        cadence: 'annual',
        quantity: 1,
        unitPriceCents: 1429,
        amountCents: 1429,
        renewsAt: '2028-01-10T12:00:00.000Z',
      },
      {
        product: 'managed-mailbox',
        resourceLabel: 'Mira Chen <mira@northstar-outreach.com>',
        cadence: 'monthly',
        quantity: 1,
        unitPriceCents: 500,
        amountCents: 500,
        renewsAt: '2027-02-10T12:00:00.000Z',
      },
      {
        product: 'managed-mailbox',
        resourceLabel: 'Jordan Lee <jordan@northstar-outreach.com>',
        cadence: 'monthly',
        quantity: 1,
        unitPriceCents: 500,
        amountCents: 500,
        renewsAt: '2027-02-10T12:00:00.000Z',
      },
    ]);
    expect(offer.quote.totals).toEqual({
      dueTodayCents: 2429,
      monthlyRecurringCents: 1000,
      annualRecurringCents: 1429,
    });
    expect(
      offer.subscriptions.map(({ product, cadence, quantity }) => ({
        product,
        cadence,
        quantity,
      })),
    ).toEqual([
      { product: 'managed-domain', cadence: 'annual', quantity: 1 },
      { product: 'managed-mailbox', cadence: 'monthly', quantity: 2 },
    ]);
    expect(offer.subscriptions.map(({ product }) => product)).not.toContain(
      'managed-warmup',
    );
  });

  it('uses canonical snapshot labels for each prewarmed review mailbox', () => {
    const bundle = {
      id: 'prewarmed-review-labels',
      domain: 'northstar-outreach.com',
      mailboxIdentities: [
        {
          identity: 'Mira Chen',
          address: 'MIRA@NORTHSTAR-OUTREACH.COM',
        },
        {
          identity: 'Jordan Lee',
          address: 'jordan@northstar-outreach.com',
        },
      ],
    } satisfies ManagedEmailDesignPrewarmedBundle;
    const review = createPrewarmedBundleReview(bundle);
    const offer = createManagedEmailDesignPrewarmedOffer({
      bundle,
      fixtureNow,
      expiresAt: fixtureExpiry,
    });
    const mailboxReviewLabels = review.lines
      .filter((line) => line.category === 'Mailbox')
      .map((line) => line.resource);
    const mailboxSubscription = offer.subscriptions.find(
      (subscription) => subscription.product === 'managed-mailbox',
    );

    if (mailboxSubscription === undefined) {
      throw new Error('Expected a managed mailbox prewarmed subscription.');
    }

    expect(mailboxReviewLabels).toEqual([
      'Mira Chen <mira@northstar-outreach.com>',
      'Jordan Lee <jordan@northstar-outreach.com>',
    ]);
    expect(
      mailboxSubscription.linkedResources.map((snapshot) => snapshot.label),
    ).toEqual(mailboxReviewLabels);
    expect(review.selectedMailbox).toBe(mailboxReviewLabels.join(', '));
  });

  it('binds each prewarmed offer identity to every quoted commercial term', () => {
    const bundle = {
      id: 'prewarmed-quote-identity',
      domain: 'northstar-outreach.com',
      mailboxIdentities: [
        {
          identity: 'Mira Chen',
          address: 'mira@northstar-outreach.com',
        },
      ],
    } satisfies ManagedEmailDesignPrewarmedBundle;
    const quotedAt = fixtureNow;
    const initialOffer = createManagedEmailDesignPrewarmedOffer({
      bundle,
      fixtureNow: quotedAt,
      expiresAt: fixtureExpiry,
    });
    const repricedOffer = (() => {
      const originalMailboxPrice =
        managedEmailDesignPricing.managedMailboxMonthlyCents;

      try {
        managedEmailDesignPricing.managedMailboxMonthlyCents =
          originalMailboxPrice + 1;
        return createManagedEmailDesignPrewarmedOffer({
          bundle,
          fixtureNow: quotedAt,
          expiresAt: fixtureExpiry,
        });
      } finally {
        managedEmailDesignPricing.managedMailboxMonthlyCents =
          originalMailboxPrice;
      }
    })();
    const variants = [
      {
        offer: createManagedEmailDesignPrewarmedOffer({
          bundle,
          fixtureNow: '2027-01-11T12:00:00.000Z',
          expiresAt: '2027-01-11T12:15:00.000Z',
        }),
        fixtureNow: '2027-01-11T12:00:00.000Z',
      },
      {
        offer: createManagedEmailDesignPrewarmedOffer({
          bundle,
          fixtureNow: quotedAt,
          expiresAt: '2027-01-10T12:20:00.000Z',
        }),
        fixtureNow: quotedAt,
      },
      {
        offer: createManagedEmailDesignPrewarmedOffer({
          bundle: {
            ...bundle,
            domain: 'different-domain.example',
          },
          fixtureNow: quotedAt,
          expiresAt: fixtureExpiry,
        }),
        fixtureNow: quotedAt,
      },
      {
        offer: createManagedEmailDesignPrewarmedOffer({
          bundle: {
            ...bundle,
            mailboxIdentities: [
              ...bundle.mailboxIdentities,
              {
                identity: 'Jordan Lee',
                address: 'jordan@northstar-outreach.com',
              },
            ],
          },
          fixtureNow: quotedAt,
          expiresAt: fixtureExpiry,
        }),
        fixtureNow: quotedAt,
      },
      {
        offer: repricedOffer,
        fixtureNow: quotedAt,
      },
    ];

    expect(
      createManagedEmailDesignPrewarmedOffer({
        bundle,
        fixtureNow: quotedAt,
        expiresAt: fixtureExpiry,
      }).quote.id,
    ).toBe(initialOffer.quote.id);

    for (const { offer, fixtureNow: currentFixtureNow } of variants) {
      expect(offer.quote.id).not.toBe(initialOffer.quote.id);
      expect(
        isManagedEmailDesignQuoteCompletable({
          quote: {
            ...offer.quote,
            acceptedQuoteId: initialOffer.quote.id,
          },
          fixtureNow: currentFixtureNow,
        }),
      ).toBe(false);
    }
  });

  it('clamps generated recurring renewals at month-end and leap-day boundaries', () => {
    const bundle = {
      id: 'prewarmed-calendar-boundary',
      domain: 'northstar-outreach.com',
      mailboxIdentities: [
        {
          identity: 'Mira Chen',
          address: 'mira@northstar-outreach.com',
        },
      ],
    } satisfies ManagedEmailDesignPrewarmedBundle;
    const januaryThirtyFirstOffer = createManagedEmailDesignPrewarmedOffer({
      bundle,
      fixtureNow: '2027-01-31T12:00:00.000Z',
      expiresAt: '2027-01-31T12:15:00.000Z',
    });
    const leapDayOffer = createManagedEmailDesignPrewarmedOffer({
      bundle,
      fixtureNow: '2028-02-29T12:00:00.000Z',
      expiresAt: '2028-02-29T12:15:00.000Z',
    });

    expect(
      januaryThirtyFirstOffer.quote.lines.find(
        (line) => line.product === 'managed-mailbox',
      )?.renewsAt,
    ).toBe('2027-02-28T12:00:00.000Z');
    expect(
      leapDayOffer.quote.lines.find((line) => line.product === 'managed-domain')
        ?.renewsAt,
    ).toBe('2029-02-28T12:00:00.000Z');
  });

  it('uses only injected fixture time to decide whether an accepted quote can complete', () => {
    const accepted = quote(
      quoteDraft({
        id: 'quote-current',
        expiresAt: fixtureExpiry,
        acceptedQuoteId: 'quote-current',
        lines: [domainQuoteLine()],
      }),
    );
    const unaccepted = quote(
      quoteDraft({
        id: 'quote-unaccepted',
        expiresAt: fixtureExpiry,
        acceptedQuoteId: null,
        lines: [domainQuoteLine({ id: 'quote-line-unaccepted' })],
      }),
    );
    const superseded = quote(
      quoteDraft({
        id: 'quote-repriced',
        expiresAt: fixtureExpiry,
        acceptedQuoteId: 'quote-before-reprice',
        lines: [domainQuoteLine({ id: 'quote-line-repriced' })],
      }),
    );
    const repriced = createManagedEmailDesignQuote({
      fixtureNow,
      quote: {
        id: 'quote-price-changed',
        expiresAt: fixtureExpiry,
        acceptedQuoteId: null,
        lines: [domainQuoteLine({ id: 'quote-line-price-changed' })],
        totals: {
          dueTodayCents: 1429,
          monthlyRecurringCents: 0,
          annualRecurringCents: 1429,
        },
        status: 'price-changed',
        previousQuote: {
          id: accepted.id,
          lines: accepted.lines,
          totals: accepted.totals,
        },
      },
    });
    const acceptedReplacement = quote(
      quoteDraft({
        id: 'quote-price-changed',
        expiresAt: fixtureExpiry,
        acceptedQuoteId: 'quote-price-changed',
        lines: [domainQuoteLine({ id: 'quote-line-price-changed' })],
      }),
    );

    expect(
      isManagedEmailDesignQuoteCompletable({
        quote: accepted,
        fixtureNow: '2027-01-10T12:14:59.999Z',
      }),
    ).toBe(true);
    expect(
      isManagedEmailDesignQuoteCompletable({
        quote: accepted,
        fixtureNow: fixtureExpiry,
      }),
    ).toBe(false);
    expect(
      isManagedEmailDesignQuoteCompletable({
        quote: accepted,
        fixtureNow: '2027-01-10T12:15:00.001Z',
      }),
    ).toBe(false);
    expect(
      isManagedEmailDesignQuoteCompletable({
        quote: unaccepted,
        fixtureNow,
      }),
    ).toBe(false);
    expect(
      isManagedEmailDesignQuoteCompletable({
        quote: superseded,
        fixtureNow,
      }),
    ).toBe(false);
    expect(repriced.acceptedQuoteId).toBeNull();
    expect(repriced.previousQuote).toEqual({
      id: accepted.id,
      lines: accepted.lines,
      totals: accepted.totals,
    });
    expect(
      isManagedEmailDesignQuoteCompletable({
        quote: repriced,
        fixtureNow,
      }),
    ).toBe(false);
    expect(
      isManagedEmailDesignQuoteCompletable({
        quote: acceptedReplacement,
        fixtureNow,
      }),
    ).toBe(true);
  });

  it('rejects a price-changed quote that retains its superseded quote id', () => {
    const previousQuote = quote(
      quoteDraft({
        id: 'quote-before-reprice',
        acceptedQuoteId: 'quote-before-reprice',
        lines: [domainQuoteLine()],
      }),
    );
    const repricedLine = domainQuoteLine({
      id: 'quote-line-after-reprice',
      unitPriceCents: 1500,
      amountCents: 1500,
    });

    expect(() =>
      createManagedEmailDesignQuote({
        fixtureNow,
        quote: {
          id: previousQuote.id,
          expiresAt: fixtureExpiry,
          acceptedQuoteId: null,
          lines: [repricedLine],
          totals: totalsFor([repricedLine]),
          status: 'price-changed',
          previousQuote: {
            id: previousQuote.id,
            lines: previousQuote.lines,
            totals: previousQuote.totals,
          },
        },
      }),
    ).toThrow();
  });

  it('retains human-readable resource snapshots after live rows disappear and preserves them through cancellation', () => {
    const subscription = managedMailboxSubscription({
      linkedResources: [
        mailboxSnapshot(
          'snapshot-mailbox-removed',
          'Mira Chen <mira@northstar-outreach.com>',
        ),
      ],
    });
    const removedMailbox = mailbox({
      id: 'mailbox-removed',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'paused',
        operation: {
          status: 'unknown',
          action: 'resume',
          operationId: 'warmup-operation-removed',
          safeDiagnostic: 'The provider did not return a final state.',
        },
      },
    });
    const removedLiveRows: ManagedEmailDesignMailbox[] = [];
    const retainedBeforeCancellation = subscription.linkedResources.map(
      (resource) => ({ ...resource }),
    );
    const providerStateBeforeCancellation = {
      ...removedMailbox.warmupState,
      operation: { ...removedMailbox.warmupState.operation },
    };
    const requested = requestManagedEmailDesignSubscriptionCancellation({
      subscription,
      cancelAt: '2027-02-10T12:00:00.000Z',
    });

    expect(removedLiveRows).toEqual([]);
    expect(requested).toMatchObject({
      status: 'pending-cancel',
      renewsAt: '2027-02-10T12:00:00.000Z',
      cancelAt: '2027-02-10T12:00:00.000Z',
      linkedResources: retainedBeforeCancellation,
    });

    const undone = undoManagedEmailDesignSubscriptionCancellation({
      subscription: requested,
      fixtureNow: '2027-02-01T12:00:00.000Z',
    });
    const canceled = applyManagedEmailDesignSubscriptionCancellation({
      subscription: requested,
      fixtureNow: '2027-02-10T12:00:00.000Z',
    });

    expect(undone).toMatchObject({
      status: 'active',
      renewsAt: '2027-02-10T12:00:00.000Z',
      linkedResources: retainedBeforeCancellation,
    });
    expect(canceled).toMatchObject({
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-02-10T12:00:00.000Z',
      linkedResources: retainedBeforeCancellation,
    });
    expect(subscription).toMatchObject({
      status: 'active',
      linkedResources: retainedBeforeCancellation,
    });
    expect(canceled).not.toHaveProperty('cancelAt');
    expect(canceled).not.toHaveProperty('pendingQuantity');
    expect(removedMailbox.warmupState).toEqual(providerStateBeforeCancellation);
  });

  it('keeps a connected mailbox unlinked and retains only allowlisted operation state', () => {
    const configuredConnectionOperation = {
      status: 'unknown',
      operationId: 'connection-operation-rory',
      configuredOutcome: 'connected',
      safeDiagnostic: 'The provider did not respond.',
    } satisfies ManagedEmailDesignMailboxConnectionOperation;
    const connectedMailbox = createManagedEmailDesignMailbox({
      identity: 'Rory Blake',
      address: 'rory@riveroak.io',
      domain: 'riveroak.io',
      source: 'connected',
      subscriptionId: null,
      readiness: 'ready',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: {
          status: 'unknown',
          action: 'pause',
          operationId: 'warmup-operation-rory',
          safeDiagnostic: 'The provider did not respond.',
          serverPassword: 'not-retained-warmup-password',
          rawProviderPayload: {
            refreshToken: 'not-retained-warmup-refresh-token',
          },
        },
      },
      connection: {
        draft: { address: 'rory@riveroak.io' },
        capabilities: ['imap', 'smtp'],
        operation: {
          ...configuredConnectionOperation,
          password: 'not-retained-connection-password',
          rawProviderPayload: {
            accessToken: 'not-retained-connection-access-token',
          },
        },
      },
      password: 'not-retained-password',
      accessToken: 'not-retained-token',
      rawProviderPayload: { refreshToken: 'not-retained-refresh-token' },
    } as unknown as Parameters<typeof createManagedEmailDesignMailbox>[0]);

    expect(connectedMailbox.subscriptionId).toBeNull();
    expect(connectedMailbox.connection).toEqual({
      draft: { address: 'rory@riveroak.io' },
      capabilities: ['imap', 'smtp'],
      operation: configuredConnectionOperation,
    });
    expect(connectedMailbox.warmupState).toEqual({
      assignment: 'assigned',
      lastConfirmedProviderState: 'warming',
      operation: {
        status: 'unknown',
        action: 'pause',
        operationId: 'warmup-operation-rory',
        safeDiagnostic: 'The provider did not respond.',
      },
    });
    expect(JSON.stringify(connectedMailbox)).not.toContain(
      'not-retained-password',
    );
    expect(JSON.stringify(connectedMailbox)).not.toContain(
      'not-retained-token',
    );
    expect(JSON.stringify(connectedMailbox)).not.toContain(
      'not-retained-refresh-token',
    );
    expect(JSON.stringify(connectedMailbox)).not.toContain(
      'not-retained-connection-password',
    );
    expect(JSON.stringify(connectedMailbox)).not.toContain(
      'not-retained-connection-access-token',
    );
    expect(JSON.stringify(connectedMailbox)).not.toContain(
      'not-retained-warmup-password',
    );
    expect(JSON.stringify(connectedMailbox)).not.toContain(
      'not-retained-warmup-refresh-token',
    );
  });

  it('keeps DNS row truth separate from static check-operation shape', () => {
    const records: ManagedEmailDesignDnsRecord[] = managedEmailDesignDnsRecords;
    const checkOperations = [
      { status: 'idle' },
      { status: 'checking', operationId: 'dns-check-checking' },
      { status: 'completed', operationId: 'dns-check-completed' },
      {
        status: 'check-failed',
        operationId: 'dns-check-failed',
        safeDiagnostic: 'The DNS provider timed out.',
      },
      {
        status: 'unknown',
        operationId: 'dns-check-unknown',
        safeDiagnostic: 'The DNS provider returned an unknown response.',
      },
    ] satisfies ManagedEmailDesignDnsCheckOperation[];
    const allowedRecordStatuses = new Set([
      'pending',
      'verified',
      'action-required',
    ]);

    expect(records).not.toHaveLength(0);
    expect(new Set(records.map(({ id }) => id)).size).toBe(records.length);
    expect(records.every(({ id }) => id.length > 0)).toBe(true);
    expect(
      records.every(({ status }) => allowedRecordStatuses.has(status)),
    ).toBe(true);
    expect(checkOperations).toEqual([
      { status: 'idle' },
      { status: 'checking', operationId: 'dns-check-checking' },
      { status: 'completed', operationId: 'dns-check-completed' },
      {
        status: 'check-failed',
        operationId: 'dns-check-failed',
        safeDiagnostic: 'The DNS provider timed out.',
      },
      {
        status: 'unknown',
        operationId: 'dns-check-unknown',
        safeDiagnostic: 'The DNS provider returned an unknown response.',
      },
    ]);
  });

  it('counts only live managed and prewarmed mailboxes against the current pooled mailbox line', () => {
    const current = managedMailboxSubscription({ quantity: 3 });
    const liveMailboxes = [
      mailbox({ id: 'mailbox-managed', source: 'managed' }),
      mailbox({
        id: 'mailbox-prewarmed',
        source: 'prewarmed',
        address: 'jordan@northstar-outreach.com',
      }),
      mailbox({
        id: 'mailbox-connected',
        source: 'connected',
        subscriptionId: null,
        address: 'rory@riveroak.io',
      }),
    ];

    expect(
      getManagedEmailDesignMailboxPoolCapacity({
        subscription: current,
        mailboxes: liveMailboxes,
      }),
    ).toEqual({
      liveMailboxCount: 2,
      effectiveQuantity: 3,
      availableCapacity: 1,
    });

    const scheduled = scheduleManagedEmailDesignSubscriptionQuantityChange({
      subscription: current,
      quantity: 2,
      effectiveAt: '2027-02-10T12:00:00.000Z',
      mailboxes: liveMailboxes,
    });

    expect(scheduled).toMatchObject({
      status: 'scheduled',
      subscription: {
        status: 'pending-change',
        quantity: 3,
        pendingQuantity: 2,
        changeEffectiveAt: '2027-02-10T12:00:00.000Z',
      },
    });
    if (scheduled.status !== 'scheduled') {
      throw new Error('Expected a schedulable mailbox reduction');
    }
    expect(
      getManagedEmailDesignMailboxPoolCapacity({
        subscription: scheduled.subscription,
        mailboxes: liveMailboxes,
      }),
    ).toEqual({
      liveMailboxCount: 2,
      effectiveQuantity: 2,
      availableCapacity: 0,
    });

    const applied = applyManagedEmailDesignSubscriptionQuantityChange({
      subscription: scheduled.subscription,
      fixtureNow: '2027-02-10T12:00:00.000Z',
    });

    expect(applied).toMatchObject({
      status: 'active',
      quantity: 2,
      linkedResources: current.linkedResources,
    });
    expect(liveMailboxes.map(({ id }) => id)).toEqual([
      'mailbox-managed',
      'mailbox-prewarmed',
      'mailbox-connected',
    ]);
  });

  it('blocks a mailbox reduction below the live pooled count without changing resources', () => {
    const liveMailboxes = [
      mailbox({ id: 'mailbox-managed', source: 'managed' }),
      mailbox({
        id: 'mailbox-prewarmed',
        source: 'prewarmed',
        address: 'jordan@northstar-outreach.com',
      }),
    ];

    expect(
      scheduleManagedEmailDesignSubscriptionQuantityChange({
        subscription: managedMailboxSubscription({ quantity: 2 }),
        quantity: 1,
        effectiveAt: '2027-02-10T12:00:00.000Z',
        mailboxes: liveMailboxes,
      }),
    ).toEqual({
      status: 'blocked',
      reason: 'mailbox-quantity-below-live-mailbox-count',
    });
    expect(liveMailboxes.map(({ id }) => id)).toEqual([
      'mailbox-managed',
      'mailbox-prewarmed',
    ]);
  });

  it('keeps readiness independent from warmup assignment and counts assignment only', () => {
    const readyWithoutWarmup = mailbox({
      id: 'mailbox-ready-without-warmup',
      source: 'prewarmed',
      readiness: 'ready',
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
    });
    const assignedMailboxes = [
      readyWithoutWarmup,
      mailbox({
        id: 'mailbox-assigned-pending-start',
        source: 'connected',
        subscriptionId: null,
        readiness: 'not-ready',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'inactive',
          operation: {
            status: 'pending',
            action: 'start',
            operationId: 'warmup-operation-start',
          },
        },
      }),
      mailbox({
        id: 'mailbox-assigned-paused',
        readiness: 'ready',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'paused',
          operation: {
            status: 'unknown',
            action: 'resume',
            operationId: 'warmup-operation-resume',
            safeDiagnostic: 'The provider did not return a final state.',
          },
        },
      }),
    ];

    expect(readyWithoutWarmup.readiness).toBe('ready');
    expect(readyWithoutWarmup.warmupState.assignment).toBe('unassigned');
    expect(getManagedEmailDesignAssignedWarmupCount(assignedMailboxes)).toBe(2);
    expect(
      getManagedEmailDesignAvailableWarmupCount({
        subscriptions: [managedWarmupSubscription({ quantity: 3 })],
        mailboxes: assignedMailboxes,
      }),
    ).toBe(1);
  });

  it('releases warmup capacity only after confirmed stop while preserving readiness', () => {
    const pendingStop = mailbox({
      id: 'mailbox-pending-stop',
      readiness: 'ready',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: {
          status: 'pending',
          action: 'stop',
          operationId: 'warmup-pending-stop',
        },
      },
    });
    const failedStop = mailbox({
      id: 'mailbox-failed-stop',
      address: 'failed-stop@northstar-outreach.com',
      readiness: 'ready',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: {
          status: 'failed',
          action: 'stop',
          operationId: 'warmup-failed-stop',
        },
      },
    });
    const unknownStop = mailbox({
      id: 'mailbox-unknown-stop',
      address: 'unknown-stop@northstar-outreach.com',
      readiness: 'ready',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'paused',
        operation: {
          status: 'unknown',
          action: 'stop',
          operationId: 'warmup-unknown-stop',
        },
      },
    });
    const confirmedStop = mailbox({
      id: 'mailbox-confirmed-stop',
      address: 'confirmed-stop@northstar-outreach.com',
      readiness: 'ready',
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
    });
    const subscription = managedWarmupSubscription({ quantity: 3 });

    expect(
      getManagedEmailDesignAssignedWarmupCount([
        pendingStop,
        failedStop,
        unknownStop,
      ]),
    ).toBe(3);
    expect(
      getManagedEmailDesignAvailableWarmupCount({
        subscriptions: [subscription],
        mailboxes: [pendingStop, failedStop, unknownStop],
      }),
    ).toBe(0);
    expect(getManagedEmailDesignAssignedWarmupCount([confirmedStop])).toBe(0);
    expect(
      getManagedEmailDesignAvailableWarmupCount({
        subscriptions: [subscription],
        mailboxes: [confirmedStop],
      }),
    ).toBe(3);
    expect([
      pendingStop.readiness,
      failedStop.readiness,
      unknownStop.readiness,
      confirmedStop.readiness,
    ]).toEqual(['ready', 'ready', 'ready', 'ready']);
  });

  it('accepts only the closed warmup assignment, provider-state, and operation matrix', () => {
    const supportedStates: ManagedEmailDesignMailbox['warmupState'][] = [
      {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'idle' },
      },
      {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: {
          status: 'failed',
          action: 'start',
          operationId: 'warmup-failed-start',
        },
      },
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'inactive',
        operation: {
          status: 'pending',
          action: 'start',
          operationId: 'warmup-pending-start',
        },
      },
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'inactive',
        operation: {
          status: 'unknown',
          action: 'start',
          operationId: 'warmup-unknown-start',
        },
      },
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: { status: 'idle' },
      },
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: {
          status: 'failed',
          action: 'pause',
          operationId: 'warmup-failed-pause',
        },
      },
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: {
          status: 'unknown',
          action: 'stop',
          operationId: 'warmup-unknown-stop',
        },
      },
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'paused',
        operation: { status: 'idle' },
      },
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'paused',
        operation: {
          status: 'pending',
          action: 'resume',
          operationId: 'warmup-pending-resume',
        },
      },
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'paused',
        operation: {
          status: 'failed',
          action: 'stop',
          operationId: 'warmup-failed-stop',
        },
      },
    ];

    supportedStates.forEach((warmupState, index) => {
      expect(() =>
        createManagedEmailDesignMailbox({
          id: `mailbox-supported-${index}`,
          identity: `Supported ${index}`,
          address: `supported-${index}@northstar-outreach.com`,
          domain: 'northstar-outreach.com',
          source: 'managed',
          warmupState,
        }),
      ).not.toThrow();
    });

    const unsupportedStates: ManagedEmailDesignMailbox['warmupState'][] = [
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'inactive',
        operation: {
          status: 'failed',
          action: 'start',
          operationId: 'invalid',
        },
      },
      {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: {
          status: 'pending',
          action: 'start',
          operationId: 'invalid',
        },
      },
      {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: {
          status: 'unknown',
          action: 'start',
          operationId: 'invalid',
        },
      },
    ];

    unsupportedStates.forEach((warmupState) => {
      expect(() =>
        createManagedEmailDesignMailbox({
          identity: 'Unsupported state',
          address: 'unsupported@northstar-outreach.com',
          domain: 'northstar-outreach.com',
          source: 'managed',
          warmupState,
        }),
      ).toThrow(
        'Warmup assignment, confirmed provider state, and operation do not form a supported lifecycle state.',
      );
    });
  });

  it('keeps every assigned unresolved warmup action in capacity until a known start failure rolls back', () => {
    const unresolvedStates = [
      {
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'pending', action: 'start' },
      },
      {
        lastConfirmedProviderState: 'warming',
        operation: { status: 'pending', action: 'pause' },
      },
      {
        lastConfirmedProviderState: 'paused',
        operation: { status: 'pending', action: 'resume' },
      },
      {
        lastConfirmedProviderState: 'warming',
        operation: { status: 'pending', action: 'stop' },
      },
      {
        lastConfirmedProviderState: 'warming',
        operation: { status: 'failed', action: 'pause' },
      },
      {
        lastConfirmedProviderState: 'paused',
        operation: { status: 'failed', action: 'resume' },
      },
      {
        lastConfirmedProviderState: 'warming',
        operation: { status: 'failed', action: 'stop' },
      },
      {
        lastConfirmedProviderState: 'inactive',
        operation: { status: 'unknown', action: 'start' },
      },
      {
        lastConfirmedProviderState: 'warming',
        operation: { status: 'unknown', action: 'pause' },
      },
      {
        lastConfirmedProviderState: 'paused',
        operation: { status: 'unknown', action: 'resume' },
      },
      {
        lastConfirmedProviderState: 'warming',
        operation: { status: 'unknown', action: 'stop' },
      },
    ] as const;
    const unresolvedMailboxes = unresolvedStates.map(
      ({ lastConfirmedProviderState, operation }, index) =>
        createManagedEmailDesignMailbox({
          identity: `Mailbox ${index}`,
          address: `mailbox-${index}@northstar-outreach.com`,
          domain: 'northstar-outreach.com',
          source: 'managed',
          subscriptionId: 'subscription-managed-mailbox',
          readiness: 'not-ready',
          warmupState: {
            assignment: 'assigned',
            lastConfirmedProviderState,
            operation: {
              ...operation,
              operationId: `warmup-operation-${index}`,
              ...(operation.status === 'failed' ||
              operation.status === 'unknown'
                ? { safeDiagnostic: 'A safe provider diagnostic.' }
                : {}),
            },
          },
        }),
    );
    const failedStart = createManagedEmailDesignMailbox({
      identity: 'Failed Start',
      address: 'failed-start@northstar-outreach.com',
      domain: 'northstar-outreach.com',
      source: 'managed',
      subscriptionId: 'subscription-managed-mailbox',
      readiness: 'not-ready',
      warmupState: {
        assignment: 'unassigned',
        lastConfirmedProviderState: 'inactive',
        operation: {
          status: 'failed',
          action: 'start',
          operationId: 'warmup-operation-failed-start',
          safeDiagnostic: 'The provider rejected the warmup start.',
        },
      },
    });

    expect(getManagedEmailDesignAssignedWarmupCount(unresolvedMailboxes)).toBe(
      unresolvedStates.length,
    );
    expect(failedStart.warmupState).toMatchObject({
      assignment: 'unassigned',
      operation: {
        status: 'failed',
        action: 'start',
        operationId: 'warmup-operation-failed-start',
      },
    });
  });

  it('blocks warmup reductions below assigned capacity with a deterministic reason', () => {
    const assignedMailboxes = [
      mailbox({
        id: 'mailbox-assigned-one',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      mailbox({
        id: 'mailbox-assigned-two',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'paused',
          operation: { status: 'idle' },
        },
      }),
    ];

    expect(
      scheduleManagedEmailDesignSubscriptionQuantityChange({
        subscription: managedWarmupSubscription({ quantity: 2 }),
        quantity: 1,
        effectiveAt: '2027-02-10T12:00:00.000Z',
        mailboxes: assignedMailboxes,
      }),
    ).toEqual({
      status: 'blocked',
      reason: 'warmup-quantity-below-assigned-mailbox-count',
    });
  });

  it('resolves managed-mailbox acquisition against pooled spare capacity before charging more', () => {
    const current = managedMailboxSubscription({
      id: 'subscription-managed-mailbox',
      quantity: 3,
      linkedResources: [
        mailboxSnapshot('snapshot-mailbox-current-mira'),
        mailboxSnapshot(
          'snapshot-mailbox-current-jordan',
          'Jordan Lee <jordan@northstar-outreach.com>',
        ),
      ],
    });
    const liveMailboxes = [
      mailbox({ id: 'mailbox-current-mira' }),
      mailbox({
        id: 'mailbox-current-jordan',
        source: 'prewarmed',
        address: 'jordan@northstar-outreach.com',
      }),
    ];
    const coveredMailbox = mailbox({
      id: 'mailbox-new-covered',
      identity: 'Rowan Cole',
      address: 'rowan@northstar-outreach.com',
      subscriptionId: null,
    });
    const uncoveredMailbox = mailbox({
      id: 'mailbox-new-uncovered',
      identity: 'Avery Miles',
      address: 'avery@northstar-outreach.com',
      subscriptionId: null,
    });

    const covered = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [current],
      mailboxes: liveMailboxes,
      selectedMailboxes: [coveredMailbox],
      targetSubscriptionId: current.id,
      fixtureNow,
    });
    const incremented = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [current],
      mailboxes: liveMailboxes,
      selectedMailboxes: [coveredMailbox, uncoveredMailbox],
      targetSubscriptionId: current.id,
      fixtureNow,
    });

    expect(covered).toMatchObject({
      status: 'ready',
      intent: {
        product: 'managed-mailbox',
        mode: 'attach-existing-capacity',
        targetSubscriptionId: current.id,
        quantityDelta: 0,
        resourceSnapshotIds: [coveredMailbox.id],
      },
      quote: {
        lines: [
          {
            product: 'managed-mailbox',
            quantity: 0,
            amountCents: 0,
          },
        ],
      },
    });
    expect(incremented).toMatchObject({
      status: 'ready',
      intent: {
        product: 'managed-mailbox',
        mode: 'increment-existing',
        targetSubscriptionId: current.id,
        quantityDelta: 1,
        resourceSnapshotIds: [coveredMailbox.id, uncoveredMailbox.id],
      },
      quote: {
        lines: [
          {
            product: 'managed-mailbox',
            quantity: 1,
            amountCents: 500,
          },
        ],
      },
    });
  });

  it('rejects multiple current managed-mailbox pools even when one target matches', () => {
    const targetSubscriptionId = 'subscription-mailbox-target-pool';
    const unrelatedSubscriptionId = 'subscription-mailbox-unrelated-pool';
    const targetMailbox = mailbox({
      id: 'mailbox-target-pool-existing',
      identity: 'Target Owner',
      address: 'target@northstar-outreach.com',
      subscriptionId: targetSubscriptionId,
    });
    const unrelatedMailbox = mailbox({
      id: 'mailbox-unrelated-pool-existing',
      identity: 'Unrelated Owner',
      address: 'unrelated@northstar-outreach.com',
      subscriptionId: unrelatedSubscriptionId,
    });
    const selectedMailbox = mailbox({
      id: 'mailbox-target-pool-selected',
      identity: 'Selected Owner',
      address: 'selected@northstar-outreach.com',
      subscriptionId: null,
    });
    const targetSubscription = managedMailboxSubscription({
      id: targetSubscriptionId,
      quantity: 2,
      linkedResources: [
        mailboxSnapshot(
          targetMailbox.id,
          `${targetMailbox.identity} <${targetMailbox.address}>`,
        ),
      ],
    });
    const unrelatedSubscription = managedMailboxSubscription({
      id: unrelatedSubscriptionId,
      quantity: 1,
      linkedResources: [
        mailboxSnapshot(
          unrelatedMailbox.id,
          `${unrelatedMailbox.identity} <${unrelatedMailbox.address}>`,
        ),
      ],
    });

    expect(() =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [targetSubscription, unrelatedSubscription],
        mailboxes: [targetMailbox, unrelatedMailbox],
        selectedMailboxes: [selectedMailbox],
        targetSubscriptionId,
        fixtureNow,
      }),
    ).toThrow('Expected at most one current managed-mailbox pool.');
  });

  it('rejects a mailbox already linked to the active pool before review', () => {
    const activeSubscriptionId = 'subscription-mailbox-already-linked';
    const selectedMailbox = mailbox({
      id: 'mailbox-already-linked',
      subscriptionId: activeSubscriptionId,
    });
    const current = managedMailboxSubscription({
      id: activeSubscriptionId,
      quantity: 1,
      linkedResources: [
        mailboxSnapshot(
          selectedMailbox.id,
          `${selectedMailbox.identity} <${selectedMailbox.address}>`,
        ),
      ],
    });

    expect(() =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [current],
        mailboxes: [selectedMailbox],
        selectedMailboxes: [selectedMailbox],
        targetSubscriptionId: current.id,
        fixtureNow,
      }),
    ).toThrow();
  });

  it('binds mailbox capacity acceptance to exact commercial terms and a stable request identity', () => {
    const current = managedMailboxSubscription({
      id: 'subscription-managed-mailbox-commercial-boundary',
      quantity: 2,
      linkedResources: [
        mailboxSnapshot('snapshot-mailbox-commercial-mira'),
        mailboxSnapshot(
          'snapshot-mailbox-commercial-jordan',
          'Jordan Lee <jordan@northstar-outreach.com>',
        ),
      ],
    });
    const liveMailboxes = [
      mailbox({ id: 'mailbox-commercial-mira' }),
      mailbox({
        id: 'mailbox-commercial-jordan',
        address: 'jordan@northstar-outreach.com',
      }),
    ];
    const firstSelection = mailbox({
      id: 'mailbox-commercial-first',
      identity: 'Avery Miles',
      address: 'avery@northstar-outreach.com',
      subscriptionId: null,
    });
    const secondSelection = mailbox({
      id: 'mailbox-commercial-second',
      identity: 'Rowan Cole',
      address: 'rowan@northstar-outreach.com',
      subscriptionId: null,
    });
    const firstReview = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [current],
      mailboxes: liveMailboxes,
      selectedMailboxes: [firstSelection],
      targetSubscriptionId: current.id,
      fixtureNow,
    });
    const repeatedFirstReview = resolveManagedEmailDesignMailboxPoolAcquisition(
      {
        workspaceId,
        subscriptions: [current],
        mailboxes: liveMailboxes,
        selectedMailboxes: [firstSelection],
        targetSubscriptionId: current.id,
        fixtureNow,
      },
    );

    if (!firstReview.quote || !repeatedFirstReview.quote) {
      throw new Error('Expected a mailbox capacity review quote');
    }
    const firstReviewQuote = firstReview.quote;
    const repeatedFirstReviewQuote = repeatedFirstReview.quote;
    const firstLine = firstReviewQuote.lines[0];
    const wrongTermsLine: ManagedEmailDesignQuoteLine = {
      ...firstLine,
      unitPriceCents: 999,
      amountCents: 999 * firstLine.quantity,
    };
    const wrongTermsQuote = quote({
      ...firstReviewQuote,
      acceptedQuoteId: firstReviewQuote.id,
      lines: [wrongTermsLine],
      totals: totalsFor([wrongTermsLine]),
    });

    expect(repeatedFirstReviewQuote.id).toBe(firstReviewQuote.id);
    expect(() =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [current],
        mailboxes: liveMailboxes,
        selectedMailboxes: [firstSelection],
        targetSubscriptionId: current.id,
        fixtureNow,
        quote: wrongTermsQuote,
      }),
    ).toThrow();

    const acceptedFirstReview = quote({
      ...firstReviewQuote,
      acceptedQuoteId: firstReviewQuote.id,
    });
    const materialized = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [current],
      mailboxes: liveMailboxes,
      selectedMailboxes: [firstSelection],
      targetSubscriptionId: current.id,
      fixtureNow,
      quote: acceptedFirstReview,
    });
    if (!materialized.subscription) {
      throw new Error('Expected the accepted mailbox review to materialize');
    }
    const materializedSubscription = materialized.subscription;
    const sameRequestRetry = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [materializedSubscription],
      mailboxes: [...liveMailboxes, firstSelection],
      selectedMailboxes: [firstSelection],
      targetSubscriptionId: current.id,
      fixtureNow,
      quote: acceptedFirstReview,
    });
    const secondReview = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [materializedSubscription],
      mailboxes: [...liveMailboxes, firstSelection],
      selectedMailboxes: [secondSelection],
      targetSubscriptionId: current.id,
      fixtureNow,
    });

    if (!sameRequestRetry.subscription || !secondReview.quote) {
      throw new Error('Expected retry evidence and a second mailbox review');
    }
    expect(sameRequestRetry.subscription).toEqual(materializedSubscription);
    expect(secondReview.quote.id).not.toBe(acceptedFirstReview.id);
    expect(() =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [materializedSubscription],
        mailboxes: [...liveMailboxes, firstSelection],
        selectedMailboxes: [secondSelection],
        targetSubscriptionId: current.id,
        fixtureNow,
        quote: acceptedFirstReview,
      }),
    ).toThrow();
  });

  it('derives capacity quote identity from every commercial term while preserving exact repeats', () => {
    const targetSubscriptionId = 'subscription-mailbox-quote-identity';
    const currentSubscription = managedMailboxSubscription({
      id: targetSubscriptionId,
      quantity: 3,
      unitPriceCents: 500,
      linkedResources: [
        mailboxSnapshot('snapshot-mailbox-quote-identity-existing'),
      ],
    });
    const existingMailboxes = [
      mailbox({
        id: 'mailbox-quote-identity-existing-one',
        subscriptionId: targetSubscriptionId,
      }),
      mailbox({
        id: 'mailbox-quote-identity-existing-two',
        identity: 'Jordan Lee',
        address: 'jordan@northstar-outreach.com',
        subscriptionId: targetSubscriptionId,
      }),
    ];
    const firstSelection = mailbox({
      id: 'mailbox-quote-identity-first',
      identity: 'Avery Miles',
      address: 'avery@northstar-outreach.com',
      subscriptionId: null,
    });
    const secondSelection = mailbox({
      id: 'mailbox-quote-identity-second',
      identity: 'Rowan Cole',
      address: 'rowan@northstar-outreach.com',
      subscriptionId: null,
    });
    const resolveMailboxCapacityReview = ({
      subscriptions,
      mailboxes,
      selectedMailboxes,
      quote: acceptedQuote,
    }: {
      subscriptions: ManagedEmailDesignRecurringSubscription[];
      mailboxes: ManagedEmailDesignMailbox[];
      selectedMailboxes: ManagedEmailDesignMailbox[];
      quote?: ManagedEmailDesignQuote;
    }) =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions,
        mailboxes,
        selectedMailboxes,
        targetSubscriptionId,
        fixtureNow,
        quote: acceptedQuote,
      });
    const baselineArgs = {
      subscriptions: [currentSubscription],
      mailboxes: existingMailboxes,
      selectedMailboxes: [firstSelection, secondSelection],
    };
    const baselineReview = resolveMailboxCapacityReview(baselineArgs);
    const exactRepeatReview = resolveMailboxCapacityReview(baselineArgs);
    const repricedReview = resolveMailboxCapacityReview({
      subscriptions: [
        managedMailboxSubscription({
          id: targetSubscriptionId,
          quantity: 3,
          unitPriceCents: 750,
          linkedResources: currentSubscription.linkedResources,
        }),
      ],
      mailboxes: existingMailboxes,
      selectedMailboxes: [firstSelection, secondSelection],
    });
    const capacityChangedReview = resolveMailboxCapacityReview({
      subscriptions: [currentSubscription],
      mailboxes: [existingMailboxes[0] as ManagedEmailDesignMailbox],
      selectedMailboxes: [firstSelection, secondSelection],
    });
    const relabeledSelection = mailbox({
      id: firstSelection.id,
      identity: 'Avery Miles Updated',
      address: firstSelection.address,
      subscriptionId: null,
    });
    const relabeledReview = resolveMailboxCapacityReview({
      subscriptions: [currentSubscription],
      mailboxes: existingMailboxes,
      selectedMailboxes: [relabeledSelection, secondSelection],
    });
    const reorderedReview = resolveMailboxCapacityReview({
      subscriptions: [currentSubscription],
      mailboxes: existingMailboxes,
      selectedMailboxes: [secondSelection, firstSelection],
    });

    if (
      !baselineReview.quote ||
      !exactRepeatReview.quote ||
      !repricedReview.quote ||
      !capacityChangedReview.quote ||
      !relabeledReview.quote ||
      !reorderedReview.quote
    ) {
      throw new Error('Expected capacity quote reviews.');
    }

    const baselineQuote = baselineReview.quote;
    const repricedQuote = repricedReview.quote;
    const capacityChangedQuote = capacityChangedReview.quote;
    const relabeledQuote = relabeledReview.quote;
    const reorderedQuote = reorderedReview.quote;
    const acceptedBaselineQuote = quote({
      ...baselineQuote,
      acceptedQuoteId: baselineQuote.id,
    });
    const changedCases = [
      {
        args: {
          subscriptions: [
            managedMailboxSubscription({
              id: targetSubscriptionId,
              quantity: 3,
              unitPriceCents: 750,
              linkedResources: currentSubscription.linkedResources,
            }),
          ],
          mailboxes: existingMailboxes,
          selectedMailboxes: [firstSelection, secondSelection],
        },
        quote: repricedQuote,
      },
      {
        args: {
          subscriptions: [currentSubscription],
          mailboxes: [existingMailboxes[0] as ManagedEmailDesignMailbox],
          selectedMailboxes: [firstSelection, secondSelection],
        },
        quote: capacityChangedQuote,
      },
      {
        args: {
          subscriptions: [currentSubscription],
          mailboxes: existingMailboxes,
          selectedMailboxes: [relabeledSelection, secondSelection],
        },
        quote: relabeledQuote,
      },
      {
        args: {
          subscriptions: [currentSubscription],
          mailboxes: existingMailboxes,
          selectedMailboxes: [secondSelection, firstSelection],
        },
        quote: reorderedQuote,
      },
    ];

    expect(exactRepeatReview.quote).toEqual(baselineQuote);
    expect(exactRepeatReview.quote.id).toBe(baselineQuote.id);
    expect(repricedQuote).toMatchObject({
      lines: [{ unitPriceCents: 750, amountCents: 750 }],
      totals: { dueTodayCents: 750, monthlyRecurringCents: 750 },
    });
    expect(capacityChangedQuote).toMatchObject({
      lines: [{ quantity: 0, amountCents: 0 }],
      totals: { dueTodayCents: 0, monthlyRecurringCents: 0 },
    });
    expect(relabeledQuote.lines[0]?.resourceLabel).not.toBe(
      baselineQuote.lines[0]?.resourceLabel,
    );
    expect(reorderedQuote.lines[0]?.resourceLabel).not.toBe(
      baselineQuote.lines[0]?.resourceLabel,
    );

    for (const changedCase of changedCases) {
      expect(changedCase.quote.id).not.toBe(baselineQuote.id);
      expect(() =>
        resolveMailboxCapacityReview({
          ...changedCase.args,
          quote: acceptedBaselineQuote,
        }),
      ).toThrow();
    }
  });

  it('changes warmup quote identity when price or assigned-resource order changes', () => {
    const targetSubscriptionId = 'subscription-warmup-quote-identity';
    const currentSubscription = managedWarmupSubscription({
      id: targetSubscriptionId,
      quantity: 2,
      unitPriceCents: 299,
      linkedResources: [
        warmupCapacitySnapshot('snapshot-warmup-quote-identity-one'),
        warmupCapacitySnapshot('snapshot-warmup-quote-identity-two'),
      ],
    });
    const firstAssignedMailbox = mailbox({
      id: 'mailbox-warmup-quote-identity-first',
      address: 'avery@northstar-outreach.com',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: { status: 'idle' },
      },
    });
    const secondAssignedMailbox = mailbox({
      id: 'mailbox-warmup-quote-identity-second',
      identity: 'Rowan Cole',
      address: 'rowan@northstar-outreach.com',
      warmupState: {
        assignment: 'assigned',
        lastConfirmedProviderState: 'warming',
        operation: { status: 'idle' },
      },
    });
    const resolveWarmupCapacityReview = ({
      subscriptions,
      mailboxes,
      quote: acceptedQuote,
    }: {
      subscriptions: ManagedEmailDesignRecurringSubscription[];
      mailboxes: ManagedEmailDesignMailbox[];
      quote?: ManagedEmailDesignQuote;
    }) =>
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId,
        subscriptions,
        mailboxes,
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow,
        quote: acceptedQuote,
      });
    const baselineArgs = {
      subscriptions: [currentSubscription],
      mailboxes: [firstAssignedMailbox, secondAssignedMailbox],
    };
    const baselineReview = resolveWarmupCapacityReview(baselineArgs);
    const exactRepeatReview = resolveWarmupCapacityReview(baselineArgs);
    const repricedReview = resolveWarmupCapacityReview({
      subscriptions: [
        managedWarmupSubscription({
          id: targetSubscriptionId,
          quantity: 2,
          unitPriceCents: 399,
          linkedResources: currentSubscription.linkedResources,
        }),
      ],
      mailboxes: [firstAssignedMailbox, secondAssignedMailbox],
    });
    const reorderedReview = resolveWarmupCapacityReview({
      subscriptions: [currentSubscription],
      mailboxes: [secondAssignedMailbox, firstAssignedMailbox],
    });

    if (
      !baselineReview.quote ||
      !exactRepeatReview.quote ||
      !repricedReview.quote ||
      !reorderedReview.quote
    ) {
      throw new Error('Expected warmup capacity quote reviews.');
    }

    const baselineQuote = baselineReview.quote;
    const acceptedBaselineQuote = quote({
      ...baselineQuote,
      acceptedQuoteId: baselineQuote.id,
    });
    expect(exactRepeatReview.quote.id).toBe(baselineQuote.id);

    expect(exactRepeatReview.quote).toEqual(baselineQuote);
    expect(repricedReview.quote).toMatchObject({
      lines: [{ unitPriceCents: 399, amountCents: 399 }],
      totals: { dueTodayCents: 399, monthlyRecurringCents: 399 },
    });
    expect(reorderedReview.quote.lines[0]?.resourceLabel).not.toBe(
      baselineQuote.lines[0]?.resourceLabel,
    );

    for (const changedReview of [repricedReview, reorderedReview]) {
      expect(changedReview.quote.id).not.toBe(baselineQuote.id);
    }
    expect(() =>
      resolveWarmupCapacityReview({
        subscriptions: [
          managedWarmupSubscription({
            id: targetSubscriptionId,
            quantity: 2,
            unitPriceCents: 399,
            linkedResources: currentSubscription.linkedResources,
          }),
        ],
        mailboxes: [firstAssignedMailbox, secondAssignedMailbox],
        quote: acceptedBaselineQuote,
      }),
    ).toThrow();
    expect(() =>
      resolveWarmupCapacityReview({
        subscriptions: [currentSubscription],
        mailboxes: [secondAssignedMailbox, firstAssignedMailbox],
        quote: acceptedBaselineQuote,
      }),
    ).toThrow();
  });

  it('keeps capacity-request and quote identities distinct for ambiguous delimiter tuples', () => {
    const targetSubscriptionId = 'subscription-capacity-tuple';
    const firstSelectedMailboxes = [
      mailbox({
        id: 'a',
        identity: 'First',
        address: 'first@northstar-outreach.com',
        subscriptionId: null,
      }),
      mailbox({
        id: 'b--c',
        identity: 'Second',
        address: 'second@northstar-outreach.com',
        subscriptionId: null,
      }),
    ];
    const secondSelectedMailboxes = [
      mailbox({
        id: 'a--b',
        identity: 'First',
        address: 'first@northstar-outreach.com',
        subscriptionId: null,
      }),
      mailbox({
        id: 'c',
        identity: 'Second',
        address: 'second@northstar-outreach.com',
        subscriptionId: null,
      }),
    ];
    const resolveMailboxTupleReview = (
      selectedMailboxes: ManagedEmailDesignMailbox[],
    ) =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [],
        mailboxes: [],
        selectedMailboxes,
        targetSubscriptionId,
        fixtureNow,
      });
    const firstMailboxReview = resolveMailboxTupleReview(
      firstSelectedMailboxes,
    );
    const exactRepeatReview = resolveMailboxTupleReview(firstSelectedMailboxes);
    const secondMailboxReview = resolveMailboxTupleReview(
      secondSelectedMailboxes,
    );
    if (
      !firstMailboxReview.quote ||
      !exactRepeatReview.quote ||
      !secondMailboxReview.quote
    ) {
      throw new Error('Expected capacity quotes for both resource tuples.');
    }

    const firstPrewarmedBundle = {
      id: 'prewarmed-tuple',
      domain: 'a--b',
      mailboxIdentities: [
        {
          identity: 'c',
          address: 'same@northstar-outreach.com',
        },
      ],
    } satisfies ManagedEmailDesignPrewarmedBundle;
    const secondPrewarmedBundle = {
      ...firstPrewarmedBundle,
      domain: 'a',
      mailboxIdentities: [
        {
          identity: 'b--c',
          address: 'same@northstar-outreach.com',
        },
      ],
    } satisfies ManagedEmailDesignPrewarmedBundle;
    const firstPrewarmedOffer = createManagedEmailDesignPrewarmedOffer({
      bundle: firstPrewarmedBundle,
      fixtureNow,
      expiresAt: fixtureExpiry,
    });
    const exactRepeatPrewarmedOffer = createManagedEmailDesignPrewarmedOffer({
      bundle: firstPrewarmedBundle,
      fixtureNow,
      expiresAt: fixtureExpiry,
    });
    const secondPrewarmedOffer = createManagedEmailDesignPrewarmedOffer({
      bundle: secondPrewarmedBundle,
      fixtureNow,
      expiresAt: fixtureExpiry,
    });

    expect(firstMailboxReview.quote.lines[0]?.resourceLabel).toBe(
      secondMailboxReview.quote.lines[0]?.resourceLabel,
    );
    expect(exactRepeatReview.quote).toEqual(firstMailboxReview.quote);
    expect(exactRepeatReview.quote.id).toBe(firstMailboxReview.quote.id);
    expect(firstMailboxReview.quote.capacityRequest?.id).not.toBe(
      secondMailboxReview.quote.capacityRequest?.id,
    );
    expect(firstMailboxReview.quote.id).not.toBe(secondMailboxReview.quote.id);
    expect(exactRepeatPrewarmedOffer.quote.id).toBe(
      firstPrewarmedOffer.quote.id,
    );
    expect(secondPrewarmedOffer.quote.id).not.toBe(
      firstPrewarmedOffer.quote.id,
    );
  });

  it('recovers a canceled mailbox pool under its source identity with every retained and selected snapshot exactly once', () => {
    const selected = mailbox({
      id: 'mailbox-new',
      identity: 'Avery Miles',
      address: 'avery@northstar-outreach.com',
      subscriptionId: null,
    });
    const newPool = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [],
      mailboxes: [],
      selectedMailboxes: [selected],
      targetSubscriptionId: 'subscription-managed-mailbox-new',
      fixtureNow,
    });

    expect(newPool).toMatchObject({
      status: 'ready',
      intent: {
        product: 'managed-mailbox',
        mode: 'create',
        targetSubscriptionId: 'subscription-managed-mailbox-new',
        quantityDelta: 1,
        resourceSnapshotIds: [selected.id],
      },
    });

    const canceledHistory = managedMailboxSubscription({
      id: 'subscription-managed-mailbox-canceled',
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
      linkedResources: [
        mailboxSnapshot(
          'snapshot-mailbox-uncovered-live',
          'Mira Chen <mira@northstar-outreach.com>',
        ),
      ],
    });
    const uncoveredLiveMailbox = mailbox({
      id: 'mailbox-uncovered-live',
      subscriptionId: canceledHistory.id,
    });
    const review = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [canceledHistory],
      mailboxes: [uncoveredLiveMailbox],
      sourceCanceledSubscriptionId: canceledHistory.id,
      selectedMailboxes: [selected],
      targetSubscriptionId: canceledHistory.id,
      fixtureNow,
    });

    expect(review.status).toBe('requires-acceptance');
    expect(review).toMatchObject({
      sourceCanceledSubscriptionId: canceledHistory.id,
      intent: {
        targetSubscriptionId: canceledHistory.id,
        resourceSnapshotIds: ['snapshot-mailbox-uncovered-live', selected.id],
      },
    });
    expect(review.quote).toMatchObject({
      acceptedQuoteId: null,
      lines: [
        {
          product: 'managed-mailbox',
          quantity: 2,
          amountCents: 1000,
        },
      ],
    });
    expect(JSON.stringify(review.quote)).toContain(
      uncoveredLiveMailbox.address,
    );
    expect(JSON.stringify(review.quote)).toContain(selected.address);
    if (!review.quote) {
      throw new Error('Expected a refreshed mailbox-pool quote');
    }

    const acceptedQuote = quote({
      ...review.quote,
      acceptedQuoteId: review.quote.id,
    });
    const materialized = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [canceledHistory],
      mailboxes: [uncoveredLiveMailbox],
      sourceCanceledSubscriptionId: canceledHistory.id,
      selectedMailboxes: [selected],
      targetSubscriptionId: canceledHistory.id,
      fixtureNow,
      quote: acceptedQuote,
    });

    expect(materialized).toMatchObject({
      status: 'ready',
      sourceCanceledSubscriptionId: canceledHistory.id,
      subscription: {
        id: canceledHistory.id,
        product: 'managed-mailbox',
        quantity: 2,
        status: 'active',
      },
    });
    if (!materialized.subscription) {
      throw new Error(
        'Expected an accepted mailbox quote to materialize a pool',
      );
    }
    const expectedSnapshotIds = [
      'snapshot-mailbox-uncovered-live',
      selected.id,
    ];
    expect(
      materialized.subscription.linkedResources.map(({ id }) => id),
    ).toEqual(expectedSnapshotIds);
    expect(new Set(expectedSnapshotIds).size).toBe(expectedSnapshotIds.length);
    const retried = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [materialized.subscription],
      mailboxes: [uncoveredLiveMailbox, selected],
      sourceCanceledSubscriptionId: canceledHistory.id,
      selectedMailboxes: [selected],
      targetSubscriptionId: canceledHistory.id,
      fixtureNow,
      quote: acceptedQuote,
    });

    if (!retried.subscription) {
      throw new Error('Expected mailbox retry to reuse the materialized pool');
    }
    expect(retried).toMatchObject({
      status: 'ready',
      sourceCanceledSubscriptionId: canceledHistory.id,
    });
    expect(retried.subscription).toEqual(materialized.subscription);
    expect(canceledHistory).toMatchObject({
      id: 'subscription-managed-mailbox-canceled',
      status: 'canceled',
      linkedResources: [
        {
          id: 'snapshot-mailbox-uncovered-live',
          label: 'Mira Chen <mira@northstar-outreach.com>',
        },
      ],
    });
  });

  it('creates an ordinary mailbox pool without recovering canceled history', () => {
    const canceledMailbox = mailbox({
      id: 'mailbox-canceled-history-only',
      identity: 'Canceled History',
      address: 'history@northstar-outreach.com',
      subscriptionId: 'subscription-mailbox-canceled-history-only',
    });
    const selectedMailbox = mailbox({
      id: 'mailbox-new-after-cancellation',
      identity: 'New Mailbox',
      address: 'new@northstar-outreach.com',
      subscriptionId: null,
    });
    const canceledSubscription = managedMailboxSubscription({
      id: 'subscription-mailbox-canceled-history-only',
      quantity: 1,
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
      linkedResources: [
        mailboxSnapshot(
          canceledMailbox.id,
          `${canceledMailbox.identity} <${canceledMailbox.address}>`,
        ),
      ],
    });
    const targetSubscriptionId = 'subscription-mailbox-new-after-cancellation';
    const review = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [canceledSubscription],
      mailboxes: [canceledMailbox],
      selectedMailboxes: [selectedMailbox],
      targetSubscriptionId,
      fixtureNow,
    });

    expect(review).toMatchObject({
      status: 'ready',
      intent: {
        product: 'managed-mailbox',
        mode: 'create',
        targetSubscriptionId,
        quantityDelta: 1,
        resourceSnapshotIds: [selectedMailbox.id],
      },
      quote: {
        lines: [{ quantity: 1, amountCents: 500 }],
      },
    });
    expect(review.quote?.lines[0]?.resourceLabel).not.toContain(
      canceledMailbox.address,
    );
  });

  it('rejects canceled-pool replacement while another active pool exists', () => {
    const canceledSubscriptionId = 'subscription-mailbox-canceled-source';
    const unrelatedSubscriptionId = 'subscription-mailbox-active-unrelated';
    const replacementSubscriptionId =
      'subscription-mailbox-canceled-replacement';
    const canceledMailbox = mailbox({
      id: 'mailbox-canceled-source-live',
      identity: 'Canceled Source',
      address: 'canceled-source@northstar-outreach.com',
      subscriptionId: canceledSubscriptionId,
    });
    const unrelatedMailbox = mailbox({
      id: 'mailbox-active-unrelated-live',
      identity: 'Active Unrelated',
      address: 'active-unrelated@northstar-outreach.com',
      subscriptionId: unrelatedSubscriptionId,
    });
    const selectedMailbox = mailbox({
      id: 'mailbox-canceled-replacement-selected',
      identity: 'Replacement Selection',
      address: 'replacement@northstar-outreach.com',
      subscriptionId: null,
    });
    const canceledSubscription = managedMailboxSubscription({
      id: canceledSubscriptionId,
      quantity: 1,
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
      linkedResources: [
        mailboxSnapshot(
          canceledMailbox.id,
          `${canceledMailbox.identity} <${canceledMailbox.address}>`,
        ),
      ],
    });
    const unrelatedSubscription = managedMailboxSubscription({
      id: unrelatedSubscriptionId,
      quantity: 2,
      linkedResources: [
        mailboxSnapshot(
          unrelatedMailbox.id,
          `${unrelatedMailbox.identity} <${unrelatedMailbox.address}>`,
        ),
      ],
    });

    expect(() =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [canceledSubscription, unrelatedSubscription],
        mailboxes: [canceledMailbox, unrelatedMailbox],
        selectedMailboxes: [selectedMailbox],
        sourceCanceledSubscriptionId: canceledSubscription.id,
        targetSubscriptionId: replacementSubscriptionId,
        fixtureNow,
      }),
    ).toThrow('Target subscription does not identify the active mailbox pool.');

    expect(
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [canceledSubscription, unrelatedSubscription],
        mailboxes: [canceledMailbox, unrelatedMailbox],
        selectedMailboxes: [selectedMailbox],
        sourceCanceledSubscriptionId: canceledSubscription.id,
        targetSubscriptionId: unrelatedSubscription.id,
        fixtureNow,
      }),
    ).toMatchObject({
      status: 'requires-acceptance',
      intent: {
        mode: 'increment-existing',
        targetSubscriptionId: unrelatedSubscription.id,
        quantityDelta: 1,
        resourceSnapshotIds: [canceledMailbox.id, selectedMailbox.id],
      },
      quote: {
        lines: [{ quantity: 1, amountCents: 500 }],
      },
    });

    const proposal = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [canceledSubscription, unrelatedSubscription],
      mailboxes: [canceledMailbox, unrelatedMailbox],
      selectedMailboxes: [selectedMailbox],
      sourceCanceledSubscriptionId: canceledSubscription.id,
      targetSubscriptionId: unrelatedSubscription.id,
      fixtureNow,
    });
    if (proposal.status === 'blocked') {
      throw new Error('Expected a recoverable active mailbox pool.');
    }
    const acceptedQuote = {
      ...proposal.quote,
      acceptedQuoteId: proposal.quote.id,
    };
    const accepted = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [canceledSubscription, unrelatedSubscription],
      mailboxes: [canceledMailbox, unrelatedMailbox],
      selectedMailboxes: [selectedMailbox],
      sourceCanceledSubscriptionId: canceledSubscription.id,
      targetSubscriptionId: unrelatedSubscription.id,
      fixtureNow,
      quote: acceptedQuote,
    });
    expect(accepted.subscription?.linkedResources.map(({ id }) => id)).toEqual([
      unrelatedMailbox.id,
      canceledMailbox.id,
      selectedMailbox.id,
    ]);
  });

  it('scopes canceled-pool replacement to the explicitly selected subscription', () => {
    const canceledMailboxA = mailbox({
      id: 'mailbox-canceled-pool-a',
      identity: 'Canceled Pool A',
      address: 'pool-a@northstar-outreach.com',
      subscriptionId: 'subscription-mailbox-canceled-a',
    });
    const canceledMailboxB = mailbox({
      id: 'mailbox-canceled-pool-b',
      identity: 'Canceled Pool B',
      address: 'pool-b@northstar-outreach.com',
      subscriptionId: 'subscription-mailbox-canceled-b',
    });
    const selectedMailbox = mailbox({
      id: 'mailbox-canceled-pool-new',
      identity: 'New Mailbox',
      address: 'new@northstar-outreach.com',
      subscriptionId: null,
    });
    const canceledSubscriptionA = managedMailboxSubscription({
      id: 'subscription-mailbox-canceled-a',
      quantity: 1,
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
      linkedResources: [
        mailboxSnapshot(
          canceledMailboxA.id,
          `${canceledMailboxA.identity} <${canceledMailboxA.address}>`,
        ),
      ],
    });
    const canceledSubscriptionB = managedMailboxSubscription({
      id: 'subscription-mailbox-canceled-b',
      quantity: 1,
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-02T12:00:00.000Z',
      linkedResources: [
        mailboxSnapshot(
          canceledMailboxB.id,
          `${canceledMailboxB.identity} <${canceledMailboxB.address}>`,
        ),
      ],
    });

    const resolution = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [canceledSubscriptionA, canceledSubscriptionB],
      mailboxes: [canceledMailboxA, canceledMailboxB],
      selectedMailboxes: [selectedMailbox],
      sourceCanceledSubscriptionId: canceledSubscriptionB.id,
      targetSubscriptionId: 'subscription-mailbox-canceled-b-replacement',
      fixtureNow,
    });

    expect(resolution).toMatchObject({
      status: 'requires-acceptance',
      intent: {
        targetSubscriptionId: 'subscription-mailbox-canceled-b-replacement',
        quantityDelta: 2,
        resourceSnapshotIds: [canceledMailboxB.id, selectedMailbox.id],
      },
      quote: {
        lines: [
          {
            quantity: 2,
            amountCents: 1000,
          },
        ],
      },
    });
    expect(resolution.quote?.lines[0]?.resourceLabel).toContain(
      canceledMailboxB.address,
    );
    expect(resolution.quote?.lines[0]?.resourceLabel).not.toContain(
      canceledMailboxA.address,
    );
  });

  it('matches canceled mailbox history by exact address without collapsing substring collisions', () => {
    const retainedJoannSnapshot = mailboxSnapshot(
      'snapshot-mailbox-history-joann',
      'Joann <joann@example.com>',
    );
    const canceledHistory = managedMailboxSubscription({
      id: 'subscription-mailbox-history-substring',
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
      linkedResources: [retainedJoannSnapshot],
    });
    const annMailbox = mailbox({
      id: 'mailbox-history-ann',
      identity: 'Ann Example',
      address: 'ann@example.com',
      domain: 'example.com',
      subscriptionId: canceledHistory.id,
    });
    const joannMailbox = mailbox({
      id: 'mailbox-history-joann',
      identity: 'Joann',
      address: 'joann@example.com',
      domain: 'example.com',
      subscriptionId: canceledHistory.id,
    });
    const selectedMailbox = mailbox({
      id: 'mailbox-history-selected',
      identity: 'Avery Miles',
      address: 'avery@example.com',
      domain: 'example.com',
      subscriptionId: null,
    });
    const review = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [canceledHistory],
      mailboxes: [annMailbox, joannMailbox],
      selectedMailboxes: [selectedMailbox],
      sourceCanceledSubscriptionId: canceledHistory.id,
      targetSubscriptionId: 'subscription-mailbox-history-replacement',
      fixtureNow,
    });

    if (!review.quote || review.intent.product !== 'managed-mailbox') {
      throw new Error('Expected a mailbox-history replacement review.');
    }

    const expectedSnapshotIds = [
      annMailbox.id,
      retainedJoannSnapshot.id,
      selectedMailbox.id,
    ];
    expect(review.intent).toMatchObject({
      mode: 'create',
      quantityDelta: expectedSnapshotIds.length,
      resourceSnapshotIds: expectedSnapshotIds,
    });
    expect(new Set(review.intent.resourceSnapshotIds).size).toBe(
      expectedSnapshotIds.length,
    );

    const materialized = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [canceledHistory],
      mailboxes: [annMailbox, joannMailbox],
      selectedMailboxes: [selectedMailbox],
      sourceCanceledSubscriptionId: canceledHistory.id,
      targetSubscriptionId: 'subscription-mailbox-history-replacement',
      fixtureNow,
      quote: quote({
        ...review.quote,
        acceptedQuoteId: review.quote.id,
      }),
    });

    if (!materialized.subscription) {
      throw new Error('Expected exact history matching to materialize a pool.');
    }

    expect(
      materialized.subscription.linkedResources.map(({ id }) => id),
    ).toEqual(expectedSnapshotIds);
  });

  it('prefers a mailbox linked canceled-history snapshot before exact identity fallback', () => {
    const sharedMailboxId = 'mailbox-history-recreated-avery';
    const olderSnapshot = mailboxSnapshot(
      sharedMailboxId,
      'Avery Miles (earlier) <avery@northstar-outreach.com>',
    );
    const newerSnapshot = mailboxSnapshot(
      sharedMailboxId,
      'Avery Miles (renewed) <avery@northstar-outreach.com>',
    );
    const olderCanceledSubscription = managedMailboxSubscription({
      id: 'subscription-mailbox-history-earlier',
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
      linkedResources: [olderSnapshot],
    });
    const newerCanceledSubscription = managedMailboxSubscription({
      id: 'subscription-mailbox-history-renewed',
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-02T12:00:00.000Z',
      linkedResources: [newerSnapshot],
    });
    const recreatedMailbox = mailbox({
      id: sharedMailboxId,
      identity: 'Avery Miles',
      address: 'avery@northstar-outreach.com',
      subscriptionId: newerCanceledSubscription.id,
    });
    const selectedMailbox = mailbox({
      id: 'mailbox-history-linked-selection',
      identity: 'Jordan Lee',
      address: 'jordan@northstar-outreach.com',
      subscriptionId: null,
    });
    const review = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [olderCanceledSubscription, newerCanceledSubscription],
      mailboxes: [recreatedMailbox],
      selectedMailboxes: [selectedMailbox],
      sourceCanceledSubscriptionId: newerCanceledSubscription.id,
      targetSubscriptionId: 'subscription-mailbox-history-linked-replacement',
      fixtureNow,
    });

    if (!review.quote || review.intent.product !== 'managed-mailbox') {
      throw new Error('Expected a linked mailbox-history replacement review.');
    }

    const selectedSnapshot = mailboxSnapshot(
      selectedMailbox.id,
      `${selectedMailbox.identity} <${selectedMailbox.address}>`,
    );
    expect(review.quote.lines[0]).toMatchObject({
      resourceLabel: `${newerSnapshot.label}, ${selectedSnapshot.label}`,
    });

    const materialized = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [olderCanceledSubscription, newerCanceledSubscription],
      mailboxes: [recreatedMailbox],
      selectedMailboxes: [selectedMailbox],
      sourceCanceledSubscriptionId: newerCanceledSubscription.id,
      targetSubscriptionId: 'subscription-mailbox-history-linked-replacement',
      fixtureNow,
      quote: quote({
        ...review.quote,
        acceptedQuoteId: review.quote.id,
      }),
    });

    if (!materialized.subscription) {
      throw new Error('Expected linked mailbox history to materialize a pool.');
    }

    expect(materialized.subscription.linkedResources).toEqual([
      newerSnapshot,
      selectedSnapshot,
    ]);
  });

  it('blocks mailbox materialization while a quantity change or cancellation is pending and rejects connected resources', () => {
    const selectedConnectedMailbox = mailbox({
      id: 'mailbox-connected-selected',
      source: 'connected',
      subscriptionId: null,
      address: 'rory@riveroak.io',
    });

    expect(
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [
          managedMailboxSubscription({
            status: 'pending-change',
            pendingQuantity: 2,
            changeEffectiveAt: '2027-02-10T12:00:00.000Z',
          }),
        ],
        mailboxes: [],
        selectedMailboxes: [
          mailbox({ id: 'mailbox-new-pending', subscriptionId: null }),
        ],
        targetSubscriptionId: 'subscription-managed-mailbox',
        fixtureNow,
      }),
    ).toEqual({
      status: 'blocked',
      reason: 'subscription-change-pending',
    });
    expect(
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [
          managedMailboxSubscription({
            status: 'pending-cancel',
            cancelAt: '2027-02-10T12:00:00.000Z',
          }),
        ],
        mailboxes: [],
        selectedMailboxes: [
          mailbox({ id: 'mailbox-new-cancel-pending', subscriptionId: null }),
        ],
        targetSubscriptionId: 'subscription-managed-mailbox',
        fixtureNow,
      }),
    ).toEqual({
      status: 'blocked',
      reason: 'subscription-cancel-pending',
    });
    expect(() =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [],
        mailboxes: [],
        selectedMailboxes: [selectedConnectedMailbox],
        targetSubscriptionId: 'subscription-managed-mailbox-new',
        fixtureNow,
      }),
    ).toThrow();
  });

  it('rejects selected mailbox resources that collide by normalized address', () => {
    const currentMailboxPool = managedMailboxSubscription({
      id: 'subscription-mailbox-address-collision',
      quantity: 1,
      linkedResources: [
        mailboxSnapshot(
          'snapshot-mailbox-current-address',
          'Existing Mira <mira@northstar-outreach.com>',
        ),
      ],
    });
    const invalidSelections: Array<() => unknown> = [
      () =>
        resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId,
          subscriptions: [],
          mailboxes: [],
          selectedMailboxes: [
            mailbox({
              id: 'mailbox-address-primary',
              address: 'MIRA@NORTHSTAR-OUTREACH.COM',
              subscriptionId: null,
            }),
            mailbox({
              id: 'mailbox-address-duplicate',
              address: '  mira@northstar-outreach.com  ',
              subscriptionId: null,
            }),
          ],
          targetSubscriptionId: 'subscription-mailbox-address-new',
          fixtureNow,
        }),
      () =>
        resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId,
          subscriptions: [],
          mailboxes: [
            mailbox({
              id: 'mailbox-existing-live-address',
              address: 'mira@northstar-outreach.com',
              subscriptionId: null,
            }),
          ],
          selectedMailboxes: [
            mailbox({
              id: 'mailbox-selected-live-address-collision',
              address: '  MIRA@NORTHSTAR-OUTREACH.COM ',
              subscriptionId: null,
            }),
          ],
          targetSubscriptionId: 'subscription-mailbox-live-address-new',
          fixtureNow,
        }),
      () =>
        resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId,
          subscriptions: [currentMailboxPool],
          mailboxes: [],
          selectedMailboxes: [
            mailbox({
              id: 'mailbox-selected-current-pool-address-collision',
              address: 'Mira@Northstar-Outreach.com',
              subscriptionId: currentMailboxPool.id,
            }),
          ],
          targetSubscriptionId: currentMailboxPool.id,
          fixtureNow,
        }),
    ];

    invalidSelections.forEach((resolveAttempt) => {
      expect(resolveAttempt).toThrow();
    });
  });

  it('rejects empty mailbox selection and non-positive warmup capacity requests', () => {
    expect(() =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [],
        mailboxes: [],
        selectedMailboxes: [],
        targetSubscriptionId: 'subscription-managed-mailbox-new',
        fixtureNow,
      }),
    ).toThrow();
    expect(() =>
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId,
        subscriptions: [],
        mailboxes: [],
        requestedQuantity: 0,
        targetSubscriptionId: 'subscription-managed-warmup-new',
        fixtureNow,
      }),
    ).toThrow();
  });

  it('materializes warmup capacity only after an accepted quote and never changes assignments', () => {
    const noCurrent = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [],
      mailboxes: [],
      requestedQuantity: 2,
      targetSubscriptionId: 'subscription-managed-warmup-new',
      fixtureNow,
    });

    expect(noCurrent.status).toBe('requires-acceptance');
    expect(noCurrent.intent).toMatchObject({
      product: 'managed-warmup',
      mode: 'create',
      targetSubscriptionId: 'subscription-managed-warmup-new',
      quantityDelta: 2,
    });
    if (!noCurrent.intent) {
      throw new Error('Expected a warmup subscription intent');
    }
    expect(new Set(noCurrent.intent.resourceSnapshotIds).size).toBe(2);
    expect(noCurrent.quote).toMatchObject({
      acceptedQuoteId: null,
      lines: [
        {
          product: 'managed-warmup',
          cadence: 'monthly',
          quantity: 2,
        },
      ],
    });
    const newCapacityLine = noCurrent.quote.lines[0];
    expect(newCapacityLine.amountCents).toBe(
      newCapacityLine.unitPriceCents * newCapacityLine.quantity,
    );
    expect(noCurrent.quote.totals).toEqual({
      dueTodayCents: newCapacityLine.amountCents,
      monthlyRecurringCents: newCapacityLine.amountCents,
      annualRecurringCents: 0,
    });
    const acceptedQuote = quote({
      ...noCurrent.quote,
      acceptedQuoteId: noCurrent.quote.id,
    });
    const materialized = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [],
      mailboxes: [],
      requestedQuantity: 2,
      targetSubscriptionId: 'subscription-managed-warmup-new',
      fixtureNow,
      quote: acceptedQuote,
    });

    expect(materialized).toMatchObject({
      status: 'ready',
      subscription: {
        id: 'subscription-managed-warmup-new',
        product: 'managed-warmup',
        quantity: 2,
        status: 'active',
        linkedResources: [
          { kind: 'warmup-capacity' },
          { kind: 'warmup-capacity' },
        ],
      },
    });
    if (!materialized.subscription) {
      throw new Error(
        'Expected an accepted warmup quote to materialize capacity',
      );
    }
    const retried = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [materialized.subscription],
      mailboxes: [],
      requestedQuantity: 2,
      targetSubscriptionId: 'subscription-managed-warmup-new',
      fixtureNow,
      quote: acceptedQuote,
    });

    if (!retried.subscription) {
      throw new Error(
        'Expected warmup retry to reuse the materialized capacity',
      );
    }
    expect(retried.subscription).toMatchObject({
      id: materialized.subscription.id,
      quantity: materialized.subscription.quantity,
    });
    expect(
      new Set(retried.subscription.linkedResources.map(({ id }) => id)).size,
    ).toBe(2);
    expect(getManagedEmailDesignAssignedWarmupCount([])).toBe(0);
  });

  it('covers canceled warmup history and assigned mailboxes in a refreshed quote without mutating history', () => {
    const canceledHistory = managedWarmupSubscription({
      id: 'subscription-managed-warmup-canceled',
      quantity: 1,
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
      linkedResources: [warmupCapacitySnapshot('snapshot-warmup-history')],
    });
    const assignedMailboxes = [
      mailbox({
        id: 'mailbox-assigned-mira',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      mailbox({
        id: 'mailbox-assigned-jordan',
        address: 'jordan@northstar-outreach.com',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'paused',
          operation: { status: 'idle' },
        },
      }),
    ];
    const review = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [canceledHistory],
      mailboxes: assignedMailboxes,
      requestedQuantity: 1,
      targetSubscriptionId: 'subscription-managed-warmup-replacement',
      fixtureNow,
    });
    if (review.status !== 'requires-acceptance') {
      throw new Error('Expected warmup replacement quote acceptance.');
    }

    expect(review.status).toBe('requires-acceptance');
    expect(review.quote).toMatchObject({
      acceptedQuoteId: null,
      lines: [
        {
          product: 'managed-warmup',
          quantity: 3,
        },
      ],
    });
    expect(JSON.stringify(review.quote)).toContain(
      assignedMailboxes[0].address,
    );
    expect(JSON.stringify(review.quote)).toContain(
      assignedMailboxes[1].address,
    );
    const refreshedCapacityLine = review.quote.lines[0];
    expect(refreshedCapacityLine.amountCents).toBe(
      refreshedCapacityLine.unitPriceCents * refreshedCapacityLine.quantity,
    );
    expect(review.quote.totals).toEqual({
      dueTodayCents: managedEmailDesignPricing.managedWarmupMonthlyCents * 3,
      monthlyRecurringCents:
        managedEmailDesignPricing.managedWarmupMonthlyCents * 3,
      annualRecurringCents: 0,
    });

    const replacement = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [canceledHistory],
      mailboxes: assignedMailboxes,
      requestedQuantity: 1,
      targetSubscriptionId: 'subscription-managed-warmup-replacement',
      fixtureNow,
      quote: quote({
        ...review.quote,
        acceptedQuoteId: review.quote.id,
      }),
    });

    expect(replacement).toMatchObject({
      status: 'ready',
      subscription: {
        id: 'subscription-managed-warmup-replacement',
        product: 'managed-warmup',
        quantity: 3,
        status: 'active',
      },
    });
    expect(canceledHistory).toMatchObject({
      status: 'canceled',
      linkedResources: [{ id: 'snapshot-warmup-history' }],
    });
    expect(
      assignedMailboxes.map(
        (mailboxItem) => mailboxItem.warmupState.assignment,
      ),
    ).toEqual(['assigned', 'assigned']);
  });

  it('increments exhausted active warmup capacity once and blocks pending quantity lifecycles', () => {
    const active = managedWarmupSubscription({
      id: 'subscription-managed-warmup-active',
      quantity: 2,
      linkedResources: [
        warmupCapacitySnapshot('snapshot-warmup-active-1'),
        warmupCapacitySnapshot(
          'snapshot-warmup-active-2',
          'Warmup capacity slot 2',
        ),
      ],
    });
    const assignedMailboxes = [
      mailbox({
        id: 'mailbox-assigned-one',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      mailbox({
        id: 'mailbox-assigned-two',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
    ];
    const review = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [active],
      mailboxes: assignedMailboxes,
      requestedQuantity: 1,
      targetSubscriptionId: active.id,
      fixtureNow,
    });

    expect(review.status).toBe('requires-acceptance');
    expect(review.intent).toMatchObject({
      product: 'managed-warmup',
      mode: 'increment-existing',
      targetSubscriptionId: active.id,
      quantityDelta: 1,
    });
    if (!review.quote) {
      throw new Error('Expected a quote for exhausted warmup capacity');
    }
    const incremented = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [active],
      mailboxes: assignedMailboxes,
      requestedQuantity: 1,
      targetSubscriptionId: active.id,
      fixtureNow,
      quote: quote({
        ...review.quote,
        acceptedQuoteId: review.quote.id,
      }),
    });

    expect(incremented).toMatchObject({
      status: 'ready',
      subscription: {
        id: active.id,
        quantity: 3,
        linkedResources: [
          { id: 'snapshot-warmup-active-1' },
          { id: 'snapshot-warmup-active-2' },
          { kind: 'warmup-capacity' },
        ],
      },
    });
    expect(
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId,
        subscriptions: [
          managedWarmupSubscription({
            status: 'pending-cancel',
            cancelAt: '2027-02-10T12:00:00.000Z',
          }),
        ],
        mailboxes: assignedMailboxes,
        requestedQuantity: 1,
        targetSubscriptionId: 'subscription-managed-warmup',
        fixtureNow,
      }),
    ).toEqual({
      status: 'blocked',
      reason: 'subscription-cancel-pending',
    });
  });

  it('blocks Add warmup capacity while active paid capacity remains spare and charges only an exhausted deficit', () => {
    const active = managedWarmupSubscription({
      id: 'subscription-managed-warmup-spare',
      quantity: 3,
      linkedResources: [
        warmupCapacitySnapshot('snapshot-warmup-spare-1'),
        warmupCapacitySnapshot('snapshot-warmup-spare-2'),
        warmupCapacitySnapshot('snapshot-warmup-spare-3'),
      ],
    });
    const assignedMailboxes = [
      mailbox({
        id: 'mailbox-warmup-spare-one',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      mailbox({
        id: 'mailbox-warmup-spare-two',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
    ];
    const spareCapacity = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [active],
      mailboxes: assignedMailboxes,
      requestedQuantity: 1,
      targetSubscriptionId: active.id,
      fixtureNow,
    });
    const exhaustedCapacity =
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId,
        subscriptions: [
          {
            ...active,
            quantity: 2,
            linkedResources: active.linkedResources.slice(0, 2),
          },
        ],
        mailboxes: assignedMailboxes,
        requestedQuantity: 1,
        targetSubscriptionId: active.id,
        fixtureNow,
      });

    expect(spareCapacity).toMatchObject({ status: 'blocked' });
    expect(spareCapacity).not.toHaveProperty('intent');
    expect(spareCapacity).not.toHaveProperty('quote');
    expect(exhaustedCapacity).toMatchObject({
      status: 'requires-acceptance',
      intent: {
        product: 'managed-warmup',
        targetSubscriptionId: active.id,
        quantityDelta: 1,
      },
      quote: {
        lines: [
          {
            quantity: 1,
            amountCents: managedEmailDesignPricing.managedWarmupMonthlyCents,
          },
        ],
      },
    });
  });
  it('increments the seeded warmup pool once with a new capacity identity and reuses it on retry', () => {
    const seededWarmupSubscription = mixedWorkspace.subscriptions.find(
      (subscription) => subscription.product === 'managed-warmup',
    );
    if (
      !seededWarmupSubscription ||
      seededWarmupSubscription.product !== 'managed-warmup'
    ) {
      throw new Error('Expected the seeded current warmup subscription');
    }
    const review = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: mixedWorkspace.subscriptions,
      mailboxes: mixedWorkspace.mailboxes,
      requestedQuantity: 1,
      targetSubscriptionId: seededWarmupSubscription.id,
      fixtureNow,
    });

    if (!review.quote) {
      throw new Error('Expected a seeded warmup increment review');
    }
    const acceptedReview = quote({
      ...review.quote,
      acceptedQuoteId: review.quote.id,
    });
    const incremented = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: mixedWorkspace.subscriptions,
      mailboxes: mixedWorkspace.mailboxes,
      requestedQuantity: 1,
      targetSubscriptionId: seededWarmupSubscription.id,
      fixtureNow,
      quote: acceptedReview,
    });

    if (!incremented.subscription) {
      throw new Error('Expected the seeded warmup increment to materialize');
    }
    const incrementedSubscription = incremented.subscription;
    const priorResourceIds = new Set(
      seededWarmupSubscription.linkedResources.map(({ id }) => id),
    );
    const addedResourceIds = incrementedSubscription.linkedResources
      .map(({ id }) => id)
      .filter((id) => !priorResourceIds.has(id));

    expect(incrementedSubscription.quantity).toBe(
      seededWarmupSubscription.quantity + 1,
    );
    expect(addedResourceIds).toHaveLength(1);
    expect(priorResourceIds.has(addedResourceIds[0] ?? '')).toBe(false);
    expect(
      new Set(incrementedSubscription.linkedResources.map(({ id }) => id)).size,
    ).toBe(incrementedSubscription.linkedResources.length);

    const retried = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: mixedWorkspace.subscriptions.map((subscription) =>
        subscription.id === seededWarmupSubscription.id
          ? incrementedSubscription
          : subscription,
      ),
      mailboxes: mixedWorkspace.mailboxes,
      requestedQuantity: 1,
      targetSubscriptionId: seededWarmupSubscription.id,
      fixtureNow,
      quote: acceptedReview,
    });

    expect(retried.subscription).toEqual(incrementedSubscription);
  });

  it('replays accepted mailbox and warmup requests with original intent and rejects tampered retry evidence', () => {
    const mailboxTargetSubscriptionId = 'subscription-mailbox-retry-intent';
    const mailboxSelection = mailbox({
      id: 'mailbox-retry-intent-selection',
      identity: 'Avery Miles',
      address: 'avery@northstar-outreach.com',
      subscriptionId: null,
    });
    const mailboxReview = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [],
      mailboxes: [],
      selectedMailboxes: [mailboxSelection],
      targetSubscriptionId: mailboxTargetSubscriptionId,
      fixtureNow,
    });

    if (
      !mailboxReview.quote ||
      mailboxReview.intent.product !== 'managed-mailbox'
    ) {
      throw new Error('Expected a mailbox capacity review.');
    }

    const acceptedMailboxQuote = quote({
      ...mailboxReview.quote,
      acceptedQuoteId: mailboxReview.quote.id,
    });
    const materializedMailbox = resolveManagedEmailDesignMailboxPoolAcquisition(
      {
        workspaceId,
        subscriptions: [],
        mailboxes: [],
        selectedMailboxes: [mailboxSelection],
        targetSubscriptionId: mailboxTargetSubscriptionId,
        fixtureNow,
        quote: acceptedMailboxQuote,
      },
    );
    const materializedMailboxSubscription = materializedMailbox.subscription;
    if (!materializedMailboxSubscription) {
      throw new Error('Expected the accepted mailbox request to materialize.');
    }

    const retriedMailbox = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [materializedMailboxSubscription],
      mailboxes: [mailboxSelection],
      selectedMailboxes: [mailboxSelection],
      targetSubscriptionId: mailboxTargetSubscriptionId,
      fixtureNow,
      quote: acceptedMailboxQuote,
    });

    const retriedMailboxIntent = retriedMailbox.intent;
    if (
      !retriedMailboxIntent ||
      retriedMailboxIntent.product !== 'managed-mailbox'
    ) {
      throw new Error('Expected the retried mailbox intent.');
    }

    expect(retriedMailboxIntent).toEqual(mailboxReview.intent);
    expect(
      composeCapacityAcquisition({
        intent: retriedMailboxIntent,
        acquisitionQuote: acceptedMailboxQuote,
        resourceSnapshots: retriedMailboxIntent.resourceSnapshotIds.map((id) =>
          mailboxSnapshot(id),
        ),
      }),
    ).toMatchObject({ status: 'succeeded' });

    const mailboxQuoteLine = acceptedMailboxQuote.lines[0];
    const mailboxCapacityRequest = acceptedMailboxQuote.capacityRequest;
    if (
      !mailboxCapacityRequest ||
      mailboxCapacityRequest.intent.product !== 'managed-mailbox'
    ) {
      throw new Error('Expected accepted mailbox request evidence.');
    }
    const repricedMailboxLine: ManagedEmailDesignQuoteLine = {
      ...mailboxQuoteLine,
      unitPriceCents: mailboxQuoteLine.unitPriceCents + 1,
      amountCents:
        (mailboxQuoteLine.unitPriceCents + 1) * mailboxQuoteLine.quantity,
    };
    const tamperedMailboxQuotes = [
      quote({
        ...acceptedMailboxQuote,
        lines: [repricedMailboxLine],
        totals: totalsFor([repricedMailboxLine]),
      }),
      quote({
        ...acceptedMailboxQuote,
        capacityRequest: {
          ...mailboxCapacityRequest,
          intent: {
            ...mailboxCapacityRequest.intent,
            mode: 'attach-existing-capacity',
            quantityDelta: 0,
          },
        },
      }),
    ];

    for (const tamperedQuote of tamperedMailboxQuotes) {
      expect(() =>
        resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId,
          subscriptions: [materializedMailboxSubscription],
          mailboxes: [mailboxSelection],
          selectedMailboxes: [mailboxSelection],
          targetSubscriptionId: mailboxTargetSubscriptionId,
          fixtureNow,
          quote: tamperedQuote,
        }),
      ).toThrow();
    }

    const warmupTargetSubscriptionId = 'subscription-warmup-retry-intent';
    const warmupReview = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [],
      mailboxes: [],
      requestedQuantity: 2,
      targetSubscriptionId: warmupTargetSubscriptionId,
      fixtureNow,
    });

    if (
      !warmupReview.quote ||
      warmupReview.intent.product !== 'managed-warmup'
    ) {
      throw new Error('Expected a warmup capacity review.');
    }

    const acceptedWarmupQuote = quote({
      ...warmupReview.quote,
      acceptedQuoteId: warmupReview.quote.id,
    });
    const materializedWarmup =
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId,
        subscriptions: [],
        mailboxes: [],
        requestedQuantity: 2,
        targetSubscriptionId: warmupTargetSubscriptionId,
        fixtureNow,
        quote: acceptedWarmupQuote,
      });

    const materializedWarmupSubscription = materializedWarmup.subscription;
    if (!materializedWarmupSubscription) {
      throw new Error('Expected the accepted warmup request to materialize.');
    }
    const retriedWarmup = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [materializedWarmupSubscription],
      mailboxes: [],
      requestedQuantity: 2,
      targetSubscriptionId: warmupTargetSubscriptionId,
      fixtureNow,
      quote: acceptedWarmupQuote,
    });

    const retriedWarmupIntent = retriedWarmup.intent;
    if (
      !retriedWarmupIntent ||
      retriedWarmupIntent.product !== 'managed-warmup'
    ) {
      throw new Error('Expected the retried warmup intent.');
    }

    expect(retriedWarmupIntent).toEqual(warmupReview.intent);
    expect(
      composeCapacityAcquisition({
        intent: retriedWarmupIntent,
        acquisitionQuote: acceptedWarmupQuote,
        resourceSnapshots: retriedWarmupIntent.resourceSnapshotIds.map((id) =>
          warmupCapacitySnapshot(id),
        ),
      }),
    ).toMatchObject({ status: 'succeeded' });

    const warmupQuoteLine = acceptedWarmupQuote.lines[0];
    const warmupCapacityRequest = acceptedWarmupQuote.capacityRequest;
    if (
      !warmupCapacityRequest ||
      warmupCapacityRequest.intent.product !== 'managed-warmup'
    ) {
      throw new Error('Expected accepted warmup request evidence.');
    }
    const repricedWarmupLine: ManagedEmailDesignQuoteLine = {
      ...warmupQuoteLine,
      unitPriceCents: warmupQuoteLine.unitPriceCents + 1,
      amountCents:
        (warmupQuoteLine.unitPriceCents + 1) * warmupQuoteLine.quantity,
    };
    const tamperedWarmupQuotes = [
      quote({
        ...acceptedWarmupQuote,
        lines: [repricedWarmupLine],
        totals: totalsFor([repricedWarmupLine]),
      }),
      quote({
        ...acceptedWarmupQuote,
        capacityRequest: {
          ...warmupCapacityRequest,
          intent: {
            ...warmupCapacityRequest.intent,
            mode: 'increment-existing',
            quantityDelta: 1,
          },
        },
      }),
    ];

    for (const tamperedQuote of tamperedWarmupQuotes) {
      expect(() =>
        resolveManagedEmailDesignWarmupCapacityAcquisition({
          workspaceId,
          subscriptions: [materializedWarmupSubscription],
          mailboxes: [],
          requestedQuantity: 2,
          targetSubscriptionId: warmupTargetSubscriptionId,
          fixtureNow,
          quote: tamperedQuote,
        }),
      ).toThrow();
    }
  });

  it('requires capacity acquisition operations to retain the accepted request intent exactly', () => {
    const mailboxReview = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [],
      mailboxes: [],
      selectedMailboxes: [
        mailbox({
          id: 'mailbox-acquisition-intent',
          identity: 'Avery Miles',
          address: 'avery@northstar-outreach.com',
          subscriptionId: null,
        }),
      ],
      targetSubscriptionId: 'subscription-mailbox-acquisition-intent',
      fixtureNow,
    });
    const warmupReview = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [],
      mailboxes: [],
      requestedQuantity: 2,
      targetSubscriptionId: 'subscription-warmup-acquisition-intent',
      fixtureNow,
    });
    if (
      !mailboxReview.quote ||
      mailboxReview.intent.product !== 'managed-mailbox' ||
      !warmupReview.quote ||
      warmupReview.intent.product !== 'managed-warmup'
    ) {
      throw new Error('Expected mailbox and warmup capacity request evidence.');
    }

    const capacityCases = [
      {
        intent: mailboxReview.intent,
        acquisitionQuote: quote({
          ...mailboxReview.quote,
          acceptedQuoteId: mailboxReview.quote.id,
        }),
        snapshotsFor: (ids: readonly string[]) =>
          ids.map((id) => mailboxSnapshot(id)),
      },
      {
        intent: warmupReview.intent,
        acquisitionQuote: quote({
          ...warmupReview.quote,
          acceptedQuoteId: warmupReview.quote.id,
        }),
        snapshotsFor: (ids: readonly string[]) =>
          ids.map((id) => warmupCapacitySnapshot(id)),
      },
    ];

    for (const { intent, acquisitionQuote, snapshotsFor } of capacityCases) {
      expect(
        composeCapacityAcquisition({
          intent,
          acquisitionQuote,
          resourceSnapshots: snapshotsFor(intent.resourceSnapshotIds),
        }),
      ).toMatchObject({ status: 'succeeded' });

      expect(() =>
        composeCapacityAcquisition({
          intent: {
            ...intent,
            targetSubscriptionId: `${intent.targetSubscriptionId}-different`,
          },
          acquisitionQuote,
          resourceSnapshots: snapshotsFor(intent.resourceSnapshotIds),
        }),
      ).toThrow();
      const mismatchedSnapshotIds = intent.resourceSnapshotIds.map(
        (_, index) => `snapshot-${intent.product}-different-${index + 1}`,
      ) as [string, ...string[]];
      expect(() =>
        composeCapacityAcquisition({
          intent: {
            ...intent,
            resourceSnapshotIds: mismatchedSnapshotIds,
          },
          acquisitionQuote,
          resourceSnapshots: snapshotsFor(mismatchedSnapshotIds),
        }),
      ).toThrow();
    }
  });

  it('composes canceled mailbox-history replacement intent from every uncovered and selected snapshot', () => {
    const retainedLiveSnapshot = mailboxSnapshot(
      'snapshot-mailbox-replacement-uncovered',
      'Mira Chen <mira@northstar-outreach.com>',
    );
    const canceledMailboxSubscription = managedMailboxSubscription({
      id: 'subscription-mailbox-replacement-history',
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
      linkedResources: [retainedLiveSnapshot],
    });
    const uncoveredLiveMailbox = mailbox({
      id: 'mailbox-replacement-uncovered',
      subscriptionId: canceledMailboxSubscription.id,
    });
    const selectedMailbox = mailbox({
      id: 'mailbox-replacement-selected',
      identity: 'Avery Miles',
      address: 'avery@northstar-outreach.com',
      subscriptionId: null,
    });
    const replacementReview = resolveManagedEmailDesignMailboxPoolAcquisition({
      workspaceId,
      subscriptions: [canceledMailboxSubscription],
      mailboxes: [uncoveredLiveMailbox],
      sourceCanceledSubscriptionId: canceledMailboxSubscription.id,
      selectedMailboxes: [selectedMailbox],
      targetSubscriptionId: 'subscription-mailbox-replacement',
      fixtureNow,
    });

    if (
      !replacementReview.quote ||
      replacementReview.intent.product !== 'managed-mailbox'
    ) {
      throw new Error('Expected a mailbox replacement review.');
    }

    expect(replacementReview.intent).toEqual({
      product: 'managed-mailbox',
      mode: 'create',
      targetSubscriptionId: 'subscription-mailbox-replacement',
      quantityDelta: 2,
      resourceSnapshotIds: [retainedLiveSnapshot.id, selectedMailbox.id],
    });
    expect(new Set(replacementReview.intent.resourceSnapshotIds).size).toBe(
      replacementReview.intent.resourceSnapshotIds.length,
    );

    const acceptedReplacementQuote = quote({
      ...replacementReview.quote,
      acceptedQuoteId: replacementReview.quote.id,
    });
    expect(
      composeCapacityAcquisition({
        intent: replacementReview.intent,
        acquisitionQuote: acceptedReplacementQuote,
        resourceSnapshots: [
          retainedLiveSnapshot,
          mailboxSnapshot(selectedMailbox.id),
        ],
      }),
    ).toMatchObject({ status: 'succeeded' });
  });

  it('allocates a new warmup purchase identity after an effective reduction while retaining prior capacity history', () => {
    const targetSubscriptionId = 'subscription-warmup-purchase-history';
    const initialSubscription = managedWarmupSubscription({
      id: targetSubscriptionId,
      quantity: 2,
      linkedResources: [
        warmupCapacitySnapshot(
          'snapshot-warmup-purchase-history-one',
          'Warmup capacity history 1',
        ),
        warmupCapacitySnapshot(
          'snapshot-warmup-purchase-history-two',
          'Warmup capacity history 2',
        ),
      ],
    });
    const assignedMailboxes = [
      mailbox({
        id: 'mailbox-warmup-purchase-history-one',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
      mailbox({
        id: 'mailbox-warmup-purchase-history-two',
        warmupState: {
          assignment: 'assigned',
          lastConfirmedProviderState: 'warming',
          operation: { status: 'idle' },
        },
      }),
    ];
    const firstReview = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [initialSubscription],
      mailboxes: assignedMailboxes,
      requestedQuantity: 1,
      targetSubscriptionId,
      fixtureNow,
    });

    if (!firstReview.quote || firstReview.intent.product !== 'managed-warmup') {
      throw new Error('Expected the first warmup purchase review.');
    }

    const acceptedFirstQuote = quote({
      ...firstReview.quote,
      acceptedQuoteId: firstReview.quote.id,
    });
    const firstPurchase = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [initialSubscription],
      mailboxes: assignedMailboxes,
      requestedQuantity: 1,
      targetSubscriptionId,
      fixtureNow,
      quote: acceptedFirstQuote,
    });

    if (!firstPurchase.subscription) {
      throw new Error('Expected the first warmup purchase to materialize.');
    }

    const firstPurchasedSubscription = firstPurchase.subscription;
    const reductionAt = '2027-01-11T12:00:00.000Z';
    const scheduledReduction =
      scheduleManagedEmailDesignSubscriptionQuantityChange({
        subscription: firstPurchasedSubscription,
        quantity: 2,
        effectiveAt: reductionAt,
        mailboxes: assignedMailboxes,
      });

    if (scheduledReduction.status !== 'scheduled') {
      throw new Error('Expected the warmup reduction to be schedulable.');
    }

    const reducedSubscription =
      applyManagedEmailDesignSubscriptionQuantityChange({
        subscription: scheduledReduction.subscription,
        fixtureNow: reductionAt,
      });
    const retainedResourceIds = new Set(
      reducedSubscription.linkedResources.map(({ id }) => id),
    );

    expect(firstPurchasedSubscription.quantity).toBe(3);
    expect(reducedSubscription).toMatchObject({
      status: 'active',
      quantity: 2,
    });
    expect(reducedSubscription.linkedResources).toEqual(
      firstPurchasedSubscription.linkedResources,
    );

    const secondReview = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [reducedSubscription],
      mailboxes: assignedMailboxes,
      requestedQuantity: 1,
      targetSubscriptionId,
      fixtureNow: reductionAt,
    });

    if (
      !secondReview.quote ||
      secondReview.intent.product !== 'managed-warmup'
    ) {
      throw new Error('Expected the second warmup purchase review.');
    }

    expect(secondReview.quote.id).not.toBe(firstReview.quote.id);
    expect(
      secondReview.intent.resourceSnapshotIds.every(
        (id) => !retainedResourceIds.has(id),
      ),
    ).toBe(true);

    const acceptedSecondQuote = quote(
      {
        ...secondReview.quote,
        acceptedQuoteId: secondReview.quote.id,
      },
      reductionAt,
    );
    const secondPurchase = resolveManagedEmailDesignWarmupCapacityAcquisition({
      workspaceId,
      subscriptions: [reducedSubscription],
      mailboxes: assignedMailboxes,
      requestedQuantity: 1,
      targetSubscriptionId,
      fixtureNow: reductionAt,
      quote: acceptedSecondQuote,
    });

    if (!secondPurchase.subscription) {
      throw new Error('Expected the second warmup purchase to materialize.');
    }

    const secondPurchasedSubscription = secondPurchase.subscription;
    const addedSecondResourceIds = secondPurchasedSubscription.linkedResources
      .map(({ id }) => id)
      .filter((id) => !retainedResourceIds.has(id));

    expect(secondPurchasedSubscription.quantity).toBe(3);
    expect(addedSecondResourceIds).toHaveLength(1);
    expect(addedSecondResourceIds).toEqual(
      secondReview.intent.resourceSnapshotIds,
    );

    const retriedSecondPurchase =
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId,
        subscriptions: [secondPurchasedSubscription],
        mailboxes: assignedMailboxes,
        requestedQuantity: 1,
        targetSubscriptionId,
        fixtureNow: reductionAt,
        quote: acceptedSecondQuote,
      });

    expect(retriedSecondPurchase.subscription).toEqual(
      secondPurchasedSubscription,
    );
    expect(retriedSecondPurchase.intent).toEqual(secondReview.intent);
  });

  it('rejects active mailbox and warmup target mismatches before quote construction', () => {
    const mailboxSubscription = managedMailboxSubscription({
      id: 'subscription-mailbox-active-target',
      quantity: 1,
      linkedResources: [mailboxSnapshot('snapshot-mailbox-active-target')],
    });
    const warmupSubscription = managedWarmupSubscription({
      id: 'subscription-warmup-active-target',
      quantity: 1,
      linkedResources: [
        warmupCapacitySnapshot('snapshot-warmup-active-target'),
      ],
    });

    expect(() =>
      resolveManagedEmailDesignMailboxPoolAcquisition({
        workspaceId,
        subscriptions: [mailboxSubscription],
        mailboxes: [mailbox({ id: 'mailbox-active-target-existing' })],
        selectedMailboxes: [
          mailbox({
            id: 'mailbox-active-target-selection',
            identity: 'Avery Miles',
            address: 'avery@northstar-outreach.com',
            subscriptionId: null,
          }),
        ],
        targetSubscriptionId: 'subscription-mailbox-conflicting-target',
        fixtureNow,
      }),
    ).toThrow();
    expect(() =>
      resolveManagedEmailDesignWarmupCapacityAcquisition({
        workspaceId,
        subscriptions: [warmupSubscription],
        mailboxes: [],
        requestedQuantity: 1,
        targetSubscriptionId: 'subscription-warmup-conflicting-target',
        fixtureNow,
      }),
    ).toThrow();
  });

  it('rejects replacement targets that collide with retained or other-product subscriptions', () => {
    const selectedMailbox = mailbox({
      id: 'mailbox-replacement-target-collision',
      identity: 'Avery Miles',
      address: 'avery@northstar-outreach.com',
      subscriptionId: null,
    });
    const canceledMailbox = managedMailboxSubscription({
      id: 'subscription-mailbox-canceled-target-collision',
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
    });
    const canceledWarmup = managedWarmupSubscription({
      id: 'subscription-warmup-canceled-target-collision',
      status: 'canceled',
      renewsAt: null,
      canceledAt: '2027-01-01T12:00:00.000Z',
    });
    const domainWithMailboxTarget = managedDomainSubscription({
      id: 'subscription-mailbox-cross-product-target',
    });
    const mailboxWithWarmupTarget = managedMailboxSubscription({
      id: 'subscription-warmup-cross-product-target',
    });
    const resolveAttempts: Array<() => unknown> = [
      () =>
        resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId,
          subscriptions: [canceledMailbox],
          mailboxes: [],
          selectedMailboxes: [selectedMailbox],
          targetSubscriptionId: canceledMailbox.id,
          fixtureNow,
        }),
      () =>
        resolveManagedEmailDesignWarmupCapacityAcquisition({
          workspaceId,
          subscriptions: [canceledWarmup],
          mailboxes: [],
          requestedQuantity: 1,
          targetSubscriptionId: canceledWarmup.id,
          fixtureNow,
        }),
      () =>
        resolveManagedEmailDesignMailboxPoolAcquisition({
          workspaceId,
          subscriptions: [domainWithMailboxTarget],
          mailboxes: [],
          selectedMailboxes: [selectedMailbox],
          targetSubscriptionId: domainWithMailboxTarget.id,
          fixtureNow,
        }),
      () =>
        resolveManagedEmailDesignWarmupCapacityAcquisition({
          workspaceId,
          subscriptions: [mailboxWithWarmupTarget],
          mailboxes: [],
          requestedQuantity: 1,
          targetSubscriptionId: mailboxWithWarmupTarget.id,
          fixtureNow,
        }),
    ];

    resolveAttempts.forEach((resolveAttempt) => {
      expect(resolveAttempt).toThrow();
    });
  });

  it('keeps only idle acquisition state identity-free', () => {
    const idle = createManagedEmailDesignAcquisitionOperation({
      operation: {
        status: 'idle',
        id: null,
        acceptedQuoteId: null,
        source: null,
        lines: [],
        subscriptionOperations: [],
      },
      resourceSnapshots: [],
      fixtureNow,
    });

    expect(idle).toEqual({
      status: 'idle',
      id: null,
      acceptedQuoteId: null,
      source: null,
      lines: [],
      subscriptionOperations: [],
    });
    expect(() =>
      createManagedEmailDesignAcquisitionOperation({
        operation: {
          status: 'idle',
          id: 'acquisition-idle-with-id',
          acceptedQuoteId: null,
          source: null,
          lines: [],
          subscriptionOperations: [],
        } as unknown as ManagedEmailDesignAcquisitionOperation,
        resourceSnapshots: [],
        fixtureNow,
      }),
    ).toThrow();
  });

  it('validates each source-specific acquisition composition and its normalized shared operations', () => {
    const domainQuote = quote(
      quoteDraft({
        lines: [domainQuoteLine()],
      }),
    );
    const mailboxQuote = quote(
      quoteDraft({
        lines: [
          mailboxQuoteLine({ id: 'quote-line-mailbox-mira' }),
          mailboxQuoteLine({
            id: 'quote-line-mailbox-jordan',
            resourceLabel: 'Jordan Lee <jordan@northstar-outreach.com>',
          }),
        ],
      }),
    );
    const warmupQuote = quote(
      quoteDraft({
        lines: [
          warmupQuoteLine({
            id: 'quote-line-warmup-1',
            resourceLabel: 'Warmup capacity slot 1',
          }),
          warmupQuoteLine({
            id: 'quote-line-warmup-2',
            resourceLabel: 'Warmup capacity slot 2',
          }),
        ],
      }),
    );
    const prewarmedQuote = quote(
      quoteDraft({
        lines: [
          domainQuoteLine({ id: 'quote-line-prewarmed-domain' }),
          mailboxQuoteLine({ id: 'quote-line-prewarmed-mailbox-mira' }),
          mailboxQuoteLine({
            id: 'quote-line-prewarmed-mailbox-jordan',
            resourceLabel: 'Jordan Lee <jordan@northstar-outreach.com>',
          }),
        ],
      }),
    );

    const sourceCases: Array<{
      source:
        | 'managed-domain'
        | 'managed-mailbox'
        | 'managed-warmup'
        | 'prewarmed';
      acquisitionQuote: ManagedEmailDesignQuote;
      operation: ManagedEmailDesignAcquisitionOperation;
      expectedProductOperations: string[];
    }> = [
      {
        source: 'managed-domain',
        acquisitionQuote: domainQuote,
        operation: acquisitionOperation({
          source: 'managed-domain',
          acceptedQuoteId: domainQuote.id,
          lines: [acquisitionLine()],
          subscriptionOperations: [subscriptionOperation()],
        }),
        expectedProductOperations: ['managed-domain'],
      },
      {
        source: 'managed-mailbox',
        acquisitionQuote: mailboxQuote,
        operation: acquisitionOperation({
          source: 'managed-mailbox',
          acceptedQuoteId: mailboxQuote.id,
          lines: [
            acquisitionLine({
              id: 'acquisition-line-mailbox-mira',
              quoteLineId: 'quote-line-mailbox-mira',
              resourceSnapshotId: 'snapshot-mailbox-mira',
              resourceOperationId: 'resource-operation-mailbox-mira',
              subscriptionOperationId: 'subscription-operation-mailbox',
              paymentEvidenceId: 'payment-mailbox-mira',
            }),
            acquisitionLine({
              id: 'acquisition-line-mailbox-jordan',
              quoteLineId: 'quote-line-mailbox-jordan',
              resourceSnapshotId: 'snapshot-mailbox-jordan',
              resourceOperationId: 'resource-operation-mailbox-jordan',
              subscriptionOperationId: 'subscription-operation-mailbox',
              paymentEvidenceId: 'payment-mailbox-jordan',
            }),
          ],
          subscriptionOperations: [
            subscriptionOperation({
              id: 'subscription-operation-mailbox',
              intent: mailboxIntent(),
            }),
          ],
        }),
        expectedProductOperations: ['managed-mailbox'],
      },
      {
        source: 'managed-warmup',
        acquisitionQuote: warmupQuote,
        operation: acquisitionOperation({
          source: 'managed-warmup',
          acceptedQuoteId: warmupQuote.id,
          lines: [
            acquisitionLine({
              id: 'acquisition-line-warmup-1',
              quoteLineId: 'quote-line-warmup-1',
              resourceSnapshotId: 'snapshot-warmup-capacity-1',
              resourceOperationId: 'resource-operation-warmup-1',
              subscriptionOperationId: 'subscription-operation-warmup',
              paymentEvidenceId: 'payment-warmup-1',
            }),
            acquisitionLine({
              id: 'acquisition-line-warmup-2',
              quoteLineId: 'quote-line-warmup-2',
              resourceSnapshotId: 'snapshot-warmup-capacity-2',
              resourceOperationId: 'resource-operation-warmup-2',
              subscriptionOperationId: 'subscription-operation-warmup',
              paymentEvidenceId: 'payment-warmup-2',
            }),
          ],
          subscriptionOperations: [
            subscriptionOperation({
              id: 'subscription-operation-warmup',
              intent: warmupIntent(),
            }),
          ],
        }),
        expectedProductOperations: ['managed-warmup'],
      },
      {
        source: 'prewarmed',
        acquisitionQuote: prewarmedQuote,
        operation: acquisitionOperation({
          source: 'prewarmed',
          acceptedQuoteId: prewarmedQuote.id,
          lines: [
            acquisitionLine({
              id: 'acquisition-line-prewarmed-domain',
              quoteLineId: 'quote-line-prewarmed-domain',
              resourceSnapshotId: 'snapshot-domain-northstar',
              resourceOperationId: 'resource-operation-prewarmed-domain',
              subscriptionOperationId:
                'subscription-operation-prewarmed-domain',
              paymentEvidenceId: 'payment-prewarmed-domain',
            }),
            acquisitionLine({
              id: 'acquisition-line-prewarmed-mailbox-mira',
              quoteLineId: 'quote-line-prewarmed-mailbox-mira',
              resourceSnapshotId: 'snapshot-mailbox-mira',
              dependsOnLineIds: ['acquisition-line-prewarmed-domain'],
              resourceOperationId: 'resource-operation-prewarmed-mailbox-mira',
              subscriptionOperationId:
                'subscription-operation-prewarmed-mailbox',
              paymentEvidenceId: 'payment-prewarmed-mailbox-mira',
            }),
            acquisitionLine({
              id: 'acquisition-line-prewarmed-mailbox-jordan',
              quoteLineId: 'quote-line-prewarmed-mailbox-jordan',
              resourceSnapshotId: 'snapshot-mailbox-jordan',
              dependsOnLineIds: ['acquisition-line-prewarmed-domain'],
              resourceOperationId:
                'resource-operation-prewarmed-mailbox-jordan',
              subscriptionOperationId:
                'subscription-operation-prewarmed-mailbox',
              paymentEvidenceId: 'payment-prewarmed-mailbox-jordan',
            }),
          ],
          subscriptionOperations: [
            subscriptionOperation({
              id: 'subscription-operation-prewarmed-domain',
              intent: domainIntent({
                targetSubscriptionId: 'subscription-prewarmed-domain',
              }),
            }),
            subscriptionOperation({
              id: 'subscription-operation-prewarmed-mailbox',
              intent: mailboxIntent({
                targetSubscriptionId: 'subscription-prewarmed-mailbox',
              }),
            }),
          ],
        }),
        expectedProductOperations: ['managed-domain', 'managed-mailbox'],
      },
    ];

    for (const sourceCase of sourceCases) {
      const created = createAcquisition({
        operation: sourceCase.operation,
        acquisitionQuote: sourceCase.acquisitionQuote,
      });

      expect(created.status).toBe('succeeded');
      expect(created.source).toBe(sourceCase.source);
      expect(
        created.subscriptionOperations.map(({ intent }) => intent.product),
      ).toEqual(sourceCase.expectedProductOperations);
      const intentShapes = created.subscriptionOperations.map(({ intent }) => ({
        product: intent.product,
        mode: intent.mode,
        quantityDelta: intent.quantityDelta,
        snapshotCount: intent.resourceSnapshotIds.length,
      }));

      if (sourceCase.source === 'managed-domain') {
        expect(intentShapes).toEqual([
          {
            product: 'managed-domain',
            mode: 'create',
            quantityDelta: 1,
            snapshotCount: 1,
          },
        ]);
      }
      if (sourceCase.source === 'managed-mailbox') {
        expect(intentShapes).toEqual([
          {
            product: 'managed-mailbox',
            mode: 'create',
            quantityDelta: 2,
            snapshotCount: 2,
          },
        ]);
      }
      if (sourceCase.source === 'managed-warmup') {
        expect(intentShapes).toEqual([
          {
            product: 'managed-warmup',
            mode: 'create',
            quantityDelta: 2,
            snapshotCount: 2,
          },
        ]);
      }
      if (sourceCase.source === 'prewarmed') {
        expect(intentShapes).toEqual([
          {
            product: 'managed-domain',
            mode: 'create',
            quantityDelta: 1,
            snapshotCount: 1,
          },
          {
            product: 'managed-mailbox',
            mode: 'create',
            quantityDelta: 2,
            snapshotCount: 2,
          },
        ]);
      }
      expect(
        new Set(
          created.lines.map(
            ({ subscriptionOperationId }) => subscriptionOperationId,
          ),
        ).size,
      ).toBe(sourceCase.source === 'prewarmed' ? 2 : 1);
    }
  });

  describe('acquisition cardinality and intent rejection boundaries', () => {
    const domainQuote = quote(quoteDraft({ lines: [domainQuoteLine()] }));
    const mailboxQuote = quote(
      quoteDraft({
        lines: [
          mailboxQuoteLine({ id: 'quote-line-mailbox-a' }),
          mailboxQuoteLine({
            id: 'quote-line-mailbox-b',
            resourceLabel: 'Jordan Lee <jordan@northstar-outreach.com>',
          }),
        ],
      }),
    );
    const validMailboxOperation = acquisitionOperation({
      source: 'managed-mailbox',
      acceptedQuoteId: mailboxQuote.id,
      lines: [
        acquisitionLine({
          id: 'line-mailbox-a',
          quoteLineId: 'quote-line-mailbox-a',
          resourceSnapshotId: 'snapshot-mailbox-mira',
          subscriptionOperationId: 'subscription-operation-mailbox',
          resourceOperationId: 'resource-operation-mailbox-a',
          paymentEvidenceId: 'payment-mailbox-a',
        }),
        acquisitionLine({
          id: 'line-mailbox-b',
          quoteLineId: 'quote-line-mailbox-b',
          resourceSnapshotId: 'snapshot-mailbox-jordan',
          subscriptionOperationId: 'subscription-operation-mailbox',
          resourceOperationId: 'resource-operation-mailbox-b',
          paymentEvidenceId: 'payment-mailbox-b',
        }),
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-mailbox',
          intent: mailboxIntent(),
        }),
      ],
    });
    const validPrewarmedQuote = quote(
      quoteDraft({
        lines: [
          domainQuoteLine({ id: 'quote-line-prewarmed-domain' }),
          mailboxQuoteLine({ id: 'quote-line-prewarmed-mailbox' }),
        ],
      }),
    );
    const validPrewarmedOperation = acquisitionOperation({
      source: 'prewarmed',
      acceptedQuoteId: validPrewarmedQuote.id,
      lines: [
        acquisitionLine({
          id: 'line-prewarmed-domain',
          quoteLineId: 'quote-line-prewarmed-domain',
          resourceSnapshotId: 'snapshot-domain-northstar',
          subscriptionOperationId: 'subscription-operation-prewarmed-domain',
          resourceOperationId: 'resource-operation-prewarmed-domain',
          paymentEvidenceId: 'payment-prewarmed-domain',
        }),
        acquisitionLine({
          id: 'line-prewarmed-mailbox',
          quoteLineId: 'quote-line-prewarmed-mailbox',
          resourceSnapshotId: 'snapshot-mailbox-mira',
          dependsOnLineIds: ['line-prewarmed-domain'],
          subscriptionOperationId: 'subscription-operation-prewarmed-mailbox',
          resourceOperationId: 'resource-operation-prewarmed-mailbox',
          paymentEvidenceId: 'payment-prewarmed-mailbox',
        }),
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-domain',
          intent: domainIntent(),
        }),
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-mailbox',
          intent: mailboxIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-mailbox-mira'],
          }),
        }),
      ],
    });
    const forbiddenPrewarmedWarmupQuote = quote(
      quoteDraft({
        id: 'quote-prewarmed-with-warmup',
        lines: [
          domainQuoteLine({ id: 'quote-line-prewarmed-warmup-domain' }),
          mailboxQuoteLine({ id: 'quote-line-prewarmed-warmup-mailbox' }),
          warmupQuoteLine({ id: 'quote-line-prewarmed-warmup-capacity' }),
        ],
      }),
    );
    const forbiddenPrewarmedWarmupOperation = acquisitionOperation({
      source: 'prewarmed',
      acceptedQuoteId: forbiddenPrewarmedWarmupQuote.id,
      lines: [
        acquisitionLine({
          id: 'line-prewarmed-warmup-domain',
          quoteLineId: 'quote-line-prewarmed-warmup-domain',
          resourceSnapshotId: 'snapshot-domain-northstar',
          subscriptionOperationId:
            'subscription-operation-prewarmed-warmup-domain',
          resourceOperationId: 'resource-operation-prewarmed-warmup-domain',
          paymentEvidenceId: 'payment-prewarmed-warmup-domain',
        }),
        acquisitionLine({
          id: 'line-prewarmed-warmup-mailbox',
          quoteLineId: 'quote-line-prewarmed-warmup-mailbox',
          resourceSnapshotId: 'snapshot-mailbox-mira',
          dependsOnLineIds: ['line-prewarmed-warmup-domain'],
          subscriptionOperationId:
            'subscription-operation-prewarmed-warmup-mailbox',
          resourceOperationId: 'resource-operation-prewarmed-warmup-mailbox',
          paymentEvidenceId: 'payment-prewarmed-warmup-mailbox',
        }),
        acquisitionLine({
          id: 'line-prewarmed-warmup-capacity',
          quoteLineId: 'quote-line-prewarmed-warmup-capacity',
          resourceSnapshotId: 'snapshot-warmup-capacity-1',
          dependsOnLineIds: ['line-prewarmed-warmup-mailbox'],
          subscriptionOperationId:
            'subscription-operation-prewarmed-warmup-capacity',
          resourceOperationId: 'resource-operation-prewarmed-warmup-capacity',
          paymentEvidenceId: 'payment-prewarmed-warmup-capacity',
        }),
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-warmup-domain',
          intent: domainIntent(),
        }),
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-warmup-mailbox',
          intent: mailboxIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-mailbox-mira'],
          }),
        }),
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-warmup-capacity',
          intent: warmupIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-warmup-capacity-1'],
          }),
        }),
      ],
    });
    const unacceptedDomainQuote = quote(
      quoteDraft({
        id: 'quote-unaccepted-acquisition',
        acceptedQuoteId: null,
        lines: [domainQuoteLine({ id: 'quote-line-unaccepted-acquisition' })],
      }),
    );
    const repricedLine = domainQuoteLine({
      id: 'quote-line-repriced-acquisition',
    });
    const repricedDomainQuote = quote({
      id: 'quote-repriced-acquisition',
      expiresAt: fixtureExpiry,
      acceptedQuoteId: null,
      lines: [repricedLine],
      totals: totalsFor([repricedLine]),
      status: 'price-changed',
      previousQuote: {
        id: 'quote-prior-acquisition',
        lines: [repricedLine],
        totals: totalsFor([repricedLine]),
      },
    } satisfies ManagedEmailDesignQuote);
    const warmupQuote = quote(
      quoteDraft({
        lines: [
          warmupQuoteLine({
            id: 'quote-line-warmup-intent',
            resourceLabel: 'Warmup capacity slot 1',
          }),
        ],
      }),
    );
    const validWarmupOperation = acquisitionOperation({
      source: 'managed-warmup',
      acceptedQuoteId: warmupQuote.id,
      lines: [
        acquisitionLine({
          id: 'line-warmup-intent',
          quoteLineId: 'quote-line-warmup-intent',
          resourceSnapshotId: 'snapshot-warmup-capacity-1',
          subscriptionOperationId: 'subscription-operation-warmup-intent',
          resourceOperationId: 'resource-operation-warmup-intent',
          paymentEvidenceId: 'payment-warmup-intent',
        }),
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-warmup-intent',
          intent: warmupIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-warmup-capacity-1'],
          }),
        }),
      ],
    });
    const invalidCases: Array<[string, () => unknown]> = [
      [
        'an empty non-idle operation',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              source: 'managed-domain',
              acceptedQuoteId: domainQuote.id,
              lines: [],
              subscriptionOperations: [],
            }),
          }),
      ],
      [
        'an operation whose accepted quote id does not match the reviewed quote',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              source: 'managed-domain',
              acceptedQuoteId: 'quote-not-accepted',
            }),
          }),
      ],
      [
        'an unaccepted quote claimed as accepted acquisition evidence',
        () =>
          createAcquisition({
            acquisitionQuote: unacceptedDomainQuote,
            operation: acquisitionOperation({
              acceptedQuoteId: unacceptedDomainQuote.id,
              lines: [
                acquisitionLine({
                  quoteLineId: 'quote-line-unaccepted-acquisition',
                }),
              ],
            }),
          }),
      ],
      [
        'a repriced quote claimed as accepted acquisition evidence',
        () =>
          createAcquisition({
            acquisitionQuote: repricedDomainQuote,
            operation: acquisitionOperation({
              acceptedQuoteId: repricedDomainQuote.id,
              lines: [
                acquisitionLine({
                  quoteLineId: 'quote-line-repriced-acquisition',
                }),
              ],
            }),
          }),
      ],
      [
        'an orphan subscription operation',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              source: 'managed-domain',
              acceptedQuoteId: domainQuote.id,
              subscriptionOperations: [
                subscriptionOperation(),
                subscriptionOperation({
                  id: 'subscription-operation-orphan',
                  intent: warmupIntent(),
                }),
              ],
            }),
          }),
      ],
      [
        'duplicate resource line ids',
        () =>
          createAcquisition({
            acquisitionQuote: mailboxQuote,
            operation: acquisitionOperation({
              ...validMailboxOperation,
              lines: [
                validMailboxOperation.lines[0],
                {
                  ...validMailboxOperation.lines[1],
                  id: validMailboxOperation.lines[0].id,
                },
              ],
            }),
          }),
      ],
      [
        'a source with the wrong product operation',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              source: 'managed-domain',
              acceptedQuoteId: domainQuote.id,
              subscriptionOperations: [
                subscriptionOperation({
                  intent: mailboxIntent({ quantityDelta: 1 }),
                }),
              ],
            }),
          }),
      ],
      [
        'a prewarmed mailbox missing its domain dependency',
        () =>
          createAcquisition({
            acquisitionQuote: validPrewarmedQuote,
            operation: acquisitionOperation({
              ...validPrewarmedOperation,
              lines: [
                validPrewarmedOperation.lines[0],
                {
                  ...validPrewarmedOperation.lines[1],
                  dependsOnLineIds: [],
                },
              ],
            }),
          }),
      ],
      [
        'a prewarmed acquisition with managed warmup',
        () =>
          createAcquisition({
            acquisitionQuote: forbiddenPrewarmedWarmupQuote,
            operation: forbiddenPrewarmedWarmupOperation,
          }),
      ],
      [
        'an acquisition line absent from its accepted quote',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              acceptedQuoteId: domainQuote.id,
              lines: [
                acquisitionLine({ quoteLineId: 'quote-line-not-listed' }),
              ],
            }),
          }),
      ],
      [
        'a quote line with no acquisition line',
        () =>
          createAcquisition({
            acquisitionQuote: mailboxQuote,
            operation: acquisitionOperation({
              source: 'managed-mailbox',
              acceptedQuoteId: mailboxQuote.id,
              lines: [validMailboxOperation.lines[0]],
              subscriptionOperations:
                validMailboxOperation.subscriptionOperations,
            }),
          }),
      ],
      [
        'a mailbox intent that uses domain snapshots',
        () =>
          createAcquisition({
            acquisitionQuote: mailboxQuote,
            operation: acquisitionOperation({
              ...validMailboxOperation,
              subscriptionOperations: [
                subscriptionOperation({
                  id: 'subscription-operation-mailbox',
                  intent: mailboxIntent({
                    resourceSnapshotIds: [domainSnapshot().id],
                  }),
                }),
              ],
            }),
          }),
      ],
      [
        'duplicate snapshot ids in a pooled intent',
        () =>
          createAcquisition({
            acquisitionQuote: mailboxQuote,
            operation: acquisitionOperation({
              ...validMailboxOperation,
              subscriptionOperations: [
                subscriptionOperation({
                  id: 'subscription-operation-mailbox',
                  intent: mailboxIntent({
                    resourceSnapshotIds: [
                      'snapshot-mailbox-mira',
                      'snapshot-mailbox-mira',
                    ],
                  }),
                }),
              ],
            }),
          }),
      ],
      [
        'a fractional mailbox intent delta',
        () =>
          createAcquisition({
            acquisitionQuote: mailboxQuote,
            operation: acquisitionOperation({
              ...validMailboxOperation,
              subscriptionOperations: [
                subscriptionOperation({
                  id: 'subscription-operation-mailbox',
                  intent: mailboxIntent({ quantityDelta: 1.5 }),
                }),
              ],
            }),
          }),
      ],
      [
        'a mailbox create intent whose delta does not match its snapshots',
        () =>
          createAcquisition({
            acquisitionQuote: mailboxQuote,
            operation: acquisitionOperation({
              ...validMailboxOperation,
              subscriptionOperations: [
                subscriptionOperation({
                  id: 'subscription-operation-mailbox',
                  intent: mailboxIntent({ quantityDelta: 1 }),
                }),
              ],
            }),
          }),
      ],
      [
        'a mailbox intent with an unsupported runtime mode',
        () =>
          createAcquisition({
            acquisitionQuote: mailboxQuote,
            operation: acquisitionOperation({
              ...validMailboxOperation,
              subscriptionOperations: [
                subscriptionOperation({
                  id: 'subscription-operation-mailbox',
                  intent: {
                    ...mailboxIntent(),
                    mode: 'unsupported',
                  } as unknown as ManagedEmailDesignSubscriptionIntent,
                }),
              ],
            }),
          }),
      ],
      [
        'a warmup intent whose delta does not match its capacity snapshots',
        () =>
          createAcquisition({
            acquisitionQuote: warmupQuote,
            operation: acquisitionOperation({
              ...validWarmupOperation,
              subscriptionOperations: [
                subscriptionOperation({
                  id: 'subscription-operation-warmup-intent',
                  intent: warmupIntent({
                    quantityDelta: 2,
                    resourceSnapshotIds: ['snapshot-warmup-capacity-1'],
                  }),
                }),
              ],
            }),
          }),
      ],
    ];

    for (const [description, build] of invalidCases) {
      it(`rejects ${description}`, () => {
        expect(build).toThrow();
      });
    }
  });

  describe('acquisition resource binding and recovery invariants', () => {
    const prewarmedQuote = quote(
      quoteDraft({
        id: 'quote-acquisition-resource-binding',
        lines: [
          domainQuoteLine({ id: 'quote-line-resource-domain' }),
          mailboxQuoteLine({ id: 'quote-line-resource-mailbox-mira' }),
          mailboxQuoteLine({
            id: 'quote-line-resource-mailbox-jordan',
            resourceLabel: 'Jordan Lee <jordan@northstar-outreach.com>',
          }),
        ],
      }),
    );
    const prewarmedOperation = acquisitionOperation({
      id: 'acquisition-resource-binding',
      source: 'prewarmed',
      acceptedQuoteId: prewarmedQuote.id,
      lines: [
        acquisitionLineWithResourceSnapshot('snapshot-domain-northstar', {
          id: 'line-resource-domain',
          quoteLineId: 'quote-line-resource-domain',
          resourceOperationId: 'resource-operation-resource-domain',
          subscriptionOperationId: 'subscription-operation-resource-domain',
          paymentEvidenceId: 'payment-resource-domain',
        }),
        acquisitionLineWithResourceSnapshot('snapshot-mailbox-mira', {
          id: 'line-resource-mailbox-mira',
          quoteLineId: 'quote-line-resource-mailbox-mira',
          dependsOnLineIds: ['line-resource-domain'],
          resourceOperationId: 'resource-operation-resource-mailbox-mira',
          subscriptionOperationId: 'subscription-operation-resource-mailbox',
          paymentEvidenceId: 'payment-resource-mailbox-mira',
        }),
        acquisitionLineWithResourceSnapshot('snapshot-mailbox-jordan', {
          id: 'line-resource-mailbox-jordan',
          quoteLineId: 'quote-line-resource-mailbox-jordan',
          dependsOnLineIds: ['line-resource-domain'],
          resourceOperationId: 'resource-operation-resource-mailbox-jordan',
          subscriptionOperationId: 'subscription-operation-resource-mailbox',
          paymentEvidenceId: 'payment-resource-mailbox-jordan',
        }),
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-resource-domain',
          intent: domainIntent({
            targetSubscriptionId: 'subscription-resource-domain',
          }),
        }),
        subscriptionOperation({
          id: 'subscription-operation-resource-mailbox',
          intent: mailboxIntent({
            targetSubscriptionId: 'subscription-resource-mailbox',
            quantityDelta: 2,
            resourceSnapshotIds: [
              'snapshot-mailbox-mira',
              'snapshot-mailbox-jordan',
            ],
          }),
        }),
      ],
    });
    const createPrewarmedAcquisition = (
      operation: ManagedEmailDesignAcquisitionOperation,
      resourceSnapshots = acquisitionResourceSnapshots,
    ) =>
      createAcquisition({
        operation,
        acquisitionQuote: prewarmedQuote,
        resourceSnapshots,
      });

    it('rejects an aggregate prewarmed mailbox line that leaves a pooled resource unbound', () => {
      const aggregateMailboxQuote = quote(
        quoteDraft({
          id: 'quote-acquisition-aggregate-resource-binding',
          lines: [
            domainQuoteLine({ id: 'quote-line-resource-domain' }),
            mailboxQuoteLine({
              id: 'quote-line-resource-mailboxes',
              resourceLabel: 'Mira Chen <mira@northstar-outreach.com>',
              quantity: 2,
            }),
          ],
        }),
      );
      const aggregateMailboxOperation = acquisitionOperation({
        ...prewarmedOperation,
        acceptedQuoteId: aggregateMailboxQuote.id,
        lines: [
          prewarmedOperation.lines[0],
          {
            ...prewarmedOperation.lines[1],
            quoteLineId: 'quote-line-resource-mailboxes',
          },
        ],
      });

      expect(() =>
        createManagedEmailDesignAcquisitionOperation({
          operation: aggregateMailboxOperation,
          quote: aggregateMailboxQuote,
          resourceSnapshots: acquisitionResourceSnapshots,
          fixtureNow,
        }),
      ).toThrow();
    });

    it('rejects subscription operations that share a target subscription id', () => {
      expect(createPrewarmedAcquisition(prewarmedOperation)).toMatchObject({
        status: 'succeeded',
      });

      expect(() =>
        createPrewarmedAcquisition(
          acquisitionOperation({
            ...prewarmedOperation,
            subscriptionOperations: [
              prewarmedOperation.subscriptionOperations[0],
              subscriptionOperation({
                id: 'subscription-operation-resource-mailbox',
                intent: mailboxIntent({
                  targetSubscriptionId: 'subscription-resource-domain',
                  quantityDelta: 2,
                  resourceSnapshotIds: [
                    'snapshot-mailbox-mira',
                    'snapshot-mailbox-jordan',
                  ],
                }),
              }),
            ],
          }),
        ),
      ).toThrow();
    });

    it('rejects acquisition lines ordered before their dependencies', () => {
      expect(createPrewarmedAcquisition(prewarmedOperation)).toMatchObject({
        status: 'succeeded',
      });

      expect(() =>
        createPrewarmedAcquisition(
          acquisitionOperation({
            ...prewarmedOperation,
            lines: [
              prewarmedOperation.lines[1],
              prewarmedOperation.lines[2],
              prewarmedOperation.lines[0],
            ],
          }),
        ),
      ).toThrow();
    });

    it('requires every acquisition line to name a resource snapshot', () => {
      const lineWithoutResourceSnapshot = {
        ...prewarmedOperation.lines[0],
      } as unknown as Record<string, unknown>;
      delete lineWithoutResourceSnapshot.resourceSnapshotId;

      expect(createPrewarmedAcquisition(prewarmedOperation)).toMatchObject({
        status: 'succeeded',
      });
      expect(() =>
        createPrewarmedAcquisition(
          acquisitionOperation({
            ...prewarmedOperation,
            lines: [
              lineWithoutResourceSnapshot as unknown as ManagedEmailDesignAcquisitionLine,
              prewarmedOperation.lines[1],
              prewarmedOperation.lines[2],
            ],
          }),
        ),
      ).toThrow();
    });

    it('rejects an acquisition-line resource snapshot absent from its subscription intent', () => {
      const unboundSnapshot = mailboxSnapshot(
        'snapshot-mailbox-not-in-intent',
        'Mira Chen <mira@northstar-outreach.com>',
      );
      const lineWithUnboundResourceSnapshot = {
        ...prewarmedOperation.lines[1],
        resourceSnapshotId: unboundSnapshot.id,
      };

      expect(createPrewarmedAcquisition(prewarmedOperation)).toMatchObject({
        status: 'succeeded',
      });
      expect(() =>
        createPrewarmedAcquisition(
          acquisitionOperation({
            ...prewarmedOperation,
            lines: [
              prewarmedOperation.lines[0],
              lineWithUnboundResourceSnapshot,
              prewarmedOperation.lines[2],
            ],
          }),
          [...acquisitionResourceSnapshots, unboundSnapshot],
        ),
      ).toThrow();
    });

    it('rejects swapped mailbox acquisition-line resource snapshot bindings', () => {
      const miraLineWithJordanSnapshot = {
        ...prewarmedOperation.lines[1],
        resourceSnapshotId: 'snapshot-mailbox-jordan',
      };
      const jordanLineWithMiraSnapshot = {
        ...prewarmedOperation.lines[2],
        resourceSnapshotId: 'snapshot-mailbox-mira',
      };

      expect(createPrewarmedAcquisition(prewarmedOperation)).toMatchObject({
        status: 'succeeded',
      });
      expect(() =>
        createPrewarmedAcquisition(
          acquisitionOperation({
            ...prewarmedOperation,
            lines: [
              prewarmedOperation.lines[0],
              miraLineWithJordanSnapshot,
              jordanLineWithMiraSnapshot,
            ],
          }),
        ),
      ).toThrow();
    });
    it('rejects duplicate mailbox acquisition-line resource snapshot bindings', () => {
      const duplicateSnapshotQuote = quote(
        quoteDraft({
          id: 'quote-acquisition-duplicate-resource-binding',
          lines: [
            domainQuoteLine({ id: 'quote-line-resource-domain' }),
            mailboxQuoteLine({ id: 'quote-line-resource-mailbox-mira' }),
            mailboxQuoteLine({
              id: 'quote-line-resource-mailbox-jordan',
              resourceLabel: 'Mira Chen <mira@northstar-outreach.com>',
            }),
          ],
        }),
      );
      const operationWithDuplicateSnapshotBinding = acquisitionOperation({
        ...prewarmedOperation,
        acceptedQuoteId: duplicateSnapshotQuote.id,
        lines: [
          prewarmedOperation.lines[0],
          prewarmedOperation.lines[1],
          {
            ...prewarmedOperation.lines[2],
            resourceSnapshotId: 'snapshot-mailbox-mira',
          },
        ],
      });

      expect(() =>
        createManagedEmailDesignAcquisitionOperation({
          operation: operationWithDuplicateSnapshotBinding,
          quote: duplicateSnapshotQuote,
          resourceSnapshots: acquisitionResourceSnapshots,
          fixtureNow,
        }),
      ).toThrow();
    });

    it('returns staged deterministic retries without changing commercial identities', () => {
      const retryQuote = quote(
        quoteDraft({
          id: 'quote-acquisition-retry-order',
          lines: [
            domainQuoteLine({ id: 'quote-line-retry-domain' }),
            mailboxQuoteLine({
              id: 'quote-line-retry-mailbox-pending',
            }),
            mailboxQuoteLine({
              id: 'quote-line-retry-mailbox-failed',
              resourceLabel: 'Jordan Lee <jordan@northstar-outreach.com>',
            }),
            mailboxQuoteLine({
              id: 'quote-line-retry-mailbox-unknown',
              resourceLabel: 'Rory Singh <rory@northstar-outreach.com>',
            }),
          ],
        }),
      );
      const rorySnapshot = mailboxSnapshot(
        'snapshot-mailbox-rory',
        'Rory Singh <rory@northstar-outreach.com>',
      );
      const sharedMailboxSubscriptionOperationId =
        'subscription-operation-retry-mailbox';
      const retryOperation = acquisitionOperation({
        id: 'acquisition-retry-order',
        status: 'reconciliation-required',
        source: 'prewarmed',
        acceptedQuoteId: retryQuote.id,
        lines: [
          acquisitionLineWithResourceSnapshot('snapshot-domain-northstar', {
            id: 'line-retry-domain',
            quoteLineId: 'quote-line-retry-domain',
            resourceOperationId: 'resource-operation-retry-domain',
            subscriptionOperationId: 'subscription-operation-retry-domain',
            paymentEvidenceId: 'payment-retry-domain',
          }),
          acquisitionLineWithResourceSnapshot('snapshot-mailbox-mira', {
            id: 'line-retry-mailbox-pending',
            quoteLineId: 'quote-line-retry-mailbox-pending',
            dependsOnLineIds: ['line-retry-domain'],
            resourceOperationId: 'resource-operation-retry-mailbox-pending',
            subscriptionOperationId: sharedMailboxSubscriptionOperationId,
            paymentEvidenceId: 'payment-retry-mailbox-pending',
            resourceOutcome: 'blocked',
            paymentOutcome: 'pending',
          }),
          acquisitionLineWithResourceSnapshot('snapshot-mailbox-jordan', {
            id: 'line-retry-mailbox-failed',
            quoteLineId: 'quote-line-retry-mailbox-failed',
            dependsOnLineIds: ['line-retry-domain'],
            resourceOperationId: 'resource-operation-retry-mailbox-failed',
            subscriptionOperationId: sharedMailboxSubscriptionOperationId,
            paymentEvidenceId: 'payment-retry-mailbox-failed',
            resourceOutcome: 'blocked',
            paymentOutcome: 'failed',
          }),
          acquisitionLineWithResourceSnapshot('snapshot-mailbox-rory', {
            id: 'line-retry-mailbox-unknown',
            quoteLineId: 'quote-line-retry-mailbox-unknown',
            dependsOnLineIds: ['line-retry-domain'],
            resourceOperationId: 'resource-operation-retry-mailbox-unknown',
            subscriptionOperationId: sharedMailboxSubscriptionOperationId,
            paymentEvidenceId: 'payment-retry-mailbox-unknown',
            resourceOutcome: 'blocked',
            paymentOutcome: 'unknown',
          }),
        ],
        subscriptionOperations: [
          subscriptionOperation({
            id: 'subscription-operation-retry-domain',
            intent: domainIntent({
              targetSubscriptionId: 'subscription-retry-domain',
            }),
          }),
          subscriptionOperation({
            id: sharedMailboxSubscriptionOperationId,
            intent: mailboxIntent({
              targetSubscriptionId: 'subscription-retry-mailbox',
              quantityDelta: 3,
              resourceSnapshotIds: [
                'snapshot-mailbox-mira',
                'snapshot-mailbox-jordan',
                'snapshot-mailbox-rory',
              ],
            }),
            outcome: 'blocked',
          }),
        ],
      });
      const paymentsResolvedOperation = acquisitionOperation({
        ...retryOperation,
        status: 'pending',
        lines: retryOperation.lines.map((line) =>
          line.subscriptionOperationId === sharedMailboxSubscriptionOperationId
            ? { ...line, paymentOutcome: 'completed' as const }
            : line,
        ),
        subscriptionOperations: retryOperation.subscriptionOperations.map(
          (subscriptionOperation) =>
            subscriptionOperation.id === sharedMailboxSubscriptionOperationId
              ? { ...subscriptionOperation, outcome: 'pending' as const }
              : subscriptionOperation,
        ),
      });
      const subscriptionResolvedOperation = acquisitionOperation({
        ...paymentsResolvedOperation,
        status: 'pending',
        lines: paymentsResolvedOperation.lines.map((line) =>
          line.subscriptionOperationId === sharedMailboxSubscriptionOperationId
            ? { ...line, resourceOutcome: 'pending' as const }
            : line,
        ),
        subscriptionOperations:
          paymentsResolvedOperation.subscriptionOperations.map(
            (subscriptionOperation) =>
              subscriptionOperation.id === sharedMailboxSubscriptionOperationId
                ? {
                    ...subscriptionOperation,
                    outcome: 'completed' as const,
                  }
                : subscriptionOperation,
          ),
      });
      const resourcesResolvedOperation = acquisitionOperation({
        ...subscriptionResolvedOperation,
        status: 'succeeded',
        lines: subscriptionResolvedOperation.lines.map((line) =>
          line.subscriptionOperationId === sharedMailboxSubscriptionOperationId
            ? { ...line, resourceOutcome: 'completed' as const }
            : line,
        ),
      });
      const retrySnapshots = [...acquisitionResourceSnapshots, rorySnapshot];
      const getCommercialIdentity = (
        operation: ManagedEmailDesignNonIdleAcquisitionOperation,
      ) => ({
        purchaseReference: operation.id,
        acceptedQuoteId: operation.acceptedQuoteId,
        quoteId: retryQuote.id,
        quoteLineIds: operation.lines.map(({ quoteLineId }) => quoteLineId),
        lineIds: operation.lines.map(({ id }) => id),
        paymentEvidenceIds: operation.lines.map(
          ({ paymentEvidenceId }) => paymentEvidenceId,
        ),
        subscriptionOperationIds: operation.subscriptionOperations.map(
          ({ id }) => id,
        ),
        resourceOperationIds: operation.lines.map(
          ({ resourceOperationId }) => resourceOperationId,
        ),
        resourceSnapshotIds: operation.lines.map(
          ({ resourceSnapshotId }) => resourceSnapshotId,
        ),
        subscriptionIntentResourceSnapshotIds:
          operation.subscriptionOperations.flatMap(
            ({ intent }) => intent.resourceSnapshotIds,
          ),
      });
      const initialCommercialIdentity = getCommercialIdentity(retryOperation);
      const retryStages = [
        retryOperation,
        paymentsResolvedOperation,
        subscriptionResolvedOperation,
        resourcesResolvedOperation,
      ];

      retryStages.forEach((operation) => {
        expect(
          createAcquisition({
            operation,
            acquisitionQuote: retryQuote,
            resourceSnapshots: retrySnapshots,
          }),
        ).toMatchObject({ status: operation.status });
      });
      expect(
        retryStages.map((operation) =>
          getManagedEmailDesignAcquisitionRetryOrder(operation),
        ),
      ).toEqual([
        [
          { kind: 'payment', id: 'payment-retry-mailbox-pending' },
          { kind: 'payment', id: 'payment-retry-mailbox-failed' },
          { kind: 'payment', id: 'payment-retry-mailbox-unknown' },
        ],
        [
          {
            kind: 'subscription',
            id: sharedMailboxSubscriptionOperationId,
          },
        ],
        [
          {
            kind: 'resource',
            id: 'resource-operation-retry-mailbox-pending',
          },
          {
            kind: 'resource',
            id: 'resource-operation-retry-mailbox-failed',
          },
          {
            kind: 'resource',
            id: 'resource-operation-retry-mailbox-unknown',
          },
        ],
        [],
      ]);
      expect(
        getManagedEmailDesignAcquisitionRetryOrder(retryOperation, 'pending'),
      ).toEqual([{ kind: 'payment', id: 'payment-retry-mailbox-pending' }]);
      expect(
        getManagedEmailDesignAcquisitionRetryOrder(retryOperation, 'failed'),
      ).toEqual([{ kind: 'payment', id: 'payment-retry-mailbox-failed' }]);
      expect(
        getManagedEmailDesignAcquisitionRetryOrder(retryOperation, 'unknown'),
      ).toEqual([{ kind: 'payment', id: 'payment-retry-mailbox-unknown' }]);
      expect(
        retryStages.map((operation) => getCommercialIdentity(operation)),
      ).toEqual([
        initialCommercialIdentity,
        initialCommercialIdentity,
        initialCommercialIdentity,
        initialCommercialIdentity,
      ]);
    });
  });

  it('queues only currently ready acquisition work with normalized operation identities', () => {
    const prewarmedQuote = quote(
      quoteDraft({
        lines: [
          domainQuoteLine({ id: 'quote-line-prewarmed-domain' }),
          mailboxQuoteLine({ id: 'quote-line-prewarmed-mailbox' }),
        ],
      }),
    );
    const operation = acquisitionOperation({
      status: 'pending',
      source: 'prewarmed',
      acceptedQuoteId: prewarmedQuote.id,
      lines: [
        acquisitionLine({
          id: 'line-prewarmed-domain',
          quoteLineId: 'quote-line-prewarmed-domain',
          resourceSnapshotId: 'snapshot-domain-northstar',
          subscriptionOperationId: 'subscription-operation-prewarmed-domain',
          resourceOperationId: 'resource-operation-prewarmed-domain',
          paymentEvidenceId: 'payment-prewarmed-domain',
          resourceOutcome: 'pending',
          paymentOutcome: 'completed',
        }),
        acquisitionLine({
          id: 'line-prewarmed-mailbox',
          quoteLineId: 'quote-line-prewarmed-mailbox',
          resourceSnapshotId: 'snapshot-mailbox-mira',
          dependsOnLineIds: ['line-prewarmed-domain'],
          subscriptionOperationId: 'subscription-operation-prewarmed-mailbox',
          resourceOperationId: 'resource-operation-prewarmed-mailbox',
          paymentEvidenceId: 'payment-prewarmed-mailbox',
          resourceOutcome: 'blocked',
          paymentOutcome: 'completed',
        }),
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-domain',
          intent: domainIntent(),
          outcome: 'completed',
        }),
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-mailbox',
          intent: mailboxIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-mailbox-mira'],
          }),
          outcome: 'completed',
        }),
      ],
    });
    const paymentFirst = acquisitionOperation({
      status: 'pending',
      source: 'prewarmed',
      acceptedQuoteId: prewarmedQuote.id,
      lines: [
        {
          ...operation.lines[0],
          resourceOutcome: 'completed',
        },
        {
          ...operation.lines[1],
          paymentOutcome: 'pending',
          resourceOutcome: 'blocked',
        },
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-domain',
          intent: domainIntent(),
          outcome: 'completed',
        }),
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-mailbox',
          intent: mailboxIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-mailbox-mira'],
          }),
          outcome: 'blocked',
        }),
      ],
    });
    const subscriptionReady = acquisitionOperation({
      ...paymentFirst,
      lines: [
        paymentFirst.lines[0],
        {
          ...paymentFirst.lines[1],
          paymentOutcome: 'completed',
        },
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-domain',
          intent: domainIntent(),
          outcome: 'completed',
        }),
        subscriptionOperation({
          id: 'subscription-operation-prewarmed-mailbox',
          intent: mailboxIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-mailbox-mira'],
          }),
          outcome: 'pending',
        }),
      ],
    });

    expect(
      createAcquisition({ operation, acquisitionQuote: prewarmedQuote }),
    ).toMatchObject({
      status: 'pending',
      lines: [
        { id: 'line-prewarmed-domain', resourceOutcome: 'pending' },
        { id: 'line-prewarmed-mailbox', resourceOutcome: 'blocked' },
      ],
    });
    expect(
      createAcquisition({
        operation: paymentFirst,
        acquisitionQuote: prewarmedQuote,
      }),
    ).toMatchObject({
      status: 'pending',
    });
    expect(getManagedEmailDesignAcquisitionRetryOrder(paymentFirst)).toEqual([
      { kind: 'payment', id: 'payment-prewarmed-mailbox' },
    ]);
    expect(getManagedEmailDesignAcquisitionRetryOrder(operation)).toEqual([
      { kind: 'resource', id: 'resource-operation-prewarmed-domain' },
    ]);
    expect(
      getManagedEmailDesignAcquisitionRetryOrder(subscriptionReady),
    ).toEqual([
      { kind: 'subscription', id: 'subscription-operation-prewarmed-mailbox' },
    ]);

    const domainCompleted = acquisitionOperation({
      ...operation,
      lines: [
        { ...operation.lines[0], resourceOutcome: 'completed' },
        { ...operation.lines[1], resourceOutcome: 'pending' },
      ],
    });

    expect(getManagedEmailDesignAcquisitionRetryOrder(domainCompleted)).toEqual(
      [{ kind: 'resource', id: 'resource-operation-prewarmed-mailbox' }],
    );
  });

  it('derives acquisition status from the closed graph instead of trusting a supplied root status', () => {
    const prewarmedQuote = quote(
      quoteDraft({
        lines: [
          domainQuoteLine({ id: 'quote-line-graph-domain' }),
          mailboxQuoteLine({ id: 'quote-line-graph-mailbox' }),
        ],
      }),
    );
    const mixedFailureAndPending = acquisitionOperation({
      status: 'pending',
      source: 'prewarmed',
      acceptedQuoteId: prewarmedQuote.id,
      lines: [
        acquisitionLine({
          id: 'line-graph-domain',
          quoteLineId: 'quote-line-graph-domain',
          resourceSnapshotId: 'snapshot-domain-northstar',
          subscriptionOperationId: 'subscription-operation-graph-domain',
          resourceOperationId: 'resource-operation-graph-domain',
          paymentEvidenceId: 'payment-graph-domain',
          paymentOutcome: 'pending',
          resourceOutcome: 'blocked',
        }),
        acquisitionLine({
          id: 'line-graph-mailbox',
          quoteLineId: 'quote-line-graph-mailbox',
          resourceSnapshotId: 'snapshot-mailbox-mira',
          dependsOnLineIds: ['line-graph-domain'],
          subscriptionOperationId: 'subscription-operation-graph-mailbox',
          resourceOperationId: 'resource-operation-graph-mailbox',
          paymentEvidenceId: 'payment-graph-mailbox',
          paymentOutcome: 'failed',
          resourceOutcome: 'blocked',
        }),
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-graph-domain',
          intent: domainIntent(),
          outcome: 'blocked',
        }),
        subscriptionOperation({
          id: 'subscription-operation-graph-mailbox',
          intent: mailboxIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-mailbox-mira'],
          }),
          outcome: 'blocked',
        }),
      ],
    });
    const partialAfterFailure = acquisitionOperation({
      status: 'partial',
      source: 'prewarmed',
      acceptedQuoteId: prewarmedQuote.id,
      lines: [
        {
          ...mixedFailureAndPending.lines[0],
          paymentOutcome: 'failed',
          resourceOutcome: 'blocked',
        },
        {
          ...mixedFailureAndPending.lines[1],
          paymentOutcome: 'completed',
          resourceOutcome: 'blocked',
        },
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-graph-domain',
          intent: domainIntent(),
          outcome: 'blocked',
        }),
        subscriptionOperation({
          id: 'subscription-operation-graph-mailbox',
          intent: mailboxIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-mailbox-mira'],
          }),
          outcome: 'completed',
        }),
      ],
    });
    const domainCompletedDespiteMailboxFailure = acquisitionOperation({
      status: 'partial',
      source: 'prewarmed',
      acceptedQuoteId: prewarmedQuote.id,
      lines: [
        {
          ...mixedFailureAndPending.lines[0],
          paymentOutcome: 'completed',
          resourceOutcome: 'completed',
        },
        {
          ...mixedFailureAndPending.lines[1],
          paymentOutcome: 'failed',
          resourceOutcome: 'blocked',
        },
      ],
      subscriptionOperations: [
        subscriptionOperation({
          id: 'subscription-operation-graph-domain',
          intent: domainIntent(),
          outcome: 'completed',
        }),
        subscriptionOperation({
          id: 'subscription-operation-graph-mailbox',
          intent: mailboxIntent({
            quantityDelta: 1,
            resourceSnapshotIds: ['snapshot-mailbox-mira'],
          }),
          outcome: 'blocked',
        }),
      ],
    });
    const failedWithoutCompletedWork = acquisitionOperation({
      status: 'failed',
      source: 'managed-domain',
      acceptedQuoteId: 'quote-graph-failed-domain',
      lines: [
        acquisitionLine({
          id: 'line-graph-failed-domain',
          quoteLineId: 'quote-line-graph-failed-domain',
          paymentEvidenceId: 'payment-graph-failed-domain',
          paymentOutcome: 'failed',
          resourceOutcome: 'blocked',
        }),
      ],
      subscriptionOperations: [subscriptionOperation({ outcome: 'blocked' })],
    });
    const unknown = acquisitionOperation({
      status: 'reconciliation-required',
      source: 'managed-domain',
      acceptedQuoteId: prewarmedQuote.id,
      lines: [
        acquisitionLine({
          id: 'line-graph-unknown',
          quoteLineId: 'quote-line-graph-domain',
          paymentEvidenceId: 'payment-graph-unknown',
          paymentOutcome: 'unknown',
          resourceOutcome: 'blocked',
        }),
      ],
      subscriptionOperations: [subscriptionOperation({ outcome: 'blocked' })],
    });

    expect(getManagedEmailDesignAcquisitionStatus(mixedFailureAndPending)).toBe(
      'pending',
    );
    expect(getManagedEmailDesignAcquisitionStatus(partialAfterFailure)).toBe(
      'partial',
    );
    expect(
      getManagedEmailDesignAcquisitionStatus(
        domainCompletedDespiteMailboxFailure,
      ),
    ).toBe('partial');
    expect(
      getManagedEmailDesignAcquisitionStatus(failedWithoutCompletedWork),
    ).toBe('failed');
    expect(getManagedEmailDesignAcquisitionStatus(unknown)).toBe(
      'reconciliation-required',
    );
    expect(
      createAcquisition({
        operation: mixedFailureAndPending,
        acquisitionQuote: prewarmedQuote,
      }).status,
    ).toBe('pending');
    expect(
      createAcquisition({
        operation: partialAfterFailure,
        acquisitionQuote: prewarmedQuote,
      }).status,
    ).toBe('partial');
    expect(
      createAcquisition({
        operation: domainCompletedDespiteMailboxFailure,
        acquisitionQuote: prewarmedQuote,
      }).status,
    ).toBe('partial');
  });

  describe('closed acquisition graph rejection boundaries', () => {
    const domainQuote = quote(
      quoteDraft({
        lines: [domainQuoteLine({ id: 'quote-line-closed-domain' })],
      }),
    );
    const pendingPayment = acquisitionOperation({
      status: 'pending',
      acceptedQuoteId: domainQuote.id,
      lines: [
        acquisitionLine({
          quoteLineId: 'quote-line-closed-domain',
          paymentOutcome: 'pending',
          resourceOutcome: 'blocked',
        }),
      ],
      subscriptionOperations: [subscriptionOperation({ outcome: 'blocked' })],
    });
    const completedPrerequisites = acquisitionOperation({
      status: 'succeeded',
      acceptedQuoteId: domainQuote.id,
      lines: [
        acquisitionLine({
          quoteLineId: 'quote-line-closed-domain',
          paymentOutcome: 'completed',
          resourceOutcome: 'completed',
        }),
      ],
      subscriptionOperations: [subscriptionOperation({ outcome: 'completed' })],
    });
    const cycleMailboxQuote = quote(
      quoteDraft({
        lines: [
          mailboxQuoteLine({ id: 'quote-line-cycle-mailbox-a' }),
          mailboxQuoteLine({
            id: 'quote-line-cycle-mailbox-b',
            resourceLabel: 'Jordan Lee <jordan@northstar-outreach.com>',
          }),
        ],
      }),
    );
    const invalidCases: Array<[string, () => unknown]> = [
      [
        'succeeded status with a pending payment',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              ...pendingPayment,
              status: 'succeeded',
            }),
          }),
      ],
      [
        'a non-blocked shared operation before all referenced payments complete',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              ...pendingPayment,
              subscriptionOperations: [
                subscriptionOperation({ outcome: 'pending' }),
              ],
            }),
          }),
      ],
      [
        'a non-blocked resource before its payment and subscription complete',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              ...pendingPayment,
              lines: [
                {
                  ...pendingPayment.lines[0],
                  resourceOutcome: 'pending',
                },
              ],
            }),
          }),
      ],
      [
        'a blocked shared operation after all of its payments complete',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              ...completedPrerequisites,
              status: 'pending',
              subscriptionOperations: [
                subscriptionOperation({ outcome: 'blocked' }),
              ],
              lines: [
                {
                  ...completedPrerequisites.lines[0],
                  resourceOutcome: 'blocked',
                },
              ],
            }),
          }),
      ],
      [
        'an orphan blocked resource after all prerequisites complete',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              ...completedPrerequisites,
              status: 'pending',
              lines: [
                {
                  ...completedPrerequisites.lines[0],
                  resourceOutcome: 'blocked',
                },
              ],
            }),
          }),
      ],
      [
        'a subscription operation whose id is not referenced by any resource line',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              ...completedPrerequisites,
              subscriptionOperations: [
                subscriptionOperation({
                  id: 'subscription-operation-unreferenced',
                }),
              ],
            }),
          }),
      ],
      [
        'a resource line pointing at a missing shared operation',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              ...completedPrerequisites,
              lines: [
                {
                  ...completedPrerequisites.lines[0],
                  subscriptionOperationId: 'subscription-operation-missing',
                },
              ],
            }),
          }),
      ],
      [
        'a resource line that depends on itself',
        () =>
          createAcquisition({
            acquisitionQuote: domainQuote,
            operation: acquisitionOperation({
              status: 'failed',
              acceptedQuoteId: domainQuote.id,
              lines: [
                acquisitionLine({
                  id: 'line-closed-self-cycle',
                  quoteLineId: 'quote-line-closed-domain',
                  dependsOnLineIds: ['line-closed-self-cycle'],
                  resourceOutcome: 'blocked',
                  paymentOutcome: 'completed',
                }),
              ],
              subscriptionOperations: [
                subscriptionOperation({ outcome: 'completed' }),
              ],
            }),
          }),
      ],
      [
        'resource lines that form a multi-line dependency cycle',
        () =>
          createAcquisition({
            acquisitionQuote: cycleMailboxQuote,
            operation: acquisitionOperation({
              status: 'failed',
              source: 'managed-mailbox',
              acceptedQuoteId: cycleMailboxQuote.id,
              lines: [
                acquisitionLine({
                  id: 'line-cycle-mailbox-a',
                  quoteLineId: 'quote-line-cycle-mailbox-a',
                  resourceSnapshotId: 'snapshot-mailbox-mira',
                  dependsOnLineIds: ['line-cycle-mailbox-b'],
                  subscriptionOperationId:
                    'subscription-operation-cycle-mailbox',
                  resourceOperationId: 'resource-operation-cycle-mailbox-a',
                  paymentEvidenceId: 'payment-cycle-mailbox-a',
                  resourceOutcome: 'blocked',
                  paymentOutcome: 'completed',
                }),
                acquisitionLine({
                  id: 'line-cycle-mailbox-b',
                  quoteLineId: 'quote-line-cycle-mailbox-b',
                  resourceSnapshotId: 'snapshot-mailbox-jordan',
                  dependsOnLineIds: ['line-cycle-mailbox-a'],
                  subscriptionOperationId:
                    'subscription-operation-cycle-mailbox',
                  resourceOperationId: 'resource-operation-cycle-mailbox-b',
                  paymentEvidenceId: 'payment-cycle-mailbox-b',
                  resourceOutcome: 'blocked',
                  paymentOutcome: 'completed',
                }),
              ],
              subscriptionOperations: [
                subscriptionOperation({
                  id: 'subscription-operation-cycle-mailbox',
                  intent: mailboxIntent(),
                  outcome: 'completed',
                }),
              ],
            }),
          }),
      ],
    ];

    for (const [description, build] of invalidCases) {
      it(`rejects ${description}`, () => {
        expect(build).toThrow();
      });
    }
  });
  it('translates fixture-owned diagnostics, validation messages, and review copy at the active locale', () => {
    const previousLocale = i18n.locale;
    const locale = 'fixture-localization';
    const normalizedDomain = 'northstar-outreach.com';
    const diagnostic =
      getManagedEmailDesignMailboxConnectionSafeDiagnosticMessage(
        managedEmailDesignMailboxConnectionSafeDiagnostics[0],
      );
    const sendingCapabilityReason =
      getManagedEmailDesignMailboxSendingCapabilityReasonMessage(
        'SMTP is not configured, so this mailbox cannot send mail.',
      );
    const domainReview = createManagedDomainReview(normalizedDomain);
    const mailboxReview = createManagedMailboxReview({
      address: `mira@${normalizedDomain}`,
      domain: normalizedDomain,
    });
    const prewarmedReview = createPrewarmedBundleReview({
      id: 'prewarmed-localization',
      domain: normalizedDomain,
      mailboxIdentities: [],
    });
    const normalizedBundleDomain = 'harborline-mail.com';
    const bundle = {
      id: 'prewarmed-localization-conflict',
      domain: normalizedBundleDomain,
      mailboxIdentities: [
        {
          identity: 'Mira Chen',
          address: `mira@${normalizedBundleDomain}`,
        },
      ],
    } satisfies ManagedEmailDesignPrewarmedBundle;
    const bundleWithDuplicateIdentities = {
      ...bundle,
      mailboxIdentities: [
        ...bundle.mailboxIdentities,
        ...bundle.mailboxIdentities,
      ],
    } satisfies ManagedEmailDesignPrewarmedBundle;
    const emptyDomainMessage = msg`Enter a domain name.`;
    const invalidDomainMessage = msg`Enter a valid domain name, such as example.com.`;
    const duplicateDomainMessage = msg`${normalizedDomain} already exists in this local domain inventory.`;
    const invalidMailboxMessage = msg`Enter a full email address, such as name@example.com.`;
    const duplicateMailboxMessage = msg`That mailbox already exists in this local inventory.`;
    const duplicateBundleIdentityMessage = msg`Cannot select this fixed bundle because its mailbox identities are not unique.`;
    const duplicateBundleDomainMessage = msg`Cannot select this fixed bundle because its domain already exists: ${normalizedBundleDomain}.`;

    i18n.load(locale, {
      [emptyDomainMessage.id]: 'Saisissez un domaine.',
      [invalidDomainMessage.id]: 'Saisissez un domaine valide.',
      [duplicateDomainMessage.id]: 'Ce domaine existe déjà.',
      [invalidMailboxMessage.id]: 'Saisissez une adresse e-mail complète.',
      [duplicateMailboxMessage.id]: 'Cette boîte aux lettres existe déjà.',
      [duplicateBundleIdentityMessage.id]:
        'Les identités de ce lot ne sont pas uniques.',
      [duplicateBundleDomainMessage.id]: 'Le domaine de ce lot existe déjà.',
      [diagnostic.id]: 'Diagnostic de connexion traduit.',
      [sendingCapabilityReason.id]: 'Raison de capacité traduite.',
      [domainReview.title.id]: 'Vérifier le domaine géré',
      [domainReview.description.id]: 'Description du domaine géré traduite.',
      [mailboxReview.title.id]: 'Vérifier la boîte aux lettres gérée',
      [mailboxReview.description.id]:
        'Description de la boîte aux lettres gérée traduite.',
      [prewarmedReview.title.id]: 'Vérifier le lot préchauffé',
      [prewarmedReview.description.id]:
        'Description du lot préchauffé traduite.',
    });
    i18n.activate(locale);

    try {
      expect(
        getManagedEmailDesignDomainValidationMessage({
          domain: '',
          domains: [],
        }),
      ).toBe('Saisissez un domaine.');
      expect(
        getManagedEmailDesignDomainValidationMessage({
          domain: 'not a domain',
          domains: [],
        }),
      ).toBe('Saisissez un domaine valide.');
      expect(
        getManagedEmailDesignDomainValidationMessage({
          domain: normalizedDomain,
          domains: [
            {
              id: 'domain-northstar',
              name: normalizedDomain,
              source: 'managed',
              verification: 'verified',
              subscriptionId: null,
            },
          ],
        }),
      ).toBe('Ce domaine existe déjà.');
      expect(
        getManagedEmailDesignMailboxValidationMessage({
          address: 'not an address',
          mailboxes: [],
        }),
      ).toBe('Saisissez une adresse e-mail complète.');
      expect(
        getManagedEmailDesignMailboxValidationMessage({
          address: `mira@${normalizedDomain}`,
          mailboxes: [mailbox({ address: `mira@${normalizedDomain}` })],
        }),
      ).toBe('Cette boîte aux lettres existe déjà.');
      expect(
        getManagedEmailDesignBundleConflictMessage(
          bundleWithDuplicateIdentities,
          {
            domains: [],
            mailboxes: [],
          },
        ),
      ).toBe('Les identités de ce lot ne sont pas uniques.');
      expect(
        getManagedEmailDesignBundleConflictMessage(bundle, {
          domains: [
            {
              id: 'domain-harborline',
              name: normalizedBundleDomain,
              source: 'managed',
              verification: 'verified',
              subscriptionId: null,
            },
          ],
          mailboxes: [],
        }),
      ).toBe('Le domaine de ce lot existe déjà.');
      expect(i18n._(diagnostic)).toBe('Diagnostic de connexion traduit.');
      expect(i18n._(sendingCapabilityReason)).toBe(
        'Raison de capacité traduite.',
      );
      expect(i18n._(domainReview.title)).toBe('Vérifier le domaine géré');
      expect(i18n._(domainReview.description)).toBe(
        'Description du domaine géré traduite.',
      );
      expect(i18n._(mailboxReview.title)).toBe(
        'Vérifier la boîte aux lettres gérée',
      );
      expect(i18n._(mailboxReview.description)).toBe(
        'Description de la boîte aux lettres gérée traduite.',
      );
      expect(i18n._(prewarmedReview.title)).toBe('Vérifier le lot préchauffé');
      expect(i18n._(prewarmedReview.description)).toBe(
        'Description du lot préchauffé traduite.',
      );
    } finally {
      i18n.activate(previousLocale);
    }
  });

  it('uses count-aware prewarmed bundle conflict grammar', () => {
    const bundle = {
      id: 'prewarmed-conflict-grammar',
      domain: 'harborline-mail.com',
      mailboxIdentities: [
        {
          identity: 'Mira Chen',
          address: 'mira@harborline-mail.com',
        },
        {
          identity: 'Jordan Lee',
          address: 'jordan@harborline-mail.com',
        },
      ],
    } satisfies ManagedEmailDesignPrewarmedBundle;

    expect(
      getManagedEmailDesignBundleConflictMessage(bundle, {
        domains: [],
        mailboxes: [],
        subscriptions: [
          managedDomainSubscription({
            linkedResources: [
              {
                id: 'retained-domain-harborline',
                kind: 'domain',
                label: bundle.domain,
              },
            ],
          }),
        ],
      }),
    ).toBe(
      'Cannot select this fixed bundle because its domain already exists: harborline-mail.com.',
    );

    expect(
      getManagedEmailDesignBundleConflictMessage(bundle, {
        domains: [],
        mailboxes: [mailbox({ address: 'mira@harborline-mail.com' })],
      }),
    ).toBe(
      'Cannot select this fixed bundle because this identity already exists: mira@harborline-mail.com.',
    );
    expect(
      getManagedEmailDesignBundleConflictMessage(bundle, {
        domains: [],
        mailboxes: [
          mailbox({ address: 'mira@harborline-mail.com' }),
          mailbox({
            id: 'mailbox-jordan',
            address: 'jordan@harborline-mail.com',
          }),
        ],
      }),
    ).toBe(
      'Cannot select this fixed bundle because these identities already exist: mira@harborline-mail.com, jordan@harborline-mail.com.',
    );
  });

  it('formats USD with the active locale while preserving the default-locale amount', () => {
    const previousLocale = i18n.locale;

    i18n.load('en-US', {});
    i18n.activate('en-US');
    expect(formatManagedEmailDesignUsd(1429)).toBe('$14.29');

    i18n.load('de-DE', {});
    i18n.activate('de-DE');
    try {
      expect(formatManagedEmailDesignUsd(1429)).toBe(
        new Intl.NumberFormat('de-DE', {
          style: 'currency',
          currency: 'USD',
        }).format(14.29),
      );
    } finally {
      i18n.activate(previousLocale);
    }
  });
});
