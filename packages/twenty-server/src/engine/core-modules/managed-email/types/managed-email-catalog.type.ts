export type ManagedEmailCadence = 'ANNUAL' | 'MONTHLY';

export type ManagedEmailCurrency = 'EUR' | 'USD';

export type ManagedEmailProductKey =
  | 'managed_sending_domain_year'
  | 'managed_mailbox_month'
  | 'managed_warmup_month';

export type ManagedEmailProviderCost =
  | Readonly<{
      kind: 'FIXED';
      amountMinorUnits: number;
      currency: ManagedEmailCurrency;
      source: string;
      verifiedAt: string;
    }>
  | Readonly<{
      kind: 'PROVIDER_QUOTE';
      currency: 'USD';
      termCount: 1;
      termUnit: 'YEAR';
    }>;

export type ManagedEmailCustomerPrice =
  | Readonly<{
      kind: 'FIXED';
      amountMinorUnits: number;
      currency: ManagedEmailCurrency;
      maximumLandedProviderCostMinorUnits: number;
    }>
  | Readonly<{
      kind: 'PROVIDER_QUOTE_MARGIN';
      currency: 'USD';
      minimumGrossMarginBasisPoints: 3000;
    }>;

export type ManagedEmailProductDefinition = Readonly<{
  key: ManagedEmailProductKey;
  metronomeProductTag: string;
  cadence: ManagedEmailCadence;
  providerCost: ManagedEmailProviderCost;
}>;

export type ManagedEmailCatalogProduct = Readonly<
  ManagedEmailProductDefinition & {
    customerPrice: ManagedEmailCustomerPrice;
  }
>;

export type ManagedEmailCatalog = Readonly<{
  version: string;
  products: readonly ManagedEmailCatalogProduct[];
}>;
