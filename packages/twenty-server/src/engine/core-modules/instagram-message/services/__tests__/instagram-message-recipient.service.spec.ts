import { ConflictException } from '@nestjs/common';
import { FieldMetadataType } from 'twenty-shared/types';

import { InstagramMessageRecipientService } from 'src/engine/core-modules/instagram-message/services/instagram-message-recipient.service';
import { INSTAGRAM_CONVERSATION_DELETED_MESSAGE } from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

const workspaceId = 'workspace-id';
const rolePermissionConfig = { unionOf: ['role-id'] };
const context = {
  workspaceId,
  initiatorUserWorkspaceId: 'user-workspace-id',
  workspaceMemberId: 'member-id',
  rolePermissionConfig,
};

const creator = {
  id: 'creator-id',
  instagramUsername: 'Creator.Name',
  instagramUrl: null,
  instagramLink: null,
};
const account = {
  bindingId: 'binding-id',
  instagramAccountRecordId: 'account-record-id',
  unipileAccountId: 'unipile-account-id',
  instagramUserId: 'instagram-user-id',
  label: 'Sender',
};

type CreatorInsertPermission =
  | 'allowed'
  | 'objectDenied'
  | 'instagramUsernameUpdateDenied'
  | 'returningIdReadDenied';

const buildCreatorPermissions = (permission: CreatorInsertPermission) => {
  const fields = [
    { id: 'creator-id-field', name: 'id', type: FieldMetadataType.UUID },
    {
      id: 'creator-instagram-username-field',
      name: 'instagramUsername',
      type: FieldMetadataType.TEXT,
    },
  ];
  const restrictedFields =
    permission === 'instagramUsernameUpdateDenied'
      ? {
          'creator-instagram-username-field': {
            canRead: true,
            canUpdate: false,
          },
        }
      : permission === 'returningIdReadDenied'
        ? { 'creator-id-field': { canRead: false, canUpdate: true } }
        : {};

  return {
    objectRecordsPermissions: {
      creator: {
        canReadObjectRecords: true,
        canUpdateObjectRecords: permission !== 'objectDenied',
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        restrictedFields,
        rowLevelPermissionPredicates: [],
        rowLevelPermissionPredicateGroups: [],
      },
    },
    internalContext: {
      objectIdByNameSingular: { creator: 'creator' },
      flatObjectMetadataMaps: {
        byUniversalIdentifier: {
          creator: {
            id: 'creator',
            universalIdentifier: 'creator',
            nameSingular: 'creator',
            isSystem: false,
            fieldIds: fields.map(({ id }) => id),
          } as FlatObjectMetadata,
        },
        universalIdentifierById: { creator: 'creator' },
        universalIdentifiersByApplicationId: {},
      },
      flatFieldMetadataMaps: {
        byUniversalIdentifier: Object.fromEntries(
          fields.map((field) => [field.id, field as FlatFieldMetadata]),
        ),
        universalIdentifierById: Object.fromEntries(
          fields.map(({ id }) => [id, id]),
        ),
        universalIdentifiersByApplicationId: {},
      },
    },
  };
};

const buildHarness = (input?: {
  allCreators?: object[];
  readableCreator?: object | null;
  localChats?: object[];
  internalLocalChats?: object[];
  readableLocalChats?: object[];
  pages?: Array<{ chats: object[]; nextCursor: string | null }>;
  permission?: boolean | ((kind: string) => boolean);
  account?: object | null;
  creatorInsertPermission?: CreatorInsertPermission;
  targetAvailable?: boolean | ((input: object) => boolean);
  profile?: object;
}) => {
  const creatorPermissions = buildCreatorPermissions(
    input?.creatorInsertPermission ?? 'allowed',
  );
  const creatorRepository = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        input?.readableCreator === undefined ? creator : input.readableCreator,
      ),
    insert: jest.fn(),
    ...creatorPermissions,
  };
  const internalCreatorRepository = {
    find: jest.fn().mockResolvedValue(input?.allCreators ?? [creator]),
  };
  const internalConversationRepository = {
    find: jest
      .fn()
      .mockResolvedValue(input?.internalLocalChats ?? input?.localChats ?? []),
  };
  const readableConversationRepository = {
    find: jest
      .fn()
      .mockResolvedValue(input?.readableLocalChats ?? input?.localChats ?? []),
  };
  const globalWorkspaceOrmManager = {
    getRepository: jest.fn(
      async (_workspaceId: string, objectName: string, role?: unknown) => {
        if (objectName === 'creator') {
          if (role === rolePermissionConfig) return creatorRepository;
          expect(role).toEqual({ shouldBypassPermissionChecks: true });
          return internalCreatorRepository;
        }
        if (role === undefined)
          throw new Error(
            'Conversation discovery requires explicit permissions',
          );
        if (role !== rolePermissionConfig) {
          expect(role).toEqual({ shouldBypassPermissionChecks: true });
          return internalConversationRepository;
        }
        expect(role).toBe(rolePermissionConfig);
        return readableConversationRepository;
      },
    ),
  };
  const recordAccessService = {
    getComposerAccount: jest
      .fn()
      .mockResolvedValue(
        input?.account === undefined ? account : input.account,
      ),
  };
  const permissionService = {
    canQueryComposerAccount: jest.fn().mockResolvedValue(true),
    canSend: jest.fn(({ actionKind }) =>
      Promise.resolve(
        typeof input?.permission === 'function'
          ? input.permission(actionKind)
          : (input?.permission ?? true),
      ),
    ),
  };
  const budgetService = {
    isTargetAvailable: jest.fn((target) =>
      Promise.resolve(
        typeof input?.targetAvailable === 'function'
          ? input.targetAvailable(target)
          : (input?.targetAvailable ?? true),
      ),
    ),
    reserve: jest.fn(),
  };
  const pages = input?.pages ?? [{ chats: [], nextCursor: null }];
  const unipileClient = {
    getInstagramMessagingProfile: jest.fn().mockResolvedValue(
      input?.profile ?? {
        username: 'creator.name',
        providerId: 'provider-id',
        providerMessagingId: 'provider-messaging-id',
      },
    ),
    listChats: jest
      .fn()
      .mockImplementation(
        async () => pages.shift() ?? { chats: [], nextCursor: null },
      ),
    getChat: jest.fn().mockResolvedValue({
      chatId: 'chat-id',
      accountId: 'unipile-account-id',
      accountType: 'INSTAGRAM',
      type: 'ONE_TO_ONE',
      attendeeProviderId: 'provider-messaging-id',
      name: 'creator.name',
      timestamp: '2026-09-11T14:49:49.090Z',
    }),
    startChat: jest.fn(() => {
      throw new Error('provider mutation during preparation');
    }),
    sendMessage: jest.fn(() => {
      throw new Error('provider mutation during preparation');
    }),
  };
  const approvalService = { createApprovedInstagramMessageBinding: jest.fn() };
  const draftRepository = { insert: jest.fn() };
  const bindingRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: account.bindingId,
      workspaceId: workspaceId,
      workspaceInstagramAccountRecordId: account.instagramAccountRecordId,
      unipileAccountId: account.unipileAccountId,
      instagramUserId: account.instagramUserId,
      status: 'ACTIVE' as const,
      deactivatedAt: null,
    }),
  };
  const projectionService = {
    upsertVerifiedChat: jest.fn().mockResolvedValue({
      conversationRecordId: 'materialised-conversation-id',
    }),
  };

  return {
    creatorRepository,
    internalCreatorRepository,
    draftRepository,
    approvalService,
    budgetService,
    unipileClient,
    bindingRepository,
    projectionService,
    service: new InstagramMessageRecipientService(
      globalWorkspaceOrmManager as never,
      recordAccessService as never,
      permissionService as never,
      budgetService as never,
      unipileClient as never,
      projectionService as never,
      bindingRepository as never,
    ),
  };
};

describe('InstagramMessageRecipientService', () => {
  it('prepares a normalized raw handle as a reply without writes', async () => {
    const harness = buildHarness({
      localChats: [
        {
          id: 'conversation-id',
          providerConversationId: 'chat-id',
          recipientIgsid: 'provider-messaging-id',
          recipientUsername: 'creator.name',
        },
      ],
      pages: [
        {
          chats: [
            {
              chatId: 'chat-id',
              accountId: 'unipile-account-id',
              type: 'ONE_TO_ONE',
              attendeeProviderId: 'provider-messaging-id',
            },
          ],
          nextCursor: null,
        },
      ],
    });

    const result = await harness.service.prepare(
      { recipient: { rawHandle: ' @Creator.Name ' } },
      context,
    );

    expect(result).toMatchObject({
      status: 'READY',
      normalizedHandle: 'creator.name',
      creatorRecordId: 'creator-id',
      actionKind: 'REPLY',
    });
    expect(harness.creatorRepository.insert).not.toHaveBeenCalled();
    expect(harness.draftRepository.insert).not.toHaveBeenCalled();
    expect(
      harness.approvalService.createApprovedInstagramMessageBinding,
    ).not.toHaveBeenCalled();
    expect(harness.budgetService.reserve).not.toHaveBeenCalled();
    expect(harness.unipileClient.startChat).not.toHaveBeenCalled();
    expect(harness.unipileClient.sendMessage).not.toHaveBeenCalled();
  });

  it.each([
    [
      'selected Creator has no canonical handle',
      { ...creator, instagramUsername: null },
    ],
    [
      'selected Creator has conflicting canonical handles',
      { ...creator, instagramUrl: 'https://instagram.com/other.creator' },
    ],
  ])('%s blocks without provider activity', async (_name, selectedCreator) => {
    const harness = buildHarness({ readableCreator: selectedCreator });

    await expect(
      harness.service.prepare(
        { recipient: { creatorRecordId: 'creator-id' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'RECIPIENT_UNAVAILABLE' });
    expect(
      harness.unipileClient.getInstagramMessagingProfile,
    ).not.toHaveBeenCalled();
    expect(harness.unipileClient.startChat).not.toHaveBeenCalled();
  });

  it.each([
    ['allowed', 'allowed', { status: 'READY', actionKind: 'START_CHAT' }],
    [
      'Creator object denied',
      'objectDenied',
      { status: 'BLOCKED', code: 'RECIPIENT_UNAVAILABLE' },
    ],
    [
      'instagramUsername update denied',
      'instagramUsernameUpdateDenied',
      { status: 'BLOCKED', code: 'RECIPIENT_UNAVAILABLE' },
    ],
    [
      'Creator ID returning read denied',
      'returningIdReadDenied',
      { status: 'BLOCKED', code: 'RECIPIENT_UNAVAILABLE' },
    ],
  ] as const)(
    'uses the real prospective Creator insert permissions when %s',
    async (_name, creatorInsertPermission, expected) => {
      const harness = buildHarness({
        allCreators: [],
        creatorInsertPermission,
        profile: {
          username: 'new.creator',
          providerId: 'provider-id',
          providerMessagingId: 'provider-messaging-id',
        },
      });

      await expect(
        harness.service.prepare(
          { recipient: { rawHandle: 'new.creator' } },
          context,
        ),
      ).resolves.toMatchObject(expected);
      expect(harness.creatorRepository.insert).not.toHaveBeenCalled();
      expect(harness.draftRepository.insert).not.toHaveBeenCalled();
      expect(
        harness.approvalService.createApprovedInstagramMessageBinding,
      ).not.toHaveBeenCalled();
      expect(harness.budgetService.reserve).not.toHaveBeenCalled();
      expect(harness.unipileClient.startChat).not.toHaveBeenCalled();
      expect(harness.unipileClient.sendMessage).not.toHaveBeenCalled();
    },
  );

  it('does not require prospective Creator insert permission to reuse a readable Creator', async () => {
    const harness = buildHarness({
      creatorInsertPermission: 'objectDenied',
    });

    await expect(
      harness.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toMatchObject({
      status: 'READY',
      creatorRecordId: creator.id,
      actionKind: 'START_CHAT',
    });
    expect(harness.creatorRepository.insert).not.toHaveBeenCalled();
  });

  it('blocks raw reuse when an exact match is inaccessible instead of creating a duplicate', async () => {
    const harness = buildHarness({ readableCreator: null });

    await expect(
      harness.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'RECIPIENT_UNAVAILABLE' });
    expect(harness.creatorRepository.insert).not.toHaveBeenCalled();
  });

  it.each([
    ['no route permission', false, 'MISSING_ROUTE_PERMISSION'],
    ['target lock', true, 'TARGET_LOCKED'],
  ] as const)('blocks %s', async (_name, permission, code) => {
    const harness = buildHarness({
      permission,
      targetAvailable: code === 'TARGET_LOCKED' ? false : true,
    });
    await expect(
      harness.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code });
  });

  it('fails closed on local/provider chat disagreement and account rebinding', async () => {
    const mismatch = buildHarness({
      localChats: [
        {
          id: 'conversation-id',
          providerConversationId: 'different-chat-id',
          recipientIgsid: 'provider-messaging-id',
          recipientUsername: 'creator.name',
        },
      ],
      pages: [
        {
          chats: [
            {
              chatId: 'chat-id',
              accountId: 'unipile-account-id',
              type: 'ONE_TO_ONE',
              attendeeProviderId: 'provider-messaging-id',
            },
          ],
          nextCursor: null,
        },
      ],
    });
    await expect(
      mismatch.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'CONTEXT_CHANGED' });

    const rebound = buildHarness({ account: null });
    await expect(
      rebound.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'ACCOUNT_UNAVAILABLE' });
  });

  it('traverses multiple pages, rejects cycles and rejects nonterminal page 100', async () => {
    const complete = buildHarness({
      pages: [
        { chats: [], nextCursor: 'page-2' },
        { chats: [], nextCursor: null },
      ],
    });
    await expect(
      complete.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toMatchObject({ status: 'READY', actionKind: 'START_CHAT' });
    expect(complete.unipileClient.listChats).toHaveBeenCalledTimes(2);

    const cycle = buildHarness({
      pages: [
        { chats: [], nextCursor: 'again' },
        { chats: [], nextCursor: 'again' },
      ],
    });
    await expect(
      cycle.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'TRAVERSAL_INCOMPLETE' });

    const truncated = buildHarness({
      pages: Array.from({ length: 100 }, (_, index) => ({
        chats: [],
        nextCursor: index === 99 ? 'nonterminal-101' : `page-${index + 2}`,
      })),
    });
    await expect(
      truncated.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'TRAVERSAL_INCOMPLETE' });
  });

  it('materialises an unsynced provider conversation as a verified reply', async () => {
    const harness = buildHarness({
      pages: [
        {
          chats: [
            {
              chatId: 'chat-id',
              accountId: 'unipile-account-id',
              type: 'ONE_TO_ONE',
              attendeeProviderId: 'provider-messaging-id',
            },
          ],
          nextCursor: null,
        },
      ],
    });
    harness.unipileClient.getChat = jest.fn().mockResolvedValue({
      chatId: 'chat-id',
      accountId: 'unipile-account-id',
      accountType: 'INSTAGRAM',
      type: 'ONE_TO_ONE',
      attendeeProviderId: 'provider-messaging-id',
      name: 'creator.name',
      timestamp: '2026-09-11T14:49:49.090Z',
    });
    harness.projectionService.upsertVerifiedChat.mockResolvedValue({
      conversationRecordId: 'materialised-conversation-id',
    });

    await expect(
      harness.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toMatchObject({ status: 'READY', actionKind: 'REPLY' });

    expect(harness.projectionService.upsertVerifiedChat).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: expect.objectContaining({ chatId: 'chat-id' }),
        creatorRecordId: creator.id,
        restoreDeletedConversation: false,
      }),
    );
    expect(harness.unipileClient.startChat).not.toHaveBeenCalled();
    expect(harness.unipileClient.sendMessage).not.toHaveBeenCalled();
  });

  it('keeps an operator-deleted conversation deleted instead of resurrecting it', async () => {
    const harness = buildHarness({
      pages: [
        {
          chats: [
            {
              chatId: 'chat-id',
              accountId: 'unipile-account-id',
              type: 'ONE_TO_ONE',
              attendeeProviderId: 'provider-messaging-id',
            },
          ],
          nextCursor: null,
        },
      ],
    });
    harness.unipileClient.getChat = jest.fn().mockResolvedValue({
      chatId: 'chat-id',
      accountId: 'unipile-account-id',
      accountType: 'INSTAGRAM',
      type: 'ONE_TO_ONE',
      attendeeProviderId: 'provider-messaging-id',
      name: 'creator.name',
      timestamp: '2026-09-11T14:49:49.090Z',
    });
    harness.projectionService.upsertVerifiedChat.mockRejectedValue(
      new ConflictException(INSTAGRAM_CONVERSATION_DELETED_MESSAGE),
    );

    await expect(
      harness.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'CONVERSATION_DELETED' });
  });

  it('does not map an unrelated conflict to the deleted-conversation code', async () => {
    const harness = buildHarness({
      pages: [
        {
          chats: [
            {
              chatId: 'chat-id',
              accountId: 'unipile-account-id',
              type: 'ONE_TO_ONE',
              attendeeProviderId: 'provider-messaging-id',
            },
          ],
          nextCursor: null,
        },
      ],
    });
    harness.projectionService.upsertVerifiedChat.mockRejectedValue(
      new ConflictException('Instagram conversation does not match approval'),
    );

    // Only the shared, identity-checked refusal may surface as deleted.
    await expect(
      harness.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'RECIPIENT_UNAVAILABLE' });
  });

  it('blocks multiple canonical raw-handle matches and a conflicting duplicate provider chat', async () => {
    const multipleCreators = buildHarness({
      allCreators: [creator, { ...creator, id: 'creator-id-2' }],
    });
    await expect(
      multipleCreators.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'CREATOR_AMBIGUOUS' });

    const conflictingChat = buildHarness({
      localChats: [
        {
          id: 'conversation-id',
          providerConversationId: 'chat-id',
          recipientIgsid: 'provider-messaging-id',
          recipientUsername: 'creator.name',
        },
      ],
      pages: [
        {
          chats: [
            {
              chatId: 'chat-id',
              accountId: 'unipile-account-id',
              type: 'ONE_TO_ONE',
              attendeeProviderId: 'provider-messaging-id',
            },
            {
              chatId: 'chat-id',
              accountId: 'unipile-account-id',
              type: 'ONE_TO_ONE',
              attendeeProviderId: 'different-messaging-id',
            },
          ],
          nextCursor: null,
        },
      ],
    });
    await expect(
      conflictingChat.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'CHAT_AMBIGUOUS' });
  });

  it('blocks a matching local chat when its verified messaging identity disagrees', async () => {
    const harness = buildHarness({
      localChats: [
        {
          id: 'conversation-id',
          providerConversationId: 'chat-id',
          recipientIgsid: 'provider-id',
          recipientUsername: 'creator.name',
        },
      ],
      pages: [
        {
          chats: [
            {
              chatId: 'chat-id',
              accountId: 'unipile-account-id',
              type: 'ONE_TO_ONE',
              attendeeProviderId: 'provider-messaging-id',
            },
          ],
          nextCursor: null,
        },
      ],
    });

    await expect(
      harness.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'CONTEXT_CHANGED' });
  });

  it('does not classify hidden local evidence as START when provider traversal is empty', async () => {
    const harness = buildHarness({
      internalLocalChats: [
        {
          id: 'hidden-conversation-id',
          providerConversationId: 'chat-id',
          recipientIgsid: 'provider-messaging-id',
          recipientUsername: 'creator.name',
        },
      ],
      readableLocalChats: [],
      pages: [{ chats: [], nextCursor: null }],
    });

    await expect(
      harness.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'CONTEXT_CHANGED' });
    expect(harness.creatorRepository.insert).not.toHaveBeenCalled();
    expect(harness.unipileClient.startChat).not.toHaveBeenCalled();
  });

  it('keeps the target key stable across a renamed handle and blocks an unresolved START receipt now classified as REPLY', async () => {
    const withReply = (rawHandle: string) =>
      buildHarness({
        localChats: [
          {
            id: 'conversation-id',
            providerConversationId: 'chat-id',
            recipientIgsid: 'provider-messaging-id',
            recipientUsername: rawHandle,
          },
        ],
        pages: [
          {
            chats: [
              {
                chatId: 'chat-id',
                accountId: 'unipile-account-id',
                type: 'ONE_TO_ONE',
                attendeeProviderId: 'provider-messaging-id',
              },
            ],
            nextCursor: null,
          },
        ],
        profile: {
          username: rawHandle,
          providerId: 'provider-id',
          providerMessagingId: 'provider-messaging-id',
        },
      });
    const beforeRename = withReply('creator.name');
    const afterRename = withReply('renamed.creator');

    await expect(
      beforeRename.service.prepare(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      ),
    ).resolves.toMatchObject({ status: 'READY', actionKind: 'REPLY' });
    await expect(
      afterRename.service.prepare(
        { recipient: { rawHandle: 'renamed.creator' } },
        context,
      ),
    ).resolves.toMatchObject({ status: 'READY', actionKind: 'REPLY' });
    expect(
      beforeRename.budgetService.isTargetAvailable.mock.calls[0][0]
        .targetFingerprint,
    ).toBe(
      afterRename.budgetService.isTargetAvailable.mock.calls[0][0]
        .targetFingerprint,
    );
    expect(
      beforeRename.budgetService.isTargetAvailable.mock.calls[0][0]
        .legacyTargetFingerprints,
    ).not.toEqual(
      afterRename.budgetService.isTargetAvailable.mock.calls[0][0]
        .legacyTargetFingerprints,
    );

    const unresolvedStart = withReply('renamed.creator');
    unresolvedStart.budgetService.isTargetAvailable.mockResolvedValueOnce(
      false,
    );
    await expect(
      unresolvedStart.service.prepare(
        { recipient: { rawHandle: 'renamed.creator' } },
        context,
      ),
    ).resolves.toEqual({ status: 'BLOCKED', code: 'TARGET_LOCKED' });
    expect(unresolvedStart.budgetService.reserve).not.toHaveBeenCalled();
  });

  it('changes its fingerprint when verified provider identity changes', async () => {
    const first = buildHarness();
    const second = buildHarness({
      profile: {
        username: 'creator.name',
        providerId: 'provider-id-2',
        providerMessagingId: 'provider-messaging-id-2',
      },
    });
    const firstResult = await first.service.prepare(
      { recipient: { rawHandle: 'creator.name' } },
      context,
    );
    const secondResult = await second.service.prepare(
      { recipient: { rawHandle: 'creator.name' } },
      context,
    );

    expect(firstResult).toMatchObject({ status: 'READY' });
    expect(secondResult).toMatchObject({ status: 'READY' });
    if (firstResult.status === 'READY' && secondResult.status === 'READY') {
      expect(secondResult.preparationFingerprint).not.toBe(
        firstResult.preparationFingerprint,
      );
    }
  });
});

describe('InstagramMessageRecipientService preparation digest extraction parity', () => {
  // Golden hashes from the original ordered array: the existing Creator keeps
  // its case-sensitive source value; the new Creator uses the canonical handle.
  it.each([
    {
      creatorRecordId: null,
      fingerprint:
        '816cb584a6675f2696da195966e7d79b4d486be3922f1fa6cafa3ee3b6ce6526',
    },
    {
      creatorRecordId: 'creator-id',
      fingerprint:
        '6ceee5828c8b2fb7428fbc2f012f37210b4052a605fa00c972bda4772caaa034',
    },
  ])(
    'preserves the original ordered fingerprint with Creator $creatorRecordId',
    async ({ creatorRecordId, fingerprint }) => {
      const harness = buildHarness({
        allCreators: creatorRecordId ? [creator] : [],
        readableCreator: creatorRecordId ? creator : null,
      });
      const resolved = await harness.service.resolve(
        { recipient: { rawHandle: 'creator.name' } },
        context,
      );
      expect(resolved.creatorRecordId).toBe(creatorRecordId);
      expect(resolved.preparationFingerprint).toBe(fingerprint);
    },
  );
});

describe('InstagramMessageRecipientService canonical scan under write lock', () => {
  const preparation = { recipient: { rawHandle: 'creator.name' } };
  const manager = { queryRunner: { id: 'same-write-runner' } };

  it('uses the transaction manager for minimal discovery and role verification without provider calls', async () => {
    const h = buildHarness();
    const graph = await h.service.resolve(preparation, context);
    h.internalCreatorRepository.find.mockClear();
    h.creatorRepository.findOne.mockClear();
    h.unipileClient.getInstagramMessagingProfile.mockClear();
    h.unipileClient.listChats.mockClear();
    const beforeQuery = jest.fn(async () => undefined);
    await h.service.assertCreatorMatchesUnderLock(
      graph,
      context,
      manager as never,
      beforeQuery,
    );
    expect(h.internalCreatorRepository.find).toHaveBeenCalledWith(
      {
        where: { deletedAt: expect.anything() },
        select: {
          id: true,
          instagramUsername: true,
          instagramUrl: true,
          instagramLinkPrimaryLinkUrl: true,
        },
      },
      manager,
    );
    expect(h.creatorRepository.findOne).toHaveBeenCalledWith(
      {
        where: { id: creator.id, deletedAt: expect.anything() },
        select: {
          id: true,
          instagramUsername: true,
          instagramUrl: true,
          instagramLinkPrimaryLinkUrl: true,
        },
      },
      manager,
    );
    expect(beforeQuery).toHaveBeenCalledTimes(2);
    expect(h.unipileClient.getInstagramMessagingProfile).not.toHaveBeenCalled();
    expect(h.unipileClient.listChats).not.toHaveBeenCalled();
  });

  it('rejects a new match since preparation instead of adopting it', async () => {
    const h = buildHarness({ allCreators: [] });
    const graph = await h.service.resolve(preparation, context);
    expect(graph.creatorRecordId).toBeNull();
    h.internalCreatorRepository.find.mockResolvedValueOnce([creator]);
    await expect(
      h.service.assertCreatorMatchesUnderLock(
        graph,
        context,
        manager as never,
        async () => undefined,
      ),
    ).rejects.toThrow('CONTEXT_CHANGED');
  });

  it.each([
    'hidden',
    'deleted',
    'renamed',
    'source drift',
    'duplicate',
    'contradictory',
  ])('rejects a %s canonical candidate', async (mutation) => {
    const h = buildHarness();
    const graph = await h.service.resolve(preparation, context);
    if (mutation === 'hidden')
      h.creatorRepository.findOne.mockResolvedValueOnce(null);
    if (mutation === 'deleted')
      h.internalCreatorRepository.find.mockResolvedValueOnce([]);
    if (mutation === 'renamed')
      h.internalCreatorRepository.find.mockResolvedValueOnce([
        { ...creator, instagramUsername: 'other' },
      ]);
    if (mutation === 'source drift')
      h.creatorRepository.findOne.mockResolvedValueOnce({
        ...creator,
        instagramUsername: 'creator.name',
      });
    if (mutation === 'duplicate')
      h.internalCreatorRepository.find.mockResolvedValueOnce([
        creator,
        { ...creator, id: 'second' },
      ]);
    if (mutation === 'contradictory')
      h.internalCreatorRepository.find.mockResolvedValueOnce([
        { ...creator, instagramUrl: 'https://instagram.com/other' },
      ]);
    await expect(
      h.service.assertCreatorMatchesUnderLock(
        graph,
        context,
        manager as never,
        async () => undefined,
      ),
    ).rejects.toThrow();
  });

  it.each([
    'objectDenied',
    'instagramUsernameUpdateDenied',
    'returningIdReadDenied',
  ] as const)(
    'rechecks %s after preparation before allowing a Creator insert',
    async (permission) => {
      const h = buildHarness({ allCreators: [] });
      const graph = await h.service.resolve(preparation, context);
      Object.assign(h.creatorRepository, buildCreatorPermissions(permission));
      await expect(
        h.service.assertCreatorMatchesUnderLock(
          graph,
          context,
          manager as never,
          async () => undefined,
        ),
      ).rejects.toThrow('RECIPIENT_UNAVAILABLE');
      expect(h.creatorRepository.insert).not.toHaveBeenCalled();
    },
  );
});
