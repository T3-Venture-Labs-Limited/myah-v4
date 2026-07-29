import {
  MANAGED_EMAIL_PRODUCT_DEFINITIONS,
  MANAGED_EMAIL_PRODUCT_KEYS,
} from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import {
  minimumCustomerPriceCents,
  validateManagedEmailCatalog,
} from 'src/engine/core-modules/managed-email/utils/validate-managed-email-catalog.util';
import { type ManagedEmailCatalog } from 'src/engine/core-modules/managed-email/types/managed-email-catalog.type';

const validCatalog = (): ManagedEmailCatalog => ({
  version: '2026-07-29',
  products: [
    {
      key: MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR,
      alias: 'myah-managed-sending-domain-year',
      cadence: 'ANNUAL',
      providerCostCents: 1000,
      customerPriceCents: 1429,
    },
    {
      key: MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH,
      alias: 'myah-managed-mailbox-month',
      cadence: 'MONTHLY',
      providerCostCents: 1000,
      customerPriceCents: 1429,
    },
    {
      key: MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH,
      alias: 'myah-managed-warmup-month',
      cadence: 'MONTHLY',
      providerCostCents: 1000,
      customerPriceCents: 1429,
    },
  ],
});

describe('validateManagedEmailCatalog', () => {
  it('accepts approved identities and returns a copy-safe catalog', () => {
    const catalog = validCatalog();
    const validated = validateManagedEmailCatalog(catalog);
    expect(validated).toEqual(catalog);
    expect(validated).not.toBe(catalog);
    expect(validated.products).not.toBe(catalog.products);
    expect(MANAGED_EMAIL_PRODUCT_DEFINITIONS).toEqual([
      {
        key: MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR,
        alias: 'myah-managed-sending-domain-year',
        cadence: 'ANNUAL',
      },
      {
        key: MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH,
        alias: 'myah-managed-mailbox-month',
        cadence: 'MONTHLY',
      },
      {
        key: MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH,
        alias: 'myah-managed-warmup-month',
        cadence: 'MONTHLY',
      },
    ]);
  });

  it('calculates the minimum customer price with a 30 percent margin floor', () => {
    expect(minimumCustomerPriceCents(1)).toBe(2);
    expect(minimumCustomerPriceCents(70)).toBe(100);
    expect(minimumCustomerPriceCents(101)).toBe(145);
  });

  it('rejects a customer price below the minimum with a stable safe error', () => {
    const catalog = validCatalog();
    catalog.products[0].customerPriceCents = 1428;
    expect(() => validateManagedEmailCatalog(catalog)).toThrow(
      'Managed email catalog is invalid',
    );
  });

  it.each([
    ['blank version', (c: ManagedEmailCatalog) => (c.version = ' ')],
    [
      'unsafe provider cost',
      (c: ManagedEmailCatalog) => (c.products[0].providerCostCents = 1.5),
    ],
    [
      'zero customer price',
      (c: ManagedEmailCatalog) => (c.products[0].customerPriceCents = 0),
    ],
    [
      'duplicate keys',
      (c: ManagedEmailCatalog) => (c.products[1].key = c.products[0].key),
    ],
    [
      'duplicate aliases',
      (c: ManagedEmailCatalog) => (c.products[1].alias = c.products[0].alias),
    ],
    [
      'wrong key assignment',
      (c: ManagedEmailCatalog) =>
        (c.products[0].alias = 'myah-managed-mailbox-month'),
    ],
    [
      'wrong cadence',
      (c: ManagedEmailCatalog) => (c.products[0].cadence = 'MONTHLY'),
    ],
    [
      'AI product identity collision',
      (c: ManagedEmailCatalog) =>
        (c.products[0].alias = 'managed-openrouter-credit'),
    ],
  ])('rejects %s', (_name, mutate) => {
    const catalog = validCatalog();
    mutate(catalog);
    expect(() => validateManagedEmailCatalog(catalog)).toThrow(
      'Managed email catalog is invalid',
    );
  });

  it('does not export illustrative retail values in production definitions', () => {
    expect(
      MANAGED_EMAIL_PRODUCT_DEFINITIONS.every(
        (product) => !('providerCostCents' in product),
      ),
    ).toBe(true);
  });
});
