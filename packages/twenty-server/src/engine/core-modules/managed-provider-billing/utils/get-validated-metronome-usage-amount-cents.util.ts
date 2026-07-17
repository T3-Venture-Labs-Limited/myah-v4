import { type MetronomeUsagePreview } from '../services/metronome-client.service';

export const getValidatedMetronomeUsageAmountCents = ({
  contractId,
  customerId,
  expectedProductIds,
  preview,
}: {
  contractId: string;
  customerId: string;
  expectedProductIds: string[];
  preview: MetronomeUsagePreview;
}): bigint => {
  if (preview.invoices.length !== 1) {
    throw new Error('Metronome usage preview is ambiguous');
  }

  const invoice = preview.invoices[0];

  if (invoice.customerId !== customerId || invoice.contractId !== contractId) {
    throw new Error('Metronome usage preview does not match the workspace');
  }

  const usageTotals = invoice.lineItems.map((lineItem) => {
    if (
      lineItem.type !== 'usage' ||
      !lineItem.productId ||
      !expectedProductIds.includes(lineItem.productId) ||
      !Number.isSafeInteger(lineItem.total) ||
      lineItem.total <= 0
    ) {
      throw new Error('Metronome usage preview is ambiguous');
    }

    return BigInt(lineItem.total);
  });
  const amountCents = usageTotals.reduce(
    (total, lineItemTotal) => total + lineItemTotal,
    BigInt(0),
  );

  if (amountCents <= BigInt(0)) {
    throw new Error('Metronome usage preview is ambiguous');
  }

  return amountCents;
};
