import { type MessageOutboundErrorOutcome } from 'src/modules/messaging/message-outbound-manager/types/message-outbound-error-outcome.type';

const REJECTED_OUTCOME = {
  kind: 'rejected',
  code: 'provider_rejected',
} as const satisfies MessageOutboundErrorOutcome;

const UNKNOWN_OUTCOME = {
  kind: 'unknown',
  code: 'unknown',
} as const satisfies MessageOutboundErrorOutcome;

export const classifyMessageOutboundError = (
  error: unknown,
): MessageOutboundErrorOutcome => {
  if (typeof error !== 'object' || error === null) {
    return UNKNOWN_OUTCOME;
  }

  const responseCode = 'responseCode' in error ? error.responseCode : undefined;
  const isRejected =
    typeof responseCode === 'number' &&
    responseCode >= 400 &&
    responseCode <= 599;

  return isRejected ? REJECTED_OUTCOME : UNKNOWN_OUTCOME;
};
