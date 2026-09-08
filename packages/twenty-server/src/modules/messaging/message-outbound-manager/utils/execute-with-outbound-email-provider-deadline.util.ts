import { OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS } from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';

export async function executeWithOutboundEmailProviderDeadline<T>(
  operation: (abortSignal: AbortSignal) => Promise<T>,
): Promise<T> {
  const abortController = new AbortController();
  let timeout: NodeJS.Timeout | undefined;

  const deadlinePromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(
        `Outbound email provider request exceeded ${OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS}ms`,
      );

      abortController.abort(error);
      reject(error);
    }, OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      operation(abortController.signal),
      deadlinePromise,
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
