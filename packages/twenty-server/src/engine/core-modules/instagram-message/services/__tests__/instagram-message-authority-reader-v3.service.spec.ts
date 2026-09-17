import { InstagramMessageProposalReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-proposal-reader.service';
import { withWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { withWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { createRequestApprovalTool } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import { buildInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { type InstagramMessageAuthorityDraftRow } from 'src/engine/core-modules/action-approval/services/instagram-message-local-authority-reader.service';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { InstagramMessageSendService } from '../instagram-message-send.service';
import { InstagramMessagePermissionService } from '../instagram-message-permission.service';
import { PermissionFlagType } from 'twenty-shared/constants';
import { InstagramMessageAuthorityReaderService } from '../instagram-message-authority-reader.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const creatorId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000004';
const conversationId = '00000000-0000-4000-8000-000000000005';
const actorId = '00000000-0000-4000-8000-000000000006';

const buildHarness = () => {
  const draft: InstagramMessageAuthorityDraftRow = {
    id: draftId,
    body: 'Exact approved body',
    revision: 1,
    kind: 'REPLY',
    creatorId,
    recipientUsername: 'creator.name',
    recipientProviderId: 'messaging-009',
    conversationId,
    sentAt: null,
    creatorInstagramUsername: 'creator.name',
    creatorInstagramUrl: null,
    creatorInstagramLinkPrimaryLinkUrl: null,
    providerConversationId: 'provider-chat',
    conversationRecipientIgsid: 'messaging-009',
    conversationRecipientUsername: 'creator.name',
    conversationProvider: 'UNIPILE',
    conversationLifecycle: 'ACTIVE',
    conversationInstagramAccountId: accountId,
    conversationCreatorId: creatorId,
  };
  const account = {
    id: '00000000-0000-4000-8000-000000000007',
    workspaceId,
    workspaceInstagramAccountRecordId: accountId,
    unipileAccountId: 'provider-account',
    instagramUserId: 'sender-user',
    status: 'ACTIVE',
    deactivatedAt: null,
  };
  const chat = {
    chatId: 'provider-chat',
    accountId: 'provider-account',
    type: 'ONE_TO_ONE',
    attendeeProviderId: 'messaging-009',
  };
  const client = {
    getInstagramMessagingProfile: jest.fn().mockResolvedValue({
      username: 'creator.name',
      providerId: 'profile-001',
      providerMessagingId: 'messaging-009',
    }),
    listChats: jest.fn().mockResolvedValue({ chats: [chat], nextCursor: null }),
    getChat: jest.fn().mockResolvedValue(chat),
  };
  const query = jest.fn(async (sql: string) =>
    sql.includes('"_myahInstagramReplyDraft"')
      ? [draft]
      : [
          {
            id: conversationId,
            providerConversationId: 'provider-chat',
            recipientIgsid: 'messaging-009',
          },
        ],
  );
  const orm = {
    executeInWorkspaceContext: jest.fn(async (operation) =>
      withWorkspaceContext(
        {
          userWorkspaceRoleMap: { [actorId]: 'role' },
          apiKeyRoleMap: {},
        } as never,
        operation,
      ),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
    getRepository: jest.fn(
      async (_workspaceId, name, _rolePermissionConfig) => ({
        findOne: async () =>
          ({
            myahInstagramReplyDraft: draft,
            creator: {
              id: creatorId,
              instagramUsername: draft.creatorInstagramUsername,
              instagramUrl: draft.creatorInstagramUrl,
              instagramLink: {
                primaryLinkUrl: draft.creatorInstagramLinkPrimaryLinkUrl,
              },
            },
            myahSocialConversation: {
              id: conversationId,
              creatorId: draft.conversationCreatorId,
              providerConversationId: draft.providerConversationId,
              recipientIgsid: draft.conversationRecipientIgsid,
              provider: draft.conversationProvider,
              lifecycle: draft.conversationLifecycle,
              instagramAccountId: draft.conversationInstagramAccountId,
            },
            myahInstagramAccount: {
              id: accountId,
              label: 'Sender',
              name: 'Sender',
            },
          })[name as string],
      }),
    ),
  };
  const service = new InstagramMessageAuthorityReaderService(
    { findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }) } as never,
    orm as never,
    { find: jest.fn().mockResolvedValue([account]) } as never,
    {
      find: jest.fn().mockResolvedValue(
        [
          ['2d357469-831a-4629-ad4b-47335900e883', 'account-metadata'],
          ['85762d24-541b-407f-9d6a-cdf89552c665', 'draft-metadata'],
          ['36817464-855f-42db-9fbb-f8853643f8d6', 'conversation-metadata'],
          ['5ca82f72-9778-4ae1-8a8e-9b762c4ce0de', 'creator-metadata'],
        ].map(([universalIdentifier, id]) => ({ universalIdentifier, id })),
      ),
    } as never,
    client as never,
  );
  return { service, client, draft, account, query, orm };
};

const input = {
  workspaceId,
  initiatorUserWorkspaceId: actorId,
  draftId,
  expectedRevision: 1,
};

describe('InstagramMessageAuthorityReaderService fresh v3 cutover', () => {
  it.each(['direct', 'thread'] as const)(
    'resolves complete immutable identity for a fresh %s REPLY without confusing profile and messaging IDs',
    async (producer) => {
      const h = buildHarness();
      const authority =
        producer === 'direct'
          ? await h.service.createDirectAuthority(input)
          : await h.service.createThreadReplyAuthority({
              ...input,
              threadId: '00000000-0000-4000-8000-000000000008',
            });
      expect(authority.expectedActionBinding).toMatchObject({
        actionVersion: 3,
        actionKind: 'REPLY',
        composerInputDigest: null,
        instagramMessageSnapshot: {
          publicIdentifier: 'creator.name',
          providerId: 'profile-001',
          providerMessagingId: 'messaging-009',
          attendeeProviderId: 'messaging-009',
          creatorRecordId: creatorId,
          accountBindingId: h.account.id,
          instagramAccountRecordId: accountId,
          unipileAccountId: 'provider-account',
          instagramUserId: 'sender-user',
          conversationRecordId: conversationId,
          providerChatId: 'provider-chat',
          actionKind: 'REPLY',
          recipientSourceValues: [
            { field: 'instagramUsername', value: 'creator.name' },
          ],
        },
      });
      expect(h.client.getInstagramMessagingProfile).toHaveBeenCalledWith({
        accountId: 'provider-account',
        username: 'creator.name',
      });
    },
  );

  it.each([
    {
      username: 'other.name',
      providerId: 'profile-001',
      providerMessagingId: 'messaging-009',
    },
    {
      username: 'creator.name',
      providerId: 'profile-001',
      providerMessagingId: '',
    },
    {
      username: 'creator.name',
      providerId: '',
      providerMessagingId: 'messaging-009',
    },
    {
      username: 'creator.name',
      providerId: 'profile-001',
      providerMessagingId: 'different-recipient',
    },
  ])(
    'does not mint or downgrade authority for contradictory or incomplete profile %j',
    async (profile) => {
      const h = buildHarness();
      h.client.getInstagramMessagingProfile.mockResolvedValue(profile);
      await expect(h.service.createDirectAuthority(input)).rejects.toThrow();
    },
  );

  it('rechecks profile identity after reservation rather than trusting the approved snapshot', async () => {
    const h = buildHarness();
    const authority = await h.service.createDirectAuthority(input);
    h.client.getInstagramMessagingProfile.mockResolvedValue({
      username: 'creator.name',
      providerId: 'reassigned-profile',
      providerMessagingId: 'reassigned-messaging',
    });
    await expect(
      h.service.assertReadyAfterReservation(authority),
    ).rejects.toThrow();
  });
});

// Only persistence, permission and transport boundaries are mocked: every send
// reconstructs its authority with the real reader and verifies provider fixtures.
const buildSendHarness = async (
  kind: 'START_CHAT' | 'REPLY',
  composer = true,
) => {
  const h = buildHarness();
  let authority = await h.service.createDirectAuthority(input);
  if (composer) {
    h.draft.recipientProviderId = 'profile-001';
    if (kind === 'START_CHAT') {
      h.draft.kind = 'FIRST_MESSAGE';
      h.draft.conversationId = null;
      h.draft.providerConversationId = null;
      h.client.listChats.mockResolvedValue({ chats: [], nextCursor: null });
      h.query.mockImplementation(async (sql) =>
        sql.includes('"_myahInstagramReplyDraft"') ? [h.draft] : [],
      );
    }
    const old = authority.expectedActionBinding;
    if (old.actionVersion !== 3) throw new Error('Fresh authority must be v3');
    authority = buildInstagramMessageActionAuthority({
      ...old,
      draft: {
        ...authority.canonicalGraph.draft,
        kind,
        conversationRecordId: kind === 'REPLY' ? conversationId : null,
        providerConversationId: kind === 'REPLY' ? 'provider-chat' : null,
      },
      account: authority.canonicalGraph.account,
      instagramMessageSnapshot:
        kind === 'REPLY'
          ? old.instagramMessageSnapshot
          : {
              ...old.instagramMessageSnapshot,
              actionKind: kind,
              conversationRecordId: null,
              providerChatId: null,
              attendeeProviderId: null,
            },
      composerInputDigest: 'a'.repeat(64),
      evidenceLinks: old.evidenceLinks.filter(
        ({ role }) => kind === 'REPLY' || role !== 'SOCIAL_CONVERSATION',
      ),
    });
  }
  const binding = authority.expectedActionBinding;
  let receipt: Record<string, unknown> | null = null;
  const receiptManager = {
    findOne: jest.fn(async () => structuredClone(receipt)),
    save: jest.fn(async (_entity, value) => {
      receipt = structuredClone(value);
      return value;
    }),
  };
  const durableApprovals = new ActionApprovalService(
    {
      transaction: async (
        operation: (manager: typeof receiptManager) => Promise<unknown>,
      ) => operation(receiptManager),
    } as never,
    {} as never,
  );
  const approvals = {
    getApprovedBinding: jest.fn(async () => binding),
    createApprovedInstagramMessageBinding: jest.fn(async () => ({
      id: 'approval-id',
    })),
    findExecutionReceiptForBinding: jest.fn(async () => receipt),
    reserveExecutionForBinding: jest.fn(async () => {
      receipt = {
        id: 'receipt-id',
        workspaceId,
        state: ActionExecutionReceiptState.PROCESSING,
        providerCode: null,
        redactedOutcome: null,
        updatedAt: new Date(),
      };
      return { created: true, receipt };
    }),
    recordProviderAccepted: jest.fn(
      durableApprovals.recordProviderAccepted.bind(durableApprovals),
    ),
    recordProviderTerminalState: jest.fn(
      durableApprovals.recordProviderTerminalState.bind(durableApprovals),
    ),
  };
  const events: string[] = [];
  const budget = {
    reserve: jest.fn(async () => ({
      status: 'RESERVED',
      reservationId: 'reservation-id',
    })),
    markProviderAttempted: jest.fn(async () => {
      events.push('marker');
    }),
    releasePreDispatch: jest.fn(),
    releaseStartTarget: jest.fn(),
    releaseStartTargetForReceipt: jest.fn(),
  };
  const request = jest.fn(async (_input, options) => {
    events.push('beforeDispatch');
    await options.beforeDispatch();
    events.push('request');
    return {
      kind: 'ACCEPTED',
      value: {
        messageId: 'accepted-message',
        chatId: kind === 'START_CHAT' ? 'new-chat' : 'provider-chat',
      },
    };
  });
  const client = {
    startChat: kind === 'START_CHAT' ? request : jest.fn(),
    sendMessage: kind === 'REPLY' ? request : jest.fn(),
  };
  const permissions = { first: true, reply: true };
  const permission = new InstagramMessagePermissionService({
    hasToolPermission: async (
      _role: unknown,
      _workspace: string,
      flag: PermissionFlagType,
    ) =>
      flag === PermissionFlagType.SEND_INSTAGRAM_FIRST_MESSAGE_TOOL
        ? permissions.first
        : permissions.reply,
  } as never);
  const projector = {
    projectReceiptWithWriter: jest.fn(() => {
      throw new Error('fixture projection unavailable');
    }),
  };
  const service = new InstagramMessageSendService(
    approvals as never,
    h.service,
    {
      withLock: async (_scope: unknown, operation: () => Promise<unknown>) =>
        operation(),
    } as never,
    budget as never,
    client as never,
    projector as never,
    {} as never,
    permission,
    {
      assertCanExecuteDraft: async () => ({
        instagramAccountRecordId: accountId,
      }),
    } as never,
  );
  const execute = {
    workspaceId,
    initiatorUserWorkspaceId: actorId,
    approvalBindingId: 'approval-id',
    threadId: null,
    interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT' as const,
    interactionContextId: draftId,
    rolePermissionConfig: { unionOf: ['role'] },
  };
  return {
    ...h,
    service,
    reader: h.service,
    binding,
    approvals,
    receiptManager,
    budget,
    client,
    readClient: h.client,
    request,
    permissions,
    projector,
    events,
    execute,
    receipt: () => receipt,
  };
};

describe('InstagramMessageSendService validated v3 dispatch and durable acceptance', () => {
  it.each(['START_CHAT', 'REPLY'] as const)(
    'dispatches composer %s exactly once, retains acceptance after projection failure and replays without fresh authority or provider writes',
    async (kind) => {
      const h = await buildSendHarness(kind);
      await expect(h.service.executeApproved(h.execute)).resolves.toEqual({
        status: 'PROVIDER_ACCEPTED',
        receiptId: 'receipt-id',
      });
      expect(h.events).toEqual(['beforeDispatch', 'marker', 'request']);
      expect(h.request).toHaveBeenCalledWith(
        kind === 'START_CHAT'
          ? {
              accountId: 'provider-account',
              attendeeId: 'messaging-009',
              text: 'Exact approved body',
            }
          : {
              accountId: 'provider-account',
              chatId: 'provider-chat',
              text: 'Exact approved body',
            },
        expect.any(Object),
      );
      expect(h.receipt()).toMatchObject({
        state: 'PROVIDER_ACCEPTED',
        providerExternalMessageId: 'accepted-message',
        providerThreadExternalId:
          kind === 'START_CHAT' ? 'new-chat' : 'provider-chat',
      });
      h.readClient.getInstagramMessagingProfile.mockRejectedValue(
        new Error('no reads on recovery'),
      );
      await expect(h.service.executeApproved(h.execute)).resolves.toMatchObject(
        { status: 'PROVIDER_ACCEPTED' },
      );
      expect(h.request).toHaveBeenCalledTimes(1);
      expect(h.budget.reserve).toHaveBeenCalledTimes(1);
      expect(h.projector.projectReceiptWithWriter).toHaveBeenCalledTimes(2);
      expect(h.budget.releasePreDispatch).not.toHaveBeenCalled();
      expect(h.budget.releaseStartTarget).not.toHaveBeenCalled();
    },
  );

  it('routes an Inbox direct click through the real fresh v3 reader and generic direct context', async () => {
    const h = await buildSendHarness('REPLY', false);
    await expect(
      h.service.sendDirect({
        ...input,
        rolePermissionConfig: h.execute.rolePermissionConfig,
      }),
    ).resolves.toMatchObject({ status: 'PROVIDER_ACCEPTED' });
    expect(
      h.approvals.createApprovedInstagramMessageBinding,
    ).toHaveBeenCalledWith(h.binding);
    expect(h.request).toHaveBeenCalledTimes(1);
  });

  it.each(['START_CHAT', 'REPLY'] as const)(
    'blocks %s after reservation when immutable profile identity changes',
    async (kind) => {
      const h = await buildSendHarness(kind);
      h.budget.reserve.mockImplementation(async () => {
        h.readClient.getInstagramMessagingProfile.mockResolvedValue({
          username: 'creator.name',
          providerId: 'reassigned-profile',
          providerMessagingId: 'reassigned-messaging',
        });
        return { status: 'RESERVED', reservationId: 'reservation-id' };
      });
      await expect(h.service.executeApproved(h.execute)).resolves.toMatchObject(
        { status: 'BLOCKED' },
      );
      expect(h.budget.releasePreDispatch).toHaveBeenCalledTimes(1);
      expect(h.request).not.toHaveBeenCalled();
    },
  );

  it('never converts approved START to REPLY when a chat appears after reservation', async () => {
    const h = await buildSendHarness('START_CHAT');
    h.budget.reserve.mockImplementation(async () => {
      h.readClient.listChats.mockResolvedValue({
        chats: [
          {
            chatId: 'appeared-chat',
            accountId: 'provider-account',
            type: 'ONE_TO_ONE',
            attendeeProviderId: 'messaging-009',
          },
        ],
        nextCursor: null,
      });
      return { status: 'RESERVED', reservationId: 'reservation-id' };
    });
    await expect(h.service.executeApproved(h.execute)).resolves.toMatchObject({
      status: 'BLOCKED',
    });
    expect(h.client.startChat).not.toHaveBeenCalled();
    expect(h.client.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    'before-marker',
    'marker',
    'after-marker',
    'receipt-save',
    'after-receipt-save',
  ] as const)('preserves conservative recovery at %s fault', async (fault) => {
    const h = await buildSendHarness('START_CHAT');
    if (fault === 'before-marker')
      h.request.mockRejectedValue(new Error('transport setup failed'));
    if (fault === 'marker')
      h.budget.markProviderAttempted.mockRejectedValue(
        new Error('marker persistence failed'),
      );
    if (fault === 'after-marker')
      h.request.mockImplementation(async (_input, options) => {
        await options.beforeDispatch();
        throw new Error('provider accepted but response lost');
      });
    if (fault === 'receipt-save')
      h.receiptManager.save.mockRejectedValueOnce(
        new Error('receipt persistence failed'),
      );
    if (fault === 'after-receipt-save') {
      const save = h.approvals.recordProviderAccepted.getMockImplementation()!;
      h.approvals.recordProviderAccepted.mockImplementation(async (...args) => {
        await save(...args);
        throw new Error('response lost after durable acceptance');
      });
    }
    const result = await h.service.executeApproved(h.execute);
    const before = fault === 'before-marker' || fault === 'marker';
    expect(result.status).toBe(before ? 'FAILED' : 'UNKNOWN');
    expect(h.receipt()).toMatchObject({
      state: before
        ? 'FAILED'
        : fault === 'after-receipt-save'
          ? 'PROVIDER_ACCEPTED'
          : 'UNKNOWN',
    });
    if (before) expect(h.budget.releasePreDispatch).toHaveBeenCalledTimes(1);
    else expect(h.budget.releasePreDispatch).not.toHaveBeenCalled();
    await h.service.executeApproved(h.execute);
    expect(h.request).toHaveBeenCalledTimes(1);
    expect(h.budget.reserve).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['START_CHAT', { messageId: '', chatId: 'new-chat' }],
    ['START_CHAT', { messageId: 'accepted-message', chatId: '' }],
    ['REPLY', { messageId: 'accepted-message', chatId: 'wrong-chat' }],
  ] as const)(
    'keeps accepted %s response with missing/contradictory IDs Unknown',
    async (kind, value) => {
      const h = await buildSendHarness(kind);
      h.request.mockImplementation(async (_input, options) => {
        await options.beforeDispatch();
        return { kind: 'ACCEPTED', value };
      });
      await expect(h.service.executeApproved(h.execute)).resolves.toMatchObject(
        { status: 'UNKNOWN' },
      );
      expect(h.receipt()).toMatchObject({ state: 'UNKNOWN' });
      expect(h.budget.releasePreDispatch).not.toHaveBeenCalled();
      expect(h.budget.releaseStartTarget).not.toHaveBeenCalled();
    },
  );

  it.each(['START_CHAT', 'REPLY'] as const)(
    'requires only the exact %s route permission for every permission combination',
    async (kind) => {
      for (const first of [false, true])
        for (const reply of [false, true]) {
          const h = await buildSendHarness(kind);
          Object.assign(h.permissions, { first, reply });
          if (kind === 'START_CHAT' ? first : reply) {
            await expect(
              h.service.executeApproved(h.execute),
            ).resolves.toMatchObject({ status: 'PROVIDER_ACCEPTED' });
          } else {
            await expect(h.service.executeApproved(h.execute)).rejects.toThrow(
              'permission is required',
            );
            expect(h.request).not.toHaveBeenCalled();
            expect(h.budget.reserve).not.toHaveBeenCalled();
          }
        }
    },
  );
});

describe('Instagram v3 thread approval and local proposal boundary', () => {
  const threadId = '00000000-0000-4000-8000-000000000008';
  it('runs the request-approval tool through the provider-aware reader and creates only v3 REPLY proposals', async () => {
    const h = buildHarness();
    const createPendingBinding = jest.fn(async () => ({
      id: '00000000-0000-4000-8000-000000000009',
    }));
    const tool = createRequestApprovalTool({
      workspaceId,
      userWorkspaceId: actorId,
      threadId,
      actionDefinitions: { send_instagram_reply: h.service } as never,
      actionApprovalService: { createPendingBinding } as never,
      instagramMessagePermissionService: { assertCanSend: jest.fn() } as never,
      instagramMessageRecordAccessService: {
        assertCanReadDraft: jest.fn(),
      } as never,
      rolePermissionConfig: { unionOf: ['role'] },
    });
    const execute = tool.execute as (input: unknown) => Promise<unknown>;
    await expect(
      execute({ toolName: 'send_instagram_reply', actionInput: { draftId } }),
    ).resolves.toMatchObject({ success: true });
    expect(createPendingBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        actionVersion: 3,
        actionKind: 'REPLY',
        threadId,
        instagramMessageSnapshot: expect.objectContaining({
          providerId: 'profile-001',
          providerMessagingId: 'messaging-009',
        }),
      }),
    );
    h.draft.kind = 'FIRST_MESSAGE';
    await expect(
      execute({ toolName: 'send_instagram_reply', actionInput: { draftId } }),
    ).rejects.toThrow('Instagram reply draft is unavailable');
    expect(createPendingBinding).toHaveBeenCalledTimes(1);
  });

  it('reconstructs stored v3 proposal through current roles without minting or re-resolving provider identity', async () => {
    const h = buildHarness();
    const authority = await h.service.createThreadReplyAuthority({
      ...input,
      threadId,
    });
    for (const mock of Object.values(h.client)) mock.mockClear();
    const proposal = new InstagramMessageProposalReaderService(
      h.orm as never,
      h.service,
    );
    const read = () =>
      withWorkspaceAuthContext(
        {
          type: 'user',
          workspace: { id: workspaceId },
          userWorkspaceId: actorId,
        } as never,
        () => proposal.read(authority.expectedActionBinding as never, actorId),
      );
    await expect(read()).resolves.toEqual({
      body: 'Exact approved body',
      recipientUsername: 'creator.name',
      accountLabel: 'Sender',
    });
    for (const call of h.orm.getRepository.mock.calls)
      expect(call[2]).toEqual({ intersectionOf: ['role'] });
    for (const mock of Object.values(h.client))
      expect(mock).not.toHaveBeenCalled();
    h.draft.creatorInstagramUsername = 'reassigned.name';
    await expect(read()).rejects.toThrow();
    for (const mock of Object.values(h.client))
      expect(mock).not.toHaveBeenCalled();
  });
});

describe('Instagram v3 exact pre-dispatch authority', () => {
  it.each([
    'body',
    'creator',
    'account',
    'route-permission',
    'binding',
    'evidence',
  ] as const)(
    'releases pre-dispatch and records BLOCKED after %s drift',
    async (field) => {
      const h = await buildSendHarness('REPLY');
      h.budget.reserve.mockImplementation(async () => {
        if (field === 'body') h.draft.body = 'changed body';
        if (field === 'creator') h.draft.conversationCreatorId = null;
        if (field === 'account') h.account.instagramUserId = 'changed-sender';
        if (field === 'route-permission') h.permissions.reply = false;
        if (field === 'binding')
          h.approvals.getApprovedBinding.mockRejectedValue(
            new Error('approval revoked'),
          );
        if (field === 'evidence')
          h.approvals.getApprovedBinding.mockResolvedValue({
            ...h.binding,
            evidenceLinks: [],
          });
        return { status: 'RESERVED', reservationId: 'reservation-id' };
      });
      await expect(h.service.executeApproved(h.execute)).resolves.toMatchObject(
        { status: 'BLOCKED' },
      );
      expect(h.request).not.toHaveBeenCalled();
      expect(h.budget.markProviderAttempted).not.toHaveBeenCalled();
      expect(h.budget.releasePreDispatch).toHaveBeenCalledTimes(1);
      expect(h.receipt()).toMatchObject({ state: 'BLOCKED' });
    },
  );

  it.each([
    'workspaceId',
    'initiatorUserWorkspaceId',
    'interactionContextId',
  ] as const)(
    'rejects a mismatching %s before even existing-receipt lookup',
    async (field) => {
      const h = await buildSendHarness('REPLY');
      await expect(
        h.service.executeApprovedWithDraftLockHeld(
          { ...h.execute, [field]: 'wrong' },
          h.binding,
        ),
      ).rejects.toThrow('approval context changed');
      expect(h.approvals.findExecutionReceiptForBinding).not.toHaveBeenCalled();
      expect(h.request).not.toHaveBeenCalled();
    },
  );

  it.each([
    'missing-creator',
    'wrong-attendee',
    'duplicate-chat',
    'incomplete-traversal',
  ] as const)('never mints fresh authority for %s evidence', async (fault) => {
    const h = buildHarness();
    if (fault === 'missing-creator') h.draft.creatorId = null;
    if (fault === 'wrong-attendee')
      h.client.getChat.mockResolvedValue({
        chatId: 'provider-chat',
        accountId: 'provider-account',
        type: 'ONE_TO_ONE',
        attendeeProviderId: 'profile-001',
      });
    if (fault === 'duplicate-chat')
      h.client.listChats.mockResolvedValue({
        chats: ['one', 'two'].map((chatId) => ({
          chatId,
          accountId: 'provider-account',
          type: 'ONE_TO_ONE',
          attendeeProviderId: 'messaging-009',
        })),
        nextCursor: null,
      });
    if (fault === 'incomplete-traversal')
      h.client.listChats.mockRejectedValue(new Error('incomplete traversal'));
    await expect(h.service.createDirectAuthority(input)).rejects.toThrow();
  });
});
