import { resolveMyahInboxReplyRecipient } from 'src/engine/core-modules/action-approval/utils/resolve-myah-inbox-reply-recipient.util';

describe('resolveMyahInboxReplyRecipient', () => {
  it('uses the one external FROM participant for an incoming message', () => {
    expect(
      resolveMyahInboxReplyRecipient({
        direction: 'INCOMING',
        participants: [
          { role: 'FROM', handle: 'creator@example.com', displayName: 'Creator' },
          { role: 'TO', handle: 'team@brand.com', displayName: 'Brand' },
        ],
        senderHandles: new Set(['team@brand.com']),
      }),
    ).toEqual({ email: 'creator@example.com', label: 'Creator' });
  });

  it('uses the one external TO participant for an outgoing parent', () => {
    expect(
      resolveMyahInboxReplyRecipient({
        direction: 'OUTGOING',
        participants: [
          { role: 'FROM', handle: 'team@brand.com', displayName: 'Brand' },
          { role: 'TO', handle: 'creator@example.com', displayName: 'Creator' },
        ],
        senderHandles: new Set(['team@brand.com', 'brand-alias@brand.com']),
      }),
    ).toEqual({ email: 'creator@example.com', label: 'Creator' });
  });

  it('excludes every sender alias before resolving an outgoing recipient', () => {
    expect(
      resolveMyahInboxReplyRecipient({
        direction: 'OUTGOING',
        participants: [
          { role: 'TO', handle: 'brand-alias@brand.com', displayName: 'Brand' },
          { role: 'TO', handle: 'creator@example.com', displayName: 'Creator' },
        ],
        senderHandles: new Set(['team@brand.com', 'brand-alias@brand.com']),
      }),
    ).toEqual({ email: 'creator@example.com', label: 'Creator' });
  });

  it('refuses invalid external email addresses', () => {
    expect(() =>
      resolveMyahInboxReplyRecipient({
        direction: 'INCOMING',
        participants: [
          { role: 'FROM', handle: 'not-an-email', displayName: 'Creator' },
          { role: 'TO', handle: 'team@brand.com', displayName: 'Brand' },
        ],
        senderHandles: new Set(['team@brand.com']),
      }),
    ).toThrow('RECIPIENT_UNAVAILABLE');
  });

  it('refuses multiple external TO recipients for an outgoing parent', () => {
    expect(() =>
      resolveMyahInboxReplyRecipient({
        direction: 'OUTGOING',
        participants: [
          { role: 'FROM', handle: 'team@brand.com', displayName: 'Brand' },
          { role: 'TO', handle: 'one@example.com', displayName: 'One' },
          { role: 'TO', handle: 'two@example.com', displayName: 'Two' },
        ],
        senderHandles: new Set(['team@brand.com']),
      }),
    ).toThrow('RECIPIENT_UNAVAILABLE');
  });
});
