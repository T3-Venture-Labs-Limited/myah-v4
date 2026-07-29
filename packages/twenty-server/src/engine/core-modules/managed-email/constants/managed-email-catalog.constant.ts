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
] as const satisfies readonly ManagedEmailProductDefinition[];
