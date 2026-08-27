import { FindOperator } from 'typeorm';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

import { ManagedEmailAcquisitionOperationEntity } from '../../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../../entities/managed-email-mailbox.entity';
import { ManagedEmailAcquisitionMode } from '../../enums/managed-email-acquisition-mode.enum';
import { ManagedEmailInfrastructureState } from '../../enums/managed-email-infrastructure-state.enum';
import {
  IcemailException,
  IcemailExceptionCode,
} from '../../providers/icemail/icemail.exception';
import { type IcemailClient } from '../../providers/icemail/icemail.client';
import { type ManagedEmailQuote } from '../../types/managed-email-quote.type';
import { ActivateManagedEmailMailboxJob } from 'src/engine/core-modules/managed-email/jobs/activate-managed-email-mailbox.job';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { ManagedEmailAcquisitionService } from '../managed-email-acquisition.service';
import { type ManagedEmailSubscriptionService } from '../managed-email-subscription.service';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const actorWorkspaceMemberId = '123e4567-e89b-42d3-a456-426614174001';
const now = new Date('2026-08-05T12:00:00.000Z');

const quote = {
  catalogVersion: 'catalog-2026-08-05',
  currency: 'USD',
  dueTodayCents: 12_000,
  expiresAt: new Date('2026-08-06T12:00:00.000Z'),
  id: '123e4567-e89b-42d3-a456-426614174010',
  lines: [
    {
      amountCents: 4_000,
      billingFrequency: 'ANNUAL',
      endingBefore: '2027-08-05T12:00:00.000Z',
      metronomeProductId: '123e4567-e89b-42d3-a456-426614174011',
      productKey: 'managed_sending_domain_year',
      productTag: 'myah-managed-sending-domain-year',
      quantity: 1,
      startingAt: '2026-08-05T12:00:00.000Z',
      unitPriceCents: 4_000,
    },
    {
      amountCents: 4_000,
      billingFrequency: 'MONTHLY',
      endingBefore: '2026-09-05T12:00:00.000Z',
      metronomeProductId: '123e4567-e89b-42d3-a456-426614174012',
      productKey: 'managed_mailbox_month',
      productTag: 'myah-managed-mailbox-month',
      quantity: 2,
      startingAt: '2026-08-05T12:00:00.000Z',
      unitPriceCents: 2_000,
    },
    {
      amountCents: 4_000,
      billingFrequency: 'MONTHLY',
      endingBefore: '2026-09-05T12:00:00.000Z',
      metronomeProductId: '123e4567-e89b-42d3-a456-426614174013',
      productKey: 'managed_warmup_month',
      productTag: 'myah-managed-warmup-month',
      quantity: 2,
      startingAt: '2026-08-05T12:00:00.000Z',
      unitPriceCents: 2_000,
    },
  ],
  metronomeRateCardAlias: 'managed-email-test',
  metronomeRateCardId: '123e4567-e89b-42d3-a456-426614174014',
  proposalHash: 'proposal-hash',
  quoteHash: 'quote-hash',
  resourceSnapshot: {
    proposal: {
      createdAt: '2026-08-05T11:55:00.000Z',
      expiresAt: '2026-08-06T12:00:00.000Z',
      policyVersion: 'proposal-policy-v1',
    },
    domains: [
      {
        domain: 'creator-partners.com',
        mailboxes: ['maya@creator-partners.com', 'sam@creator-partners.com'],
        providerQuote: {
          amountMinorUnits: 1_000,
          currency: 'USD',
          fingerprint:
            'f11e3f8d78a4abb74cd0e4c5c22fd46bb792a648dc1baa2f303b84c79d925a5b',
          observedAt: '2026-08-05T11:55:00.000Z',
          termCount: 1,
          termUnit: 'YEAR',
        },
      },
    ],
    personas: [
      {
        address: 'maya@creator-partners.com',
        createdByWorkspaceMemberId: actorWorkspaceMemberId,
        firstName: 'Maya',
        lastName: 'Chen',
        localPart: 'maya',
        roleTitle: null,
        signature: 'Maya',
        version: 1,
      },
      {
        address: 'sam@creator-partners.com',
        createdByWorkspaceMemberId: actorWorkspaceMemberId,
        firstName: 'Sam',
        lastName: 'Lee',
        localPart: 'sam',
        roleTitle: 'Growth',
        signature: 'Sam',
        version: 1,
      },
    ],
  },
  workspaceId,
} as unknown as ManagedEmailQuote;
const CUSTOMER_OWNED_DOMAIN_IMPORT =
  'CUSTOMER_OWNED_DOMAIN_IMPORT' as ManagedEmailAcquisitionMode;
const customerOwnedDomain = 'customer-owned-partners.com';
const customerOwnedQuote = {
  ...quote,
  dueTodayCents: quote.lines[1].amountCents + quote.lines[2].amountCents,
  lines: [quote.lines[2], quote.lines[1]],
  quoteHash: 'customer-owned-quote-hash',
  resourceSnapshot: {
    customerOwnedDomain,
    domains: [
      {
        domain: customerOwnedDomain,
        mailboxes: [
          'maya@customer-owned-partners.com',
          'sam@customer-owned-partners.com',
        ],
      },
    ],
    personas: [
      {
        address: 'maya@customer-owned-partners.com',
        createdByWorkspaceMemberId: actorWorkspaceMemberId,
        firstName: 'Maya',
        lastName: 'Chen',
        localPart: 'maya',
        roleTitle: null,
        signature: 'Maya',
        version: 1,
      },
      {
        address: 'sam@customer-owned-partners.com',
        createdByWorkspaceMemberId: actorWorkspaceMemberId,
        firstName: 'Sam',
        lastName: 'Lee',
        localPart: 'sam',
        roleTitle: 'Growth',
        signature: 'Sam',
        version: 1,
      },
    ],
    proposal: quote.resourceSnapshot.proposal,
  },
} as unknown as ManagedEmailQuote;

const customerOwnedSubscriptionIdFor = (productKey: string) => {
  switch (productKey) {
    case 'managed_warmup_month':
      return '123e4567-e89b-42d3-a456-426614174022';
    case 'managed_mailbox_month':
      return '123e4567-e89b-42d3-a456-426614174023';
    default:
      throw new Error('Unexpected customer-owned subscription product');
  }
};

type MutableOperation = ManagedEmailAcquisitionOperationEntity & {
  [key: string]: unknown;
};

const createOperation = (
  overrides: Partial<ManagedEmailAcquisitionOperationEntity> = {},
): MutableOperation =>
  ({
    acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
    authorizedActorWorkspaceMemberId: actorWorkspaceMemberId,
    correlatedSubscriptionLines: quote.lines.map((line, index) => ({
      endingBefore: line.endingBefore,
      isProrated: false,
      productId: line.metronomeProductId,
      quantity: line.quantity,
      startingAt: line.startingAt,
      subscriptionId: [
        '123e4567-e89b-42d3-a456-426614174021',
        '123e4567-e89b-42d3-a456-426614174022',
        '123e4567-e89b-42d3-a456-426614174023',
      ][index],
      total: line.amountCents,
      unitPrice: line.unitPriceCents,
    })),
    paymentReceipts: [
      {
        externalInvoiceId: 'stripe-invoice-annual',
        externalPaymentId: 'stripe-payment-annual',
        metronomeInvoiceId: 'metronome-invoice-annual',
      },
      {
        externalInvoiceId: 'stripe-invoice-monthly',
        externalPaymentId: 'stripe-payment-monthly',
        metronomeInvoiceId: 'metronome-invoice-monthly',
      },
    ],
    expectedLineItems: quote.lines.map((line) => ({
      currency: 'USD',
      metronomeProductId: line.metronomeProductId,
      periodEnd: line.endingBefore,
      periodStart: line.startingAt,
      productKey: line.productKey,
      productTag: line.productTag,
      quantity: line.quantity,
      totalCents: line.amountCents,
      unitPriceCents: line.unitPriceCents,
    })),
    id: '123e4567-e89b-42d3-a456-426614174020',
    idempotencyKey: 'purchase-1',
    metronomeContractId: '123e4567-e89b-42d3-a456-426614174030',
    metronomeCustomerId: '123e4567-e89b-42d3-a456-426614174031',
    metronomeSubscriptionIds: [
      '123e4567-e89b-42d3-a456-426614174021',
      '123e4567-e89b-42d3-a456-426614174022',
      '123e4567-e89b-42d3-a456-426614174023',
    ],
    nextReconciliationAt: null,
    paymentStatus: 'PAID',
    providerIntentHash: null,
    providerOutcome: null,
    providerReceipt: null,
    providerConfigurationKey: 'icemail-production-v1',
    quoteHash: quote.quoteHash,
    reconciliationAttemptCount: 0,
    resourceSnapshot: quote.resourceSnapshot,
    readinessPolicyVersion: 'readiness-v1',
    safeFailureCode: null,
    state: 'PAYMENT_PAID',
    workspaceId,
    ...overrides,
  }) as MutableOperation;

const createCustomerOwnedOperation = (
  overrides: Partial<ManagedEmailAcquisitionOperationEntity> = {},
): MutableOperation =>
  createOperation({
    acquisitionMode: CUSTOMER_OWNED_DOMAIN_IMPORT,
    correlatedSubscriptionLines: customerOwnedQuote.lines.map((line) => ({
      endingBefore: line.endingBefore,
      isProrated: false,
      productId: line.metronomeProductId,
      quantity: line.quantity,
      startingAt: line.startingAt,
      subscriptionId: customerOwnedSubscriptionIdFor(line.productKey),
      total: line.amountCents,
      unitPrice: line.unitPriceCents,
    })),
    expectedLineItems: customerOwnedQuote.lines.map((line) => ({
      billingFrequency: line.billingFrequency,
      currency: 'USD',
      metronomeProductId: line.metronomeProductId,
      periodEnd: line.endingBefore,
      periodStart: line.startingAt,
      productKey: line.productKey,
      productTag: line.productTag,
      quantity: line.quantity,
      totalCents: line.amountCents,
      unitPriceCents: line.unitPriceCents,
    })),
    metronomeSubscriptionIds: customerOwnedQuote.lines.map((line) =>
      customerOwnedSubscriptionIdFor(line.productKey),
    ),
    paymentReceipts: [
      {
        externalInvoiceId: 'stripe-invoice-customer-owned',
        externalPaymentId: 'stripe-payment-customer-owned',
        metronomeInvoiceId: 'metronome-invoice-customer-owned',
      },
    ],
    quoteHash: customerOwnedQuote.quoteHash,
    resourceSnapshot: customerOwnedQuote.resourceSnapshot,
    ...overrides,
  });

const matchesValue = (actual: unknown, expected: unknown): boolean => {
  if (!(expected instanceof FindOperator)) return actual === expected;
  if (expected.type === 'isNull') return actual === null;
  if (expected.type === 'in') {
    return Array.isArray(expected.value) && expected.value.includes(actual);
  }
  throw new Error(`Unsupported test FindOperator: ${expected.type}`);
};
const matches = (record: Record<string, unknown>, criteria: object): boolean =>
  Object.entries(criteria).every(([key, value]) =>
    matchesValue(record[key], value),
  );

function createRepository<T extends { id: string; workspaceId: string }>(
  rows: Map<string, T>,
  onSave?: () => void,
) {
  return {
    find: jest.fn(async (_workspaceId: string, options?: { where?: object }) =>
      [...rows.values()].filter(
        (row) =>
          row.workspaceId === _workspaceId &&
          (options?.where === undefined ||
            matches(row as Record<string, unknown>, options.where)),
      ),
    ),
    findOneBy: jest.fn(async (_workspaceId: string, criteria: object) => {
      return (
        [...rows.values()].find(
          (row) =>
            row.workspaceId === _workspaceId &&
            matches(row as Record<string, unknown>, criteria),
        ) ?? null
      );
    }),
    save: jest.fn(async (_workspaceId: string, input: Partial<T>) => {
      onSave?.();
      const row = {
        ...input,
        id: input.id ?? `generated-${rows.size + 1}`,
        workspaceId: _workspaceId,
      } as T;
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(
      async (_workspaceId: string, criteria: object, patch: Partial<T>) => {
        const row = [...rows.values()].find(
          (candidate) =>
            candidate.workspaceId === _workspaceId &&
            matches(candidate as Record<string, unknown>, criteria),
        );
        if (row === undefined) return { affected: 0 };
        Object.assign(row, patch);
        return { affected: 1 };
      },
    ),
  };
}

const createHarness = ({
  allowedWorkspaceIds = [workspaceId],
  enabled = true,
  operation = createOperation(),
}: {
  allowedWorkspaceIds?: string[];
  enabled?: boolean;
  operation?: MutableOperation;
} = {}) => {
  const operationRows = new Map([[operation.id, operation]]);
  const domainRows = new Map<string, ManagedEmailDomainEntity>();
  const mailboxRows = new Map<string, ManagedEmailMailboxEntity>();
  const order: string[] = [];
  const operationRepository = createRepository(operationRows);
  const domainRepository = createRepository(domainRows, () =>
    order.push('resource'),
  );
  const mailboxRepository = createRepository(mailboxRows, () =>
    order.push('resource'),
  );
  const subscriptionService = {
    createPurchaseOperation: jest.fn(async () => {
      order.push('operation');
      return operation;
    }),
    continueSubscriptionCreation: jest.fn(async () => {
      order.push('subscriptions');
      return operation;
    }),
    reconcilePayment: jest.fn(async () => operation),
  };
  const messageQueueService = {
    add: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Pick<MessageQueueService, 'add'>>;
  const icemailClient = {
    buyPrewarmedBundles: jest.fn(),
    checkDomainAvailability: jest.fn().mockResolvedValue({
      alternatives: [],
      available: true,
      domain: 'creator-partners.com',
      price: {
        amountCents: 1_000,
        currency: 'USD',
        duration: 1,
        durationUnit: 'YEAR',
      },
    }),
    createOrdinaryOrder: jest.fn().mockResolvedValue({
      domains: [
        {
          domain: 'creator-partners.com',
          domainId: 'domain-provider-1',
          mailboxes: [
            {
              address: 'maya@creator-partners.com',
              firstName: 'Maya',
              id: 'mailbox-provider-1',
              lastName: 'Chen',
            },
            {
              address: 'sam@creator-partners.com',
              firstName: 'Sam',
              id: 'mailbox-provider-2',
              lastName: 'Lee',
            },
          ],
          orderId: 'provider-order-1',
        },
      ],
    }),
    createCustomerOwnedDomainImportOrder: jest.fn().mockResolvedValue({
      domains: [
        {
          domain: customerOwnedDomain,
          domainId: 'domain-provider-customer-owned',
          mailboxes: [
            {
              address: 'maya@customer-owned-partners.com',
              firstName: 'Maya',
              id: 'mailbox-provider-customer-owned-1',
              lastName: 'Chen',
            },
            {
              address: 'sam@customer-owned-partners.com',
              firstName: 'Sam',
              id: 'mailbox-provider-customer-owned-2',
              lastName: 'Lee',
            },
          ],
          orderId: 'provider-order-customer-owned',
        },
      ],
    }),
    listDomains: jest.fn(),
    listMailboxes: jest.fn(),
    listPrewarmedBundles: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'MANAGED_EMAIL_ENABLED') return enabled;
      if (key === 'MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS') {
        return allowedWorkspaceIds;
      }
      return undefined;
    }),
  };
  const service = new ManagedEmailAcquisitionService(
    operationRepository as unknown as WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
    domainRepository as unknown as WorkspaceScopedRepository<ManagedEmailDomainEntity>,
    mailboxRepository as unknown as WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    subscriptionService as unknown as ManagedEmailSubscriptionService,
    icemailClient as unknown as IcemailClient,
    messageQueueService as unknown as MessageQueueService,
    config as never,
    () => now,
    () => 'temporary-setup-password',
  );

  return {
    domainRows,
    domainRepository,
    icemailClient,
    mailboxRepository,
    mailboxRows,
    operation,
    messageQueueService,
    operationRepository,
    operationRows,
    order,
    service,
    subscriptionService,
  };
};

const admissionInput = {
  acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
  actorWorkspaceMemberId,
  idempotencyKey: 'purchase-1',
  operationId: '123e4567-e89b-42d3-a456-426614174020',
  providerConfigurationKey: 'icemail-production-v1',
  quote,
  readinessPolicyVersion: 'readiness-v1',
  workspaceId,
};

describe('ManagedEmailAcquisitionService', () => {
  it('requires enabled and allowlisted configuration for new admission', async () => {
    const disabled = createHarness({ enabled: false });
    const unlisted = createHarness({ allowedWorkspaceIds: [] });

    await expect(disabled.service.admit(admissionInput)).rejects.toThrow(
      'Managed email acquisition is unavailable',
    );
    await expect(unlisted.service.admit(admissionInput)).rejects.toThrow(
      'Managed email acquisition is unavailable',
    );
    expect(
      disabled.subscriptionService.createPurchaseOperation,
    ).not.toHaveBeenCalled();
    expect(
      unlisted.subscriptionService.createPurchaseOperation,
    ).not.toHaveBeenCalled();
  });

  it('persists resource rows before creating subscriptions', async () => {
    const harness = createHarness({
      operation: createOperation({ state: 'CREATING_SUBSCRIPTIONS' }),
    });

    await harness.service.admit(admissionInput);

    expect(harness.order[0]).toBe('operation');
    expect(harness.order[harness.order.length - 1]).toBe('subscriptions');
    expect(harness.order.filter((step) => step === 'resource')).toHaveLength(3);
    expect(harness.domainRows.size).toBe(1);
    expect(harness.mailboxRows.size).toBe(2);
    expect(harness.domainRepository.update).toHaveBeenCalledWith(
      workspaceId,
      {
        metronomeSubscriptionId: expect.anything(),
        normalizedDomain: 'creator-partners.com',
      },
      expect.objectContaining({
        metronomeSubscriptionId: '123e4567-e89b-42d3-a456-426614174021',
      }),
    );
    expect(harness.mailboxRepository.update).toHaveBeenCalledTimes(2);
    expect(harness.mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      {
        metronomeMailboxSubscriptionId: expect.anything(),
        normalizedAddress: 'maya@creator-partners.com',
      },
      expect.objectContaining({
        metronomeMailboxSubscriptionId: '123e4567-e89b-42d3-a456-426614174022',
      }),
    );
  });

  it('restores missing resource rows before resuming subscription creation', async () => {
    const harness = createHarness({
      operation: createOperation({ state: 'CREATING_SUBSCRIPTIONS' }),
    });

    await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(harness.order[0]).toBe('resource');
    expect(harness.order[harness.order.length - 1]).toBe('subscriptions');
    expect(harness.domainRows.size).toBe(1);
    expect(harness.mailboxRows.size).toBe(2);
  });

  it('rejects prewarmed admission without exact inventory identities', async () => {
    const harness = createHarness();

    await expect(
      harness.service.admit({
        ...admissionInput,
        acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      }),
    ).rejects.toThrow('Managed email acquisition is unavailable');
    expect(
      harness.subscriptionService.createPurchaseOperation,
    ).not.toHaveBeenCalled();
  });

  it('rejects resource reuse by a different acquisition operation', async () => {
    const harness = createHarness();

    await harness.service.admit(admissionInput);
    harness.subscriptionService.createPurchaseOperation.mockResolvedValueOnce(
      createOperation({
        id: '123e4567-e89b-42d3-a456-426614174099',
        idempotencyKey: 'purchase-2',
      }),
    );

    await expect(
      harness.service.admit({
        ...admissionInput,
        idempotencyKey: 'purchase-2',
      }),
    ).rejects.toThrow('Managed email resource idempotency conflict');
  });

  it('does not call the provider before exact payment is paid', async () => {
    const harness = createHarness({
      operation: createOperation({
        paymentReceipts: null,
        paymentStatus: null,
        state: 'PAYMENT_PENDING',
      }),
    });

    await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(harness.icemailClient.createOrdinaryOrder).not.toHaveBeenCalled();
    expect(harness.icemailClient.buyPrewarmedBundles).not.toHaveBeenCalled();
  });

  it('gates one customer-owned import on exact payment and never duplicates an uncertain import', async () => {
    const harness = createHarness({
      operation: createCustomerOwnedOperation({
        paymentReceipts: null,
        paymentStatus: null,
        state: 'PAYMENT_PENDING',
      }),
    });

    await harness.service.admit({
      ...admissionInput,
      acquisitionMode: CUSTOMER_OWNED_DOMAIN_IMPORT,
      quote: customerOwnedQuote,
    });

    expect([...harness.domainRows.values()]).toEqual([
      expect.objectContaining({
        cancelAtPeriodEnd: false,
        metronomeSubscriptionId: null,
        paidThrough: null,
        renewalEnabled: false,
      }),
    ]);
    expect([...harness.mailboxRows.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metronomeMailboxSubscriptionId: customerOwnedSubscriptionIdFor(
            'managed_mailbox_month',
          ),
          metronomeWarmupSubscriptionId: customerOwnedSubscriptionIdFor(
            'managed_warmup_month',
          ),
          normalizedAddress: 'maya@customer-owned-partners.com',
        }),
        expect.objectContaining({
          metronomeMailboxSubscriptionId: customerOwnedSubscriptionIdFor(
            'managed_mailbox_month',
          ),
          metronomeWarmupSubscriptionId: customerOwnedSubscriptionIdFor(
            'managed_warmup_month',
          ),
          normalizedAddress: 'sam@customer-owned-partners.com',
        }),
      ]),
    );

    await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });
    expect(
      harness.icemailClient.createCustomerOwnedDomainImportOrder,
    ).not.toHaveBeenCalled();
    expect(harness.icemailClient.createOrdinaryOrder).not.toHaveBeenCalled();

    harness.operation.paymentReceipts = [
      {
        externalInvoiceId: 'stripe-invoice-customer-owned',
        externalPaymentId: 'stripe-payment-customer-owned',
        metronomeInvoiceId: 'metronome-invoice-customer-owned',
      },
    ];
    harness.operation.paymentStatus = 'PAID';
    harness.operation.state = 'PAYMENT_PAID';
    harness.icemailClient.createCustomerOwnedDomainImportOrder.mockRejectedValueOnce(
      new IcemailException(IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN),
    );

    const first = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });
    const replay = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(
      harness.icemailClient.createCustomerOwnedDomainImportOrder,
    ).toHaveBeenCalledWith({
      customerOwnedDomain,
      mailboxes: [
        {
          address: 'maya@customer-owned-partners.com',
          firstName: 'Maya',
          lastName: 'Chen',
          password: 'temporary-setup-password',
        },
        {
          address: 'sam@customer-owned-partners.com',
          firstName: 'Sam',
          lastName: 'Lee',
          password: 'temporary-setup-password',
        },
      ],
    });
    expect(harness.icemailClient.createOrdinaryOrder).not.toHaveBeenCalled();
    expect(
      harness.icemailClient.checkDomainAvailability,
    ).not.toHaveBeenCalled();
    expect(first.state).toBe('RECONCILIATION_REQUIRED');
    expect(replay.state).toBe('RECONCILIATION_REQUIRED');
    expect(
      harness.icemailClient.createCustomerOwnedDomainImportOrder,
    ).toHaveBeenCalledTimes(1);
  });

  it('projects exact paid periods before starting provider fulfillment', async () => {
    const harness = createHarness();

    await harness.service.admit(admissionInput);
    await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect([...harness.domainRows.values()]).toEqual([
      expect.objectContaining({
        paidThrough: new Date('2027-08-05T12:00:00.000Z'),
      }),
    ]);
    expect([...harness.mailboxRows.values()]).toEqual([
      expect.objectContaining({
        infrastructurePaidThrough: new Date('2026-09-05T12:00:00.000Z'),
        warmupPaidThrough: new Date('2026-09-05T12:00:00.000Z'),
      }),
      expect.objectContaining({
        infrastructurePaidThrough: new Date('2026-09-05T12:00:00.000Z'),
        warmupPaidThrough: new Date('2026-09-05T12:00:00.000Z'),
      }),
    ]);
    expect(harness.operation.nextSubscriptionReconciliationAt).toEqual(
      new Date('2026-09-05T10:00:00.000Z'),
    );
  });

  it('revalidates and submits one domain-batched ordinary order after payment', async () => {
    const harness = createHarness();
    await harness.service.admit(admissionInput);
    harness.icemailClient.checkDomainAvailability.mockImplementationOnce(
      async () => {
        expect([...harness.domainRows.values()][0].infrastructureState).toBe(
          'ORDERING',
        );
        expect(
          [...harness.mailboxRows.values()].every(
            ({ infrastructureState }) => infrastructureState === 'ORDERING',
          ),
        ).toBe(true);
        return {
          alternatives: [],
          available: true,
          domain: 'creator-partners.com',
          price: {
            amountCents: 1_000,
            currency: 'USD',
            duration: 1,
            durationUnit: 'YEAR',
          },
        };
      },
    );

    const result = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(harness.icemailClient.checkDomainAvailability).toHaveBeenCalledWith(
      'creator-partners.com',
    );
    expect(harness.icemailClient.createOrdinaryOrder).toHaveBeenCalledTimes(1);
    expect(harness.icemailClient.createOrdinaryOrder).toHaveBeenCalledWith({
      domains: [
        {
          domain: 'creator-partners.com',
          mailboxes: [
            {
              address: 'maya@creator-partners.com',
              firstName: 'Maya',
              lastName: 'Chen',
              password: 'temporary-setup-password',
            },
            {
              address: 'sam@creator-partners.com',
              firstName: 'Sam',
              lastName: 'Lee',
              password: 'temporary-setup-password',
            },
          ],
        },
      ],
    });
    expect(result.state).toBe('PROVIDER_SUCCEEDED');
    expect(result.providerReceipt).toEqual({
      domains: [
        {
          mailboxes: [
            {
              normalizedAddress: 'maya@creator-partners.com',
              providerMailboxId: 'mailbox-provider-1',
            },
            {
              normalizedAddress: 'sam@creator-partners.com',
              providerMailboxId: 'mailbox-provider-2',
            },
          ],
          normalizedDomain: 'creator-partners.com',
          providerDomainId: 'domain-provider-1',
          providerOrderId: 'provider-order-1',
        },
      ],
      failedInventoryIds: [],
      orderIds: ['provider-order-1'],
      schemaVersion: 1,
      totalCostCents: null,
    });
    expect([...harness.domainRows.values()][0]).toMatchObject({
      providerDomainId: 'domain-provider-1',
      providerOrderId: 'provider-order-1',
    });
    expect(harness.messageQueueService.add).toHaveBeenCalledTimes(2);
    expect(harness.messageQueueService.add).toHaveBeenNthCalledWith(
      1,
      ActivateManagedEmailMailboxJob.name,
      {
        mailboxId: 'generated-1',
        workspaceId,
      },
      expect.objectContaining({
        id: `managed-email-mailbox-activation:generated-1`,
      }),
    );
    expect(
      JSON.stringify(harness.messageQueueService.add.mock.calls),
    ).not.toContain('temporary-setup-password');
    expect(
      [...harness.mailboxRows.values()].map(
        (mailbox) => mailbox.providerMailboxId,
      ),
    ).toEqual(['mailbox-provider-1', 'mailbox-provider-2']);
    expect([...harness.mailboxRows.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          infrastructureState:
            ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
          nextReconciliationAt: expect.any(Date),
        }),
      ]),
    );
  });

  it('returns an exact completed replay without a second provider write', async () => {
    const harness = createHarness();
    await harness.service.admit(admissionInput);
    const first = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });
    const replay = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(replay).toBe(first);
    expect(harness.icemailClient.createOrdinaryOrder).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the exact ordinary domain quote changes', async () => {
    const harness = createHarness();
    await harness.service.admit(admissionInput);
    harness.icemailClient.checkDomainAvailability.mockResolvedValueOnce({
      alternatives: [],
      available: true,
      domain: 'creator-partners.com',
      price: {
        amountCents: 1_001,
        currency: 'USD',
        duration: 1,
        durationUnit: 'YEAR',
      },
    });

    const result = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(result.state).toBe('PROVIDER_FAILED');
    expect(result.safeFailureCode).toBe('ICEMAIL_STOCK_CHANGED');
    expect(harness.icemailClient.createOrdinaryOrder).not.toHaveBeenCalled();
  });

  it('persists known provider failure without retrying', async () => {
    const harness = createHarness();
    await harness.service.admit(admissionInput);
    harness.icemailClient.createOrdinaryOrder.mockRejectedValueOnce(
      new IcemailException(IcemailExceptionCode.INSUFFICIENT_CREDITS),
    );

    const first = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });
    const replay = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(first.state).toBe('PROVIDER_FAILED');
    expect(first.safeFailureCode).toBe(
      IcemailExceptionCode.INSUFFICIENT_CREDITS,
    );
    expect(replay).toBe(first);
    expect(harness.icemailClient.createOrdinaryOrder).toHaveBeenCalledTimes(1);
  });

  it('marks an uncertain write for reconciliation and never blindly retries it', async () => {
    const harness = createHarness();
    await harness.service.admit(admissionInput);
    harness.icemailClient.createOrdinaryOrder.mockRejectedValueOnce(
      new IcemailException(IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN),
    );

    const first = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });
    const replay = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(first.state).toBe('RECONCILIATION_REQUIRED');
    expect(first.nextReconciliationAt).toEqual(
      new Date('2026-08-05T12:01:00.000Z'),
    );
    expect(replay.state).toBe('RECONCILIATION_REQUIRED');
    expect(harness.icemailClient.createOrdinaryOrder).toHaveBeenCalledTimes(1);
  });

  it('records the provider receipt before projecting provider identifiers', async () => {
    const harness = createHarness();
    await harness.service.admit(admissionInput);
    const persistedBeforeProjection: unknown[] = [];
    const originalUpdate = harness.operationRows.get(harness.operation.id);
    if (originalUpdate === undefined) {
      throw new Error('Test operation is unavailable');
    }
    harness.domainRepository.update.mockImplementation(
      async (_workspaceId, _criteria, patch) => {
        if ('providerDomainId' in patch) {
          persistedBeforeProjection.push(originalUpdate.providerReceipt);
          throw new Error('projection unavailable');
        }
        return { affected: 1 };
      },
    );

    const result = await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(persistedBeforeProjection[0]).not.toBeNull();
    expect(harness.operation.providerReceipt).not.toBeNull();
    expect(result.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.nextReconciliationAt).toEqual(
      new Date('2026-08-05T12:01:00.000Z'),
    );
  });

  it('persists a definitive receipt after concurrent recovery begins', async () => {
    const harness = createHarness();
    await harness.service.admit(admissionInput);
    harness.operationRepository.findOneBy.mockImplementation(
      async (_workspaceId: string, criteria: { id?: string }) =>
        criteria.id === harness.operation.id
          ? ({ ...harness.operation } as MutableOperation)
          : null,
    );
    const createOrder =
      harness.icemailClient.createOrdinaryOrder.getMockImplementation();
    if (createOrder === undefined) {
      throw new Error('Test provider implementation is unavailable');
    }
    harness.icemailClient.createOrdinaryOrder.mockImplementationOnce(
      async () => {
        harness.operation.state = 'RECONCILIATION_REQUIRED';
        return createOrder();
      },
    );
    await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });
    expect(harness.operation.state).toBe('PROVIDER_SUCCEEDED');
    expect(harness.operation.providerReceipt).not.toBeNull();
  });

  it('requires the whole selected prewarmed bundle to remain in live stock', async () => {
    const prewarmedQuote = {
      ...quote,
      resourceSnapshot: {
        ...quote.resourceSnapshot,
        domains: quote.resourceSnapshot.domains.map((domain) => ({
          ...domain,
          providerInventoryId: 'inventory-1',
          prewarmedProviderCosts: {
            domainPriceCents: 1_000,
            mailboxPriceCents: 250,
          },
        })),
      },
    } as ManagedEmailQuote;
    const operation = createOperation({
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      resourceSnapshot: prewarmedQuote.resourceSnapshot,
    });
    const harness = createHarness({ operation });
    harness.icemailClient.listPrewarmedBundles.mockResolvedValue({ items: [] });

    await harness.service.admit({
      ...admissionInput,
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      quote: prewarmedQuote,
    });
    const result = await harness.service.continue({
      operationId: operation.id,
      workspaceId,
    });

    expect(result.state).toBe('PROVIDER_FAILED');
    expect(result.safeFailureCode).toBe('ICEMAIL_STOCK_CHANGED');
    expect(harness.icemailClient.buyPrewarmedBundles).not.toHaveBeenCalled();
  });

  it('rejects a selected prewarmed bundle when a provider cost changes', async () => {
    const prewarmedQuote = {
      ...quote,
      resourceSnapshot: {
        ...quote.resourceSnapshot,
        domains: quote.resourceSnapshot.domains.map((domain) => ({
          ...domain,
          providerInventoryId: 'inventory-1',
          prewarmedProviderCosts: {
            domainPriceCents: 1_000,
            mailboxPriceCents: 250,
          },
        })),
      },
    } as ManagedEmailQuote;
    const operation = createOperation({
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      resourceSnapshot: prewarmedQuote.resourceSnapshot,
    });
    const harness = createHarness({ operation });

    harness.icemailClient.listPrewarmedBundles.mockResolvedValue({
      items: [
        {
          domain: 'creator-partners.com',
          domainPriceCents: 1_000,
          inventoryId: 'inventory-1',
          mailboxCount: 2,
          mailboxPriceCents: 251,
          mailboxes: [
            {
              address: 'maya@creator-partners.com',
              firstName: 'Maya',
              lastName: 'Chen',
              master: false,
              provider: 'GOOGLE',
            },
            {
              address: 'sam@creator-partners.com',
              firstName: 'Sam',
              lastName: 'Lee',
              master: false,
              provider: 'GOOGLE',
            },
          ],
        },
      ],
    });

    await harness.service.admit({
      ...admissionInput,
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      quote: prewarmedQuote,
    });
    const updateDomain =
      harness.domainRepository.update.getMockImplementation();
    if (updateDomain === undefined) {
      throw new Error('Test domain repository is unavailable');
    }
    let failProjection = true;
    harness.domainRepository.update.mockImplementation(
      async (workspaceId, criteria, patch) => {
        if (
          failProjection &&
          patch.infrastructureState ===
            ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED
        ) {
          failProjection = false;
          return { affected: 0 };
        }
        return updateDomain(workspaceId, criteria, patch);
      },
    );
    await expect(
      harness.service.continue({
        operationId: operation.id,
        workspaceId,
      }),
    ).rejects.toThrow('Managed email failure projection is incomplete');
    expect(operation).toMatchObject({
      nextReconciliationAt: expect.any(Date),
      providerOutcome: 'FAILED',
      safeFailureCode: 'ICEMAIL_STOCK_CHANGED',
      state: 'RECONCILIATION_REQUIRED',
    });
    harness.domainRepository.update.mockImplementation(updateDomain);
    const result = await harness.service.continue({
      operationId: operation.id,
      workspaceId,
    });

    expect(result.state).toBe('PROVIDER_FAILED');
    expect(result.safeFailureCode).toBe('ICEMAIL_STOCK_CHANGED');
    expect(harness.icemailClient.buyPrewarmedBundles).not.toHaveBeenCalled();
    expect([...harness.domainRows.values()]).toEqual([
      expect.objectContaining({
        infrastructureState:
          ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
        nextReconciliationAt: null,
        safeFailureCode: 'ICEMAIL_STOCK_CHANGED',
      }),
    ]);
    expect([...harness.mailboxRows.values()]).toEqual([
      expect.objectContaining({
        infrastructureState:
          ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
        nextReconciliationAt: null,
        safeFailureCode: 'ICEMAIL_STOCK_CHANGED',
      }),
      expect.objectContaining({
        infrastructureState:
          ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
        nextReconciliationAt: null,
        safeFailureCode: 'ICEMAIL_STOCK_CHANGED',
      }),
    ]);
  });
  it('purchases the selected prewarmed bundle as one whole provider call', async () => {
    const prewarmedQuote = {
      ...quote,
      resourceSnapshot: {
        ...quote.resourceSnapshot,
        domains: quote.resourceSnapshot.domains.map((domain) => ({
          ...domain,
          providerInventoryId: 'inventory-1',
          prewarmedProviderCosts: {
            domainPriceCents: 1_000,
            mailboxPriceCents: 250,
          },
        })),
      },
    } as ManagedEmailQuote;
    const operation = createOperation({
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      resourceSnapshot: prewarmedQuote.resourceSnapshot,
    });
    const harness = createHarness({ operation });
    harness.icemailClient.listPrewarmedBundles.mockResolvedValue({
      items: [
        {
          domain: 'creator-partners.com',
          domainPriceCents: 1_000,
          inventoryId: 'inventory-1',
          mailboxCount: 2,
          mailboxPriceCents: 250,
          mailboxes: [
            {
              address: 'maya@creator-partners.com',
              firstName: 'Maya',
              lastName: 'Chen',
              master: false,
              provider: 'GOOGLE',
            },
            {
              address: 'sam@creator-partners.com',
              firstName: 'Sam',
              lastName: 'Lee',
              master: false,
              provider: 'GOOGLE',
            },
          ],
        },
      ],
    });
    harness.icemailClient.buyPrewarmedBundles.mockResolvedValue({
      failedInventoryIds: [],
      orderId: 'prewarm-order-1',
      successful: [
        {
          domain: 'creator-partners.com',
          domainId: 'provider-domain-1',
          mailboxes: [
            {
              address: 'maya@creator-partners.com',
              firstName: 'Maya',
              id: 'provider-mailbox-1',
              lastName: 'Chen',
              master: false,
              provider: 'GOOGLE',
            },
            {
              address: 'sam@creator-partners.com',
              firstName: 'Sam',
              id: 'provider-mailbox-2',
              lastName: 'Lee',
              master: false,
              provider: 'GOOGLE',
            },
          ],
        },
      ],
      totalCostCents: 1_500,
    });

    await harness.service.admit({
      ...admissionInput,
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      quote: prewarmedQuote,
    });
    const result = await harness.service.continue({
      operationId: operation.id,
      workspaceId,
    });

    expect(harness.icemailClient.buyPrewarmedBundles).toHaveBeenCalledWith({
      inventoryIds: ['inventory-1'],
    });
    expect(harness.icemailClient.buyPrewarmedBundles).toHaveBeenCalledTimes(1);
    expect(result.state).toBe('PROVIDER_SUCCEEDED');
    expect(result.safeFailureCode).toBeNull();
  });

  it('persists a partial prewarmed result and never retries failed inventory', async () => {
    const prewarmedQuote = {
      ...quote,
      resourceSnapshot: {
        ...quote.resourceSnapshot,
        domains: quote.resourceSnapshot.domains.map((domain) => ({
          ...domain,
          providerInventoryId: 'inventory-1',
          prewarmedProviderCosts: {
            domainPriceCents: 1_000,
            mailboxPriceCents: 250,
          },
        })),
      },
    } as ManagedEmailQuote;
    const operation = createOperation({
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      resourceSnapshot: prewarmedQuote.resourceSnapshot,
    });
    const harness = createHarness({ operation });
    harness.icemailClient.listPrewarmedBundles.mockResolvedValue({
      items: [
        {
          domain: 'creator-partners.com',
          domainPriceCents: 1_000,
          inventoryId: 'inventory-1',
          mailboxCount: 2,
          mailboxPriceCents: 250,
          mailboxes: [
            {
              address: 'maya@creator-partners.com',
              firstName: 'Maya',
              lastName: 'Chen',
              master: false,
              provider: 'GOOGLE',
            },
            {
              address: 'sam@creator-partners.com',
              firstName: 'Sam',
              lastName: 'Lee',
              master: false,
              provider: 'GOOGLE',
            },
          ],
        },
      ],
    });
    harness.icemailClient.buyPrewarmedBundles.mockResolvedValue({
      failedInventoryIds: ['inventory-1'],
      orderId: 'prewarm-order-1',
      successful: [],
      totalCostCents: 0,
    });

    await harness.service.admit({
      ...admissionInput,
      acquisitionMode: ManagedEmailAcquisitionMode.PREWARMED_INVENTORY,
      quote: prewarmedQuote,
    });
    const first = await harness.service.continue({
      operationId: operation.id,
      workspaceId,
    });
    const replay = await harness.service.continue({
      operationId: operation.id,
      workspaceId,
    });

    expect(first.state).toBe('PROVIDER_PARTIAL');
    expect(first.safeFailureCode).toBe('ICEMAIL_PARTIAL_PURCHASE');
    expect(first.providerReceipt).toMatchObject({
      domains: [],
      failedInventoryIds: ['inventory-1'],
      orderIds: ['prewarm-order-1'],
      totalCostCents: 0,
    });
    expect(first.nextReconciliationAt).toBeNull();
    expect([...harness.domainRows.values()][0]).toMatchObject({
      infrastructureState: 'REPLACEMENT_REQUIRED',
      safeFailureCode: 'ICEMAIL_PARTIAL_PURCHASE',
    });
    expect(
      [...harness.mailboxRows.values()].every(
        ({ campaignEligibility, infrastructureState, safeFailureCode }) =>
          campaignEligibility === 'BLOCKED' &&
          infrastructureState === 'REPLACEMENT_REQUIRED' &&
          safeFailureCode === 'ICEMAIL_PARTIAL_PURCHASE',
      ),
    ).toBe(true);
    expect(replay).toBe(first);
    expect(harness.icemailClient.buyPrewarmedBundles).toHaveBeenCalledTimes(1);
  });

  it('does not replay a provider write after restarting from persisted intent', async () => {
    const operation = createOperation({
      providerIntentHash: 'persisted-provider-intent',
      providerOutcome: 'CALL_NOT_ACKNOWLEDGED',
      state: 'PROVIDER_INTENT_RECORDED',
    });
    const harness = createHarness({ operation });

    const result = await harness.service.continue({
      operationId: operation.id,
      workspaceId,
    });

    expect(result.state).toBe('RECONCILIATION_REQUIRED');
    expect(result.safeFailureCode).toBe('PROVIDER_ACK_UNKNOWN');
    expect(harness.icemailClient.createOrdinaryOrder).not.toHaveBeenCalled();
    expect(harness.icemailClient.buyPrewarmedBundles).not.toHaveBeenCalled();
  });

  it('continues recovery for an existing operation after allowlist removal', async () => {
    const allowedWorkspaceIds = [workspaceId];
    const harness = createHarness({ allowedWorkspaceIds });

    await harness.service.admit(admissionInput);
    allowedWorkspaceIds.splice(0);
    await expect(
      harness.service.admit({
        ...admissionInput,
        idempotencyKey: 'purchase-after-removal',
      }),
    ).rejects.toThrow();
    await harness.service.continue({
      operationId: harness.operation.id,
      workspaceId,
    });

    expect(harness.icemailClient.createOrdinaryOrder).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-workspace continuation', async () => {
    const harness = createHarness();

    await expect(
      harness.service.continue({
        operationId: harness.operation.id,
        workspaceId: '123e4567-e89b-42d3-a456-426614174099',
      }),
    ).rejects.toThrow('Managed email acquisition operation was not found');
    expect(harness.icemailClient.createOrdinaryOrder).not.toHaveBeenCalled();
  });
});
