import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

import { MANAGED_EMAIL_PRODUCT_KEYS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import { ManagedEmailAcquisitionOperationEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-acquisition-operation.entity';
import { ManagedEmailAcquisitionMode } from 'src/engine/core-modules/managed-email/enums/managed-email-acquisition-mode.enum';
import { ManagedEmailSubscriptionService } from 'src/engine/core-modules/managed-email/services/managed-email-subscription.service';
import { type ManagedEmailQuote } from 'src/engine/core-modules/managed-email/types/managed-email-quote.type';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from 'src/engine/core-modules/managed-provider-billing/metronome-client.exception';
import { type MetronomeClientService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-client.service';
import { type MetronomeWorkspaceCustomerService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-workspace-customer.service';
import { type ManagedProviderStripeService } from 'src/engine/core-modules/managed-provider-billing/stripe/managed-provider-stripe.service';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const actorWorkspaceMemberId = '123e4567-e89b-42d3-a456-426614174001';
const operationId = '123e4567-e89b-42d3-a456-426614174002';
const periodStart = '2026-08-05T10:00:00.000Z';
const monthlyEnd = '2026-09-05T10:00:00.000Z';
const annualEnd = '2027-08-05T10:00:00.000Z';

const quote: ManagedEmailQuote = {
  catalogVersion: 'test-catalog-v1',
  currency: 'USD',
  disclosures: {
    cancellation:
      'Domain, mailbox, and warmup renewals can be stopped independently and remain active through their paid-through dates.',
    managedServiceOwnership:
      'Managed sending domains are service assets for exclusive workspace use. Registrar ownership or transfer is not included.',
    prepaidBalance: 'Email services do not use your AI balance.',
  },
  dueTodayCents: 20_000,
  expiresAt: new Date('2026-08-05T10:15:00.000Z'),
  id: 'quote-id',
  lines: [
    {
      amountCents: 2000,
      billingFrequency: 'ANNUAL',
      endingBefore: annualEnd,
      metronomeProductId: '123e4567-e89b-42d3-a456-426614174010',
      productKey: MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR,
      productTag: 'myah-managed-sending-domain-year',
      quantity: 2,
      startingAt: periodStart,
      unitPriceCents: 1000,
    },
    {
      amountCents: 2000,
      billingFrequency: 'MONTHLY',
      endingBefore: monthlyEnd,
      metronomeProductId: '123e4567-e89b-42d3-a456-426614174011',
      productKey: MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH,
      productTag: 'myah-managed-mailbox-month',
      quantity: 4,
      startingAt: periodStart,
      unitPriceCents: 500,
    },
    {
      amountCents: 16_000,
      billingFrequency: 'MONTHLY',
      endingBefore: monthlyEnd,
      metronomeProductId: '123e4567-e89b-42d3-a456-426614174012',
      productKey: MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH,
      productTag: 'myah-managed-warmup-month',
      quantity: 4,
      startingAt: periodStart,
      unitPriceCents: 4000,
    },
  ],
  metronomeRateCardAlias: 'managed-email-test',
  metronomeRateCardId: '123e4567-e89b-42d3-a456-426614174020',
  proposalHash: 'proposal-hash',
  quoteHash: 'quote-hash',
  resourceSnapshot: {
    domains: [
      {
        domain: 'creator-partners.co',
        mailboxes: [
          'sender1@creator-partners.co',
          'sender2@creator-partners.co',
        ],
        providerQuote: {
          amountMinorUnits: 1000,
          currency: 'USD',
          fingerprint: 'provider-quote-1',
          observedAt: periodStart,
          termCount: 1,
          termUnit: 'YEAR',
        },
      },
      {
        domain: 'creator-collabs.co',
        mailboxes: ['sender3@creator-collabs.co', 'sender4@creator-collabs.co'],
        providerQuote: {
          amountMinorUnits: 1000,
          currency: 'USD',
          fingerprint: 'provider-quote-2',
          observedAt: periodStart,
          termCount: 1,
          termUnit: 'YEAR',
        },
      },
    ],
    personas: [1, 2, 3, 4].map((index) => ({
      address: `sender${index}@${index < 3 ? 'creator-partners.co' : 'creator-collabs.co'}`,
      createdByWorkspaceMemberId: actorWorkspaceMemberId,
      firstName: 'Sender',
      lastName: String(index),
      localPart: `sender${index}`,
      roleTitle: null,
      signature: 'Sender',
      version: 1,
    })),
    proposal: {
      createdAt: periodStart,
      expiresAt: '2026-08-05T10:15:00.000Z',
      policyVersion: 'deliverability-test-v1',
    },
  },
  workspaceId,
};

describe('ManagedEmailSubscriptionService', () => {
  const createService = () => {
    const persisted = new Map<string, ManagedEmailAcquisitionOperationEntity>();
    const repository = {
      findOneBy: jest.fn(
        async (
          _workspaceId: string,
          where: Partial<ManagedEmailAcquisitionOperationEntity>,
        ) =>
          [...persisted.values()].find((operation) =>
            Object.entries(where).every(
              ([key, value]) =>
                operation[
                  key as keyof ManagedEmailAcquisitionOperationEntity
                ] === value,
            ),
          ) ?? null,
      ),
      save: jest.fn(
        async (
          _workspaceId: string,
          value: Partial<ManagedEmailAcquisitionOperationEntity>,
        ) => {
          const operation = {
            ...value,
            id: value.id ?? operationId,
            workspaceId,
          } as ManagedEmailAcquisitionOperationEntity;
          persisted.set(operation.id, operation);
          return operation;
        },
      ),
      update: jest.fn(
        async (
          _workspaceId: string,
          where: { id: string },
          patch: Partial<ManagedEmailAcquisitionOperationEntity>,
        ) => {
          const operation = persisted.get(where.id);
          if (!operation) throw new Error('missing operation');
          Object.assign(operation, patch);
          return { affected: 1, generatedMaps: [], raw: [] };
        },
      ),
    } as unknown as jest.Mocked<
      Pick<
        WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
        'findOneBy' | 'save' | 'update'
      >
    >;
    const metronomeClient = {
      assertRateCardLineItems: jest.fn().mockResolvedValue(undefined),
      addSubscription: jest
        .fn()
        .mockResolvedValueOnce({
          metronomeEditId: '123e4567-e89b-42d3-a456-426614174030',
          subscriptionId: '123e4567-e89b-42d3-a456-426614174040',
        })
        .mockResolvedValueOnce({
          metronomeEditId: '123e4567-e89b-42d3-a456-426614174031',
          subscriptionId: '123e4567-e89b-42d3-a456-426614174041',
        })
        .mockResolvedValueOnce({
          metronomeEditId: '123e4567-e89b-42d3-a456-426614174032',
          subscriptionId: '123e4567-e89b-42d3-a456-426614174042',
        }),
      recoverAddedSubscription: jest.fn(),
      createCustomerCredit: jest.fn(),
      getRateCard: jest.fn().mockResolvedValue({
        aliases: [],
        fiatCreditType: {
          id: '123e4567-e89b-42d3-a456-426614174060',
          name: 'USD (cents)',
        },
        id: quote.metronomeRateCardId,
      }),
      getPrepaidBalance: jest.fn(),
      listInvoicesFirstPage: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        MetronomeClientService,
        | 'assertRateCardLineItems'
        | 'addSubscription'
        | 'createCustomerCredit'
        | 'getPrepaidBalance'
        | 'getRateCard'
        | 'listInvoicesFirstPage'
        | 'recoverAddedSubscription'
      >
    >;
    const workspaceCustomerService = {
      ensureWorkspaceStripeBillingContext: jest.fn().mockResolvedValue({
        metronomeCustomerId: '123e4567-e89b-42d3-a456-426614174050',
      }),
      ensureWorkspaceManagedEmailContract: jest.fn().mockResolvedValue({
        contractId: '123e4567-e89b-42d3-a456-426614174051',
        rateCardId: quote.metronomeRateCardId,
      }),
      ensureStripeBillingConfiguration: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<
      Pick<
        MetronomeWorkspaceCustomerService,
        | 'ensureWorkspaceStripeBillingContext'
        | 'ensureStripeBillingConfiguration'
        | 'ensureWorkspaceManagedEmailContract'
      >
    >;
    const managedProviderStripeService = {
      assertPaidExternalInvoice: jest.fn().mockResolvedValue({
        customerId: 'cus_managed_email_test',
        invoiceId: 'in_exact',
        metronomeInvoiceId: 'metronome-invoice-exact',
        status: 'paid',
      }),
      assertWorkspacePaymentMethodReady: jest.fn().mockResolvedValue({
        stripeCustomerId: 'cus_managed_email_test',
      }),
    } as unknown as jest.Mocked<
      Pick<
        ManagedProviderStripeService,
        'assertPaidExternalInvoice' | 'assertWorkspacePaymentMethodReady'
      >
    >;
    const twentyConfigService = {
      get: jest.fn().mockReturnValue('SANDBOX'),
    };

    return {
      managedProviderStripeService,
      metronomeClient,
      persisted,
      repository,
      service: new ManagedEmailSubscriptionService(
        repository as unknown as WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
        metronomeClient as unknown as MetronomeClientService,
        workspaceCustomerService as unknown as MetronomeWorkspaceCustomerService,
        managedProviderStripeService as unknown as ManagedProviderStripeService,
        twentyConfigService as never,
      ),
      workspaceCustomerService,
    };
  };

  it('persists immutable authorization before remote writes and records each advance subscription receipt', async () => {
    const {
      metronomeClient,
      persisted,
      repository,
      service,
      workspaceCustomerService,
    } = createService();

    await expect(
      service.beginPurchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorWorkspaceMemberId,
        idempotencyKey: 'purchase-1',
        operationId,
        providerConfigurationKey: 'icemail-production-v1',
        quote,
        readinessPolicyVersion: 'readiness-v1',
        workspaceId,
      }),
    ).resolves.toMatchObject({ id: operationId, state: 'PAYMENT_PENDING' });

    expect(repository.save).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({
        authorizedActorWorkspaceMemberId: actorWorkspaceMemberId,
        catalogVersion: quote.catalogVersion,
        expectedAmountCents: String(quote.dueTodayCents),
        idempotencyKey: 'purchase-1',
        id: operationId,
        metronomeContractId: null,
        metronomeCustomerId: null,
        quoteHash: quote.quoteHash,
        nextReconciliationAt: expect.any(Date),
        providerConfigurationKey: 'icemail-production-v1',
        readinessPolicyVersion: 'readiness-v1',
        resourceSnapshot: quote.resourceSnapshot,
        state: 'CREATING_SUBSCRIPTIONS',
        workspaceId,
      }),
    );
    expect(repository.save.mock.invocationCallOrder[0]).toBeLessThan(
      workspaceCustomerService.ensureWorkspaceManagedEmailContract.mock
        .invocationCallOrder[0],
    );
    expect(repository.save.mock.invocationCallOrder[0]).toBeLessThan(
      metronomeClient.addSubscription.mock.invocationCallOrder[0],
    );
    expect(metronomeClient.addSubscription).toHaveBeenCalledTimes(3);
    expect(
      workspaceCustomerService.ensureWorkspaceStripeBillingContext,
    ).toHaveBeenCalledWith({
      contractId: '123e4567-e89b-42d3-a456-426614174051',
      environment: 'SANDBOX',
      workspaceId,
    });
    expect(metronomeClient.addSubscription).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        billingFrequency: 'ANNUAL',
        customerId: '123e4567-e89b-42d3-a456-426614174050',
        contractId: '123e4567-e89b-42d3-a456-426614174051',
        productId: quote.lines[0].metronomeProductId,
        quantity: 2,
        startingAt: periodStart,
        uniquenessKey: `${operationId}:${MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR}`,
        proration: {
          invoiceBehavior: 'BILL_IMMEDIATELY',
          isProrated: false,
        },
      }),
    );
    expect(metronomeClient.assertRateCardLineItems).toHaveBeenCalledWith({
      lines: quote.lines.map((line) => ({
        billingFrequency: line.billingFrequency,
        productId: line.metronomeProductId,
        startingAt: line.startingAt,
        unitPriceCents: line.unitPriceCents,
      })),
      rateCardId: quote.metronomeRateCardId,
    });
    expect(
      metronomeClient.assertRateCardLineItems.mock.invocationCallOrder[0],
    ).toBeLessThan(metronomeClient.addSubscription.mock.invocationCallOrder[0]);
    expect(repository.update).toHaveBeenCalledTimes(5);
    expect(persisted.get(operationId)).toMatchObject({
      metronomeEditIds: [
        '123e4567-e89b-42d3-a456-426614174030',
        '123e4567-e89b-42d3-a456-426614174031',
        '123e4567-e89b-42d3-a456-426614174032',
      ],
      metronomeSubscriptionIds: [
        '123e4567-e89b-42d3-a456-426614174040',
        '123e4567-e89b-42d3-a456-426614174041',
        '123e4567-e89b-42d3-a456-426614174042',
      ],
      state: 'PAYMENT_PENDING',
    });
    expect(metronomeClient.getPrepaidBalance).not.toHaveBeenCalled();
    expect(metronomeClient.createCustomerCredit).not.toHaveBeenCalled();
  });

  it('fails closed before subscription edits when the contract rate card differs from the persisted quote', async () => {
    const { metronomeClient, service, workspaceCustomerService } =
      createService();

    workspaceCustomerService.ensureWorkspaceManagedEmailContract.mockResolvedValueOnce(
      {
        contractId: '123e4567-e89b-42d3-a456-426614174051',
        rateCardId: '123e4567-e89b-42d3-a456-426614174099',
      },
    );

    await expect(
      service.beginPurchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorWorkspaceMemberId,
        idempotencyKey: 'purchase-1',
        operationId,
        providerConfigurationKey: 'icemail-production-v1',
        quote,
        readinessPolicyVersion: 'readiness-v1',
        workspaceId,
      }),
    ).rejects.toThrow('Managed email subscription rate card mismatch');
    expect(metronomeClient.assertRateCardLineItems).not.toHaveBeenCalled();
    expect(metronomeClient.addSubscription).not.toHaveBeenCalled();
  });

  it('recovers an accepted subscription edit after an idempotency conflict', async () => {
    const { metronomeClient, persisted, service } = createService();

    metronomeClient.addSubscription
      .mockReset()
      .mockRejectedValueOnce(
        new MetronomeClientException(MetronomeClientExceptionCode.CONFLICT),
      )
      .mockResolvedValueOnce({
        metronomeEditId: '123e4567-e89b-42d3-a456-426614174031',
        subscriptionId: '123e4567-e89b-42d3-a456-426614174041',
      })
      .mockResolvedValueOnce({
        metronomeEditId: '123e4567-e89b-42d3-a456-426614174032',
        subscriptionId: '123e4567-e89b-42d3-a456-426614174042',
      });
    metronomeClient.recoverAddedSubscription.mockResolvedValueOnce({
      metronomeEditId: '123e4567-e89b-42d3-a456-426614174030',
      subscriptionId: '123e4567-e89b-42d3-a456-426614174040',
    });

    await expect(
      service.beginPurchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorWorkspaceMemberId,
        idempotencyKey: 'purchase-1',
        operationId,
        providerConfigurationKey: 'icemail-production-v1',
        quote,
        readinessPolicyVersion: 'readiness-v1',
        workspaceId,
      }),
    ).resolves.toMatchObject({ state: 'PAYMENT_PENDING' });

    expect(metronomeClient.recoverAddedSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        contractId: '123e4567-e89b-42d3-a456-426614174051',
        customerId: '123e4567-e89b-42d3-a456-426614174050',
        productId: quote.lines[0].metronomeProductId,
        uniquenessKey: `${operationId}:${MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR}`,
      }),
    );
    expect(persisted.get(operationId)?.metronomeSubscriptionIds).toEqual([
      '123e4567-e89b-42d3-a456-426614174040',
      '123e4567-e89b-42d3-a456-426614174041',
      '123e4567-e89b-42d3-a456-426614174042',
    ]);
  });

  it('returns an exact replay and rejects a conflicting replay before any remote call', async () => {
    const { metronomeClient, service, workspaceCustomerService } =
      createService();
    const input = {
      acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
      actorWorkspaceMemberId,
      idempotencyKey: 'purchase-1',
      operationId,
      providerConfigurationKey: 'icemail-production-v1',
      readinessPolicyVersion: 'readiness-v1',
      quote,
      workspaceId,
    };
    const original = await service.beginPurchase(input);

    await expect(service.beginPurchase(input)).resolves.toBe(original);
    await expect(
      service.beginPurchase({
        ...input,
        quote: { ...quote, quoteHash: 'different-quote' },
      }),
    ).rejects.toThrow('Managed email purchase idempotency conflict');
    expect(metronomeClient.addSubscription).toHaveBeenCalledTimes(3);
    expect(
      workspaceCustomerService.ensureWorkspaceManagedEmailContract,
    ).toHaveBeenCalledTimes(1);
  });

  it('projects one exact paid Stripe invoice containing every subscription line', async () => {
    const {
      managedProviderStripeService,
      metronomeClient,
      persisted,
      service,
    } = createService();

    await service.beginPurchase({
      acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
      actorWorkspaceMemberId,
      idempotencyKey: 'purchase-1',
      operationId,
      providerConfigurationKey: 'icemail-production-v1',
      readinessPolicyVersion: 'readiness-v1',
      quote,
      workspaceId,
    });

    const makeLine = (index: number) => {
      const line = quote.lines[index];

      return {
        endingBefore: line.endingBefore,
        hasAppliedCommitOrCredit: false,
        isProrated: false,
        productId: line.metronomeProductId,
        quantity: line.quantity,
        startingAt: line.startingAt,
        subscriptionId: `123e4567-e89b-42d3-a456-42661417404${index}`,
        total: line.amountCents,
        type: 'subscription',
        unitPrice: line.unitPriceCents,
      };
    };
    const makeInvoice = ({
      id,
      lineIndexes,
      paymentId,
      stripeInvoiceId,
    }: {
      id: string;
      lineIndexes: number[];
      paymentId: string;
      stripeInvoiceId: string;
    }) => {
      const lines = lineIndexes.map(makeLine);
      const total = lines.reduce((sum, line) => sum + line.total, 0);

      return {
        contractId: '123e4567-e89b-42d3-a456-426614174051',
        creditType: {
          id: '123e4567-e89b-42d3-a456-426614174060',
          name: 'USD (cents)',
        },
        customerId: '123e4567-e89b-42d3-a456-426614174050',
        endingBefore: periodStart,
        externalInvoice: {
          billingProvider: 'stripe',
          externalPaymentId: paymentId,
          externalStatus: 'PAID',
          invoiceId: stripeInvoiceId,
          invoicedTotal: total,
        },
        id,
        lines,
        startingAt: periodStart,
        status: 'FINALIZED',
        total,
      };
    };
    const consolidatedInvoice = makeInvoice({
      id: 'metronome-invoice-consolidated',
      lineIndexes: [0, 1, 2],
      paymentId: 'pi_consolidated',
      stripeInvoiceId: 'in_consolidated',
    });

    metronomeClient.listInvoicesFirstPage
      .mockResolvedValueOnce({
        hasNextPage: false,
        invoices: [],
      })
      .mockResolvedValueOnce({
        hasNextPage: false,
        invoices: [consolidatedInvoice],
      });

    await expect(
      service.reconcilePayment({ operationId, workspaceId }),
    ).resolves.toMatchObject({ state: 'PAYMENT_PENDING' });
    expect(persisted.get(operationId)?.paymentReceipts).toBeNull();

    await expect(
      service.reconcilePayment({ operationId, workspaceId }),
    ).resolves.toMatchObject({
      paymentReceipts: [
        {
          externalInvoiceId: 'in_consolidated',
          externalPaymentId: 'pi_consolidated',
          metronomeInvoiceId: 'metronome-invoice-consolidated',
        },
      ],
      paymentStatus: 'PAID',
      state: 'PAYMENT_PAID',
    });
    expect(
      managedProviderStripeService.assertPaidExternalInvoice,
    ).toHaveBeenCalledWith({
      metronomeBaseUrlEnvironment: 'SANDBOX',
      currency: 'USD',
      expectedAmountCents: quote.lines.reduce(
        (sum, line) => sum + line.amountCents,
        0,
      ),
      expectedPaymentIntentId: 'pi_consolidated',
      metronomeInvoiceId: 'metronome-invoice-consolidated',
      stripeInvoiceId: 'in_consolidated',
      workspaceId,
    });
  });
});
