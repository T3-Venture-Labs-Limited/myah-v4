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
    actionContextFingerprint: null,
    inboundMessageId: 'provider-inbound-message-id',
    inboundSenderIgsid: 'recipient-igsid',
    inboundDirection: 'INBOUND' as const,
    inboundReceivedAt: new Date('2026-07-17T11:30:00.000Z'),
    threadId: '00000000-0000-4000-8000-000000000003',
    initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000004',
    evidenceLinks: [],
  };
  const inboxReplyBinding = {
    workspaceId: base.workspaceId,
    actionName: 'send_inbox_reply' as const,
    actionVersion: 1 as const,
    draftId: '20202020-0b5c-4178-bed7-d371f6411eaf',
    contentDigest: 'a'.repeat(64),
    recipientFingerprint: 'b'.repeat(64),
    sendingAccountFingerprint: 'c'.repeat(64),
    actionContextFingerprint: 'd'.repeat(64),
    threadId: '20202020-0b5c-4178-bed7-d371f6411eaf',
    initiatorUserWorkspaceId: base.initiatorUserWorkspaceId,
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

  it('rejects an unsupported action kind', () => {
    expect(() =>
      computeLogicalActionKey({
        ...base,
        actionName: 'unsupported_action',
      } as never),
    ).toThrow();
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

  it('binds outreach execution to its email-thread context', () => {
    const outreach = {
      workspaceId: base.workspaceId,
      actionName: 'send_outreach_email' as const,
      actionVersion: 1 as const,
      draftId: base.draftId,
      contentDigest: base.contentDigest,
      recipientFingerprint: base.recipientFingerprint,
      sendingAccountFingerprint: base.sendingAccountFingerprint,
      actionContextFingerprint: 'd'.repeat(64),
      threadId: base.threadId,
      initiatorUserWorkspaceId: base.initiatorUserWorkspaceId,
      evidenceLinks: [],
    };

    expect(computeLogicalActionKey(outreach)).not.toBe(
      computeLogicalActionKey(base),
    );
    expect(
      computeLogicalActionKey({
        ...outreach,
        actionContextFingerprint: 'e'.repeat(64),
      }),
    ).not.toBe(computeLogicalActionKey(outreach));
    expect(
      computeLogicalActionKey({
        ...outreach,
        threadId: '00000000-0000-4000-8000-000000000099',
      }),
    ).toBe(computeLogicalActionKey(outreach));
  });

  it('keeps identical Inbox reply sends on one logical key', () => {
    expect(computeLogicalActionKey(inboxReplyBinding)).toBe(
      computeLogicalActionKey({ ...inboxReplyBinding }),
    );
  });

  it('changes the Inbox reply key when the saved revision context changes', () => {
    expect(computeLogicalActionKey(inboxReplyBinding)).not.toBe(
      computeLogicalActionKey({
        ...inboxReplyBinding,
        actionContextFingerprint: 'e'.repeat(64),
      }),
    );
  });
});
