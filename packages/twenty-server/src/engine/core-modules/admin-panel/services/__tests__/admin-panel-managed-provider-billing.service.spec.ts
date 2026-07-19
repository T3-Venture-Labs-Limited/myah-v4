import { type MetronomeClientService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-client.service';
import { type MetronomeWorkspaceCustomerService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-workspace-customer.service';
import { type ManagedProviderFundingJournalService } from 'src/engine/core-modules/managed-provider-billing/services/managed-provider-funding-journal.service';
import {
  MetronomeClientException,
  MetronomeClientExceptionCode,
} from 'src/engine/core-modules/managed-provider-billing/metronome-client.exception';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { AdminPanelManagedProviderBillingService } from '../admin-panel-managed-provider-billing.service';

describe('AdminPanelManagedProviderBillingService', () => {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const operatorId = '22222222-2222-4222-8222-222222222222';

  const createConfig = () => ({
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        MANAGED_OPENROUTER_CREDIT_PRODUCT_ID: 'credit-product-id',
        MANAGED_OPENROUTER_FUNDING_WORKSPACE_IDS: [workspaceId],
        MANAGED_OPENROUTER_GRANT_DAILY_ACTION_LIMIT: 20,
        MANAGED_OPENROUTER_GRANT_OPERATOR_USER_IDS: [operatorId],
        MANAGED_OPENROUTER_MAX_GRANT_CENTS: 1_000_000,
      };

      return values[key];
    }),
  });

  it('journals then grants a credit to the exact workspace customer and contract', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-19T10:00:00.000Z'));
    const metronomeClientService = {
      createCustomerCredit: jest.fn().mockResolvedValue({ id: 'credit-id' }),
    };
    const metronomeWorkspaceCustomerService = {
      ensureWorkspaceContract: jest.fn().mockResolvedValue('contract-id'),
      ensureWorkspaceCustomer: jest.fn().mockResolvedValue('customer-id'),
    };
    const fundingJournalService = {
      countRecentActions: jest.fn().mockResolvedValue(0),
      createPending: jest.fn().mockResolvedValue({
        createdAt: new Date('2026-07-19T10:00:00.000Z'),
        id: 'funding-action-id',
        metronomeUniquenessKey: 'myah:funding-key',
        state: 'PENDING',
      }),
      findByIdempotency: jest.fn().mockResolvedValue(null),
      transition: jest.fn(),
    };
    const service = new AdminPanelManagedProviderBillingService(
      metronomeClientService as unknown as MetronomeClientService,
      metronomeWorkspaceCustomerService as unknown as MetronomeWorkspaceCustomerService,
      createConfig() as unknown as TwentyConfigService,
      fundingJournalService as unknown as ManagedProviderFundingJournalService,
    );

    await expect(
      service.grantCredit(
        {
          amountCents: 5_000,
          endingBefore: new Date('2027-01-01T00:00:00.000Z'),
          reason: 'design partner pilot',
          idempotencyKey: 'pilot-grant-1',
          workspaceId,
        },
        operatorId,
      ),
    ).resolves.toEqual({
      contractId: 'contract-id',
      creditId: 'credit-id',
      customerId: 'customer-id',
    });
    expect(
      fundingJournalService.createPending.mock.invocationCallOrder[0],
    ).toBeLessThan(
      metronomeClientService.createCustomerCredit.mock.invocationCallOrder[0],
    );
    expect(metronomeClientService.createCustomerCredit).toHaveBeenCalledWith({
      amountCents: 5_000,
      contractId: 'contract-id',
      customerId: 'customer-id',
      customFields: { myah_managed_openrouter: 'sponsored' },
      endingBefore: '2027-01-01T00:00:00.000Z',
      name: 'Myah managed OpenRouter sponsored credit: design partner pilot',
      productId: 'credit-product-id',
      startingAt: '2026-07-19T10:00:00.000Z',
      uniquenessKey: 'myah:funding-key',
    });
    expect(fundingJournalService.transition).toHaveBeenCalledWith(
      'funding-action-id',
      'SUCCEEDED',
      'credit-id',
    );
    jest.useRealTimers();
  });

  it('rejects a credit that does not end in the future before Metronome I/O', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-19T10:00:00.000Z'));
    const metronomeClientService = {
      createCustomerCredit: jest.fn(),
    };
    const fundingJournalService = {
      countRecentActions: jest.fn(),
      createPending: jest.fn(),
      findByIdempotency: jest.fn(),
      transition: jest.fn(),
    };
    const service = new AdminPanelManagedProviderBillingService(
      metronomeClientService as unknown as MetronomeClientService,
      {
        ensureWorkspaceContract: jest.fn(),
        ensureWorkspaceCustomer: jest.fn(),
      } as unknown as MetronomeWorkspaceCustomerService,
      createConfig() as unknown as TwentyConfigService,
      fundingJournalService as unknown as ManagedProviderFundingJournalService,
    );

    await expect(
      service.grantCredit(
        {
          reason: 'design partner pilot',
          amountCents: 5_000,
          endingBefore: new Date('2026-07-19T10:00:00.000Z'),
          idempotencyKey: 'pilot-grant-1',
          workspaceId,
        },
        operatorId,
      ),
    ).rejects.toThrow('Managed provider credit must end in the future');
    expect(fundingJournalService.createPending).not.toHaveBeenCalled();
    expect(metronomeClientService.createCustomerCredit).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
  it('fails closed for an unauthorized grant operator before any journal or provider I/O', async () => {
    const config = createConfig();

    config.get.mockImplementation((key: string) =>
      key === 'MANAGED_OPENROUTER_GRANT_OPERATOR_USER_IDS'
        ? []
        : createConfig().get(key),
    );
    const fundingJournalService = {
      countRecentActions: jest.fn(),
      createPending: jest.fn(),
      findByIdempotency: jest.fn(),
      transition: jest.fn(),
    };
    const metronomeClientService = { createCustomerCredit: jest.fn() };
    const service = new AdminPanelManagedProviderBillingService(
      metronomeClientService as unknown as MetronomeClientService,
      {
        ensureWorkspaceContract: jest.fn(),
        ensureWorkspaceCustomer: jest.fn(),
      } as unknown as MetronomeWorkspaceCustomerService,
      config as unknown as TwentyConfigService,
      fundingJournalService as unknown as ManagedProviderFundingJournalService,
    );

    await expect(
      service.grantCredit(
        {
          amountCents: 100,
          endingBefore: new Date('2027-01-01T00:00:00.000Z'),
          idempotencyKey: 'unauthorized',
          reason: 'must not run',
          workspaceId,
        },
        operatorId,
      ),
    ).rejects.toThrow('not authorized');
    expect(fundingJournalService.createPending).not.toHaveBeenCalled();
    expect(metronomeClientService.createCustomerCredit).not.toHaveBeenCalled();
  });

  it('quarantines an ambiguous Metronome credit outcome for reconciliation', async () => {
    const fundingJournalService = {
      countRecentActions: jest.fn().mockResolvedValue(0),
      createPending: jest.fn().mockResolvedValue({
        createdAt: new Date('2026-07-19T10:00:00.000Z'),
        id: 'funding-action-id',
        metronomeUniquenessKey: 'myah:funding-key',
        state: 'PENDING',
      }),
      findByIdempotency: jest.fn().mockResolvedValue(null),
      transition: jest.fn(),
    };
    const service = new AdminPanelManagedProviderBillingService(
      {
        createCustomerCredit: jest
          .fn()
          .mockRejectedValue(
            new MetronomeClientException(
              MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
            ),
          ),
      } as unknown as MetronomeClientService,
      {
        ensureWorkspaceContract: jest.fn().mockResolvedValue('contract-id'),
        ensureWorkspaceCustomer: jest.fn().mockResolvedValue('customer-id'),
      } as unknown as MetronomeWorkspaceCustomerService,
      createConfig() as unknown as TwentyConfigService,
      fundingJournalService as unknown as ManagedProviderFundingJournalService,
    );

    await expect(
      service.grantCredit(
        {
          amountCents: 100,
          endingBefore: new Date('2027-01-01T00:00:00.000Z'),
          idempotencyKey: 'ambiguous',
          reason: 'test reconciliation',
          workspaceId,
        },
        operatorId,
      ),
    ).rejects.toMatchObject({
      code: MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
    });
    expect(fundingJournalService.transition).toHaveBeenCalledWith(
      'funding-action-id',
      'RECONCILIATION_REQUIRED',
      null,
      MetronomeClientExceptionCode.CREATE_OUTCOME_UNCERTAIN,
    );
  });

  it('audits unsupported offline commitments with finance authorization and a definitive outcome', async () => {
    const config = createConfig();

    config.get.mockImplementation((key: string) =>
      key === 'MANAGED_OPENROUTER_FINANCE_OPERATOR_USER_IDS'
        ? [operatorId]
        : createConfig().get(key),
    );
    const fundingJournalService = {
      createPending: jest.fn().mockResolvedValue({
        id: 'funding-action-id',
        state: 'PENDING',
      }),
      transition: jest.fn(),
    };
    const service = new AdminPanelManagedProviderBillingService(
      { createCustomerCredit: jest.fn() } as unknown as MetronomeClientService,
      {} as MetronomeWorkspaceCustomerService,
      config as unknown as TwentyConfigService,
      fundingJournalService as unknown as ManagedProviderFundingJournalService,
    );

    await expect(
      service.recordOfflineCommitment(
        {
          amountCents: 5_000,
          currency: 'USD',
          externalReference: 'wire-2026-07-19',
          idempotencyKey: 'offline-1',
          paymentEvidence: 'bank-receipt-42',
          reason: 'verified offline payment',
          workspaceId,
        },
        operatorId,
      ),
    ).rejects.toThrow('OFFLINE_COMMITMENT_UNSUPPORTED');
    expect(fundingJournalService.createPending).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'PREPAID_COMMIT',
        operatorIdentity: operatorId,
        paymentEvidence: { reference: 'bank-receipt-42' },
        permissionUsed: 'managed_provider_finance',
      }),
    );
    expect(fundingJournalService.transition).toHaveBeenCalledWith(
      'funding-action-id',
      'FAILED_DEFINITIVE',
      null,
      'MANAGED_PROVIDER_OFFLINE_COMMITMENT_UNSUPPORTED',
    );
  });
});
