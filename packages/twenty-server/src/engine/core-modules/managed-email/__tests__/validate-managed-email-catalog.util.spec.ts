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

const validCatalog = (): MutableManagedEmailCatalog => ({
  version: 'test-catalog-2026-08-02',
  products: [
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[0]),
      customerPrice: {
        kind: 'PROVIDER_QUOTE_MARGIN',
        currency: 'USD',
        minimumGrossMarginBasisPoints: 3000,
      },
    },
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[1]),
      customerPrice: {
        kind: 'FIXED',
        amountMinorUnits: 358,
        currency: 'USD',
        maximumLandedProviderCostMinorUnits: 250,
      },
    },
    {
      ...structuredClone(MANAGED_EMAIL_PRODUCT_DEFINITIONS[2]),
      customerPrice: {
        kind: 'FIXED',
        amountMinorUnits: 3285,
        currency: 'EUR',
        maximumLandedProviderCostMinorUnits: 2299,
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
          amountMinorUnits: 250,
          currency: 'USD',
          source: 'Icemail controlled purchase',
          verifiedAt: '2026-07-26',
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
  });

  it('calculates a 30 percent margin floor in one unchanged currency', () => {
    expect(minimumCustomerPriceMinorUnits(1)).toBe(2);
    expect(minimumCustomerPriceMinorUnits(70)).toBe(100);
    expect(minimumCustomerPriceMinorUnits(101)).toBe(145);
    expect(minimumCustomerPriceMinorUnits(250)).toBe(358);
    expect(minimumCustomerPriceMinorUnits(2299)).toBe(3285);
  });

  it('rejects a margin result outside the safe-integer boundary', () => {
    expect(() =>
      minimumCustomerPriceMinorUnits(Number.MAX_SAFE_INTEGER),
    ).toThrow('Managed email catalog is invalid');
  });

  it('rejects a fixed customer price below its same-currency landed-cost ceiling', () => {
    const catalog = validCatalog();
    const warmup = catalog.products[2];

    if (warmup.customerPrice.kind !== 'FIXED') {
      throw new Error('Expected fixed warmup test price');
    }
    warmup.customerPrice.amountMinorUnits = 3284;

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
      'cross-currency fixed price without an approved FX policy',
      (c: MutableManagedEmailCatalog) => {
        const warmup = c.products[2];

        if (warmup.customerPrice.kind === 'FIXED') {
          warmup.customerPrice.currency = 'USD';
        }
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
