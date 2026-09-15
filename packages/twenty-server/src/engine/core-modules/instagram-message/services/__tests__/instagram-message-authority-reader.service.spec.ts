import { InstagramMessageLocalAuthorityReaderService } from 'src/engine/core-modules/action-approval/services/instagram-message-local-authority-reader.service';
import { PermissionsException } from 'src/engine/metadata-modules/permissions/permissions.exception';
import { InstagramMessageAuthorityReaderService } from 'src/engine/core-modules/instagram-message/services/instagram-message-authority-reader.service';
import { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

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
  conversationCreatorId: null,
};

const buildHarness = (
  draft: Record<string, unknown> = firstDraft,
  dataSourceOverride?: {
    transaction: jest.Mock;
    query: jest.Mock;
  },
) => {
  const dataSource = dataSourceOverride ?? {
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
    const sql = harness.dataSource.query.mock.calls
      .map(([statement]) => statement)
      .join('\n');
    expect(sql).toMatch(/LEFT JOIN "workspace_[^"]+"\."creator" creator/);
    expect(sql).not.toContain('"_creator"');
  });

  it('requires the GlobalWorkspaceDataSource raw-query permission option for draft and local conversation authority reads', async () => {
    const queryRunner = {
      isReleased: false,
      query: jest.fn(async (sql: string) =>
        sql.includes('"_myahInstagramReplyDraft"') ? [firstDraft] : [],
      ),
      release: jest.fn(),
    };
    const dataSource = Object.create(
      GlobalWorkspaceDataSource.prototype,
    ) as GlobalWorkspaceDataSource;
    Object.defineProperty(dataSource, 'createQueryRunner', {
      value: jest.fn(() => queryRunner),
    });
    Object.defineProperty(dataSource, 'transaction', {
      value: jest.fn(async (callback) => callback({ query: jest.fn() })),
    });
    const harness = buildHarness(firstDraft, dataSource as never);

    try {
      await dataSource.query('SELECT 1');
      throw new Error('GlobalWorkspaceDataSource query should require options');
    } catch (error) {
      expect(error).toBeInstanceOf(PermissionsException);
    }

    await harness.service.createDirectAuthority({
      workspaceId,
      initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000005',
      draftId,
      expectedRevision: 2,
    });

    expect(
      queryRunner.query.mock.calls.map(([sql]) => sql).join('\n'),
    ).toContain('"_myahInstagramReplyDraft"');
    expect(
      queryRunner.query.mock.calls.map(([sql]) => sql).join('\n'),
    ).toContain('"_myahSocialConversation"');
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
      conversationRecipientUsername: null,
      conversationProvider: 'UNIPILE',
      conversationLifecycle: 'ACTIVE',
      conversationInstagramAccountId: accountRecordId,
      conversationCreatorId: creatorId,
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

describe('InstagramMessageAuthorityReaderService shared local extraction', () => {
  it.each(['rebuildExecutionAuthority', 'rebuildForReconciliation'] as const)(
    'keeps %s authority equivalent and provider-free until reservation',
    async (method) => {
      const harness = buildHarness({
        ...firstDraft,
        kind: 'REPLY',
        conversationId: 'conversation-id',
        providerConversationId: 'provider-chat',
        conversationRecipientIgsid: 'creator.name',
        conversationProvider: 'UNIPILE',
        conversationLifecycle: 'ACTIVE',
        conversationInstagramAccountId: accountRecordId,
        conversationCreatorId: creatorId,
      });
      const original = await harness.service.createThreadReplyAuthority({
        workspaceId,
        initiatorUserWorkspaceId: 'viewer-id',
        threadId: 'thread-id',
        draftId,
      });
      expect(harness.service).toBeInstanceOf(
        InstagramMessageLocalAuthorityReaderService,
      );
      await expect(
        harness.service[method]({
          workspaceId,
          binding: original.expectedActionBinding,
        }),
      ).resolves.toEqual(original);
      expect(harness.client.listChats).not.toHaveBeenCalled();
      expect(harness.client.getChat).not.toHaveBeenCalled();
      expect(harness.dataSource.query).toHaveBeenLastCalledWith(
        expect.stringContaining('"_myahInstagramReplyDraft"'),
        [draftId, method === 'rebuildForReconciliation'],
        undefined,
        { shouldBypassPermissionChecks: true },
      );
      await harness.service.assertReadyAfterReservation(original);
      expect(harness.client.getChat).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['rebuildExecutionAuthority', 'rebuildForReconciliation'] as const)(
    'preserves %s fingerprint mismatch rejection',
    async (method) => {
      const harness = buildHarness();
      const authority = await harness.service.createDirectAuthority({
        workspaceId,
        initiatorUserWorkspaceId: 'viewer-id',
        draftId,
        expectedRevision: 2,
      });
      await expect(
        harness.service[method]({
          workspaceId,
          binding: {
            ...authority.expectedActionBinding,
            actionContextFingerprint: 'stale',
          },
        }),
      ).rejects.toThrow('source graph is unavailable');
      expect(harness.client.listChats).not.toHaveBeenCalled();
      expect(harness.client.getChat).not.toHaveBeenCalled();
    },
  );
});

describe('InstagramMessageAuthorityReaderService current conversation Creator linkage', () => {
  it.each([null, 'replacement-creator'])(
    'rejects saved REPLY after Creator link becomes %s without changing revision or provider target',
    async (conversationCreatorId) => {
      const draft = {
        ...firstDraft,
        kind: 'REPLY',
        recipientProviderId: 'recipient-igsid',
        conversationId: 'conversation-id',
        providerConversationId: 'provider-chat',
        conversationRecipientIgsid: 'recipient-igsid',
        conversationProvider: 'UNIPILE',
        conversationLifecycle: 'ACTIVE',
        conversationInstagramAccountId: accountRecordId,
        conversationCreatorId: creatorId as string | null,
      };
      const harness = buildHarness(draft);
      const input = {
        workspaceId,
        initiatorUserWorkspaceId: 'viewer-id',
        draftId,
        expectedRevision: 2,
      };
      const original = await harness.service.createDirectAuthority(input);
      draft.conversationCreatorId = conversationCreatorId;

      await expect(
        harness.service.createDirectAuthority(input),
      ).rejects.toThrow('REPLY draft target is stale');
      await expect(
        harness.service.createThreadReplyAuthority({
          ...input,
          threadId: 'thread-id',
        }),
      ).rejects.toThrow('REPLY draft target is stale');
      for (const method of [
        'rebuildExecutionAuthority',
        'rebuildForReconciliation',
      ] as const) {
        await expect(
          harness.service[method]({
            workspaceId,
            binding: original.expectedActionBinding,
          }),
        ).rejects.toThrow('REPLY draft target is stale');
      }
      expect(draft.revision).toBe(2);
      expect(harness.client.getChat).not.toHaveBeenCalled();
      expect(harness.client.listChats).not.toHaveBeenCalled();
      expect(harness.dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining(
          'conversation."creatorId" AS "conversationCreatorId"',
        ),
        [draftId, true],
        undefined,
        { shouldBypassPermissionChecks: true },
      );

      draft.conversationCreatorId = creatorId;
      await expect(
        harness.service.rebuildExecutionAuthority({
          workspaceId,
          binding: original.expectedActionBinding,
        }),
      ).resolves.toEqual(original);
    },
  );
});
