export type ManagedEmailCadence = 'ANNUAL' | 'MONTHLY';

export type ManagedEmailProductKey =
  | 'managed_sending_domain_year'
  | 'managed_mailbox_month'
  | 'managed_warmup_month';

export type ManagedEmailProductDefinition = Readonly<{
  key: ManagedEmailProductKey;
  alias: string;
  cadence: ManagedEmailCadence;
}>;

export type ManagedEmailCatalogProduct = Readonly<
  ManagedEmailProductDefinition & {
    providerCostCents: number;
    customerPriceCents: number;
  }
>;

export type ManagedEmailCatalog = Readonly<{
  version: string;
  products: readonly ManagedEmailCatalogProduct[];
}>;
