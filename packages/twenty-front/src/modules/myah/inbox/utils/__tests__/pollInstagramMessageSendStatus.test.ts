import { pollInstagramMessageSendStatus } from '@/myah/inbox/utils/pollInstagramMessageSendStatus';

const status = (state: string, providerMessageId: string | null = null) => ({
  data: {
    instagramMessageSendStatus: {
      receiptId: 'receipt-1',
      state,
      providerCode: 'accepted',
      providerMessageId,
    },
  },
});

describe('pollInstagramMessageSendStatus', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('keeps a provider-accepted result through timeout', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValue(status('PROVIDER_ACCEPTED', 'message-1')),
    };
    const result = pollInstagramMessageSendStatus(client as never, 'receipt-1');
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({
      status: 'PROVIDER_ACCEPTED',
      providerMessageId: 'message-1',
      error: null,
    });
  });

  it('keeps an already-accepted result through a failed status read', async () => {
    const client = { query: jest.fn().mockRejectedValue(new Error('network')) };
    const result = pollInstagramMessageSendStatus(
      client as never,
      'receipt-1',
      () => true,
      true,
    );
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({
      status: 'PROVIDER_ACCEPTED',
      error: null,
    });
  });

  it('retains Unknown for a receipt that was never accepted', async () => {
    const client = { query: jest.fn().mockResolvedValue(status('PROCESSING')) };
    const result = pollInstagramMessageSendStatus(client as never, 'receipt-1');
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ status: 'UNKNOWN' });
  });

  it('returns a sent receipt with provider identity on its first read', async () => {
    const client = {
      query: jest.fn().mockResolvedValue(status('SENT', 'message-1')),
    };
    const result = pollInstagramMessageSendStatus(client as never, 'receipt-1');
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({
      status: 'SENT',
      providerMessageId: 'message-1',
    });
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
