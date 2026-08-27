import { ManagedEmailAcquisitionMode } from '../../enums/managed-email-acquisition-mode.enum';
import { MANAGED_EMAIL_PRODUCT_DEFINITIONS } from '../../constants/managed-email-catalog.constant';
import { type ManagedEmailProposal } from '../../types/managed-email-proposal.type';
import { ManagedEmailCatalogService } from '../managed-email-catalog.service';

const now = new Date('2026-08-06T12:00:00.000Z');
const proposal = {
  acquisitionMode: ManagedEmailAcquisitionMode.NEW_MANAGED,
  id: 'proposal-1',
  workspaceId: '123e4567-e89b-42d3-a456-426614174000',
  createdAt: new Date('2026-08-06T11:55:00.000Z'),
  expiresAt: new Date('2026-08-06T12:15:00.000Z'),
  mailboxCount: 2,
  domains: [
    {
      domain: 'creator-partners.test',
      mailboxes: [],
      providerQuote: {
        amountMinorUnits: 1_000,
        currency: 'USD',
        fingerprint: 'provider-quote-1',
        observedAt: now.toISOString(),
        termCount: 1,
        termUnit: 'YEAR',
      },
    },
  ],
  disclosures: {
    cancellation: 'Renewals can be stopped independently.',
    managedServiceOwnership: 'Managed sending domains are service assets.',
    prepaidBalance: 'Email services do not use your AI balance.',
  },
  policyVersion: 'sandbox-v1',
} satisfies ManagedEmailProposal;

const paymentProcessing = {
  currency: 'USD',
  maximumFixedFeeMinorUnits: 30,
  maximumVariableFeeBasisPoints: 300,
  source: 'Explicit test payment processing terms',
  verifiedAt: '2026-08-03',
};

const mailboxProviderCostMinorUnits = 250;
const mailboxCustomerPriceMinorUnits = 650;

const catalog = {
  version: 'test-catalog-2026-08-06',
  products: [
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[0]),
      customerPrice: {
        currency: 'USD',
        kind: 'PROVIDER_QUOTE_MARGIN',
        minimumGrossMarginBasisPoints: 3_000,
        paymentProcessing,
      },
    },
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[1]),
      customerPrice: {
        amountMinorUnits: mailboxCustomerPriceMinorUnits,
        currency: 'USD',
        kind: 'FIXED',
        landedProviderCost: {
          amountMinorUnits: mailboxProviderCostMinorUnits,
          currency: 'USD',
          kind: 'SAME_CURRENCY',
          source: 'Explicit test catalog cost',
          verifiedAt: '2026-08-03',
        },
        minimumGrossMarginBasisPoints: 3_000,
        paymentProcessing,
      },
    },
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[2]),
      customerPrice: {
        amountMinorUnits: 4_076,
        currency: 'USD',
        kind: 'FIXED',
        landedProviderCost: {
          amountMinorUnits: 2_700,
          currency: 'USD',
          kind: 'FX_CEILING',
          rateSource: 'Explicit test catalog FX ceiling',
          safetyBufferBasisPoints: 500,
          sourceCurrency: 'EUR',
          verifiedAt: '2026-08-03',
        },
        minimumGrossMarginBasisPoints: 3_000,
        paymentProcessing,
      },
    },
  ],
};

const tags = MANAGED_EMAIL_PRODUCT_DEFINITIONS.map(
  ({ metronomeProductTag }) => metronomeProductTag,
);

const clock = jest.fn(() => now);

const createHarness = (mode: 'SANDBOX' | 'PRODUCTION' = 'SANDBOX') => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'MANAGED_EMAIL_CATALOG') return catalog;
      if (key === 'MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS') {
        return mode === 'SANDBOX' ? 'sandbox-managed-email' : 'managed-email';
      }
      if (key === 'MANAGED_EMAIL_EXECUTION_MODE') return mode;
      throw new Error(`Unexpected config key: ${key}`);
    }),
  };
  const metronome = {
    assertRateCardLineItems: jest.fn().mockResolvedValue(undefined),
    resolveRateCardProducts: jest.fn().mockResolvedValue({
      rateCardId: 'rate-card-1',
      productIdsByTag: {
        [tags[0]]: 'product-domain',
        [tags[1]]: 'product-mailbox',
        [tags[2]]: 'product-warmup',
      },
    }),
  };
  const quotedLines = [
    {
      billingFrequency: 'ANNUAL',
      metronomeProductId: 'product-domain',
      startingAt: now.toISOString(),
      unitPriceCents: 1_500,
    },
    {
      billingFrequency: 'MONTHLY',
      metronomeProductId: 'product-mailbox',
      startingAt: now.toISOString(),
      unitPriceCents: mailboxCustomerPriceMinorUnits,
    },
    {
      billingFrequency: 'MONTHLY',
      metronomeProductId: 'product-warmup',
      startingAt: now.toISOString(),
      unitPriceCents: 4_076,
    },
  ] as const;
  const quote = {
    createQuote: jest.fn().mockReturnValue({
      id: 'quote-1',
      lines: quotedLines,
      metronomeRateCardId: 'rate-card-1',
    }),
  };
  const service = new ManagedEmailCatalogService(
    config as never,
    metronome as never,
    quote as never,
    clock,
  );

  return { config, metronome, quote, service };
};

describe('ManagedEmailCatalogService', () => {
  it('validates the typed catalog, resolves canonical tags, and delegates exact derived IDs', async () => {
    const { metronome, quote, service } = createHarness();

    await expect(service.createQuote({ proposal })).resolves.toEqual(
      expect.objectContaining({ id: 'quote-1' }),
    );
    expect(metronome.resolveRateCardProducts).toHaveBeenCalledWith({
      alias: 'sandbox-managed-email',
      at: now,
      productTags: tags,
    });
    expect(quote.createQuote).toHaveBeenCalledWith({
      catalog,
      metronomeProducts: {
        managed_sending_domain_year: 'product-domain',
        managed_mailbox_month: 'product-mailbox',
        managed_warmup_month: 'product-warmup',
      },
      metronomeRateCardAlias: 'sandbox-managed-email',
      metronomeRateCardId: 'rate-card-1',
      now,
      proposal,
    });
    expect(metronome.assertRateCardLineItems).toHaveBeenCalledWith({
      lines: [
        {
          billingFrequency: 'ANNUAL',
          productId: 'product-domain',
          startingAt: now.toISOString(),
          unitPriceCents: 1_500,
        },
        {
          billingFrequency: 'MONTHLY',
          productId: 'product-mailbox',
          startingAt: now.toISOString(),
          unitPriceCents: mailboxCustomerPriceMinorUnits,
        },
        {
          billingFrequency: 'MONTHLY',
          productId: 'product-warmup',
          startingAt: now.toISOString(),
          unitPriceCents: 4_076,
        },
      ],
      rateCardId: 'rate-card-1',
    });
  });

  it('requires a sandbox-prefixed alias in sandbox and never substitutes sandbox values in production', async () => {
    const sandbox = createHarness();
    sandbox.config.get.mockImplementation((key: string) => {
      if (key === 'MANAGED_EMAIL_CATALOG') return catalog;
      if (key === 'MANAGED_EMAIL_EXECUTION_MODE') return 'SANDBOX';
      if (key === 'MANAGED_EMAIL_METRONOME_RATE_CARD_ALIAS')
        return 'managed-email';
      throw new Error(`Unexpected config key: ${key}`);
    });
    await expect(sandbox.service.createQuote({ proposal })).rejects.toThrow();
    expect(sandbox.metronome.resolveRateCardProducts).not.toHaveBeenCalled();

    const production = createHarness('PRODUCTION');
    await production.service.createQuote({ proposal });
    expect(production.metronome.resolveRateCardProducts).toHaveBeenCalledWith(
      expect.objectContaining({ alias: 'managed-email' }),
    );
  });
});
