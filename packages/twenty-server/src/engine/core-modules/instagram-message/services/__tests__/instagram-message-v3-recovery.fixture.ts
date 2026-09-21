import { buildInstagramMessageV3ActionAuthority } from 'src/engine/core-modules/action-approval/definitions/instagram-message-action.definition';
import { ActionExecutionReceiptState } from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { InstagramMessageAuthorityReaderService } from '../instagram-message-authority-reader.service';
import { InstagramMessageDraftService } from '../instagram-message-draft.service';
import { InstagramMessageReceiptProjectionService } from '../instagram-message-receipt-projection.service';
import { InstagramMessageRecordAccessService } from '../instagram-message-record-access.service';
import { UnipileInstagramProjectionService } from 'src/modules/myah-unipile/services/unipile-instagram-projection.service';
import { UnipileV1ClientService } from 'src/modules/myah-unipile/services/unipile-v1-client.service';

// SQL/provider transports only: the authority, client parsers, projector, draft
// marker and destination reader are real services. Not a PostgreSQL proof.
export const createV3RecoveryFixture = (
  kind: 'START_CHAT' | 'REPLY' = 'START_CHAT',
) => {
  const id = (n: number) =>
    `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const workspaceId = id(1);
  const creatorId = id(2);
  const account = {
    id: id(3),
    workspaceId,
    workspaceInstagramAccountRecordId: id(4),
    unipileAccountId: 'account-v3',
    instagramUserId: 'sender-v3',
    status: 'ACTIVE',
    deactivatedAt: null,
  };
  const snapshot = {
    publicIdentifier: 'original.handle',
    providerId: 'profile-v3',
    providerMessagingId: 'messaging-v3',
    creatorRecordId: creatorId,
    accountBindingId: account.id,
    instagramAccountRecordId: id(4),
    unipileAccountId: account.unipileAccountId,
    instagramUserId: account.instagramUserId,
    recipientSourceValues: [
      { field: 'instagramUsername', value: 'original.handle' },
    ],
    ...(kind === 'START_CHAT'
      ? {
          actionKind: kind,
          conversationRecordId: null,
          providerChatId: null,
          attendeeProviderId: null,
        }
      : {
          actionKind: kind,
          conversationRecordId: id(8),
          providerChatId: 'chat-v3',
          attendeeProviderId: 'messaging-v3',
        }),
  };
  const authority = buildInstagramMessageV3ActionAuthority({
    workspaceId,
    initiatorUserWorkspaceId: id(5),
    threadId: null,
    interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
    interactionContextId: id(6),
    draft: {
      id: id(6),
      revision: 1,
      body: 'Immutable approved body',
      kind,
      creatorRecordId: creatorId,
      recipientUsername: snapshot.publicIdentifier,
      recipientSourceValues: snapshot.recipientSourceValues,
      conversationRecordId: snapshot.conversationRecordId,
      providerConversationId: snapshot.providerChatId,
      recipientProviderId: snapshot.providerId,
    },
    account: {
      bindingId: account.id,
      workspaceInstagramAccountRecordId: id(4),
      unipileAccountId: account.unipileAccountId,
      instagramUserId: account.instagramUserId,
    },
    evidenceLinks: [],
    instagramMessageSnapshot: snapshot,
    composerInputDigest: 'a'.repeat(64),
  });
  const binding = {
    ...authority.expectedActionBinding,
    id: id(7),
    inboundMessageId: null,
    inboundSenderIgsid: null,
    inboundDirection: null,
    inboundReceivedAt: null,
  };
  const receipt = {
    id: id(9),
    workspaceId,
    actionApprovalBindingId: binding.id,
    actionApprovalBinding: binding,
    state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
    providerMessageId: null,
    providerExternalMessageId: 'message-v3',
    providerThreadExternalId: 'chat-v3',
  };
  const chat = {
    object: 'Chat',
    id: 'chat-v3',
    account_id: account.unipileAccountId,
    account_type: 'INSTAGRAM',
    attendee_provider_id: snapshot.providerMessagingId,
    type: 0,
    name: null,
    timestamp: '2026-09-03T12:00:00.000Z',
  };
  const message = {
    object: 'Message',
    id: 'message-v3',
    account_id: account.unipileAccountId,
    chat_id: chat.id,
    sender_id: account.instagramUserId,
    text: 'Immutable approved body',
    timestamp: '2026-09-03T12:00:01.000Z',
    attachments: [],
    seen: false,
    delivered: true,
    hidden: false,
    deleted: false,
    is_event: false,
  };
  const fetch = jest.fn(async (url: string, init: RequestInit) => {
    if (init.method !== 'GET') throw new Error('No provider writes allowed');
    let body: unknown;
    if (url.includes('/messages/message-v3')) body = message;
    else if (url.includes('/chats/chat-v3/messages'))
      body = { object: 'MessageList', items: [message], cursor: null };
    else if (url.includes('/chats/chat-v3')) body = chat;
    else if (url.includes('/chats?'))
      body = { object: 'ChatList', items: [chat], cursor: null };
    else throw new Error('Unexpected provider lookup');
    return { ok: true, status: 200, json: async () => body };
  });
  const client = new UnipileV1ClientService(
    {
      assertEnabled: jest.fn(),
      config: { apiBaseUrl: 'https://fixture.example.test/api/v1/' },
    } as never,
    { get: () => 'synthetic-fixture-key' } as never,
    fetch as never,
  );
  const rows: Record<string, Array<Record<string, unknown>>> = {
    creator: [
      { id: creatorId, instagramUsername: 'changed.handle', deletedAt: null },
    ],
    myahInstagramAccount: [
      {
        id: id(4),
        status: 'ACTIVE',
        unipileAccountId: account.unipileAccountId,
        deletedAt: null,
      },
    ],
    myahInstagramReplyDraft: [
      { id: id(6), body: message.text, deletedAt: null },
    ],
    myahSocialConversation:
      kind === 'REPLY'
        ? [
            {
              id: id(8),
              creatorId,
              instagramAccountId: id(4),
              provider: 'UNIPILE',
              lifecycle: 'ACTIVE',
              providerConversationId: chat.id,
              recipientIgsid: snapshot.providerMessagingId,
              deletedAt: null,
            },
          ]
        : [],
    myahSocialMessage: [],
  };
  const query = jest.fn(async (sql: string, parameters: unknown[] = []) => {
    if (sql.includes('pg_advisory')) return [];
    const table = Object.keys(rows).find((name) => sql.includes(`"_${name}"`));
    if (!table) throw new Error(`Unexpected SQL: ${sql}`);
    const records = rows[table];
    if (sql.includes('INSERT INTO')) {
      const columns = sql
        .slice(sql.indexOf('(') + 1, sql.indexOf(')'))
        .match(/"[^"]+"/g)!
        .map((v) => v.slice(1, -1));
      records.push({
        deletedAt: null,
        ...Object.fromEntries(columns.map((c, i) => [c, parameters[i]])),
      });
      return [];
    }
    if (sql.includes('SELECT')) {
      if (table === 'myahSocialConversation')
        return records.filter(
          (r) =>
            (sql.includes('"deletedAt" IS NOT NULL')
              ? r.deletedAt != null
              : r.deletedAt == null) &&
            (sql.includes('"id" = $1')
              ? r.id === parameters[0]
              : r.instagramAccountId === parameters[1] &&
                r.providerConversationId === parameters[2]),
        );
      if (sql.includes('"deletedAt" IS NOT NULL')) return [];
      if (table === 'myahSocialMessage')
        return records.filter(
          (r) =>
            r.conversationId === parameters[0] &&
            r.providerMessageId === parameters[2],
        );
      return records.filter((r) => r.id === parameters[0]);
    }
    if (sql.includes('UPDATE')) {
      if (table === 'myahInstagramReplyDraft') {
        if (records[0]) records[0].status = 'SENT';
        return [];
      }
      if (table === 'myahSocialConversation') {
        const record = records.find((r) => r.id === parameters[9]);
        if (record && parameters[10]) record.creatorId = parameters[10];
      }
      return [];
    }
    throw new Error('Unexpected SQL operation');
  });
  const dataSource = {
    query,
    transaction: async (callback: (manager: unknown) => unknown) =>
      callback({ queryRunner: {} }),
  };
  const matches = (
    record: Record<string, unknown>,
    where: Record<string, unknown>,
  ) =>
    Object.entries(where).every(([key, value]) =>
      value !== null && typeof value === 'object'
        ? record[key] == null
        : record[key] === value,
    );
  const orm = {
    executeInWorkspaceContext: jest.fn(async (callback, context) => {
      if (context?.workspace?.id !== workspaceId)
        throw new Error('Fixture workspace authorization is unavailable');
      return callback();
    }),
    getGlobalWorkspaceDataSource: jest.fn(async () => dataSource),
    getRepository: jest.fn(async (_workspace, name: string, _role) => ({
      find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        rows[name].filter((r) => matches(r, where)),
      ),
      findOne: jest.fn(
        async ({ where }: { where: Record<string, unknown> }) =>
          rows[name].find((r) => matches(r, where)) ?? null,
      ),
    })),
  };
  const workspaceRepository = {
    findOneBy: jest.fn(async () => ({ id: workspaceId })),
  };
  const accountRepository = {
    find: jest.fn(async () => (account.status === 'ACTIVE' ? [account] : [])),
    findOne: jest.fn(async () =>
      account.status === 'ACTIVE' ? account : null,
    ),
  };
  const reader = new InstagramMessageAuthorityReaderService(
    workspaceRepository as never,
    orm as never,
    accountRepository as never,
    {} as never,
    client,
  );
  const projection = new UnipileInstagramProjectionService(
    orm as never,
    {
      withLock: async (
        _scope: unknown,
        callback: (manager: unknown) => unknown,
      ) => callback({ getRepository: () => accountRepository }),
    } as never,
    {
      ensureSourceContactInTransaction: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      isTriageSchemaProvisioned: jest.fn().mockResolvedValue(true),
      lockMigrationMarkerForSourcePersistenceInTransaction: jest
        .fn()
        .mockResolvedValue(true),
      recordInTransaction: jest.fn().mockResolvedValue(undefined),
    } as never,
  );
  const draft = new InstagramMessageDraftService(
    workspaceRepository as never,
    orm as never,
    {} as never,
    {} as never,
  );
  const writer = new InstagramMessageReceiptProjectionService(
    reader,
    accountRepository as never,
    client,
    projection,
    draft,
  );
  const receiptRepository = {
    findOne: jest.fn(async () => receipt),
    update: jest.fn(async (_where, patch) => {
      Object.assign(receipt, patch);
      return { affected: 1 };
    }),
  };
  const projector = new ActionReceiptProjectorService(
    receiptRepository as never,
    writer,
  );
  const access = new InstagramMessageRecordAccessService(
    orm as never,
    accountRepository as never,
  );
  return {
    workspaceId,
    creatorId,
    account,
    binding,
    receipt,
    authority,
    chat,
    message,
    fetch,
    client,
    rows,
    query,
    orm,
    reader,
    projection,
    draft,
    writer,
    projector,
    access,
    receiptRepository,
    accountRepository,
  };
};
