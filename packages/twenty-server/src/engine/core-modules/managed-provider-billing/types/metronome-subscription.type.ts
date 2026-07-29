export type MetronomeBillingFrequency =
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUAL'
  | 'WEEKLY';

export type MetronomeSubscriptionProrationRounding = {
  decimalPlaces: number;
  roundingMethod: 'HALF_UP' | 'FLOOR' | 'CEILING';
};

export type MetronomeSubscriptionProration = {
  invoiceBehavior: 'BILL_IMMEDIATELY' | 'BILL_ON_NEXT_COLLECTION_DATE';
  isProrated: boolean;
  rounding?: MetronomeSubscriptionProrationRounding;
};

export type MetronomeAddSubscriptionInput = {
  customerId: string;
  contractId: string;
  billingFrequency: MetronomeBillingFrequency;
  productId: string;
  quantity: number;
  startingAt: string;
  endingBefore?: string;
  uniquenessKey: string;
  proration: MetronomeSubscriptionProration;
};

export type MetronomeQuantityUpdateInput = {
  customerId: string;
  contractId: string;
  subscriptionId: string;
  quantity: number;
  effectiveAt: string;
  uniquenessKey: string;
  prorationRounding?: MetronomeSubscriptionProrationRounding | null;
};

export type MetronomeEndSubscriptionInput = {
  customerId: string;
  contractId: string;
  subscriptionId: string;
  endingBefore: string;
  uniquenessKey: string;
};

export type MetronomeSubscriptionReceipt = {
  metronomeEditId: string;
  subscriptionId: string;
};

export type MetronomeInvoiceListInput = {
  contractId: string;
  customerId: string;
  endingBefore: string;
  startingOn: string;
};

export type MetronomeInvoiceLine = {
  endingBefore: string | null;
  hasAppliedCommitOrCredit: boolean;
  isProrated: boolean | null;
  productId: string | null;
  quantity: number | null;
  startingAt: string | null;
  subscriptionId: string | null;
  total: number;
  type: string;
  unitPrice: number | null;
};

export type MetronomeInvoice = {
  contractId: string | null;
  customerId: string;
  endingBefore: string | null;
  externalInvoice: {
    billingProvider: string;
    externalPaymentId: string | null;
    externalStatus: string | null;
    invoiceId: string | null;
    invoicedTotal: number | null;
  } | null;
  id: string;
  lines: MetronomeInvoiceLine[];
  startingAt: string | null;
  status: string;
  total: number;
};

export type MetronomeInvoicePage = {
  hasNextPage: boolean;
  invoices: MetronomeInvoice[];
};

export type ExpectedMetronomeSubscriptionLine = {
  endingBefore: string;
  isProrated: boolean;
  productId: string;
  quantity: number;
  startingAt: string;
  subscriptionId: string;
  total: number;
  unitPrice: number;
};

export type ExpectedPaidMetronomeInvoice = {
  contractId: string;
  customerId: string;
  endingBefore: string;
  lines: ExpectedMetronomeSubscriptionLine[];
  startingAt: string;
  total: number;
  usdRateCardProof: {
    contractId: string;
    fiatCreditTypeId: string;
    fiatCreditTypeName: string;
    rateCardId: string;
  };
};

export type PaidMetronomeInvoiceReceipt = {
  externalInvoiceId: string;
  externalPaymentId: string;
  invoiceId: string;
};
