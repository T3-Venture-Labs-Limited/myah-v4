import {
  InstagramReplyActionDefinition,
  InstagramReplyActionProposalInputZodSchema,
} from 'src/engine/core-modules/action-approval/definitions/instagram-reply-action.definition';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const userWorkspaceId = '00000000-0000-4000-8000-000000000003';
const threadId = '00000000-0000-4000-8000-000000000004';

const inboundReceivedAt = new Date('2026-07-16T11:30:00.000Z');

const sourceGraph = {
  draftId,
  draftBody: 'Cafe\r\nThanks!',
  draftLabel: 'Reply to @myah',
  draftSentAt: null,
  draftStatus: 'NEEDS_REVIEW',
  conversationId: '00000000-0000-4000-8000-000000000005',
  conversationLabel: '@myah',
  providerConversationId: 'provider-conversation-id',
  recipientIgsid: 'recipient-igsid',
  inboundRecordId: '00000000-0000-4000-8000-000000000008',
  inboundMessageId: 'provider-inbound-message-id',
  inboundSenderIgsid: 'recipient-igsid',
  inboundDirection: 'INBOUND',
  inboundReceivedAt,
  accountId: '00000000-0000-4000-8000-000000000006',
  accountLabel: '@myah_business',
  connectedAccountId: 'connected-account-id',
  composioUserId: 'workspace:00000000-0000-4000-8000-000000000001:instagram',
  igUserId: 'sending-account-igsid',
};

const buildDefinition = ({
  draft = sourceGraph,
  conversation = sourceGraph,
  account = sourceGraph,
  activeAccounts = [sourceGraph],
  messages = [sourceGraph],
}: {
  draft?: typeof sourceGraph | null;
  conversation?: typeof sourceGraph | null;
  account?: typeof sourceGraph | null;
  activeAccounts?: (typeof sourceGraph)[];
  messages?: (typeof sourceGraph)[];
} = {}) => {
  const query = jest.fn().mockResolvedValue([sourceGraph]);
  const repositories = {
    myahInstagramReplyDraft: {
      findOneBy: jest.fn().mockResolvedValue(
        draft && {
          id: draft.draftId,
          body: draft.draftBody,
          title: draft.draftLabel,
          name: null,
          sentAt: draft.draftSentAt,
          status: draft.draftStatus,
          conversationId: draft.conversationId,
        },
      ),
    },
    myahSocialConversation: {
      findOneBy: jest.fn().mockResolvedValue(
        conversation && {
          id: conversation.conversationId,
          label: conversation.conversationLabel,
          name: null,
          providerConversationId: conversation.providerConversationId,
          recipientIgsid: conversation.recipientIgsid,
          instagramAccountId: conversation.accountId,
        },
      ),
    },
    myahSocialMessage: {
      find: jest.fn().mockResolvedValue(
        messages.map((message) => ({
          id: message.inboundRecordId,
          conversationId: message.conversationId,
          providerMessageId: message.inboundMessageId,
          direction: message.inboundDirection,
          createdAt: message.inboundReceivedAt,
        })),
      ),
    },
    myahInstagramAccount: {
      findOneBy: jest.fn().mockResolvedValue(
        account && {
          id: account.accountId,
          label: account.accountLabel,
          name: null,
          status: 'ACTIVE',
          connectedAccountId: account.connectedAccountId,
          composioUserId: account.composioUserId,
          igUserId: account.igUserId,
        },
      ),
      find: jest.fn().mockResolvedValue(
        activeAccounts.map((activeAccount) => ({
          id: activeAccount.accountId,
          status: 'ACTIVE',
        })),
      ),
    },
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      callback(),
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
    getRepository: jest.fn(
      async (_workspaceId: string, objectName: keyof typeof repositories) =>
        repositories[objectName],
    ),
  };
  const workspaceRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }),
  };
  const userWorkspaceRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: userWorkspaceId,
      workspaceId,
      user: { id: 'user-id' },
    }),
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      flatWorkspaceMemberMaps: {
        idByUserId: { 'user-id': 'workspace-member-id' },
        byId: { 'workspace-member-id': { id: 'workspace-member-id' } },
      },
    }),
  };

  const objectMetadataRepository = {
    find: jest.fn().mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-000000000101',
        universalIdentifier: '85762d24-541b-407f-9d6a-cdf89552c665',
      },
      {
        id: '00000000-0000-4000-8000-000000000102',
        universalIdentifier: '36817464-855f-42db-9fbb-f8853643f8d6',
      },
      {
        id: '00000000-0000-4000-8000-000000000103',
        universalIdentifier: '2d357469-831a-4629-ad4b-47335900e883',
      },
      {
        id: '00000000-0000-4000-8000-000000000104',
        universalIdentifier: '7241bd44-e474-4904-8636-339276b3feff',
      },
    ]),
  };
  const Definition = InstagramReplyActionDefinition as unknown as new (
    ...args: unknown[]
  ) => InstagramReplyActionDefinition;

  return {
    query,
    globalWorkspaceOrmManager,
    definition: new Definition(
      workspaceRepository,
      globalWorkspaceOrmManager,
      objectMetadataRepository,
      userWorkspaceRepository,
      workspaceCacheService,
    ),
  };
};

describe('InstagramReplyActionDefinition', () => {
  it('accepts only a draft UUID as proposal input', () => {
    expect(
      InstagramReplyActionProposalInputZodSchema.parse({ draftId }),
    ).toEqual({
      draftId,
    });
    expect(() =>
      InstagramReplyActionProposalInputZodSchema.parse({
        draftId,
        body: 'caller supplied text',
      }),
    ).toThrow();
    expect(() =>
      InstagramReplyActionProposalInputZodSchema.parse({
        connectedAccountId: 'caller supplied account',
      }),
    ).toThrow();
  });

  it('derives normalized immutable authority and source evidence from the visible graph', async () => {
    const { definition, globalWorkspaceOrmManager } = buildDefinition();

    await expect(
      definition.propose({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
        input: { draftId },
      }),
    ).resolves.toMatchObject({
      proposal: {
        title: 'Reply to @myah',
        preview: { format: 'text', content: 'Cafe\r\nThanks!' },
        targetLabel: '@myah',
      },
      expectedActionBinding: {
        workspaceId,
        actionName: 'send_instagram_reply',
        actionVersion: 1,
        draftId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
        contentDigest:
          '6e55a89183e73df9319c1ab0458b529c5d5a65ff0a77f73e5b3662beb2f14844',
        inboundMessageId: sourceGraph.inboundMessageId,
        inboundSenderIgsid: sourceGraph.inboundSenderIgsid,
        inboundDirection: 'INBOUND',
        inboundReceivedAt,
        evidenceLinks: expect.arrayContaining([
          expect.objectContaining({
            objectMetadataId: '00000000-0000-4000-8000-000000000101',
            recordId: draftId,
            role: 'draft',
          }),
          expect.objectContaining({
            objectMetadataId: '00000000-0000-4000-8000-000000000102',
            recordId: sourceGraph.conversationId,
            role: 'conversation',
          }),
          expect.objectContaining({
            objectMetadataId: '00000000-0000-4000-8000-000000000103',
            recordId: sourceGraph.accountId,
            role: 'sending_account',
          }),
          expect.objectContaining({
            objectMetadataId: '00000000-0000-4000-8000-000000000104',
            recordId: sourceGraph.inboundRecordId,
            role: 'inbound_message',
          }),
        ]),
      },
    });

    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'myahInstagramReplyDraft',
    );
    expect(
      globalWorkspaceOrmManager.getGlobalWorkspaceDataSource,
    ).not.toHaveBeenCalled();
  });

  it('returns an exact guarded preview only while the canonical graph matches the binding', async () => {
    const { definition } = buildDefinition();
    const expected = await definition.propose({
      workspaceId,
      initiatorUserWorkspaceId: userWorkspaceId,
      threadId,
      input: { draftId },
    });
    const binding = {
      ...expected.expectedActionBinding,
      state: 'PENDING',
      expiresAt: new Date('2026-07-17T10:30:00.000Z'),
      createdAt: new Date('2026-07-17T10:00:00.000Z'),
      decidedAt: null,
    };

    await expect(
      definition.getProposal({ workspaceId, binding: binding as never }),
    ).resolves.toEqual({
      action: 'send_instagram_reply',
      actionVersion: 1,
      body: 'Cafe\r\nThanks!',
      recipientLabel: '@myah',
      sendingAccountLabel: '@myah_business',
      state: 'PENDING',
      expiresAt: binding.expiresAt,
      occurredAt: binding.createdAt,
      evidenceLinks: binding.evidenceLinks,
    });

    await expect(
      definition.getProposal({
        workspaceId,
        binding: { ...binding, contentDigest: 'mismatched' } as never,
      }),
    ).rejects.toThrow('Instagram reply source graph is unavailable');
  });

  it('rejects a graph hidden from the initiator before creating a binding', async () => {
    const { definition } = buildDefinition({ draft: null });

    await expect(
      definition.propose({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
        input: { draftId },
      }),
    ).rejects.toThrow('Instagram reply source graph is unavailable');
  });

  it('rejects a proposal without one exact canonical inbound message', async () => {
    const { definition } = buildDefinition({ messages: [] });

    await expect(
      definition.propose({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
        input: { draftId },
      }),
    ).rejects.toThrow('Instagram reply source graph is unavailable');
  });

  it('rejects multiple active local Instagram accounts before creating a binding', async () => {
    const { definition } = buildDefinition({
      activeAccounts: [
        sourceGraph,
        { ...sourceGraph, accountId: '00000000-0000-4000-8000-000000000007' },
      ],
    });

    await expect(
      definition.propose({
        workspaceId,
        initiatorUserWorkspaceId: userWorkspaceId,
        threadId,
        input: { draftId },
      }),
    ).rejects.toThrow('Instagram reply source graph is unavailable');
  });
});
