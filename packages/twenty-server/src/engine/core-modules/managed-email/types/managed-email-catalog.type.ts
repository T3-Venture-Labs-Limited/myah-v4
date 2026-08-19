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

export type ManagedEmailPaymentProcessing = Readonly<{
  maximumVariableFeeBasisPoints: number;
  maximumFixedFeeMinorUnits: number;
  currency: 'USD';
  source: string;
  verifiedAt: string;
}>;

export type ManagedEmailLandedProviderCost =
  | Readonly<{
      kind: 'SAME_CURRENCY';
      amountMinorUnits: number;
      currency: 'USD';
      source: string;
      verifiedAt: string;
    }>
  | Readonly<{
      kind: 'FX_CEILING';
      amountMinorUnits: number;
      currency: 'USD';
      sourceCurrency: Exclude<ManagedEmailCurrency, 'USD'>;
      rateSource: string;
      verifiedAt: string;
      safetyBufferBasisPoints: number;
    }>;

export type ManagedEmailCustomerPrice =
  | Readonly<{
      kind: 'FIXED';
      amountMinorUnits: number;
      currency: 'USD';
      minimumGrossMarginBasisPoints: 3000;
      landedProviderCost: ManagedEmailLandedProviderCost;
      paymentProcessing: ManagedEmailPaymentProcessing;
    }>
  | Readonly<{
      kind: 'FIXED_PROVIDER_QUOTE_CEILING';
      amountMinorUnits: number;
      maximumProviderQuoteMinorUnits: number;
      currency: 'USD';
      minimumGrossMarginBasisPoints: 3000;
      paymentProcessing: ManagedEmailPaymentProcessing;
    }>
  | Readonly<{
      kind: 'PROVIDER_QUOTE_MARGIN';
      currency: 'USD';
      minimumGrossMarginBasisPoints: 3000;
      paymentProcessing: ManagedEmailPaymentProcessing;
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
