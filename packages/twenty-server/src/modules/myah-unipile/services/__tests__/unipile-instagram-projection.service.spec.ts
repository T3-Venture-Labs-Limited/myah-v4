import { ConflictException } from '@nestjs/common';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { FieldActorSource } from 'twenty-shared/types';

type Workspace = { id: string };

type Binding = {
  id: string;
  workspaceId: string;
  workspaceInstagramAccountRecordId: string;
  unipileAccountId: string;
  instagramUserId: string;
  status: 'ACTIVE';
  deactivatedAt: null;
};

type Chat = {
  chatId: string;
  accountId: string;
  accountType: 'INSTAGRAM';
  type: 'ONE_TO_ONE';
  attendeeProviderId: string;
  name: string | null;
  timestamp: string | null;
};

type Message = {
  messageId: string;
  accountId: string;
  chatId: string;
  senderId: string;
  isSender?: 0 | 1;
  text: string | null;
  timestamp: string | null;
  hasAttachments: boolean;
  attachmentCount: number;
};

type DeliveryState = 'UNKNOWN' | 'RECEIVED' | 'SENT' | 'DELIVERED' | 'READ';

type UnipileInstagramProjectionService = {
  upsertVerifiedChat: (input: {
    workspace: Workspace;
    binding: Binding;
    chat: Chat;
  }) => Promise<{ conversationRecordId: string }>;
  upsertVerifiedMessage: (input: {
    workspace: Workspace;
    binding: Binding;
    chat: Chat;
    conversationRecordId: string;
    message: Message;
    deliveryState?: DeliveryState;
    deliveryStateUpdatedAt?: string | null;
  }) => Promise<{
    messageRecordId: string;
    direction: 'INBOUND' | 'OUTBOUND' | 'UNKNOWN';
    deliveryState: DeliveryState;
  }>;
  markCompletedMessageSync: (input: {
    workspace: Workspace;
    binding: Binding;
    conversationRecordId: string;
    completedMessageSyncAt: string;
  }) => Promise<void>;
  markCompletedChatSync: (input: {
    workspace: Workspace;
    binding: Binding;
    workspaceInstagramAccountRecordId: string;
    completedChatSyncAt: string;
  }) => Promise<void>;
};

type UnipileInstagramProjectionServiceModule = {
  UnipileInstagramProjectionService: new (
    globalWorkspaceOrmManager: {
      executeInWorkspaceContext: jest.Mock;
      getGlobalWorkspaceDataSource: jest.Mock;
    },
    accountFinalizationLock: {
      withLock: jest.Mock;
    },
  ) => UnipileInstagramProjectionService;
};

const loadProjectionServiceModule = ():
  | UnipileInstagramProjectionServiceModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-instagram-projection.service') as UnipileInstagramProjectionServiceModule;
  } catch {
    return undefined;
  }
};

const workspace: Workspace = { id: '20202020-1c25-4d02-bf25-6aeccf7ea419' };
const binding: Binding = {
  id: 'binding-id',
  workspaceId: workspace.id,
  workspaceInstagramAccountRecordId: '5c833949-57b8-4aa2-8d8c-24d10cecf6ec',
  unipileAccountId: 'unipile-account-123',
  instagramUserId: '17841400000000001',
  status: 'ACTIVE',
  deactivatedAt: null,
};
const chat: Chat = {
  chatId: 'unipile-chat-123',
  accountId: binding.unipileAccountId,
  accountType: 'INSTAGRAM',
  type: 'ONE_TO_ONE',
  attendeeProviderId: '17841400000000002',
  name: 'Alex Creator',
  timestamp: '2026-09-04T12:30:00.000Z',
};
const inboundMessage: Message = {
  messageId: 'unipile-message-123',
  accountId: binding.unipileAccountId,
  chatId: chat.chatId,
  senderId: chat.attendeeProviderId,
  text: null,
  timestamp: '2026-09-04T12:31:00.000Z',
  hasAttachments: true,
  attachmentCount: 2,
};
const queryOptions = { shouldBypassPermissionChecks: true };

const createProjectionService = (
  query: jest.Mock,
  lockedBinding: Binding | null = binding,
) => {
  const getGlobalWorkspaceDataSource = jest.fn().mockResolvedValue({ query });
  const executeInWorkspaceContext = jest
    .fn()
    .mockImplementation(async (callback: () => Promise<unknown>) => callback());
  const bindingRepository = {
    findOne: jest.fn().mockResolvedValue(lockedBinding),
  };
  const lockedManager = {
    getRepository: jest.fn().mockReturnValue(bindingRepository),
  };
  const withLock = jest
    .fn()
    .mockImplementation(
      async (
        _scope: unknown,
        callback: (manager: typeof lockedManager) => Promise<unknown>,
      ) => callback(lockedManager),
    );
  const projectionServiceModule = loadProjectionServiceModule();

  expect(projectionServiceModule).toBeDefined();

  if (!projectionServiceModule) {
    return undefined;
  }

  return {
    service: new projectionServiceModule.UnipileInstagramProjectionService(
      {
        executeInWorkspaceContext,
        getGlobalWorkspaceDataSource,
      },
      { withLock },
    ),
    bindingRepository,
    executeInWorkspaceContext,
    getGlobalWorkspaceDataSource,
    withLock,
  };
};

const findQuery = (query: jest.Mock, fragment: string) => {
  const call = query.mock.calls.find(
    ([sql]) => typeof sql === 'string' && sql.includes(fragment),
  );

  expect(call).toBeDefined();

  return call as [string, unknown[], unknown, unknown];
};

const expectSystemWorkspaceContext = (subject: {
  executeInWorkspaceContext: jest.Mock;
  getGlobalWorkspaceDataSource: jest.Mock;
}) => {
  expect(subject.executeInWorkspaceContext).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({ type: 'system', workspace }),
  );
  expect(subject.getGlobalWorkspaceDataSource).toHaveBeenCalledTimes(1);
};

describe('UnipileInstagramProjectionService', () => {
  let providerFetch: jest.SpyInstance;

  beforeEach(() => {
    providerFetch = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(
        new Error('Provider calls are not part of projection'),
      );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('inserts a verified one-to-one Instagram chat under an account-scoped advisory lock', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    const result = await subject.service.upsertVerifiedChat({
      workspace,
      binding,
      chat,
    });
    const { conversationRecordId } = result;

    expect(result).toEqual({ conversationRecordId });
    expect(conversationRecordId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [lockSql, lockValues] = findQuery(query, 'pg_advisory_xact_lock');
    const [selectSql, selectValues] = findQuery(
      query,
      `FROM "${schemaName}"."_myahSocialConversation"`,
    );
    const [insertSql, insertValues, , insertOptions] = findQuery(
      query,
      `INSERT INTO "${schemaName}"."_myahSocialConversation"`,
    );

    expectSystemWorkspaceContext(subject);
    expect(subject.withLock).toHaveBeenCalledWith(
      {
        workspaceId: binding.workspaceId,
        unipileAccountId: binding.unipileAccountId,
        instagramUserId: binding.instagramUserId,
      },
      expect.any(Function),
    );
    expect(subject.bindingRepository.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: binding.id,
        status: 'ACTIVE',
        deactivatedAt: expect.anything(),
      }),
    });
    expect(
      subject.bindingRepository.findOne.mock.invocationCallOrder[0],
    ).toBeLessThan(
      subject.getGlobalWorkspaceDataSource.mock.invocationCallOrder[0],
    );
    expect(lockSql).toContain('pg_advisory_xact_lock');
    expect(lockValues.map(String).join(' ')).toContain(
      binding.workspaceInstagramAccountRecordId,
    );
    expect(lockValues.map(String).join(' ')).toContain(chat.chatId);
    expect(selectSql).toContain('"provider" = $1');
    expect(selectSql).toContain('"instagramAccountId" = $2');
    expect(selectSql).toContain('"providerConversationId" = $3');
    expect(selectSql).toContain('"deletedAt" IS NULL');
    expect(selectValues).toEqual([
      'UNIPILE',
      binding.workspaceInstagramAccountRecordId,
      chat.chatId,
    ]);
    expect(insertSql).toContain('"recipientIgsid"');
    expect(insertSql).toContain('"recipientDisplayName"');
    expect(insertSql).toContain('"name"');
    expect(insertSql).toContain('"label"');
    expect(insertSql).toContain('"lifecycle"');
    expect(insertSql).not.toContain('"creatorId"');
    expect(insertValues).toEqual(
      expect.arrayContaining([
        conversationRecordId,
        'UNIPILE',
        binding.workspaceInstagramAccountRecordId,
        chat.chatId,
        chat.attendeeProviderId,
        chat.name,
        'ACTIVE',
        FieldActorSource.SYSTEM,
      ]),
    );
    expect(insertOptions).toEqual(queryOptions);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('blocks every projection write when the finalization lock cannot reread its exact active binding', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const subject = createProjectionService(query, null);

    if (!subject) {
      return;
    }

    const writes = [
      () => subject.service.upsertVerifiedChat({ workspace, binding, chat }),
      () =>
        subject.service.upsertVerifiedMessage({
          workspace,
          binding,
          chat,
          conversationRecordId: 'conversation-record-id',
          message: inboundMessage,
        }),
      () =>
        subject.service.markCompletedMessageSync({
          workspace,
          binding,
          conversationRecordId: 'conversation-record-id',
          completedMessageSyncAt: '2026-09-04T12:32:00.000Z',
        }),
      () =>
        subject.service.markCompletedChatSync({
          workspace,
          binding,
          workspaceInstagramAccountRecordId:
            binding.workspaceInstagramAccountRecordId,
          completedChatSyncAt: '2026-09-04T12:32:00.000Z',
        }),
    ];

    for (const write of writes) {
      await expect(write()).rejects.toThrow();
    }

    expect(subject.withLock).toHaveBeenCalledTimes(writes.length);
    expect(subject.bindingRepository.findOne).toHaveBeenCalledTimes(
      writes.length,
    );
    expect(subject.getGlobalWorkspaceDataSource).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('replays an active chat without inserting a duplicate or changing its creator', async () => {
    const conversationRecordId = 'bb6b09e6-a71f-43d8-8e3c-39874f2ba54a';
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: conversationRecordId }])
      .mockResolvedValueOnce([]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedChat({ workspace, binding, chat }),
    ).resolves.toEqual({ conversationRecordId });

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [updateSql, updateValues, , updateOptions] = findQuery(
      query,
      `UPDATE "${schemaName}"."_myahSocialConversation"`,
    );

    expect(updateSql).toContain('"recipientIgsid"');
    expect(updateSql).toContain('"recipientDisplayName"');
    expect(updateSql).toContain('"name"');
    expect(updateSql).toContain('"label"');
    expect(updateSql).toContain('"lifecycle"');
    expect(updateSql).not.toContain('"creatorId"');
    expect(updateSql).toContain('WHERE "id"');
    expect(updateValues).toEqual(
      expect.arrayContaining([
        chat.attendeeProviderId,
        chat.name,
        'ACTIVE',
        FieldActorSource.SYSTEM,
        conversationRecordId,
      ]),
    );
    expect(updateOptions).toEqual(queryOptions);
    expect(
      query.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO'),
      ),
    ).toHaveLength(0);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('restores the exact soft-deleted chat instead of inserting a second record', async () => {
    const conversationRecordId = 'bb6b09e6-a71f-43d8-8e3c-39874f2ba54a';
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: conversationRecordId }])
      .mockResolvedValueOnce([]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedChat({ workspace, binding, chat }),
    ).resolves.toEqual({ conversationRecordId });

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [restoreSql, restoreValues] = findQuery(
      query,
      `UPDATE "${schemaName}"."_myahSocialConversation"`,
    );

    expect(restoreSql).toContain('"deletedAt" = NULL');
    expect(restoreSql).toContain('WHERE "id"');
    expect(restoreValues).toEqual(
      expect.arrayContaining([conversationRecordId, FieldActorSource.SYSTEM]),
    );
    expect(
      query.mock.calls.filter(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO'),
      ),
    ).toHaveLength(0);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['different account', { ...chat, accountId: 'unipile-account-other' }],
    ['non-Instagram chat', { ...chat, accountType: 'WHATSAPP' }],
    ['non-one-to-one chat', { ...chat, type: 'GROUP' }],
    ['missing attendee', { ...chat, attendeeProviderId: '' }],
  ])(
    'rejects a %s chat before acquiring a lock or writing',
    async (_, invalidChat) => {
      const query = jest.fn();
      const subject = createProjectionService(query);

      if (!subject) {
        return;
      }

      await expect(
        subject.service.upsertVerifiedChat({
          workspace,
          binding,
          chat: invalidChat as Chat,
        }),
      ).rejects.toThrow(ConflictException);

      expect(query).not.toHaveBeenCalled();
      expect(subject.getGlobalWorkspaceDataSource).not.toHaveBeenCalled();
      expect(providerFetch).not.toHaveBeenCalled();
    },
  );

  it('projects a media-only attendee message without provider attachment payloads', async () => {
    const conversationRecordId = 'bb6b09e6-a71f-43d8-8e3c-39874f2ba54a';
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('_myahSocialConversation')) {
        return Promise.resolve([
          {
            id: conversationRecordId,
            instagramAccountId: binding.workspaceInstagramAccountRecordId,
            provider: 'UNIPILE',
            providerConversationId: chat.chatId,
          },
        ]);
      }

      return Promise.resolve([]);
    });
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    const result = await subject.service.upsertVerifiedMessage({
      workspace,
      binding,
      chat,
      conversationRecordId,
      message: inboundMessage,
    });
    const { messageRecordId } = result;

    expect(result).toEqual({
      messageRecordId,
      direction: 'INBOUND',
      deliveryState: 'RECEIVED',
    });
    expect(messageRecordId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [lockSql, lockValues] = findQuery(query, 'pg_advisory_xact_lock');
    const [conversationSql, conversationValues] = findQuery(
      query,
      `FROM "${schemaName}"."_myahSocialConversation"`,
    );
    const [insertSql, insertValues, , insertOptions] = findQuery(
      query,
      `INSERT INTO "${schemaName}"."_myahSocialMessage"`,
    );

    expectSystemWorkspaceContext(subject);
    expect(lockSql).toContain('pg_advisory_xact_lock');
    expect(lockValues.map(String).join(' ')).toContain(conversationRecordId);
    expect(lockValues.map(String).join(' ')).toContain(
      inboundMessage.messageId,
    );
    expect(conversationSql).toContain('"id" = $1');
    expect(conversationSql).toContain('"instagramAccountId" = $2');
    expect(conversationSql).toContain('"provider" = $3');
    expect(conversationSql).toContain('"providerConversationId" = $4');
    expect(conversationSql).toContain('"deletedAt" IS NULL');
    expect(conversationValues).toEqual([
      conversationRecordId,
      binding.workspaceInstagramAccountRecordId,
      'UNIPILE',
      chat.chatId,
    ]);
    expect(insertSql).toContain('"conversationId"');
    expect(insertSql).toContain('"providerMessageId"');
    expect(insertSql).toContain('"direction"');
    expect(insertSql).toContain('"deliveryState"');
    expect(insertSql).toContain('"hasAttachments"');
    expect(insertSql).toContain('"attachmentCount"');
    expect(insertSql).not.toContain('attachmentUrl');
    expect(insertSql).not.toContain('attachmentPayload');
    expect(insertSql).not.toContain('rawPayload');
    expect(insertValues).toEqual(
      expect.arrayContaining([
        messageRecordId,
        conversationRecordId,
        'UNIPILE',
        inboundMessage.messageId,
        inboundMessage.text,
        'INBOUND',
        'RECEIVED',
        inboundMessage.hasAttachments,
        inboundMessage.attachmentCount,
        FieldActorSource.SYSTEM,
      ]),
    );
    expect(insertOptions).toEqual(queryOptions);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('uses verified Unipile self-sender evidence for outbound messages while retaining identity fallback', async () => {
    const conversationRecordId = 'bb6b09e6-a71f-43d8-8e3c-39874f2ba54a';
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('_myahSocialConversation')) {
        return Promise.resolve([
          {
            id: conversationRecordId,
            instagramAccountId: binding.workspaceInstagramAccountRecordId,
            provider: 'UNIPILE',
            providerConversationId: chat.chatId,
          },
        ]);
      }
      if (sql.includes('_myahSocialMessage')) {
        return Promise.resolve([
          { id: 'b7037d71-3486-4767-80a1-d0f1e3209985' },
        ]);
      }

      return Promise.resolve([]);
    });
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedMessage({
        workspace,
        binding,
        chat,
        conversationRecordId,
        message: {
          ...inboundMessage,
          senderId: '17841400000000003',
          isSender: 1,
        },
      }),
    ).resolves.toMatchObject({ direction: 'OUTBOUND', deliveryState: 'SENT' });
    await expect(
      subject.service.upsertVerifiedMessage({
        workspace,
        binding,
        chat,
        conversationRecordId,
        message: {
          ...inboundMessage,
          messageId: 'unipile-message-identity-fallback',
          senderId: binding.instagramUserId,
        },
      }),
    ).resolves.toMatchObject({ direction: 'OUTBOUND', deliveryState: 'SENT' });
    await expect(
      subject.service.upsertVerifiedMessage({
        workspace,
        binding,
        chat,
        conversationRecordId,
        message: {
          ...inboundMessage,
          messageId: 'unipile-message-unknown',
          senderId: '17841400000000003',
          isSender: 0,
        },
      }),
    ).resolves.toMatchObject({
      direction: 'UNKNOWN',
      deliveryState: 'UNKNOWN',
    });

    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('idempotently promotes an existing unknown message to outbound from verified self-sender evidence', async () => {
    const conversationRecordId = 'bb6b09e6-a71f-43d8-8e3c-39874f2ba54a';
    const messageRecordId = 'b7037d71-3486-4767-80a1-d0f1e3209985';
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('_myahSocialConversation')) {
        return Promise.resolve([{ id: conversationRecordId }]);
      }
      if (sql.includes('_myahSocialMessage') && sql.includes('SELECT')) {
        return Promise.resolve([
          {
            id: messageRecordId,
            deliveryState: 'UNKNOWN',
            deliveryStateUpdatedAt: inboundMessage.timestamp,
          },
        ]);
      }

      return Promise.resolve([]);
    });
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedMessage({
        workspace,
        binding,
        chat,
        conversationRecordId,
        message: {
          ...inboundMessage,
          senderId: 'provider-specific-self-sender',
          isSender: 1,
        },
      }),
    ).resolves.toEqual({
      messageRecordId,
      direction: 'OUTBOUND',
      deliveryState: 'SENT',
    });

    expect(
      findQuery(
        query,
        `UPDATE "${getWorkspaceSchemaName(workspace.id)}"."_myahSocialMessage"`,
      )[1],
    ).toEqual(expect.arrayContaining(['OUTBOUND', 'SENT', messageRecordId]));
    expect(
      query.mock.calls.some(
        ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO'),
      ),
    ).toBe(false);
  });

  it.each([
    ['self sender marked inbound', chat.attendeeProviderId, 1],
    ['owner marked inbound', binding.instagramUserId, 0],
  ])(
    'rejects a contradictory %s flag before writing',
    async (_name, senderId, isSender) => {
      const query = jest.fn();
      const subject = createProjectionService(query);

      if (!subject) {
        return;
      }

      await expect(
        subject.service.upsertVerifiedMessage({
          workspace,
          binding,
          chat,
          conversationRecordId: 'conversation-record-id',
          message: { ...inboundMessage, senderId, isSender: isSender as 0 | 1 },
        }),
      ).rejects.toThrow(ConflictException);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('does not regress an existing delivery state when a replay is older and lower precedence', async () => {
    const conversationRecordId = 'bb6b09e6-a71f-43d8-8e3c-39874f2ba54a';
    const messageRecordId = 'b7037d71-3486-4767-80a1-d0f1e3209985';
    const deliveredAt = '2026-09-04T12:35:00.000Z';
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('_myahSocialConversation')) {
        return Promise.resolve([
          {
            id: conversationRecordId,
            instagramAccountId: binding.workspaceInstagramAccountRecordId,
            provider: 'UNIPILE',
            providerConversationId: chat.chatId,
          },
        ]);
      }
      if (sql.includes('_myahSocialMessage') && sql.includes('SELECT')) {
        return Promise.resolve([
          {
            id: messageRecordId,
            deliveryState: 'DELIVERED',
            deliveryStateUpdatedAt: deliveredAt,
          },
        ]);
      }
      if (sql.includes('_myahSocialMessage')) {
        return Promise.resolve([{ id: messageRecordId }]);
      }

      return Promise.resolve([]);
    });
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedMessage({
        workspace,
        binding,
        chat,
        conversationRecordId,
        message: inboundMessage,
        deliveryState: 'SENT',
        deliveryStateUpdatedAt: '2026-09-04T12:34:00.000Z',
      }),
    ).resolves.toEqual({
      messageRecordId,
      direction: 'INBOUND',
      deliveryState: 'DELIVERED',
    });

    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('advances delivery only when the incoming state is higher precedence at the same or newer time', async () => {
    const conversationRecordId = 'bb6b09e6-a71f-43d8-8e3c-39874f2ba54a';
    const messageRecordId = 'b7037d71-3486-4767-80a1-d0f1e3209985';
    const sentAt = '2026-09-04T12:34:00.000Z';
    const readAt = '2026-09-04T12:35:00.000Z';
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('_myahSocialConversation')) {
        return Promise.resolve([
          {
            id: conversationRecordId,
            instagramAccountId: binding.workspaceInstagramAccountRecordId,
            provider: 'UNIPILE',
            providerConversationId: chat.chatId,
          },
        ]);
      }
      if (sql.includes('_myahSocialMessage') && sql.includes('SELECT')) {
        return Promise.resolve([
          {
            id: messageRecordId,
            deliveryState: 'SENT',
            deliveryStateUpdatedAt: sentAt,
          },
        ]);
      }
      if (sql.includes('_myahSocialMessage')) {
        return Promise.resolve([{ id: messageRecordId }]);
      }

      return Promise.resolve([]);
    });
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedMessage({
        workspace,
        binding,
        chat,
        conversationRecordId,
        message: inboundMessage,
        deliveryState: 'READ',
        deliveryStateUpdatedAt: readAt,
      }),
    ).resolves.toEqual({
      messageRecordId,
      direction: 'INBOUND',
      deliveryState: 'READ',
    });

    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('rejects an unverified message and conversation before writing a message', async () => {
    const conversationRecordId = 'bb6b09e6-a71f-43d8-8e3c-39874f2ba54a';
    const query = jest.fn();
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.upsertVerifiedMessage({
        workspace,
        binding,
        chat,
        conversationRecordId,
        message: { ...inboundMessage, accountId: 'unipile-account-other' },
      }),
    ).rejects.toThrow(ConflictException);

    expect(query).not.toHaveBeenCalled();
    expect(subject.getGlobalWorkspaceDataSource).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('records a completed message high-water marker for the exact active conversation only', async () => {
    const conversationRecordId = 'bb6b09e6-a71f-43d8-8e3c-39874f2ba54a';
    const completedMessageSyncAt = '2026-09-04T12:37:00.000Z';
    const query = jest.fn().mockResolvedValue([{ id: conversationRecordId }]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.markCompletedMessageSync({
        workspace,
        conversationRecordId,
        binding,
        completedMessageSyncAt,
      }),
    ).resolves.toBeUndefined();

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [conversationSql, conversationValues, , conversationOptions] =
      findQuery(query, `UPDATE "${schemaName}"."_myahSocialConversation"`);

    expectSystemWorkspaceContext(subject);
    expect(conversationSql).toContain('"completedMessageSyncAt" = $1');
    expect(conversationSql).toContain('WHERE "id" = $');
    expect(conversationSql).toContain('"deletedAt" IS NULL');
    expect(conversationValues).toEqual(
      expect.arrayContaining([
        completedMessageSyncAt,
        conversationRecordId,
        FieldActorSource.SYSTEM,
      ]),
    );
    expect(conversationOptions).toEqual(queryOptions);
    expect(
      query.mock.calls.some(([sql]) => sql.includes('"_myahInstagramAccount"')),
    ).toBe(false);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('records a completed chat high-water marker for the exact active account only', async () => {
    const completedChatSyncAt = '2026-09-04T12:36:00.000Z';
    const query = jest.fn().mockResolvedValue([]);
    const subject = createProjectionService(query);

    if (!subject) {
      return;
    }

    await expect(
      subject.service.markCompletedChatSync({
        workspace,
        binding,
        workspaceInstagramAccountRecordId:
          binding.workspaceInstagramAccountRecordId,
        completedChatSyncAt,
      }),
    ).resolves.toBeUndefined();

    const schemaName = getWorkspaceSchemaName(workspace.id);
    const [accountSql, accountValues, , accountOptions] = findQuery(
      query,
      `UPDATE "${schemaName}"."_myahInstagramAccount"`,
    );

    expectSystemWorkspaceContext(subject);
    expect(accountSql).toContain('"completedChatSyncAt" = $1');
    expect(accountSql).toContain('WHERE "id" = $');
    expect(accountSql).toContain('"deletedAt" IS NULL');
    expect(accountValues).toEqual(
      expect.arrayContaining([
        completedChatSyncAt,
        binding.workspaceInstagramAccountRecordId,
        FieldActorSource.SYSTEM,
      ]),
    );
    expect(accountOptions).toEqual(queryOptions);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('"_myahSocialConversation"'),
      ),
    ).toBe(false);
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
