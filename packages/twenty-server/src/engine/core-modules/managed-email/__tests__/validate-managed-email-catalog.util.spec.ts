import {
  MANAGED_EMAIL_PRODUCT_DEFINITIONS,
  MANAGED_EMAIL_PRODUCT_KEYS,
} from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  minimumCustomerPriceMinorUnits,
  validateManagedEmailCatalog,
} from 'src/engine/core-modules/managed-email/utils/validate-managed-email-catalog.util';
import { type ManagedEmailCatalog } from 'src/engine/core-modules/managed-email/types/managed-email-catalog.type';

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends Readonly<object>
    ? Mutable<T[Key]>
    : T[Key];
};

type MutableManagedEmailCatalog = {
  version: string;
  products: Mutable<ManagedEmailCatalog['products'][number]>[];
};

const paymentProcessing = () => ({
  maximumVariableFeeBasisPoints: 290,
  maximumFixedFeeMinorUnits: 30,
  currency: 'USD' as const,
  source: 'Illustrative Stripe test fixture',
  verifiedAt: '2026-08-03',
});

const validCatalog = (): MutableManagedEmailCatalog => ({
  version: 'test-catalog-2026-08-03',
  products: [
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[0]),
      customerPrice: {
        kind: 'PROVIDER_QUOTE_MARGIN',
        currency: 'USD',
        minimumGrossMarginBasisPoints: 3000,
        paymentProcessing: paymentProcessing(),
      },
    },
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[1]),
      customerPrice: {
        kind: 'FIXED',
        amountMinorUnits: 650,
        currency: 'USD',
        minimumGrossMarginBasisPoints: 3000,
        landedProviderCost: {
          kind: 'SAME_CURRENCY',
          amountMinorUnits: 400,
          currency: 'USD',
          source: 'User-confirmed Icemail mailbox rate',
          verifiedAt: '2026-08-06',
        },
        paymentProcessing: paymentProcessing(),
      },
    },
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[2]),
      customerPrice: {
        kind: 'FIXED',
        amountMinorUnits: 4070,
        currency: 'USD',
        minimumGrossMarginBasisPoints: 3000,
        landedProviderCost: {
          kind: 'FX_CEILING',
          amountMinorUnits: 2700,
          currency: 'USD',
          sourceCurrency: 'EUR',
          rateSource: 'Illustrative test FX policy',
          verifiedAt: '2026-08-03',
          safetyBufferBasisPoints: 500,
        },
        paymentProcessing: paymentProcessing(),
      },
    },
  ],
});

describe('validateManagedEmailCatalog', () => {
  it('freezes only the approved provider identities and cost-source facts', () => {
    expect(MANAGED_EMAIL_PRODUCT_DEFINITIONS).toEqual([
      {
        key: MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR,
        metronomeProductTag: 'myah-managed-sending-domain-year',
        cadence: 'ANNUAL',
        providerCost: {
          kind: 'PROVIDER_QUOTE',
          currency: 'USD',
          termCount: 1,
          termUnit: 'YEAR',
        },
      },
      {
        key: MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH,
        metronomeProductTag: 'myah-managed-mailbox-month',
        cadence: 'MONTHLY',
        providerCost: {
          kind: 'FIXED',
          amountMinorUnits: 400,
          currency: 'USD',
          source: 'User-confirmed Icemail mailbox rate',
          verifiedAt: '2026-08-06',
        },
      },
      {
        key: MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH,
        metronomeProductTag: 'myah-managed-warmup-month',
        cadence: 'MONTHLY',
        providerCost: {
          kind: 'FIXED',
          amountMinorUnits: 2299,
          currency: 'EUR',
          source: 'User-observed Warmup Inbox account invoice',
          verifiedAt: '2026-08-02',
        },
      },
    ]);
    expect(
      MANAGED_EMAIL_PRODUCT_DEFINITIONS.every(
        (product) => !('customerPrice' in product),
      ),
    ).toBe(true);
  });

  it('accepts an evidence-bearing test catalog and returns a deep copy-safe value', () => {
    const catalog = validCatalog();
    const validated = validateManagedEmailCatalog(catalog);

    expect(validated).toEqual(catalog);
    expect(validated).not.toBe(catalog);
    expect(validated.products).not.toBe(catalog.products);
    expect(validated.products[0].providerCost).not.toBe(
      catalog.products[0].providerCost,
    );
    expect(validated.products[0].customerPrice).not.toBe(
      catalog.products[0].customerPrice,
    );
    expect(Object.isFrozen(validated.products[0].providerCost)).toBe(true);
    expect(Object.isFrozen(validated.products[0].customerPrice)).toBe(true);
    expect(
      Object.isFrozen(validated.products[0].customerPrice.paymentProcessing),
    ).toBe(true);
    const fixedPrice = validated.products[2].customerPrice;

    if (fixedPrice.kind !== 'FIXED') {
      throw new Error('Expected fixed warmup test price');
    }
    expect(Object.isFrozen(fixedPrice.landedProviderCost)).toBe(true);
  });

  it('calculates the exact 30 percent margin floor after payment processing', () => {
    expect(
      minimumCustomerPriceMinorUnits({
        landedProviderCostMinorUnits: 1,
        maximumVariableFeeBasisPoints: 0,
        maximumFixedFeeMinorUnits: 0,
      }),
    ).toBe(2);
    expect(
      minimumCustomerPriceMinorUnits({
        landedProviderCostMinorUnits: 250,
        maximumVariableFeeBasisPoints: 0,
        maximumFixedFeeMinorUnits: 0,
      }),
    ).toBe(358);
    expect(
      minimumCustomerPriceMinorUnits({
        landedProviderCostMinorUnits: 250,
        maximumVariableFeeBasisPoints: 290,
        maximumFixedFeeMinorUnits: 30,
      }),
    ).toBe(419);
    expect(
      minimumCustomerPriceMinorUnits({
        landedProviderCostMinorUnits: 2700,
        maximumVariableFeeBasisPoints: 290,
        maximumFixedFeeMinorUnits: 30,
      }),
    ).toBe(4070);
  });

  it('rejects a margin result outside the safe-integer boundary', () => {
    expect(() =>
      minimumCustomerPriceMinorUnits({
        landedProviderCostMinorUnits: Number.MAX_SAFE_INTEGER,
        maximumVariableFeeBasisPoints: 290,
        maximumFixedFeeMinorUnits: 30,
      }),
    ).toThrow('Managed email catalog is invalid');
  });

  it('rejects a fixed customer price below its post-fee margin floor', () => {
    const catalog = validCatalog();
    const mailbox = catalog.products[1];

    if (mailbox.customerPrice.kind !== 'FIXED') {
      throw new Error('Expected fixed mailbox test price');
    }
    mailbox.customerPrice.amountMinorUnits = 418;

    expect(() => validateManagedEmailCatalog(catalog)).toThrow(
      'Managed email catalog is invalid',
    );
  });

  it.each([
    ['blank version', (c: MutableManagedEmailCatalog) => (c.version = ' ')],
    [
      'unsafe provider cost',
      (c: MutableManagedEmailCatalog) => {
        const mailbox = c.products[1];

        if (mailbox.providerCost.kind === 'FIXED') {
          mailbox.providerCost.amountMinorUnits = 1.5;
        }
      },
    ],
    [
      'zero customer price',
      (c: MutableManagedEmailCatalog) => {
        const mailbox = c.products[1];

        if (mailbox.customerPrice.kind === 'FIXED') {
          mailbox.customerPrice.amountMinorUnits = 0;
        }
      },
    ],
    [
      'non-USD customer price',
      (c: MutableManagedEmailCatalog) => {
        const warmup = c.products[2];

        (warmup.customerPrice as { currency: string }).currency = 'EUR';
      },
    ],
    [
      'foreign provider cost without an FX ceiling',
      (c: MutableManagedEmailCatalog) => {
        const warmup = c.products[2];

        if (warmup.customerPrice.kind === 'FIXED') {
          warmup.customerPrice.landedProviderCost = {
            kind: 'SAME_CURRENCY',
            amountMinorUnits: 2700,
            currency: 'USD',
            source: 'Wrong same-currency claim',
            verifiedAt: '2026-08-03',
          };
        }
      },
    ],
    [
      'unknown landed-cost discriminant',
      (c: MutableManagedEmailCatalog) => {
        const warmup = c.products[2];

        if (warmup.customerPrice.kind === 'FIXED') {
          (warmup.customerPrice.landedProviderCost as { kind: string }).kind =
            'UNKNOWN';
        }
      },
    ],
    [
      'impossible evidence date',
      (c: MutableManagedEmailCatalog) => {
        c.products[0].customerPrice.paymentProcessing.verifiedAt = '2026-02-30';
      },
    ],
    [
      'blank payment-processing evidence',
      (c: MutableManagedEmailCatalog) => {
        c.products[0].customerPrice.paymentProcessing.source = ' ';
      },
    ],
    [
      'static domain customer price',
      (c: MutableManagedEmailCatalog) => {
        c.products[0].customerPrice = structuredClone(
          c.products[1].customerPrice,
        );
      },
    ],
    [
      'quoted mailbox provider cost',
      (c: MutableManagedEmailCatalog) => {
        c.products[1].providerCost = structuredClone(
          c.products[0].providerCost,
        );
      },
    ],
    [
      'duplicate keys',
      (c: MutableManagedEmailCatalog) =>
        (c.products[1].key = c.products[0].key),
    ],
    [
      'duplicate product tags',
      (c: MutableManagedEmailCatalog) =>
        (c.products[1].metronomeProductTag = c.products[0].metronomeProductTag),
    ],
    [
      'wrong key assignment',
      (c: MutableManagedEmailCatalog) =>
        (c.products[0].metronomeProductTag = 'myah-managed-mailbox-month'),
    ],
    [
      'wrong cadence',
      (c: MutableManagedEmailCatalog) => (c.products[0].cadence = 'MONTHLY'),
    ],
    [
      'AI product identity collision',
      (c: MutableManagedEmailCatalog) =>
        (c.products[0].metronomeProductTag = 'managed-openrouter-credit'),
    ],
  ])('rejects %s', (_name, mutate) => {
    const catalog = validCatalog();

    mutate(catalog);

    expect(() => validateManagedEmailCatalog(catalog)).toThrow(
      'Managed email catalog is invalid',
    );
  });
});
