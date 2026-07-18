import {
  computeActionContentDigest,
  computeLogicalActionKey,
} from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';

describe('action binding digest', () => {
  const base = {
    workspaceId: '00000000-0000-4000-8000-000000000001',
    actionName: 'send_instagram_reply' as const,
    actionVersion: 1 as const,
    draftId: '00000000-0000-4000-8000-000000000002',
    contentDigest: 'a'.repeat(64),
    recipientFingerprint: 'b'.repeat(64),
    sendingAccountFingerprint: 'c'.repeat(64),
    inboundMessageId: 'provider-inbound-message-id',
    inboundSenderIgsid: 'recipient-igsid',
    inboundDirection: 'INBOUND' as const,
    inboundReceivedAt: new Date('2026-07-17T11:30:00.000Z'),
    threadId: '00000000-0000-4000-8000-000000000003',
    initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000004',
    evidenceLinks: [],
  };

  it('normalizes Unicode and line endings without trimming message content', () => {
    expect(computeActionContentDigest('  Cafe\u0301\r\n  ')).toBe(
      computeActionContentDigest('  Caf\u00e9\n  '),
    );
    expect(computeActionContentDigest('  Caf\u00e9\n  ')).not.toBe(
      computeActionContentDigest('Caf\u00e9'),
    );
  });

  it.each([
    ['workspaceId', '00000000-0000-4000-8000-000000000099'],
    ['actionName', 'send_instagram_reply_v2'],
    ['actionVersion', 2],
    ['draftId', '00000000-0000-4000-8000-000000000099'],
    ['contentDigest', 'd'.repeat(64)],
    ['recipientFingerprint', 'e'.repeat(64)],
    ['sendingAccountFingerprint', 'f'.repeat(64)],
    ['inboundMessageId', 'other-provider-inbound-message-id'],
    ['inboundSenderIgsid', 'other-recipient-igsid'],
    ['inboundDirection', 'OUTBOUND'],
    ['inboundReceivedAt', new Date('2026-07-17T11:31:00.000Z')],
  ])('changes the logical key when %s changes', (field, value) => {
    expect(
      computeLogicalActionKey({ ...base, [field]: value } as typeof base),
    ).not.toBe(computeLogicalActionKey(base));
  });

  it('excludes approval, actor, and thread identity from the logical key', () => {
    expect(
      computeLogicalActionKey({
        ...base,
        threadId: '00000000-0000-4000-8000-000000000099',
        initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000098',
      }),
    ).toBe(computeLogicalActionKey(base));
  });
});
