import { matchExactPaidMetronomeInvoice } from '../utils/match-exact-paid-metronome-invoice.util';
import {
  type ExpectedMetronomeSubscriptionLine,
  type ExpectedPaidMetronomeInvoice,
  type MetronomeInvoicePage,
} from '../types/metronome-subscription.type';

const expectedLine: ExpectedMetronomeSubscriptionLine = {
  endingBefore: '2026-09-01T00:00:00.000Z',
  isProrated: false,
  productId: 'product-id',
  quantity: 3,
  startingAt: '2026-08-01T00:00:00.000Z',
  subscriptionId: 'subscription-id',
  total: 3_000,
  unitPrice: 1_000,
};

const expected: ExpectedPaidMetronomeInvoice = {
  contractId: 'contract-id',
  customerId: 'customer-id',
  endingBefore: '2026-09-01T00:00:00.000Z',
  lines: [expectedLine],
  startingAt: '2026-08-01T00:00:00.000Z',
  total: 3_000,
  usdRateCardProof: {
    contractId: 'contract-id',
    fiatCreditTypeId: 'usd-credit-type-id',
    fiatCreditTypeName: 'USD',
    rateCardId: 'rate-card-id',
  },
};

const exactInvoice = {
  contractId: 'contract-id',
  creditType: { id: 'usd-credit-type-id', name: 'USD' },
  customerId: 'customer-id',
  endingBefore: '2026-09-01T00:00:00.000Z',
  externalInvoice: {
    billingProvider: 'stripe',
    externalPaymentId: 'pi_123',
    externalStatus: 'PAID',
    invoiceId: 'in_123',
    invoicedTotal: 3_000,
  },
  id: 'invoice-id',
  lines: [
    {
      ...expectedLine,
      hasAppliedCommitOrCredit: false,
      type: 'subscription',
    },
  ],
  startingAt: '2026-08-01T00:00:00.000Z',
  status: 'FINALIZED',
  total: 3_000,
};

const makePage = (): MetronomeInvoicePage => ({
  hasNextPage: false,
  invoices: structuredClone([exactInvoice]),
});

const makeExpected = (): ExpectedPaidMetronomeInvoice =>
  structuredClone(expected);

const requireExternalInvoice = (page: MetronomeInvoicePage) => {
  const externalInvoice = page.invoices[0].externalInvoice;

  if (externalInvoice === null) {
    throw new Error('Expected external invoice');
  }

  return externalInvoice;
};

describe('matchExactPaidMetronomeInvoice', () => {
  it('returns Myah-owned receipt IDs for one exact paid Stripe invoice', () => {
    expect(matchExactPaidMetronomeInvoice(makePage(), makeExpected())).toEqual({
      externalInvoiceId: 'in_123',
      externalPaymentId: 'pi_123',
      invoiceId: 'invoice-id',
    });
  });

  it('treats equivalent ISO timestamps as the same instant', () => {
    const page = makePage();

    page.invoices[0].startingAt = '2026-07-31T20:00:00.000-04:00';
    page.invoices[0].endingBefore = '2026-08-31T20:00:00.000-04:00';
    page.invoices[0].lines[0].startingAt = '2026-07-31T20:00:00.000-04:00';
    page.invoices[0].lines[0].endingBefore = '2026-08-31T20:00:00.000-04:00';

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toEqual({
      externalInvoiceId: 'in_123',
      externalPaymentId: 'pi_123',
      invoiceId: 'invoice-id',
    });
  });

  it.each([
    [
      'customer',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].customerId = 'other-customer';
      },
    ],
    [
      'contract',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].contractId = 'other-contract';
      },
    ],
    [
      'period start',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].startingAt = '2026-08-02T00:00:00.000Z';
      },
    ],
    [
      'period end',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].endingBefore = '2026-09-02T00:00:00.000Z';
      },
    ],
    [
      'total',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].total = 2_999;
      },
    ],
    [
      'internal status',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].status = 'DRAFT';
      },
    ],
    [
      'external provider',
      (page: MetronomeInvoicePage) => {
        requireExternalInvoice(page).billingProvider = 'metronome';
      },
    ],
    [
      'external invoice ID',
      (page: MetronomeInvoicePage) => {
        requireExternalInvoice(page).invoiceId = ' ';
      },
    ],
    [
      'external status',
      (page: MetronomeInvoicePage) => {
        requireExternalInvoice(page).externalStatus = 'FINALIZED';
      },
    ],
    [
      'external invoiced total',
      (page: MetronomeInvoicePage) => {
        requireExternalInvoice(page).invoicedTotal = 2_999;
      },
    ],
    [
      'credit type ID',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].creditType.id = 'eur-credit-type-id';
      },
    ],
    [
      'credit type name',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].creditType.name = 'EUR';
      },
    ],
  ])('rejects an invoice with a mismatched %s', (_, mutate) => {
    const page = makePage();

    mutate(page);

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });

  it('rejects USD proof persisted for another contract', () => {
    const correlation = makeExpected();

    correlation.usdRateCardProof.contractId = 'other-contract';

    expect(matchExactPaidMetronomeInvoice(makePage(), correlation)).toBeNull();
  });

  it('rejects blank contract identity in persisted USD proof', () => {
    const correlation = makeExpected();

    correlation.contractId = '';
    correlation.usdRateCardProof.contractId = '';

    expect(matchExactPaidMetronomeInvoice(makePage(), correlation)).toBeNull();
  });

  it.each([null, ' '])(
    'rejects a paid invoice with missing or blank external payment ID: %p',
    (externalPaymentId) => {
      const page = makePage();

      requireExternalInvoice(page).externalPaymentId = externalPaymentId;

      expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
    },
  );

  it('rejects missing persisted exact USD rate-card proof', () => {
    const correlation = makeExpected();

    correlation.usdRateCardProof.fiatCreditTypeName = 'EUR';

    expect(matchExactPaidMetronomeInvoice(makePage(), correlation)).toBeNull();
  });

  it('rejects a missing expected subscription line', () => {
    const page = makePage();

    page.invoices[0].lines = [];

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });

  it('rejects an extra subscription line', () => {
    const page = makePage();

    page.invoices[0].lines.push({
      ...page.invoices[0].lines[0],
      subscriptionId: 'extra-subscription',
    });

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });

  it('rejects a different subscription line', () => {
    const page = makePage();

    page.invoices[0].lines[0].productId = 'other-product';

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });

  it('rejects an unexpected duplicate subscription line', () => {
    const page = makePage();

    page.invoices[0].lines.push(structuredClone(page.invoices[0].lines[0]));

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });

  it('matches duplicate subscription lines only when the expected multiset also duplicates them', () => {
    const page = makePage();
    const correlation = makeExpected();

    page.invoices[0].lines.push(structuredClone(page.invoices[0].lines[0]));
    correlation.lines.push(structuredClone(correlation.lines[0]));

    expect(matchExactPaidMetronomeInvoice(page, correlation)).toEqual({
      externalInvoiceId: 'in_123',
      externalPaymentId: 'pi_123',
      invoiceId: 'invoice-id',
    });
  });

  it('rejects a non-subscription line even when invoice totals match', () => {
    const page = makePage();

    page.invoices[0].lines[0].type = 'usage';

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });

  it('rejects an applied-credit subscription line even when invoice totals match', () => {
    const page = makePage();

    page.invoices[0].lines[0].hasAppliedCommitOrCredit = true;

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });

  it('rejects a paginated result rather than looking beyond the bounded first page', () => {
    const page = makePage();

    page.hasNextPage = true;

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });

  it('rejects two exact paid candidates as ambiguous', () => {
    const page = makePage();

    page.invoices.push({
      ...structuredClone(page.invoices[0]),
      id: 'invoice-2',
    });

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });

  it.each([
    [
      'invoice cents',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].total = 3_000.5;
      },
    ],
    [
      'line cents',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].lines[0].total = 3_000.5;
      },
    ],
    [
      'line quantity',
      (page: MetronomeInvoicePage) => {
        page.invoices[0].lines[0].quantity = 1.5;
      },
    ],
  ])('rejects non-integer %s', (_, mutate) => {
    const page = makePage();

    mutate(page);

    expect(matchExactPaidMetronomeInvoice(page, makeExpected())).toBeNull();
  });
});
