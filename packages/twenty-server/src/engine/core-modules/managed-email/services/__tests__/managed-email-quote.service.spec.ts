import {
  MANAGED_EMAIL_PRODUCT_DEFINITIONS,
  MANAGED_EMAIL_PRODUCT_KEYS,
} from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import { ManagedEmailQuoteService } from 'src/engine/core-modules/managed-email/services/managed-email-quote.service';
import { type ManagedEmailCatalog } from 'src/engine/core-modules/managed-email/types/managed-email-catalog.type';
import { type ManagedEmailProposal } from 'src/engine/core-modules/managed-email/types/managed-email-proposal.type';
import { minimumCustomerPriceMinorUnits } from 'src/engine/core-modules/managed-email/utils/validate-managed-email-catalog.util';

const paymentProcessing = {
  currency: 'USD' as const,
  maximumFixedFeeMinorUnits: 30,
  maximumVariableFeeBasisPoints: 290,
  source: 'Illustrative Stripe test fixture',
  verifiedAt: '2026-08-03',
};

const mailboxProviderCostMinorUnits = 400;
const mailboxCustomerPriceMinorUnits = 650;

const catalog: ManagedEmailCatalog = {
  products: [
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[0]),
      customerPrice: {
        currency: 'USD',
        kind: 'PROVIDER_QUOTE_MARGIN',
        minimumGrossMarginBasisPoints: 3000,
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
          source: 'Illustrative same-currency test ceiling',
          verifiedAt: '2026-08-03',
        },
        minimumGrossMarginBasisPoints: 3000,
        paymentProcessing,
      },
    },
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[2]),
      customerPrice: {
        amountMinorUnits: 4070,
        currency: 'USD',
        kind: 'FIXED',
        landedProviderCost: {
          amountMinorUnits: 2700,
          currency: 'USD',
          kind: 'FX_CEILING',
          rateSource: 'Illustrative test FX policy',
          safetyBufferBasisPoints: 500,
          sourceCurrency: 'EUR',
          verifiedAt: '2026-08-03',
        },
        minimumGrossMarginBasisPoints: 3000,
        paymentProcessing,
      },
    },
  ],
  version: 'test-catalog-2026-08-03',
};

const proposal: ManagedEmailProposal = {
  createdAt: new Date('2026-08-05T10:00:00.000Z'),
  disclosures: {
    cancellation:
      'Domain, mailbox, and warmup renewals can be stopped independently and remain active through their paid-through dates.',
    managedServiceOwnership:
      'Managed sending domains are service assets for exclusive workspace use. Registrar ownership or transfer is not included.',
    prepaidBalance: 'Email services do not use your AI balance.',
  },
  domains: ['creator-partners.co', 'creator-collabs.co'].map(
    (domain, index) => ({
      domain,
      mailboxes: [
        {
          address: `sender${index * 2 + 1}@${domain}`,
          createdByWorkspaceMemberId: '123e4567-e89b-42d3-a456-426614174001',
          firstName: 'Sender',
          lastName: String(index * 2 + 1),
          localPart: `sender${index * 2 + 1}`,
          roleTitle: null,
          signature: 'Sender',
          version: 1,
        },
        {
          address: `sender${index * 2 + 2}@${domain}`,
          createdByWorkspaceMemberId: '123e4567-e89b-42d3-a456-426614174001',
          firstName: 'Sender',
          lastName: String(index * 2 + 2),
          localPart: `sender${index * 2 + 2}`,
          roleTitle: null,
          signature: 'Sender',
          version: 1,
        },
      ],
      providerQuote: {
        amountMinorUnits: 1000,
        currency: 'USD' as const,
        fingerprint: `quote-${index}`,
        observedAt: '2026-08-05T10:00:00.000Z',
        termCount: 1 as const,
        termUnit: 'YEAR' as const,
      },
    }),
  ),
  expiresAt: new Date('2026-08-05T10:15:00.000Z'),
  id: 'proposal-id',
  mailboxCount: 4,
  policyVersion: 'deliverability-test-v1',
  workspaceId: '123e4567-e89b-42d3-a456-426614174000',
};

const metronomeProducts = {
  [MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR]:
    '123e4567-e89b-42d3-a456-426614174010',
  [MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH]:
    '123e4567-e89b-42d3-a456-426614174011',
  [MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH]:
    '123e4567-e89b-42d3-a456-426614174012',
};

describe('ManagedEmailQuoteService', () => {
  const service = new ManagedEmailQuoteService(() => 'quote-id');

  it('creates immutable exact annual and monthly lines entirely from validated server facts', () => {
    const quote = service.createQuote({
      catalog,
      metronomeProducts,
      metronomeRateCardAlias: 'managed-email-test',
      metronomeRateCardId: '123e4567-e89b-42d3-a456-426614174020',
      now: new Date('2026-08-05T10:05:00.000Z'),
      proposal,
    });
    const domainPrice = minimumCustomerPriceMinorUnits({
      landedProviderCostMinorUnits: 1000,
      maximumFixedFeeMinorUnits: 30,
      maximumVariableFeeBasisPoints: 290,
    });

    expect(quote).toMatchObject({
      catalogVersion: 'test-catalog-2026-08-03',
      currency: 'USD',
      expiresAt: proposal.expiresAt,
      id: 'quote-id',
      workspaceId: proposal.workspaceId,
    });
    expect(quote.lines).toEqual([
      {
        amountCents: domainPrice * 2,
        billingFrequency: 'ANNUAL',
        endingBefore: '2027-08-05T10:05:00.000Z',
        metronomeProductId:
          metronomeProducts[MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR],
        productKey: MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR,
        productTag: 'myah-managed-sending-domain-year',
        quantity: 2,
        startingAt: '2026-08-05T10:05:00.000Z',
        unitPriceCents: domainPrice,
      },
      {
        amountCents: mailboxCustomerPriceMinorUnits * 4,
        billingFrequency: 'MONTHLY',
        endingBefore: '2026-09-05T10:05:00.000Z',
        metronomeProductId:
          metronomeProducts[MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH],
        productKey: MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH,
        productTag: 'myah-managed-mailbox-month',
        quantity: 4,
        startingAt: '2026-08-05T10:05:00.000Z',
        unitPriceCents: mailboxCustomerPriceMinorUnits,
      },
      {
        amountCents: 4070 * 4,
        billingFrequency: 'MONTHLY',
        endingBefore: '2026-09-05T10:05:00.000Z',
        metronomeProductId:
          metronomeProducts[MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH],
        productKey: MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH,
        productTag: 'myah-managed-warmup-month',
        quantity: 4,
        startingAt: '2026-08-05T10:05:00.000Z',
        unitPriceCents: 4070,
      },
    ]);
    expect(quote.dueTodayCents).toBe(
      quote.lines.reduce((total, line) => total + line.amountCents, 0),
    );
    expect(quote.disclosures).toEqual(proposal.disclosures);
    expect(Object.isFrozen(quote)).toBe(true);
    expect(Object.isFrozen(quote.lines)).toBe(true);
  });

  it('preserves prewarmed inventory identity and exact provider costs', () => {
    const prewarmedProposal: ManagedEmailProposal = {
      ...proposal,
      domains: [
        {
          ...proposal.domains[0],
          providerInventoryId: 'inventory-1',
          prewarmedProviderCosts: {
            domainPriceCents: 1000,
            mailboxPriceCents: mailboxProviderCostMinorUnits,
          },
        },
      ],
      mailboxCount: 2,
    };

    const quote = service.createQuote({
      catalog,
      metronomeProducts,
      metronomeRateCardAlias: 'managed-email-test',
      metronomeRateCardId: '123e4567-e89b-42d3-a456-426614174020',
      now: new Date('2026-08-05T10:05:00.000Z'),
      proposal: prewarmedProposal,
    });

    expect(quote.resourceSnapshot.domains).toEqual([
      expect.objectContaining({
        providerInventoryId: 'inventory-1',
        prewarmedProviderCosts: {
          domainPriceCents: 1000,
          mailboxPriceCents: mailboxProviderCostMinorUnits,
        },
      }),
    ]);
  });

  it('rejects a prewarmed mailbox cost above the approved fixed catalog cost', () => {
    const prewarmedProposal: ManagedEmailProposal = {
      ...proposal,
      domains: [
        {
          ...proposal.domains[0],
          providerInventoryId: 'inventory-1',
          prewarmedProviderCosts: {
            domainPriceCents: 1000,
            mailboxPriceCents: mailboxProviderCostMinorUnits + 1,
          },
        },
      ],
      mailboxCount: 2,
    };

    expect(() =>
      service.createQuote({
        catalog,
        metronomeProducts,
        metronomeRateCardAlias: 'managed-email-test',
        metronomeRateCardId: '123e4567-e89b-42d3-a456-426614174020',
        now: new Date('2026-08-05T10:05:00.000Z'),
        proposal: prewarmedProposal,
      }),
    ).toThrow('Managed email prewarmed mailbox cost is not covered');
  });

  it('rejects expired proposals and provider quotes that cannot form one exact product line', () => {
    expect(() =>
      service.createQuote({
        catalog,
        metronomeProducts,
        metronomeRateCardAlias: 'managed-email-test',
        metronomeRateCardId: '123e4567-e89b-42d3-a456-426614174020',
        now: proposal.expiresAt,
        proposal,
      }),
    ).toThrow('Managed email proposal has expired');

    expect(() =>
      service.createQuote({
        catalog,
        metronomeProducts,
        metronomeRateCardAlias: 'managed-email-test',
        metronomeRateCardId: '123e4567-e89b-42d3-a456-426614174020',
        now: new Date('2026-08-05T10:05:00.000Z'),
        proposal: {
          ...proposal,
          domains: proposal.domains.map((domain, index) => ({
            ...domain,
            providerQuote: {
              ...domain.providerQuote,
              amountMinorUnits: 1000 + index,
            },
          })),
        },
      }),
    ).toThrow('Managed email domain quotes cannot be represented exactly');
  });

  it('rejects missing or mismatched catalog and Metronome product facts', () => {
    expect(() =>
      service.createQuote({
        catalog: { ...catalog, version: '' },
        metronomeProducts,
        metronomeRateCardAlias: 'managed-email-test',
        metronomeRateCardId: '123e4567-e89b-42d3-a456-426614174020',
        now: new Date('2026-08-05T10:05:00.000Z'),
        proposal,
      }),
    ).toThrow('Managed email catalog is invalid');

    expect(() =>
      service.createQuote({
        catalog,
        metronomeProducts: {
          ...metronomeProducts,
          [MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH]: '',
        },
        metronomeRateCardAlias: 'managed-email-test',
        metronomeRateCardId: '123e4567-e89b-42d3-a456-426614174020',
        now: new Date('2026-08-05T10:05:00.000Z'),
        proposal,
      }),
    ).toThrow('Managed email Metronome catalog is invalid');
  });
});
