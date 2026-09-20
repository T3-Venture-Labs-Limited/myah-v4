import { createV3RecoveryFixture } from './instagram-message-v3-recovery.fixture';
import { buildLegacyInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';

type ProjectionWriter = {
  project: (input: Record<string, unknown>) => Promise<void>;
};

type ProjectionWriterConstructor = new (
  ...dependencies: never[]
) => ProjectionWriter;

type ProjectionWriterModule = {
  InstagramMessageReceiptProjectionService: ProjectionWriterConstructor;
};

const workspaceId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const authority = buildLegacyInstagramMessageActionAuthority({
  workspaceId,
  initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000003',
  threadId: null,
  interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
  interactionContextId: draftId,
  draft: {
    id: draftId,
    revision: 2,
    body: 'Hello creator',
    kind: 'REPLY',
    creatorRecordId: '00000000-0000-4000-8000-000000000004',
    recipientUsername: 'creator.name',
    recipientSourceValues: [
      { field: 'instagramUsername', value: '@Creator.Name' },
    ],
    conversationRecordId: '00000000-0000-4000-8000-000000000008',
    providerConversationId: 'provider-chat',
    recipientProviderId: 'creator-provider-id',
  },
  account: {
    bindingId: '00000000-0000-4000-8000-000000000005',
    workspaceInstagramAccountRecordId: '00000000-0000-4000-8000-000000000006',
    unipileAccountId: 'provider-account',
    instagramUserId: 'brand-provider-user',
  },
  evidenceLinks: [],
});
const projectionInput = {
  ...authority.expectedActionBinding,
  receiptId: '00000000-0000-4000-8000-000000000007',
  providerMessageId: null,
  providerExternalMessageId: 'provider-message',
  providerThreadExternalId: 'provider-chat',
};

const loadWriter = (): ProjectionWriterConstructor | undefined => {
  try {
    return (
      require('../instagram-message-receipt-projection.service') as ProjectionWriterModule
    ).InstagramMessageReceiptProjectionService;
  } catch {
    return undefined;
  }
};

const buildHarness = () => {
  const accountBinding = {
    id: authority.canonicalGraph.account.bindingId,
    workspaceId,
    workspaceInstagramAccountRecordId:
      authority.canonicalGraph.account.workspaceInstagramAccountRecordId,
    unipileAccountId: authority.canonicalGraph.account.unipileAccountId,
    instagramUserId: authority.canonicalGraph.account.instagramUserId,
    status: 'ACTIVE',
    deactivatedAt: null,
  };
  const authorityReader = {
    rebuildForReconciliation: jest.fn().mockResolvedValue(authority),
  };
  const bindingRepository = {
    findOne: jest.fn().mockResolvedValue(accountBinding),
  };
  const chat = {
    chatId: 'provider-chat',
    accountId: 'provider-account',
    accountType: 'INSTAGRAM',
    type: 'ONE_TO_ONE',
    attendeeProviderId: 'creator-provider-id',
    attendeeName: 'Creator',
    timestamp: new Date('2026-09-05T12:00:00.000Z'),
  };
  const message = {
    messageId: 'provider-message',
    accountId: 'provider-account',
    chatId: 'provider-chat',
    senderId: 'brand-provider-user',
    text: 'Hello creator',
    timestamp: new Date('2026-09-05T12:00:01.000Z'),
    seen: false,
    delivered: true,
    hidden: false,
    deleted: false,
    isEvent: false,
    hasAttachments: false,
    attachmentCount: 0,
  };
  const client = {
    getChat: jest.fn().mockResolvedValue(chat),
    getMessage: jest.fn().mockResolvedValue(message),
  };
  const projection = {
    upsertVerifiedChat: jest
      .fn()
      .mockResolvedValue({ conversationRecordId: 'conversation-record' }),
    upsertVerifiedMessage: jest
      .fn()
      .mockResolvedValue({ messageRecordId: 'message-record' }),
  };
  const draftService = { markSent: jest.fn().mockResolvedValue(undefined) };
  const Writer = loadWriter();

  expect(Writer).toBeDefined();

  return {
    authorityReader,
    bindingRepository,
    chat,
    client,
    message,
    draftService,
    projection,
    writer: new Writer!(
      authorityReader as never,
      bindingRepository as never,
      client as never,
      projection as never,
      draftService as never,
    ),
  };
};

describe('InstagramMessageReceiptProjectionService', () => {
  it('rebuilds authority, verifies the accepted bound chat and message, then projects both idempotently', async () => {
    const harness = buildHarness();

    await expect(
      harness.writer.project(projectionInput),
    ).resolves.toBeUndefined();
    expect(harness.client.getChat).toHaveBeenCalledWith({
      accountId: 'provider-account',
      chatId: 'provider-chat',
      expectedAttendeeId: 'creator-provider-id',
    });
    expect(harness.client.getMessage).toHaveBeenCalledWith({
      accountId: 'provider-account',
      chatId: 'provider-chat',
      messageId: 'provider-message',
    });
    expect(harness.projection.upsertVerifiedChat).toHaveBeenCalledWith(
      expect.objectContaining({ chat: harness.chat }),
    );
    expect(harness.projection.upsertVerifiedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationRecordId: 'conversation-record',
        message: harness.message,
        triageMode: 'LIVE',
        sourceGenerationId: `action-receipt:${projectionInput.receiptId}`,
      }),
    );
    expect(harness.draftService.markSent).toHaveBeenCalledWith({
      workspaceId,
      draftId,
      contentDigest: authority.expectedActionBinding.contentDigest,
    });
    expect(harness.client.getMessage.mock.invocationCallOrder[0]).toBeLessThan(
      harness.projection.upsertVerifiedMessage.mock.invocationCallOrder[0],
    );
  });

  it('accepts validated provider self-sender evidence when the provider sender ID differs from the account ID', async () => {
    const harness = buildHarness();
    harness.client.getMessage.mockResolvedValue({
      ...harness.message,
      senderId: 'provider-specific-self-sender',
      isSender: 1,
    });

    await expect(
      harness.writer.project(projectionInput),
    ).resolves.toBeUndefined();
    expect(harness.projection.upsertVerifiedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({ isSender: 1 }),
      }),
    );
    expect(harness.draftService.markSent).toHaveBeenCalledTimes(1);
  });

  it('fails closed before projection when the bound provider message content does not match approval', async () => {
    const harness = buildHarness();
    harness.client.getMessage.mockResolvedValue({
      ...harness.message,
      text: 'Different provider text',
    });

    await expect(harness.writer.project(projectionInput)).rejects.toThrow(
      'Accepted Instagram message does not match the approved content',
    );
    expect(harness.projection.upsertVerifiedChat).not.toHaveBeenCalled();
    expect(harness.projection.upsertVerifiedMessage).not.toHaveBeenCalled();
  });
});

describe('InstagramMessageReceiptProjectionService first-contact safety', () => {
  it.each(['creator.name', '17841400000000000', 'creator-provider-id'])(
    'rejects apparently matching historical START identity %s before reconstruction or provider reads',
    async (identity) => {
      const harness = buildHarness();
      const legacyAuthority = buildLegacyInstagramMessageActionAuthority({
        ...authority.expectedActionBinding,
        ...authority.canonicalGraph,
        evidenceLinks: [...authority.expectedActionBinding.evidenceLinks],
        draft: {
          ...authority.canonicalGraph.draft,
          kind: 'START_CHAT',
          conversationRecordId: null,
          providerConversationId: null,
          recipientUsername: identity,
          recipientProviderId: identity,
          recipientSourceValues: [
            { field: 'instagramUsername', value: identity },
          ],
        },
      });
      harness.authorityReader.rebuildForReconciliation.mockResolvedValue(
        legacyAuthority,
      );
      harness.client.getChat.mockResolvedValue({
        ...harness.chat,
        attendeeProviderId: identity,
      });
      const input = {
        ...projectionInput,
        ...legacyAuthority.expectedActionBinding,
      };
      const before = structuredClone(input);
      await expect(harness.writer.project(input)).rejects.toThrow(
        'Instagram first-contact projection is unavailable',
      );
      expect(input).toEqual(before);
      expect(
        harness.authorityReader.rebuildForReconciliation,
      ).not.toHaveBeenCalled();
      expect(harness.bindingRepository.findOne).not.toHaveBeenCalled();
      expect(harness.client.getChat).not.toHaveBeenCalled();
      expect(harness.client.getMessage).not.toHaveBeenCalled();
      expect(harness.projection.upsertVerifiedChat).not.toHaveBeenCalled();
      expect(harness.projection.upsertVerifiedMessage).not.toHaveBeenCalled();
      expect(harness.draftService.markSent).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      override: { actionName: 'send_inbox_reply' },
      error: 'An Instagram message v2 projection is required',
    },
    {
      override: { providerExternalMessageId: null },
      error: 'Accepted Instagram provider identifiers are unavailable',
    },
    {
      override: { providerThreadExternalId: null },
      error: 'Accepted Instagram provider identifiers are unavailable',
    },
  ])(
    'retains existing validation before the START guard: $error',
    async ({ override, error }) => {
      const harness = buildHarness();
      await expect(
        harness.writer.project({
          ...projectionInput,
          actionKind: 'START_CHAT',
          ...override,
        }),
      ).rejects.toThrow(error);
      expect(
        harness.authorityReader.rebuildForReconciliation,
      ).not.toHaveBeenCalled();
      expect(harness.client.getChat).not.toHaveBeenCalled();
      expect(harness.draftService.markSent).not.toHaveBeenCalled();
    },
  );
});

describe('InstagramMessageReceiptProjectionService immutable v3 recovery', () => {
  it('uses the explicit scope argument rather than duplicating workspaceId in the account-binding query', async () => {
    const h = createV3RecoveryFixture();
    (h.accountRepository.findOne as jest.Mock).mockImplementation(
      async (
        scopedWorkspaceId?: string,
        options?: { where: Record<string, unknown> },
      ) => {
        if (!options) return h.account;
        if (scopedWorkspaceId !== h.workspaceId)
          throw new Error('Fixture workspace scope is unavailable');
        if ('workspaceId' in options.where)
          throw new Error('WorkspaceScopedRepository duplicate scope');

        return h.account;
      },
    );

    await expect(h.projector.projectReceipt(h.receipt.id)).resolves.toEqual({
      projected: true,
    });
  });

  it.each(['START_CHAT', 'REPLY'] as const)(
    'projects %s from stored identity after a changed handle, then replays without duplicate rows or writes',
    async (kind) => {
      const h = createV3RecoveryFixture(kind);
      const before = structuredClone(h.binding);
      await h.projector.projectReceipt(h.receipt.id);
      expect(h.receipt.state).toBe('SENT');
      expect(h.rows.myahSocialConversation).toHaveLength(1);
      expect(h.rows.myahSocialConversation[0].creatorId).toBe(h.creatorId);
      expect(h.rows.myahSocialMessage).toHaveLength(1);
      h.receipt.state = 'PROVIDER_ACCEPTED' as typeof h.receipt.state;
      await h.projector.projectReceipt(h.receipt.id);
      expect(h.rows.myahSocialConversation).toHaveLength(1);
      expect(h.rows.myahSocialMessage).toHaveLength(1);
      expect(h.binding).toEqual(before);
      expect(
        h.fetch.mock.calls.every(
          ([url, init]) => init.method === 'GET' && !url.includes('/users'),
        ),
      ).toBe(true);
    },
  );

  it('retains durable acceptance on missing draft marking failure and replays projection without resend', async () => {
    const h = createV3RecoveryFixture();
    h.rows.myahInstagramReplyDraft = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(h.projector.projectReceipt(h.receipt.id)).rejects.toThrow(
        'Instagram message draft content changed',
      );
      expect(h.receipt.state).toBe('PROVIDER_ACCEPTED');
      expect(h.rows.myahSocialMessage).toHaveLength(1);
    }
    expect(h.fetch.mock.calls.every(([, init]) => init.method === 'GET')).toBe(
      true,
    );
  });

  it.each(['creator', 'account', 'binding'])(
    'retains accepted state for missing/deactivated %s',
    async (missing) => {
      const h = createV3RecoveryFixture();
      if (missing === 'creator') h.rows.creator = [];
      if (missing === 'account') h.rows.myahInstagramAccount = [];
      if (missing === 'binding') h.account.status = 'INACTIVE';
      await expect(h.projector.projectReceipt(h.receipt.id)).rejects.toThrow();
      expect(h.receipt.state).toBe('PROVIDER_ACCEPTED');
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.rows.myahSocialMessage).toHaveLength(0);
    },
  );

  it.each([
    ['account', { account_id: 'other-account' }],
    ['chat', { chat_id: 'other-chat' }],
    ['message', { id: 'other-message' }],
    ['body', { text: 'mutated body' }],
    ['direction', { sender_id: 'messaging-v3' }],
    ['timestamp', { timestamp: null }],
    ['hidden', { hidden: true }],
    ['deleted', { deleted: true }],
    ['event', { is_event: true }],
  ])(
    'fails closed before any projection for wrong %s',
    async (_name, change) => {
      const h = createV3RecoveryFixture();
      Object.assign(h.message, change);
      await expect(h.projector.projectReceipt(h.receipt.id)).rejects.toThrow();
      expect(h.receipt.state).toBe('PROVIDER_ACCEPTED');
      expect(h.rows.myahSocialConversation).toHaveLength(0);
    },
  );

  it.each(['profile-v3', 'other-messaging-id'])(
    'rejects attendee %s rather than confusing namespaces',
    async (attendee) => {
      const h = createV3RecoveryFixture();
      h.chat.attendee_provider_id = attendee;
      await expect(h.projector.projectReceipt(h.receipt.id)).rejects.toThrow();
      expect(h.rows.myahSocialMessage).toHaveLength(0);
    },
  );
});

it.each(['START_CHAT', 'REPLY'] as const)(
  'does not restore a deleted local %s destination or mark SENT',
  async (kind) => {
    const h = createV3RecoveryFixture(kind);
    h.rows.myahSocialConversation = [
      {
        id:
          h.binding.instagramMessageSnapshot.conversationRecordId ??
          'deleted-start-chat',
        creatorId: h.creatorId,
        instagramAccountId: h.account.workspaceInstagramAccountRecordId,
        providerConversationId: h.chat.id,
        deletedAt: new Date(),
      },
    ];
    const before = structuredClone(h.rows);
    await expect(h.projector.projectReceipt(h.receipt.id)).rejects.toThrow(
      'Instagram conversation is deleted',
    );
    expect(h.rows).toEqual(before);
    expect(h.receipt.state).toBe('PROVIDER_ACCEPTED');
    expect(
      h.query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT)/.test(sql)),
    ).toBe(false);
  },
);

it('does not create a replacement for a missing bound REPLY conversation', async () => {
  const h = createV3RecoveryFixture('REPLY');
  h.rows.myahSocialConversation = [];
  await expect(h.projector.projectReceipt(h.receipt.id)).rejects.toThrow(
    'Instagram conversation does not match approval',
  );
  expect(h.rows.myahSocialConversation).toHaveLength(0);
  expect(h.receipt.state).toBe('PROVIDER_ACCEPTED');
});

it.each([null, 'approved', 'wrong'])(
  'handles an existing active START conversation owner %s without reassignment',
  async (owner) => {
    const h = createV3RecoveryFixture();
    h.rows.myahSocialConversation = [
      {
        id: 'existing-start',
        creatorId: owner === 'approved' ? h.creatorId : owner,
        instagramAccountId: h.account.workspaceInstagramAccountRecordId,
        providerConversationId: h.chat.id,
        deletedAt: null,
      },
    ];
    if (owner === 'wrong') {
      await expect(h.projector.projectReceipt(h.receipt.id)).rejects.toThrow(
        'Instagram conversation Creator does not match',
      );
      expect(h.rows.myahSocialMessage).toHaveLength(0);
      expect(h.rows.myahSocialConversation[0].creatorId).toBe('wrong');
      expect(
        h.query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT)/.test(sql)),
      ).toBe(false);
    } else {
      await h.projector.projectReceipt(h.receipt.id);
      expect(h.rows.myahSocialConversation).toHaveLength(1);
      expect(h.rows.myahSocialConversation[0].creatorId).toBe(h.creatorId);
      expect(h.rows.myahSocialMessage).toHaveLength(1);
    }
  },
);

it('does not report confirmed projection when the v3 receipt SENT transition did not persist', async () => {
  const h = createV3RecoveryFixture();
  h.receiptRepository.update.mockImplementation(async () => ({ affected: 0 }));
  await expect(h.projector.projectReceipt(h.receipt.id)).resolves.toEqual({
    projected: false,
  });
  expect(h.receipt.state).toBe('PROVIDER_ACCEPTED');
});

it.each(['workspace', 'binding'])(
  'rejects a mismatched immutable receipt %s association before reads',
  async (mismatch) => {
    const h = createV3RecoveryFixture();
    if (mismatch === 'workspace') h.binding.workspaceId = 'other-workspace';
    else h.receipt.actionApprovalBindingId = 'other-binding';
    await expect(h.projector.projectReceipt(h.receipt.id)).rejects.toThrow(
      'Instagram receipt binding is unavailable',
    );
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.query).not.toHaveBeenCalled();
  },
);
