import { ManagedEmailAcquisitionMode } from '../../enums/managed-email-acquisition-mode.enum';
import { ManagedEmailCustomerService } from '../managed-email-customer.service';
import { ManagedEmailCatalogService } from '../managed-email-catalog.service';

const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const actorWorkspaceMemberId = '123e4567-e89b-42d3-a456-426614174001';
const proposalId = 'proposal-1';
const quoteId = 'quote-1';
const quoteFingerprint = 'quote-fingerprint-1';
const now = new Date('2026-08-06T12:00:00.000Z');
const bundleHandleId = '323e4567-e89b-42d3-a456-426614174099';

const proposal = {
  id: proposalId,
  workspaceId,
  actorWorkspaceMemberId,
  expiresAt: new Date('2026-08-06T12:15:00.000Z'),
  mailboxCount: 2,
  policyVersion: 'sandbox-v1',
  domains: [
    {
      domain: 'creator-partners.test',
      mailboxes: [
        {
          address: 'maya@creator-partners.test',
          firstName: 'Maya',
          lastName: 'Chen',
        },
      ],
    },
  ],
  disclosures: {
    cancellation: 'Renewals can be stopped independently.',
    managedServiceOwnership: 'Managed sending domains are service assets.',
    prepaidBalance: 'Email services do not use your AI balance.',
  },
};

const quote = {
  id: quoteId,
  proposalId,
  workspaceId,
  actorWorkspaceMemberId,
  catalogVersion: 'quote-v1',
  quoteHash: quoteFingerprint,
  expiresAt: new Date('2026-08-06T12:15:00.000Z'),
  currency: 'USD',
  dueTodayCents: 2_000,
  lines: [
    {
      productKey: 'managed_mailbox_month',
      quantity: 2,
      unitPriceCents: 1_000,
      amountCents: 2_000,
      billingFrequency: 'MONTHLY',
      startingAt: now,
      endingBefore: new Date('2026-09-06T12:00:00.000Z'),
    },
  ],
  disclosures: proposal.disclosures,
};

const createHarness = () => {
  const catalogService = {
    createQuote: jest.fn().mockResolvedValue(quote),
  } as unknown as jest.Mocked<Pick<ManagedEmailCatalogService, 'createQuote'>>;
  const offerService = {
    persistBundleSelection: jest.fn().mockResolvedValue({ id: bundleHandleId }),
    resolveBundleSelection: jest.fn().mockResolvedValue('inventory-1'),
    loadProposalForQuote: jest.fn().mockResolvedValue(proposal),
    persistQuote: jest.fn().mockResolvedValue(quote),
    reserveQuoteForPurchase: jest.fn().mockResolvedValue({
      operationId: 'operation-1',
      quote,
      replayed: false,
    }),
  };
  const acquisitionService = {
    admit: jest.fn().mockResolvedValue({ id: 'operation-1' }),
  };
  const proposalService = {
    listPrewarmedBundles: jest.fn().mockResolvedValue({
      observedAt: now,
      bundles: [
        {
          inventoryId: 'inventory-1',
          domain: 'creator-partners.test',
          domainPriceCents: 1_000,
          mailboxPriceCents: 500,
          mailboxCount: 2,
          mailboxes: [
            {
              address: 'maya@creator-partners.test',
              firstName: 'Maya',
              lastName: 'Chen',
              provider: 'ICEMAIL',
              master: true,
            },
          ],
        },
      ],
    }),
    createPrewarmedProposal: jest.fn().mockResolvedValue(proposal),
  };
  const readinessService = {
    assertApprovedPurchasePolicy: jest.fn(),
  };
  const config = {
    get: jest.fn(
      (key: string) =>
        ({
          MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS: [workspaceId],
          MANAGED_EMAIL_ENABLED: true,
          MANAGED_EMAIL_EXECUTION_MODE: 'SANDBOX',
          MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY: 'provider-config-sandbox',
          MANAGED_EMAIL_READINESS_POLICY_VERSION: 'sandbox-v1',
        })[key],
    ),
  };
  const service = new ManagedEmailCustomerService(
    { find: jest.fn(), findOneBy: jest.fn() } as never,
    { find: jest.fn(), findOneBy: jest.fn() } as never,
    { findOneBy: jest.fn() } as never,
    {} as never,
    acquisitionService as never,
    proposalService as never,
    catalogService as never,
    offerService as never,
    config as never,
    readinessService as never,
  );
  return {
    service,
    catalogService,
    offerService,
    acquisitionService,
    readinessService,
    proposalService,
    config,
  };
};

describe('ManagedEmailCustomerService customer checkout contracts', () => {
  it('lists prewarmed bundles with actor-scoped opaque handles and no provider inventory IDs', async () => {
    const { service, proposalService, offerService } = createHarness();

    const result = await service.prewarmedBundles({
      actorId: actorWorkspaceMemberId,
      workspaceId,
    });

    expect(result).toEqual([
      {
        bundleId: bundleHandleId,
        domain: 'creator-partners.test',
        exclusiveWorkspaceUse: true,
        mailboxCount: 2,
        observedAt: now,
        providerType: 'ICEMAIL',
        mailboxes: [
          { address: 'maya@creator-partners.test', displayName: 'Maya Chen' },
        ],
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('inventory-1');
    expect(offerService.persistBundleSelection).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      providerInventoryId: 'inventory-1',
      workspaceId,
    });
    expect(proposalService.listPrewarmedBundles).toHaveBeenCalledTimes(1);
  });

  it('resolves the selected opaque bundle handle before provider proposal creation', async () => {
    const { service, proposalService, offerService } = createHarness();

    await expect(
      service.prewarmedProposal({
        actorId: actorWorkspaceMemberId,
        bundleId: bundleHandleId,
        workspaceId,
      }),
    ).resolves.toMatchObject({ id: proposalId, mailboxCount: 2 });
    expect(offerService.resolveBundleSelection).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      bundleId: bundleHandleId,
      workspaceId,
    });
    expect(proposalService.createPrewarmedProposal).toHaveBeenCalledWith(
      { inventoryIds: ['inventory-1'] },
      {
        actorWorkspaceMemberId,
        workspaceId,
        workspaceSlug: workspaceId,
      },
    );
  });

  it('loads the persisted proposal, creates and persists a quote, and returns server-derived sandbox state', async () => {
    const { service, catalogService, offerService, config } = createHarness();

    await expect(
      service.quote({
        actorId: actorWorkspaceMemberId,
        proposalId,
        workspaceId,
      }),
    ).resolves.toMatchObject({
      isSandbox: true,
      quoteFingerprint,
      quoteVersion: quote.catalogVersion,
    });
    expect(offerService.loadProposalForQuote).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      proposalId,
      workspaceId,
    });
    expect(catalogService.createQuote).toHaveBeenCalledWith({ proposal });
    expect(offerService.persistQuote).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      proposalId,
      quote,
      workspaceId,
    });
    expect(config.get).toHaveBeenCalledWith('MANAGED_EMAIL_EXECUTION_MODE');
  });

  it('reserves the persisted quote before admission and supports durable replay recovery', async () => {
    const {
      service,
      offerService,
      acquisitionService,
      config,
      readinessService,
    } = createHarness();
    const input = {
      idempotencyKey: 'purchase-1',
      quoteFingerprint,
      quoteId,
      quoteVersion: quote.catalogVersion,
    };

    await expect(
      service.purchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorId: actorWorkspaceMemberId,
        input,
        workspaceId,
      }),
    ).resolves.toEqual({ accepted: true, operationId: 'operation-1' });
    expect(offerService.reserveQuoteForPurchase).toHaveBeenCalledWith({
      actorWorkspaceMemberId,
      idempotencyKey: input.idempotencyKey,
      operationId: expect.any(String),
      quoteFingerprint,
      quoteId,
      quoteVersion: input.quoteVersion,
      workspaceId,
    });
    expect(acquisitionService.admit).toHaveBeenCalledWith({
      acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
      actorWorkspaceMemberId,
      idempotencyKey: input.idempotencyKey,
      operationId: 'operation-1',
      providerConfigurationKey: 'provider-config-sandbox',
      quote,
      readinessPolicyVersion: 'sandbox-v1',
      workspaceId,
    });
    expect(
      offerService.reserveQuoteForPurchase.mock.invocationCallOrder[0],
    ).toBeLessThan(acquisitionService.admit.mock.invocationCallOrder[0]);
    expect(readinessService.assertApprovedPurchasePolicy).toHaveBeenCalledWith({
      policyVersion: 'sandbox-v1',
      providerConfigurationKey: 'provider-config-sandbox',
    });
    expect(
      readinessService.assertApprovedPurchasePolicy.mock.invocationCallOrder[0],
    ).toBeLessThan(
      offerService.reserveQuoteForPurchase.mock.invocationCallOrder[0],
    );
    expect(config.get).toHaveBeenCalledWith(
      'MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY',
    );
    expect(config.get).toHaveBeenCalledWith(
      'MANAGED_EMAIL_READINESS_POLICY_VERSION',
    );

    offerService.reserveQuoteForPurchase.mockResolvedValueOnce({
      operationId: 'operation-1',
      quote,
      replayed: true,
    });
    await expect(
      service.purchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorId: actorWorkspaceMemberId,
        input,
        workspaceId,
      }),
    ).resolves.toEqual({ accepted: true, operationId: 'operation-1' });
    expect(acquisitionService.admit).toHaveBeenLastCalledWith(
      expect.objectContaining({ operationId: 'operation-1' }),
    );
  });
  it('rejects purchase before quote reservation when readiness policy approval is unavailable', async () => {
    const { service, readinessService, offerService, acquisitionService } =
      createHarness();
    readinessService.assertApprovedPurchasePolicy.mockImplementationOnce(() => {
      throw new Error('Managed email readiness policy is unavailable');
    });

    await expect(
      service.purchase({
        acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
        actorId: actorWorkspaceMemberId,
        input: {
          idempotencyKey: 'purchase-1',
          quoteFingerprint,
          quoteId,
          quoteVersion: quote.catalogVersion,
        },
        workspaceId,
      }),
    ).rejects.toThrow('Managed email readiness policy is unavailable');
    expect(offerService.reserveQuoteForPurchase).not.toHaveBeenCalled();
    expect(acquisitionService.admit).not.toHaveBeenCalled();
  });
});
