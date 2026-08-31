import { Metronome } from '@metronome/sdk';

import { type ConfigVariables } from 'src/engine/core-modules/twenty-config/config-variables';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { MetronomeClientService } from '../services/metronome-client.service';

jest.mock('@metronome/sdk', () => ({ Metronome: jest.fn() }));

const input = {
  chargeProductId: 'charge-product-id',
  commitmentId: 'commitment-id',
  commitmentProductId: 'commitment-product-id',
  contractId: 'contract-id',
  customerId: 'customer-id',
  fundingActionId: 'funding-action-id',
  fundingIdentity: 'funding-identity',
  invoiceId: 'invoice-id',
  principalCents: 5_000,
  purchaseAt: '2026-08-29T10:37:42.123Z',
  uniquenessKey: 'funding-key',
};
const commit = {
  access_schedule: {
    schedule_items: [
      {
        amount: 5_000,
        ending_before: '2027-08-29T10:37:42.123Z',
        id: 'access-id',
        starting_at: '2026-08-29T10:00:00.000Z',
      },
    ],
  },
  applicable_product_ids: ['charge-product-id'],
  archived_at: undefined,
  balance: 5_000,
  contract: { id: 'contract-id' },
  custom_fields: {
    myah_funding_action_id: 'funding-action-id',
    myah_funding_identity: 'funding-identity',
  },
  id: 'commitment-id',
  invoice_schedule: {
    schedule_items: [
      {
        amount: 5_000,
        id: 'invoice-schedule-id',
        invoice_id: 'invoice-id',
        timestamp: '2026-08-29T10:00:00.000Z',
      },
    ],
  },
  ledger: [
    {
      amount: 5_000,
      segment_id: 'access-id',
      timestamp: '2026-08-29T10:00:00.000Z',
      type: 'PREPAID_COMMIT_SEGMENT_START',
    },
  ],
  priority: 100,
  product: { id: 'commitment-product-id', name: 'Managed AI credits' },
  type: 'PREPAID',
};

const createService = (sdk: object) => {
  jest.mocked(Metronome).mockImplementation(() => sdk as Metronome);
  return new MetronomeClientService({
    get: jest.fn((key: keyof ConfigVariables) => {
      if (key === 'METRONOME_ENABLED') return true;
      if (key === 'METRONOME_API_KEY') return 'metronome-api-key';
      throw new Error(`Unexpected config key: ${key}`);
    }),
  } as unknown as TwentyConfigService);
};

describe('MetronomeClientService refunds', () => {
  it('proves one active, fully unspent and unapplied commitment', async () => {
    const listBalances = jest.fn().mockResolvedValue({
      data: [commit],
      next_page: '',
    });
    const service = createService({ v1: { contracts: { listBalances } } });

    await expect(
      service.assertPaymentGatedPrepaidCommitRefundable(input),
    ).resolves.toEqual({ remainingBalanceCents: 5_000 });
    expect(listBalances).toHaveBeenCalledWith({
      customer_id: 'customer-id',
      exclude_zero_balances: false,
      id: 'commitment-id',
      include_archived: true,
      include_balance: true,
      include_contract_balances: true,
      include_ledgers: true,
      limit: 25,
    });

    listBalances.mockResolvedValue({
      data: [
        {
          ...commit,
          balance: 4_999,
          ledger: [
            ...commit.ledger,
            {
              amount: -1,
              invoice_id: 'usage-invoice-id',
              segment_id: 'access-id',
              timestamp: '2026-08-30T10:00:00.000Z',
              type: 'PREPAID_COMMIT_AUTOMATED_INVOICE_DEDUCTION',
            },
          ],
        },
      ],
      next_page: '',
    });
    await expect(
      service.assertPaymentGatedPrepaidCommitRefundable(input),
    ).rejects.toThrow('Metronome commitment is not fully refundable');
  });

  it('voids and reads back the exact Metronome payment invoice', async () => {
    const voidInvoice = jest
      .fn()
      .mockResolvedValue({ data: { id: 'invoice-id' } });
    const retrieve = jest.fn().mockResolvedValue({
      data: {
        contract_id: 'contract-id',
        credit_type: { id: 'fiat-id', name: 'USD (cents)' },
        customer_id: 'customer-id',
        external_invoice: null,
        id: 'invoice-id',
        issued_at: '2026-08-29T10:00:00.000Z',
        line_items: [
          {
            commit_id: 'commitment-id',
            credit_type: { id: 'fiat-id', name: 'USD (cents)' },
            name: 'Commit purchase',
            total: 5_000,
            type: 'commit_purchase',
          },
        ],
        status: 'VOID',
        subtotal: 5_000,
        total: 5_000,
        type: 'SCHEDULED',
      },
    });
    const service = createService({
      v1: {
        customers: { invoices: { retrieve } },
        invoices: { void: voidInvoice },
      },
    });

    await expect(
      service.voidPaymentGatedPrepaidInvoice({
        commitmentId: 'commitment-id',
        contractId: 'contract-id',
        customerId: 'customer-id',
        fiatCreditTypeId: 'fiat-id',
        invoiceId: 'invoice-id',
        principalCents: 5_000,
      }),
    ).resolves.toEqual({ invoiceId: 'invoice-id' });
    expect(voidInvoice).toHaveBeenCalledWith(
      { id: 'invoice-id' },
      { maxRetries: 0 },
    );
  });

  it('proves the exact commitment is archived with zero balance and no ledger', async () => {
    const listBalances = jest.fn().mockResolvedValue({
      data: [
        {
          ...commit,
          archived_at: '2026-08-30T12:00:00.000Z',
          balance: 0,
          ledger: null,
        },
      ],
      next_page: '',
    });
    const service = createService({ v1: { contracts: { listBalances } } });

    await expect(
      service.assertPaymentGatedPrepaidCommitArchived(input),
    ).resolves.toEqual({ archivedAt: '2026-08-30T12:00:00.000Z' });
  });
});
