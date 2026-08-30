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

export type MetronomePaymentGatedPrepaidCommitArchiveInput = Readonly<{
  commitmentId: string;
  contractId: string;
  customerId: string;
  uniquenessKey: string;
}>;
