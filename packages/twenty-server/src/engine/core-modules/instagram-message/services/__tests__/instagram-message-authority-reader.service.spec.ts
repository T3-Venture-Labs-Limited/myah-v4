import { buildLegacyInstagramMessageActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { InstagramMessageAuthorityReaderService } from '../instagram-message-authority-reader.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const creatorId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000004';
const conversationId = '00000000-0000-4000-8000-000000000005';
const profileId = '00000000-0000-4000-8000-000000000006';
const actorId = '00000000-0000-4000-8000-000000000007';
const rolePermissionConfig = { unionOf: ['role'] };

const setup = () => {
  const draft = {
    id: draftId,
    body: 'Hello creator',
    revision: 2,
    kind: 'REPLY',
    creatorId,
    recipientUsername: 'creator.name',
    recipientProviderId: 'recipient-igsid',
    conversationId,
    sentAt: null,
    providerConversationId: 'provider-chat',
    conversationCreatorId: creatorId as string | null,
    conversationRecipientIgsid: 'recipient-igsid',
    conversationProvider: 'UNIPILE',
    conversationLifecycle: 'ACTIVE',
    conversationInstagramAccountId: accountId,
  };
  const profile = {
    id: profileId,
    creatorId,
    platform: 'INSTAGRAM',
    handle: 'creator.name',
    profileUrl: null,
    platformAccountId: null,
    deletedAt: null,
  };
  const account = {
    id: '00000000-0000-4000-8000-000000000008',
    workspaceId,
    workspaceInstagramAccountRecordId: accountId,
    unipileAccountId: 'provider-account',
    instagramUserId: 'brand-user',
    status: 'ACTIVE',
    deactivatedAt: null,
  };
  const chat = {
    chatId: 'provider-chat',
    accountId: 'provider-account',
    type: 'ONE_TO_ONE',
    attendeeProviderId: 'recipient-igsid',
  };
  const client = {
    getInstagramMessagingProfile: jest.fn().mockResolvedValue({
      username: 'creator.name',
      providerId: 'recipient-profile-id',
      providerMessagingId: 'recipient-igsid',
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
            recipientIgsid: 'recipient-igsid',
          },
        ],
  );
  const getRepository = jest.fn(
    async (_workspaceId: string, name: string, permissions: unknown) => ({
      findOne: jest.fn(
        async () =>
          ({
            creator: { id: creatorId },
            socialProfile: profile,
            myahInstagramReplyDraft: draft,
            myahSocialConversation: {
              id: conversationId,
              creatorId: draft.conversationCreatorId,
              providerConversationId: draft.providerConversationId,
              recipientIgsid: draft.conversationRecipientIgsid,
              provider: draft.conversationProvider,
              lifecycle: draft.conversationLifecycle,
              instagramAccountId: draft.conversationInstagramAccountId,
            },
            myahInstagramAccount: { id: accountId },
          })[name],
      ),
      find: jest.fn(async () => (name === 'socialProfile' ? [profile] : [])),
      permissions,
    }),
  );
  const reader = new InstagramMessageAuthorityReaderService(
    { findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }) } as never,
    {
      getRepository,
      executeInWorkspaceContext: jest.fn(async (callback) => callback()),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({ query }),
    } as never,
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
  const input = {
    workspaceId,
    initiatorUserWorkspaceId: actorId,
    draftId,
    expectedRevision: 2,
    rolePermissionConfig,
  };
  return {
    reader,
    client,
    query,
    getRepository,
    draft,
    profile,
    account,
    input,
  };
};

describe('InstagramMessageAuthorityReaderService canonical reply authority', () => {
  it('refuses scalar-only historical v2 before any draft or provider read', async () => {
    const h = setup();
    const historical = buildLegacyInstagramMessageActionAuthority({
      workspaceId,
      initiatorUserWorkspaceId: actorId,
      threadId: null,
      interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
      interactionContextId: draftId,
      draft: {
        id: draftId,
        revision: 2,
        body: 'Hello creator',
        kind: 'REPLY',
        creatorRecordId: creatorId,
        recipientUsername: 'creator.name',
        recipientProviderId: 'recipient-igsid',
        recipientSourceValues: [
          { field: 'instagramUsername', value: 'creator.name' },
        ],
        conversationRecordId: conversationId,
        providerConversationId: 'provider-chat',
      },
      account: {
        bindingId: h.account.id,
        workspaceInstagramAccountRecordId: accountId,
        unipileAccountId: h.account.unipileAccountId,
        instagramUserId: h.account.instagramUserId,
      },
      evidenceLinks: [],
    });
    await expect(
      h.reader.rebuildExecutionAuthority({
        workspaceId,
        binding: historical.expectedActionBinding,
        rolePermissionConfig,
      }),
    ).rejects.toThrow('historical recipient is unavailable');
    expect(h.query).not.toHaveBeenCalled();
    expect(h.client.getChat).not.toHaveBeenCalled();
    expect(h.client.getInstagramMessagingProfile).not.toHaveBeenCalled();
  });

  it('rebuilds a canonical v3 reply under role-readable repositories without provider reads', async () => {
    const h = setup();
    const authority = await h.reader.createDirectAuthority(h.input);
    h.client.getChat.mockClear();
    h.client.getInstagramMessagingProfile.mockClear();
    h.getRepository.mockClear();
    await expect(
      h.reader.rebuildExecutionAuthority({
        workspaceId,
        binding: authority.expectedActionBinding,
        rolePermissionConfig,
      }),
    ).resolves.toEqual(authority);
    expect(h.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'socialProfile',
      rolePermissionConfig,
    );
    expect(h.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'creator',
      rolePermissionConfig,
    );
    expect(h.client.getChat).not.toHaveBeenCalled();
    expect(h.client.getInstagramMessagingProfile).not.toHaveBeenCalled();
  });

  it.each(['socialProfile', 'creator'] as const)(
    'rejects unreadable %s during unreceipted v3 rebuild despite a readable conversation',
    async (denied) => {
      const h = setup();
      const authority = await h.reader.createDirectAuthority(h.input);
      const repository = h.getRepository.getMockImplementation()!;
      h.getRepository.mockImplementation(async (...args) => {
        const result = await repository(...args);
        if (args[1] === denied && args[2] === rolePermissionConfig)
          return {
            ...result,
            findOne: jest.fn().mockResolvedValue(null),
            find: jest.fn().mockResolvedValue([]),
          };
        return result;
      });
      h.client.getChat.mockClear();
      await expect(
        h.reader.rebuildExecutionAuthority({
          workspaceId,
          binding: authority.expectedActionBinding,
          rolePermissionConfig,
        }),
      ).rejects.toThrow();
      expect(h.client.getChat).not.toHaveBeenCalled();
    },
  );

  it('rejects a changed canonical source fingerprint without provider verification', async () => {
    const h = setup();
    const authority = await h.reader.createDirectAuthority(h.input);
    h.profile.handle = 'changed';
    h.client.getChat.mockClear();
    await expect(
      h.reader.rebuildExecutionAuthority({
        workspaceId,
        binding: authority.expectedActionBinding,
        rolePermissionConfig,
      }),
    ).rejects.toThrow();
    expect(h.client.getChat).not.toHaveBeenCalled();
  });

  it.each([null, 'replacement-creator'])(
    'rejects current conversation Creator link %s without rewriting its immutable binding',
    async (creator) => {
      const h = setup();
      const authority = await h.reader.createDirectAuthority(h.input);
      h.client.getChat.mockClear();
      h.draft.conversationCreatorId = creator;
      await expect(
        h.reader.rebuildExecutionAuthority({
          workspaceId,
          binding: authority.expectedActionBinding,
          rolePermissionConfig,
        }),
      ).rejects.toThrow('REPLY draft target is stale');
      expect(authority.expectedActionBinding.actionVersion).toBe(3);
      expect(h.client.getChat).not.toHaveBeenCalled();
    },
  );
});
