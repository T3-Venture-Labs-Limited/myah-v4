export type MetronomePaymentGatedPrepaidCommitInput = Readonly<{
  chargeProductId: string;
  commitmentProductId: string;
  contractId: string;
  customerId: string;
  fundingActionId: string;
  fundingIdentity: string;
  principalCents: number;
  purchaseAt: string;
  uniquenessKey: string;
}>;

export type MetronomePaymentGatedPrepaidCommitReceipt = Readonly<{
  commitmentId: string;
  metronomeEditId: string;
}>;

export type MetronomePaymentGatedPrepaidCommitRecovery =
  MetronomePaymentGatedPrepaidCommitReceipt &
    Readonly<{
      accessScheduleItemId: string;
      archivedAt: string | null;
      invoiceId: string | null;
    }>;

export type MetronomePaymentGatedPrepaidCommitExpiryInput = Readonly<{
  accessScheduleItemId: string;
  commitmentId: string;
  contractId: string;
  customerId: string;
  paidAt: string;
  uniquenessKey: string;
}>;

export type MetronomePaymentGatedPrepaidCommitExpiryProofInput =
  MetronomePaymentGatedPrepaidCommitInput &
    Readonly<{
      accessScheduleItemId: string;
      commitmentId: string;
      invoiceId: string;
      paidAt: string;
    }>;

export type MetronomePaymentGatedPrepaidCommitArchiveInput = Readonly<{
  commitmentId: string;
  contractId: string;
  customerId: string;
  uniquenessKey: string;
}>;

export type MetronomePaymentGatedPrepaidInvoiceInput = Readonly<{
  commitmentId: string;
  contractId: string;
  customerId: string;
  fiatCreditTypeId: string;
  invoiceId: string;
  principalCents: number;
}>;

export type MetronomePaymentGatedPrepaidExternalInvoice = Readonly<{
  issuedAt: string | null;
  pdfUrl: string | null;
  status:
    | 'DRAFT'
    | 'FINALIZED'
    | 'PAID'
    | 'PARTIALLY_PAID'
    | 'UNCOLLECTIBLE'
    | 'VOID'
    | 'DELETED'
    | 'PAYMENT_FAILED'
    | 'INVALID_REQUEST_ERROR'
    | 'SKIPPED'
    | 'SENT'
    | 'QUEUED';
  stripeInvoiceId: string | null;
  stripePaymentIntentId: string | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalCents: number | null;
}>;

export type MetronomePaymentGatedPrepaidInvoice = Readonly<{
  externalInvoice: MetronomePaymentGatedPrepaidExternalInvoice | null;
  issuedAt: string | null;
  metronomeInvoiceId: string;
  principalCents: number;
  status: 'DRAFT' | 'FINALIZED' | 'VOID';
}>;
