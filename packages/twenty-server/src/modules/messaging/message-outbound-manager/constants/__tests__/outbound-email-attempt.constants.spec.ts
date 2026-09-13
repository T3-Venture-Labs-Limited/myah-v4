import {
  OUTBOUND_EMAIL_ATTEMPT_SAFETY_MARGIN_MS,
  OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS,
  OUTBOUND_EMAIL_UNKNOWN_AFTER_MS,
} from 'src/modules/messaging/message-outbound-manager/constants/outbound-email-attempt.constants';

describe('outbound email attempt constants', () => {
  it('exports the fixed provider receipt deadline contract', () => {
    expect(OUTBOUND_EMAIL_PROVIDER_REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(OUTBOUND_EMAIL_ATTEMPT_SAFETY_MARGIN_MS).toBe(30_000);
    expect(OUTBOUND_EMAIL_UNKNOWN_AFTER_MS).toBe(60_000);
  });
});
