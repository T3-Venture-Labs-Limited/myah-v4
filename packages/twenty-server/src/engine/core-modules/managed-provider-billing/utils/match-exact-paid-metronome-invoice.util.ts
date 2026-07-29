import {
  type ExpectedMetronomeSubscriptionLine,
  type ExpectedPaidMetronomeInvoice,
  type MetronomeInvoice,
  type MetronomeInvoiceLine,
  type MetronomeInvoicePage,
  type PaidMetronomeInvoiceReceipt,
} from '../types/metronome-subscription.type';

const toInstant = (value: string | null): number | null => {
  if (value === null) return null;

  const instant = Date.parse(value);

  return Number.isFinite(instant) ? instant : null;
};

const isSafeInteger = (value: number | null): value is number =>
  value !== null && Number.isSafeInteger(value);

const expectedLineKey = (
  line: ExpectedMetronomeSubscriptionLine,
): string | null => {
  const startingAt = toInstant(line.startingAt);
  const endingBefore = toInstant(line.endingBefore);

  if (
    startingAt === null ||
    endingBefore === null ||
    Number.isSafeInteger(line.quantity) === false ||
    line.quantity < 0 ||
    Number.isSafeInteger(line.total) === false ||
    Number.isSafeInteger(line.unitPrice) === false ||
    line.subscriptionId.trim() === '' ||
    line.productId.trim() === ''
  ) {
    return null;
  }

  return JSON.stringify([
    line.subscriptionId,
    line.productId,
    line.quantity,
    line.total,
    line.unitPrice,
    startingAt,
    endingBefore,
    line.isProrated,
  ]);
};

const invoiceLineKey = (line: MetronomeInvoiceLine): string | null => {
  const startingAt = toInstant(line.startingAt);
  const endingBefore = toInstant(line.endingBefore);

  if (
    line.type !== 'subscription' ||
    line.hasAppliedCommitOrCredit ||
    line.subscriptionId === null ||
    line.subscriptionId.trim() === '' ||
    line.productId === null ||
    line.productId.trim() === '' ||
    isSafeInteger(line.quantity) === false ||
    line.quantity < 0 ||
    Number.isSafeInteger(line.total) === false ||
    isSafeInteger(line.unitPrice) === false ||
    startingAt === null ||
    endingBefore === null ||
    line.isProrated === null
  ) {
    return null;
  }

  return JSON.stringify([
    line.subscriptionId,
    line.productId,
    line.quantity,
    line.total,
    line.unitPrice,
    startingAt,
    endingBefore,
    line.isProrated,
  ]);
};

const hasExactLineMultiset = (
  invoiceLines: MetronomeInvoiceLine[],
  expectedLines: ExpectedMetronomeSubscriptionLine[],
): boolean => {
  if (invoiceLines.length !== expectedLines.length) return false;

  const counts = new Map<string, number>();

  for (const line of expectedLines) {
    const key = expectedLineKey(line);

    if (key === null) return false;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const line of invoiceLines) {
    const key = invoiceLineKey(line);

    if (key === null) return false;
    const count = counts.get(key);

    if (count === undefined || count === 0) return false;
    if (count === 1) counts.delete(key);
    else counts.set(key, count - 1);
  }

  return counts.size === 0;
};

const isExactInvoice = (
  invoice: MetronomeInvoice,
  expected: ExpectedPaidMetronomeInvoice,
): boolean => {
  const expectedStart = toInstant(expected.startingAt);
  const expectedEnd = toInstant(expected.endingBefore);
  const invoiceStart = toInstant(invoice.startingAt);
  const invoiceEnd = toInstant(invoice.endingBefore);
  const externalInvoice = invoice.externalInvoice;

  return (
    expectedStart !== null &&
    expectedEnd !== null &&
    invoiceStart === expectedStart &&
    invoiceEnd === expectedEnd &&
    invoice.customerId === expected.customerId &&
    invoice.contractId === expected.contractId &&
    Number.isSafeInteger(expected.total) &&
    Number.isSafeInteger(invoice.total) &&
    invoice.total === expected.total &&
    invoice.status === 'FINALIZED' &&
    externalInvoice !== null &&
    externalInvoice.billingProvider === 'stripe' &&
    externalInvoice.invoiceId !== null &&
    externalInvoice.invoiceId.trim() !== '' &&
    externalInvoice.externalPaymentId !== null &&
    externalInvoice.externalPaymentId.trim() !== '' &&
    externalInvoice.externalStatus === 'PAID' &&
    isSafeInteger(externalInvoice.invoicedTotal) &&
    externalInvoice.invoicedTotal === expected.total &&
    hasExactLineMultiset(invoice.lines, expected.lines)
  );
};

export const matchExactPaidMetronomeInvoice = (
  page: MetronomeInvoicePage,
  expected: ExpectedPaidMetronomeInvoice,
): PaidMetronomeInvoiceReceipt | null => {
  if (
    page.hasNextPage ||
    expected.usdRateCardProof.contractId.trim() === '' ||
    expected.usdRateCardProof.contractId !== expected.contractId ||
    expected.usdRateCardProof.rateCardId.trim() === '' ||
    expected.usdRateCardProof.fiatCreditTypeId.trim() === '' ||
    expected.usdRateCardProof.fiatCreditTypeName !== 'USD'
  ) {
    return null;
  }

  const matches = page.invoices.filter((invoice) =>
    isExactInvoice(invoice, expected),
  );

  if (matches.length !== 1) return null;

  const invoice = matches[0];
  const externalInvoiceId = invoice.externalInvoice?.invoiceId;
  const externalPaymentId = invoice.externalInvoice?.externalPaymentId;

  if (
    externalInvoiceId === undefined ||
    externalInvoiceId === null ||
    externalPaymentId === undefined ||
    externalPaymentId === null
  ) {
    return null;
  }

  return {
    externalInvoiceId,
    externalPaymentId,
    invoiceId: invoice.id,
  };
};
