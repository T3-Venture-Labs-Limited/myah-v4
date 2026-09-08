import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';
import { executeWithOutboundEmailProviderDeadline } from 'src/modules/messaging/message-outbound-manager/utils/execute-with-outbound-email-provider-deadline.util';

describe('executeWithOutboundEmailProviderDeadline', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aborts and rejects a stalled operation at the fixed deadline', async () => {
    let signal: AbortSignal | undefined;

    const resultPromise = executeWithOutboundEmailProviderDeadline(
      (abortSignal) => {
        signal = abortSignal;

        return new Promise(() => undefined);
      },
    );

    const rejection = expect(resultPromise).rejects.toThrow(
      `Outbound email provider request exceeded ${OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS}ms`,
    );

    await jest.advanceTimersByTimeAsync(
      OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
    );

    await rejection;
    expect(signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears its timer when the operation completes', async () => {
    await expect(
      executeWithOutboundEmailProviderDeadline(async () => 'done'),
    ).resolves.toBe('done');

    expect(jest.getTimerCount()).toBe(0);
  });
});
