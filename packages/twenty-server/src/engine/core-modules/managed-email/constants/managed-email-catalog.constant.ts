import {
  type ManagedEmailProductDefinition,
  type ManagedEmailProductKey,
} from 'src/engine/core-modules/managed-email/types/managed-email-catalog.type';

export const MANAGED_EMAIL_PRODUCT_KEYS = {
  SENDING_DOMAIN_YEAR: 'managed_sending_domain_year',
  MAILBOX_MONTH: 'managed_mailbox_month',
  WARMUP_MONTH: 'managed_warmup_month',
} as const satisfies Record<string, ManagedEmailProductKey>;

export const MANAGED_EMAIL_PRODUCT_DEFINITIONS = [
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
] as const satisfies readonly ManagedEmailProductDefinition[];
