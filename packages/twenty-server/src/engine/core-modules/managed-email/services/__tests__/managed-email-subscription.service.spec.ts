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
          name: 'USD',
        },
        id: quote.metronomeRateCardId,
      }),
      getPrepaidBalance: jest.fn(),
      listInvoicesFirstPage: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<
        MetronomeClientService,
        | 'addSubscription'
        | 'createCustomerCredit'
        | 'getPrepaidBalance'
        | 'getRateCard'
        | 'listInvoicesFirstPage'
        | 'recoverAddedSubscription'
      >
    >;
    const workspaceCustomerService = {
      ensureWorkspaceCustomer: jest
        .fn()
        .mockResolvedValue('123e4567-e89b-42d3-a456-426614174050'),
      ensureWorkspaceManagedEmailContract: jest
        .fn()
        .mockResolvedValue('123e4567-e89b-42d3-a456-426614174051'),
    } as unknown as jest.Mocked<
      Pick<
        MetronomeWorkspaceCustomerService,
        'ensureWorkspaceCustomer' | 'ensureWorkspaceManagedEmailContract'
      >
    >;

    return {
      metronomeClient,
      persisted,
      repository,
      service: new ManagedEmailSubscriptionService(
        repository as unknown as WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
        metronomeClient as unknown as MetronomeClientService,
        workspaceCustomerService as unknown as MetronomeWorkspaceCustomerService,
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

  it('projects only one exact paid Stripe invoice onto the operation', async () => {
    const { metronomeClient, persisted, service } = createService();

    await service.beginPurchase({
      acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
      actorWorkspaceMemberId,
      idempotencyKey: 'purchase-1',
      providerConfigurationKey: 'icemail-production-v1',
      readinessPolicyVersion: 'readiness-v1',
      quote,
      workspaceId,
    });

    const exactInvoice = {
      contractId: '123e4567-e89b-42d3-a456-426614174051',
      creditType: {
        id: '123e4567-e89b-42d3-a456-426614174060',
        name: 'USD',
      },
      customerId: '123e4567-e89b-42d3-a456-426614174050',
      endingBefore: annualEnd,
      externalInvoice: {
        billingProvider: 'stripe',
        externalPaymentId: 'pi_exact',
        externalStatus: 'PAID',
        invoiceId: 'in_exact',
        invoicedTotal: quote.dueTodayCents,
      },
      id: 'metronome-invoice-exact',
      lines: quote.lines.map((line, index) => ({
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
      })),
      startingAt: periodStart,
      status: 'FINALIZED',
      total: quote.dueTodayCents,
    };
    metronomeClient.listInvoicesFirstPage
      .mockResolvedValueOnce({
        hasNextPage: false,
        invoices: [
          {
            ...exactInvoice,
            id: 'unrelated-paid-invoice',
            lines: exactInvoice.lines.map((line, index) =>
              index === 0
                ? {
                    ...line,
                    productId: '123e4567-e89b-42d3-a456-426614174099',
                  }
                : line,
            ),
          },
        ],
      })
      .mockResolvedValueOnce({
        hasNextPage: false,
        invoices: [exactInvoice],
      });

    await expect(
      service.reconcilePayment({ operationId, workspaceId }),
    ).resolves.toMatchObject({ state: 'PAYMENT_PENDING' });
    expect(persisted.get(operationId)?.externalInvoiceId).toBeNull();

    await expect(
      service.reconcilePayment({ operationId, workspaceId }),
    ).resolves.toMatchObject({
      externalInvoiceId: 'in_exact',
      externalPaymentId: 'pi_exact',
      metronomeInvoiceId: 'metronome-invoice-exact',
      paymentStatus: 'PAID',
      state: 'PAYMENT_PAID',
    });
    expect(persisted.get(operationId)?.correlatedSubscriptionLines).toEqual(
      exactInvoice.lines.map(
        ({
          endingBefore,
          isProrated,
          productId,
          quantity,
          startingAt,
          subscriptionId,
          total,
          unitPrice,
        }) => ({
          endingBefore,
          isProrated,
          productId,
          quantity,
          startingAt,
          subscriptionId,
          total,
          unitPrice,
        }),
      ),
    );
  });
});
