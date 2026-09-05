import { InstagramMessageAuthorityReaderService } from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const draftId = '00000000-0000-4000-8000-000000000002';
const creatorId = '00000000-0000-4000-8000-000000000003';
const accountRecordId = '00000000-0000-4000-8000-000000000004';

const objectMetadata = [
  ['2d357469-831a-4629-ad4b-47335900e883', 'account-metadata'],
  ['85762d24-541b-407f-9d6a-cdf89552c665', 'draft-metadata'],
  ['36817464-855f-42db-9fbb-f8853643f8d6', 'conversation-metadata'],
  ['5ca82f72-9778-4ae1-8a8e-9b762c4ce0de', 'creator-metadata'],
].map(([universalIdentifier, id]) => ({ universalIdentifier, id }));

const firstDraft = {
  id: draftId,
  body: 'Hello creator',
  revision: 2,
  kind: 'FIRST_MESSAGE',
  creatorId,
  recipientUsername: 'creator.name',
  recipientProviderId: 'creator.name',
  conversationId: null,
  sentAt: null,
  creatorInstagramUsername: '@Creator.Name',
  creatorInstagramUrl: 'https://instagram.com/creator.name/',
  creatorInstagramLinkPrimaryLinkUrl: null,
  providerConversationId: null,
  conversationRecipientIgsid: null,
  conversationRecipientUsername: null,
  conversationProvider: null,
  conversationLifecycle: null,
  conversationInstagramAccountId: null,
};

const buildHarness = (draft: Record<string, unknown> = firstDraft) => {
  const dataSource = {
    transaction: jest.fn(async (callback) => callback({ query: jest.fn() })),
    query: jest.fn(async (sql: string) =>
      sql.includes('"_myahInstagramReplyDraft"') ? [draft] : [],
    ),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback) => callback()),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
  };
  const accountBinding = {
    id: 'binding-id',
    workspaceId,
    workspaceInstagramAccountRecordId: accountRecordId,
    unipileAccountId: 'provider-account',
    instagramUserId: 'brand-user',
    status: 'ACTIVE',
    deactivatedAt: null,
  };
  const client = {
    listChats: jest.fn().mockResolvedValue({ chats: [], nextCursor: null }),
    getChat: jest.fn().mockResolvedValue({ chatId: 'provider-chat' }),
  };
  const service = new InstagramMessageAuthorityReaderService(
    { findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }) } as never,
    globalWorkspaceOrmManager as never,
    { find: jest.fn().mockResolvedValue([accountBinding]) } as never,
    { find: jest.fn().mockResolvedValue(objectMetadata) } as never,
    client as never,
  );

  return { client, dataSource, service };
};

describe('InstagramMessageAuthorityReaderService', () => {
  it('builds direct START_CHAT authority from current Creator fields and read-only local/provider state', async () => {
    const harness = buildHarness();

    const authority = await harness.service.createDirectAuthority({
      workspaceId,
      initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000005',
      draftId,
      expectedRevision: 2,
    });

    expect(authority).toMatchObject({
      expectedActionBinding: {
        actionName: 'send_instagram_message',
        actionVersion: 2,
        actionKind: 'START_CHAT',
        threadId: null,
        interactionContextId: draftId,
      },
    });
    expect(harness.client.listChats).not.toHaveBeenCalled();
    expect(harness.client.getChat).not.toHaveBeenCalled();

    await harness.service.assertReadyAfterReservation(authority);

    expect(harness.client.listChats).toHaveBeenCalledTimes(1);
  });

  it('blocks START_CHAT when a current provider chat already exists', async () => {
    const harness = buildHarness();
    harness.client.listChats.mockResolvedValue({
      chats: [
        {
          chatId: 'provider-chat',
          attendeeProviderId: 'creator.name',
        },
      ],
      nextCursor: null,
    });

    const authority = await harness.service.createDirectAuthority({
      workspaceId,
      initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000005',
      draftId,
      expectedRevision: 2,
    });

    await expect(
      harness.service.assertReadyAfterReservation(authority),
    ).rejects.toThrow(
      'START_CHAT authority cannot target an existing conversation',
    );
  });

  it('requires and provider-verifies the exact active Unipile conversation for REPLY', async () => {
    const harness = buildHarness({
      ...firstDraft,
      kind: 'REPLY',
      conversationId: 'conversation-id',
      providerConversationId: 'provider-chat',
      conversationRecipientIgsid: 'creator.name',
      conversationRecipientUsername: 'creator.name',
      conversationProvider: 'UNIPILE',
      conversationLifecycle: 'ACTIVE',
      conversationInstagramAccountId: accountRecordId,
    });

    const authority = await harness.service.createThreadReplyAuthority({
      workspaceId,
      initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000005',
      threadId: '00000000-0000-4000-8000-000000000006',
      draftId,
    });

    expect(authority).toMatchObject({
      expectedActionBinding: {
        actionKind: 'REPLY',
        threadId: '00000000-0000-4000-8000-000000000006',
      },
    });
    expect(harness.client.getChat).not.toHaveBeenCalled();

    await harness.service.assertReadyAfterReservation(authority);

    expect(harness.client.getChat).toHaveBeenCalledWith({
      accountId: 'provider-account',
      chatId: 'provider-chat',
      expectedAttendeeId: 'creator.name',
    });
  });
});
