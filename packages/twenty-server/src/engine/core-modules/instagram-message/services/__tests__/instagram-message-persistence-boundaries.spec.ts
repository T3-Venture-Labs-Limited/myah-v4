import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntitySchema, IsNull, QueryResult } from 'typeorm';
import {
  FieldMetadataType,
  RelationType,
  type ObjectsPermissions,
} from 'twenty-shared/types';

import { type WorkspaceInternalContext } from 'src/engine/twenty-orm/interfaces/workspace-internal-context.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import {
  flushBufferedWorkspaceDatabaseEvents,
  runWithWorkspaceDatabaseEventBuffer,
} from 'src/engine/workspace-event-emitter/utils/workspace-database-event-buffer';
import { InstagramMessageRecipientService } from '../instagram-message-recipient.service';
import { withInstagramConversationLinkEvents } from '../instagram-message-conversation-link-events.util';
import { type ResolvedInstagramComposerGraph } from '../instagram-message-composer.types';

class MetadataOnlyDataSource extends DataSource {
  async buildTestMetadata() {
    await this.buildMetadatas();
  }
}

const creatorId = '00000000-0000-4000-8000-000000000001';
const conversationId = '00000000-0000-4000-8000-000000000002';
const rolePermissionConfig = { unionOf: ['role'] };
const context = {
  workspaceId: 'workspace-test',
  initiatorUserWorkspaceId: 'user-workspace',
  workspaceMemberId: 'member',
  rolePermissionConfig,
};
const graph = {
  normalizedHandle: 'recipient',
  creatorRecordId: creatorId,
  recipient: {
    sourceValues: [{ field: 'instagramUsername', value: 'recipient' }],
  },
} as ResolvedInstagramComposerGraph;

// Actual repository -> WorkspaceEntityManager -> query builders -> permissions,
// formatter and emitter. Only SQL execution/context metadata are fixtures. No DB
// connection is initialized; a second checkout fails the test.
const buildHarness = async (
  denial?:
    | 'read'
    | 'create'
    | 'update'
    | 'field'
    | 'RLS'
    | 'linkRead'
    | 'linkRLS'
    | 'conversationRead'
    | 'conversationRLS',
) => {
  const dataSource = new MetadataOnlyDataSource({
    type: 'postgres',
    entities: [
      new EntitySchema({
        name: 'creator',
        tableName: 'creator',
        schema: 'workspace_test',
        columns: {
          id: { type: 'uuid', primary: true },
          instagramUsername: { type: String },
          instagramUrl: { type: String, nullable: true },
          instagramLinkPrimaryLinkUrl: { type: String, nullable: true },
          instagramLinkPrimaryLinkLabel: { type: String, nullable: true },
          instagramLinkSecondaryLinks: { type: 'jsonb', nullable: true },
          deletedAt: { type: Date, nullable: true },
        },
      }),
      new EntitySchema({
        name: 'myahSocialConversation',
        tableName: '_myahSocialConversation',
        schema: 'workspace_test',
        columns: {
          id: { type: 'uuid', primary: true },
          creatorId: { type: 'uuid', nullable: true },
          instagramAccountId: { type: 'uuid' },
          providerConversationId: { type: String },
          recipientIgsid: { type: String },
          recipientUsername: { type: String },
          lifecycle: { type: String },
          provider: { type: String },
          deletedAt: { type: Date, nullable: true },
        },
      }),
    ],
  });
  await dataSource.buildTestMetadata();
  const runner = dataSource.createQueryRunner();
  Object.assign(runner, { isTransactionActive: true });
  const checkout = jest
    .spyOn(dataSource, 'createQueryRunner')
    .mockImplementation(() => {
      throw new Error('second connection checkout');
    });
  const fields = [
    ...[
      ['id', FieldMetadataType.UUID],
      ['instagramUsername', FieldMetadataType.TEXT],
      ['instagramUrl', FieldMetadataType.TEXT],
      ['instagramLink', FieldMetadataType.LINKS],
      ['deletedAt', FieldMetadataType.DATE_TIME],
    ].map(([name, type]) => ({ name, type, objectMetadataId: 'creator' })),
    ...[
      ['id', FieldMetadataType.UUID],
      ['creator', FieldMetadataType.RELATION],
      ['instagramAccountId', FieldMetadataType.UUID],
      ['providerConversationId', FieldMetadataType.TEXT],
      ['recipientIgsid', FieldMetadataType.TEXT],
      ['recipientUsername', FieldMetadataType.TEXT],
      ['lifecycle', FieldMetadataType.TEXT],
      ['provider', FieldMetadataType.TEXT],
      ['deletedAt', FieldMetadataType.DATE_TIME],
    ].map(([name, type]) => ({
      name,
      type,
      objectMetadataId: 'myahSocialConversation',
    })),
  ].map((field) => ({
    ...field,
    id: `${field.objectMetadataId}-${field.name}`,
    universalIdentifier: `${field.objectMetadataId}-${field.name}`,
    isActive: true,
    ...(field.type === FieldMetadataType.RELATION
      ? {
          relationTargetObjectMetadataId: 'creator',
          settings: { relationType: RelationType.MANY_TO_ONE },
        }
      : {}),
  }));
  const objects = ['creator', 'myahSocialConversation'].map((name) => ({
    id: name,
    universalIdentifier: name,
    nameSingular: name,
    namePlural: `${name}s`,
    isSystem: false,
    isCustom: name !== 'creator',
    fieldIds: fields
      .filter((field) => field.objectMetadataId === name)
      .map((field) => field.id),
  }));
  const maps = <T extends { id: string }>(items: T[]) => ({
    byUniversalIdentifier: Object.fromEntries(
      items.map((item) => [item.id, item]),
    ),
    universalIdentifierById: Object.fromEntries(
      items.map((item) => [item.id, item.id]),
    ),
    universalIdentifiersByApplicationId: {},
  });
  const state = {
    hasCreator: true,
    linked: false,
    committed: false,
    released: false,
    username: 'recipient' as string | null,
    url: null as string | null,
    link: null as string | null,
    conversationIds: [conversationId],
  };
  const listener = jest.fn((_name: string, _event: unknown) => {
    expect(state.committed).toBe(true);
    expect(state.released).toBe(true);
  });
  const emitter = new WorkspaceEventEmitter({
    emit: listener,
  } as unknown as EventEmitter2);
  const emitted = jest.spyOn(emitter, 'emitDatabaseBatchEvent');
  const internalContext = {
    workspaceId: context.workspaceId,
    objectIdByNameSingular: Object.fromEntries(
      objects.map((object) => [object.id, object.id]),
    ),
    flatObjectMetadataMaps: maps(objects),
    flatFieldMetadataMaps: maps(fields),
    eventEmitterService: emitter,
    coreDataSource: { getRepository: jest.fn(() => ({})) },
    userWorkspaceRoleMap: {},
    apiKeyRoleMap: { key: 'role' },
    flatRowLevelPermissionPredicateMaps: maps(
      denial === 'RLS'
        ? [
            {
              id: 'predicate',
              roleId: 'role',
              objectMetadataId: 'creator',
              fieldMetadataId: 'creator-instagramUsername',
              operand: 'CONTAINS',
              value: 'hidden',
            },
          ]
        : denial === 'linkRLS' || denial === 'conversationRLS'
          ? [
              {
                id: 'link-predicate',
                roleId: 'role',
                objectMetadataId: 'myahSocialConversation',
                fieldMetadataId: 'myahSocialConversation-lifecycle',
                operand: 'CONTAINS',
                value: 'INACTIVE',
              },
            ]
          : [],
    ),
    flatRowLevelPermissionPredicateGroupMaps: maps([]),
  } as unknown as WorkspaceInternalContext;
  const permissions: ObjectsPermissions = Object.fromEntries(
    objects.map((object) => [
      object.id,
      {
        canReadObjectRecords:
          denial !== 'read' &&
          !(
            object.id === 'myahSocialConversation' &&
            denial === 'conversationRead'
          ),
        canUpdateObjectRecords:
          object.id === 'creator' ? denial !== 'create' : denial !== 'update',
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        restrictedFields:
          denial === 'field'
            ? {
                'myahSocialConversation-creator': {
                  canRead: true,
                  canUpdate: false,
                },
              }
            : denial === 'linkRead'
              ? { 'creator-instagramLink': { canRead: false, canUpdate: true } }
              : ({} as ObjectsPermissions[string]['restrictedFields']),
        rowLevelPermissionPredicates: [],
        rowLevelPermissionPredicateGroups: [],
      },
    ]),
  );
  Object.assign(dataSource, {
    permissionsPerRoleId: { role: permissions },
    featureFlagMap: {},
  });
  // SAFETY: the real manager only needs TypeORM's metadata/query-builder surface;
  // workspace context getters are replaced, not repository/permission behavior.
  const manager = new WorkspaceEntityManager(
    dataSource as unknown as GlobalWorkspaceDataSource,
    runner,
  );
  const auth = {
    type: 'apiKey',
    apiKey: { id: 'key' },
    userWorkspaceId: 'user-workspace',
    workspaceMemberId: 'member',
  } as unknown as WorkspaceAuthContext;
  jest
    .spyOn(manager, 'internalContext', 'get')
    .mockReturnValue(internalContext);
  jest.spyOn(manager, 'authContext', 'get').mockReturnValue(auth);
  const query = jest
    .spyOn(runner, 'query')
    .mockImplementation(async (sql: string) => {
      const result = new QueryResult();
      if (sql.startsWith('UPDATE ')) {
        expect(sql).toContain('"creatorId" IS NULL');
        state.linked = true;
        result.affected = 1;
        result.records = [{ id: conversationId }];
      } else if (sql.includes('"workspace_test"."creator"')) {
        expect(sql).toMatch(/^SELECT /);
        expect(sql).not.toContain(' AS "creator_deletedAt"');
        expect(sql).not.toContain('instagramLinkPrimaryLinkLabel');
        expect(sql).not.toContain('instagramLinkSecondaryLinks');
        const hidden = sql.includes('LIKE');
        result.records =
          state.hasCreator && !hidden
            ? [
                {
                  creator_id: creatorId,
                  creator_instagramUsername: state.username,
                  creator_instagramUrl: state.url,
                  creator_instagramLinkPrimaryLinkUrl: state.link,
                },
              ]
            : [];
      } else {
        expect(sql).toMatch(/^SELECT /);
        expect(sql).toContain('"workspace_test"."_myahSocialConversation"');
        result.records =
          (state.linked && sql.includes('"creatorId" IS NULL')) ||
          (denial === 'conversationRLS' && sql.includes('LIKE'))
            ? []
            : state.conversationIds.map((id) => ({
                myahSocialConversation_id: id,
                myahSocialConversation_creatorId: state.linked
                  ? creatorId
                  : null,
                myahSocialConversation_instagramAccountId: creatorId,
                myahSocialConversation_providerConversationId: 'chat',
                myahSocialConversation_recipientIgsid: 'recipient-igsid',
                myahSocialConversation_recipientUsername: 'recipient',
                myahSocialConversation_lifecycle: 'ACTIVE',
                myahSocialConversation_provider: 'UNIPILE',
                myahSocialConversation_deletedAt: null,
              }));
      }
      result.raw = result.records;
      return result;
    });
  const getRepository = jest.fn(
    async (
      _workspace: string,
      target: string,
      role?: Parameters<WorkspaceEntityManager['getRepository']>[1],
    ) => manager.getRepository(target, role, auth),
  );
  const provider = {
    getInstagramMessagingProfile: jest.fn(async () => ({
      username: 'recipient',
      providerId: 'profile-id',
      providerMessagingId: 'recipient-igsid',
    })),
    listChats: jest.fn(async () => ({
      chats: state.conversationIds.length
        ? [
            {
              chatId: 'chat',
              accountId: 'account',
              type: 'ONE_TO_ONE',
              attendeeProviderId: 'recipient-igsid',
            },
          ]
        : [],
      nextCursor: null,
    })),
    startChat: jest.fn(),
    sendMessage: jest.fn(),
  };
  const recipient = new InstagramMessageRecipientService(
    { getRepository } as never,
    {
      getComposerAccount: jest.fn(async () => ({
        bindingId: 'binding',
        instagramAccountRecordId: creatorId,
        unipileAccountId: 'account',
        instagramUserId: 'instagram-user',
        label: 'Sender',
      })),
    } as never,
    {
      canQueryComposerAccount: jest.fn(async () => true),
      canSend: jest.fn(async () => true),
    } as never,
    { isTargetAvailable: jest.fn(async () => true) } as never,
    provider as never,
    { upsertVerifiedChat: jest.fn() } as never,
    { findOne: jest.fn() } as never,
  );
  const conversationRepository = manager.getRepository(
    'myahSocialConversation',
    rolePermissionConfig,
    auth,
  );
  const update = () =>
    conversationRepository.update(
      {
        id: conversationId,
        creatorId: IsNull(),
        instagramAccountId: creatorId,
        providerConversationId: 'chat',
        recipientIgsid: 'recipient-igsid',
        lifecycle: 'ACTIVE',
        provider: 'UNIPILE',
        deletedAt: IsNull(),
      },
      { creatorId },
      undefined,
      manager,
      ['id'],
    );
  const beforeQuery = jest.fn(async () => undefined);
  const link = () =>
    withInstagramConversationLinkEvents({
      manager,
      conversationId,
      creatorId,
      beforeQuery,
      update,
    });
  return {
    manager,
    recipient,
    getRepository,
    query,
    checkout,
    state,
    emitted,
    listener,
    update,
    link,
    beforeQuery,
    provider,
  };
};

describe('InstagramMessageRecipientService real discovery permission boundary', () => {
  it('discovers internally then verifies through the role on the same runner', async () => {
    const h = await buildHarness();
    await h.recipient.assertCreatorMatchesUnderLock(
      graph,
      context,
      h.manager,
      h.beforeQuery,
    );
    expect(h.getRepository.mock.calls.map((call) => call[2])).toEqual([
      { shouldBypassPermissionChecks: true },
      rolePermissionConfig,
    ]);
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(h.checkout).not.toHaveBeenCalled();
  });

  it('demonstrates empty default permissions deny a non-system Creator SELECT', async () => {
    const h = await buildHarness();
    await expect(
      h.manager
        .getRepository('creator')
        .find({ select: { id: true } }, h.manager),
    ).rejects.toThrow(/permission|Permission/);
    expect(h.query).not.toHaveBeenCalled();
  });

  it.each(['read', 'RLS'] as const)(
    'never adopts an internally matched Creator hidden by %s',
    async (denial) => {
      const h = await buildHarness(denial);
      await expect(
        h.recipient.assertCreatorMatchesUnderLock(
          graph,
          context,
          h.manager,
          h.beforeQuery,
        ),
      ).rejects.toThrow(
        denial === 'read' ? /permission|Permission/ : 'RECIPIENT_UNAVAILABLE',
      );
      expect(h.query).toHaveBeenCalledTimes(denial === 'read' ? 1 : 2);
      expect(h.state.linked).toBe(false);
    },
  );

  it.each(['read', 'RLS', 'linkRead'] as const)(
    'returns only generic blocked evidence for a hidden match (%s)',
    async (denial) => {
      const h = await buildHarness(denial);
      await expect(
        h.recipient.prepare({ recipient: { rawHandle: 'recipient' } }, context),
      ).resolves.toEqual({ status: 'BLOCKED', code: 'RECIPIENT_UNAVAILABLE' });
      expect(h.query).toHaveBeenCalledTimes(denial === 'RLS' ? 2 : 1);
    },
  );

  it('reconstructs a primary-link-only canonical identity in both selected and under-lock lookup', async () => {
    const h = await buildHarness();
    h.state.username = null;
    h.state.link = 'https://www.instagram.com/recipient/';
    await expect(
      h.recipient.resolveNormalizedHandle(
        { recipient: { creatorRecordId: creatorId } },
        context,
      ),
    ).resolves.toBe('recipient');
    await expect(
      h.recipient.assertCreatorMatchesUnderLock(
        {
          ...graph,
          recipient: {
            ...graph.recipient,
            sourceValues: [{ field: 'instagramLink', value: h.state.link }],
          },
        },
        context,
        h.manager,
        h.beforeQuery,
      ),
    ).resolves.toBeUndefined();
    expect(h.query).toHaveBeenCalledTimes(3);
  });

  it.each(['url', 'link'] as const)(
    'rejects username disagreement with canonical %s evidence',
    async (source) => {
      const h = await buildHarness();
      h.state[source] = 'https://www.instagram.com/another/';
      await expect(
        h.recipient.assertCreatorMatchesUnderLock(
          graph,
          context,
          h.manager,
          h.beforeQuery,
        ),
      ).rejects.toThrow('CREATOR_AMBIGUOUS');
      await expect(
        h.recipient.resolveNormalizedHandle(
          { recipient: { creatorRecordId: creatorId } },
          context,
        ),
      ).rejects.toThrow('RECIPIENT_UNAVAILABLE');
    },
  );

  it('enforces composite read permission on the selected physical primary-link subcolumn', async () => {
    const h = await buildHarness('linkRead');
    await expect(
      h.recipient.resolveNormalizedHandle(
        { recipient: { creatorRecordId: creatorId } },
        context,
      ),
    ).rejects.toThrow(/permission|Permission/);
    expect(h.query).not.toHaveBeenCalled();
  });

  it.each(['allowed', 'create'] as const)(
    'checks current create capability after an empty internal scan: %s',
    async (denial) => {
      const h = await buildHarness(denial === 'allowed' ? undefined : denial);
      h.state.hasCreator = false;
      const result = h.recipient.assertCreatorMatchesUnderLock(
        { ...graph, creatorRecordId: null },
        context,
        h.manager,
        h.beforeQuery,
      );
      if (denial === 'allowed') await expect(result).resolves.toBeUndefined();
      else await expect(result).rejects.toThrow('RECIPIENT_UNAVAILABLE');
      expect(h.query).toHaveBeenCalledTimes(1);
    },
  );
});

describe('InstagramMessageRecipientService real conversation discovery permission boundary', () => {
  const conversationCalls = (h: Awaited<ReturnType<typeof buildHarness>>) =>
    h.getRepository.mock.calls.filter(
      (call) => call[1] === 'myahSocialConversation',
    );
  const conversationQueries = (h: Awaited<ReturnType<typeof buildHarness>>) =>
    h.query.mock.calls.filter(([sql]) =>
      sql.includes('"workspace_test"."_myahSocialConversation"'),
    );

  it('rejects omitted permissions for the non-system app conversation before SQL', async () => {
    const h = await buildHarness();
    await expect(
      h.manager
        .getRepository('myahSocialConversation')
        .find({ select: { id: true } }),
    ).rejects.toThrow(/permission|Permission/);
    expect(h.query).not.toHaveBeenCalled();
    expect(h.checkout).not.toHaveBeenCalled();
  });

  it.each([
    { recipient: { rawHandle: 'recipient' } },
    { recipient: { creatorRecordId: creatorId } },
  ])(
    'prepares an authorized empty conversation table for $recipient',
    async (input) => {
      const h = await buildHarness();
      h.state.conversationIds = [];
      await expect(h.recipient.prepare(input, context)).resolves.toMatchObject({
        status: 'READY',
        actionKind: 'START_CHAT',
        creatorRecordId: creatorId,
      });
      // No candidate is adopted, so the existing empty-discovery fast path stays intact.
      expect(conversationCalls(h).map((call) => call[2])).toEqual([
        { shouldBypassPermissionChecks: true },
      ]);
      expect(conversationQueries(h)).toHaveLength(1);
      expect(h.checkout).not.toHaveBeenCalled();
      expect(h.provider.startChat).not.toHaveBeenCalled();
      expect(h.provider.sendMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    { recipient: { rawHandle: 'recipient' } },
    { recipient: { creatorRecordId: creatorId } },
  ])(
    'rereads an exact conversation through the caller role on the same runner for $recipient',
    async (input) => {
      const h = await buildHarness();
      await expect(h.recipient.resolve(input, context)).resolves.toMatchObject({
        status: 'READY',
        actionKind: 'REPLY',
        chat: { conversationRecordId: conversationId, providerChatId: 'chat' },
      });
      expect(conversationCalls(h).map((call) => call[2])).toEqual([
        { shouldBypassPermissionChecks: true },
        rolePermissionConfig,
      ]);
      expect(conversationQueries(h)).toHaveLength(2);
      for (const [sql] of conversationQueries(h)) {
        expect(sql.split(' FROM ')[0]).toBe(
          'SELECT "myahSocialConversation"."id" AS "myahSocialConversation_id", "myahSocialConversation"."providerConversationId" AS "myahSocialConversation_providerConversationId", "myahSocialConversation"."recipientIgsid" AS "myahSocialConversation_recipientIgsid", "myahSocialConversation"."recipientUsername" AS "myahSocialConversation_recipientUsername"',
        );
        expect(sql).toContain('"deletedAt" IS NULL');
        expect(sql).toContain('"instagramAccountId" =');
        expect(sql).toContain('"lifecycle" =');
        expect(sql).toContain('"provider" =');
      }
      expect(h.checkout).not.toHaveBeenCalled();
      expect(h.provider.startChat).not.toHaveBeenCalled();
      expect(h.provider.sendMessage).not.toHaveBeenCalled();
    },
  );

  it.each(['conversationRead', 'conversationRLS'] as const)(
    'does not classify internal evidence hidden by %s as START even without provider chats',
    async (denial) => {
      const h = await buildHarness(denial);
      h.provider.listChats.mockResolvedValue({ chats: [], nextCursor: null });
      await expect(
        h.recipient.prepare({ recipient: { rawHandle: 'recipient' } }, context),
      ).resolves.toEqual({
        status: 'BLOCKED',
        code:
          denial === 'conversationRead'
            ? 'RECIPIENT_UNAVAILABLE'
            : 'CONTEXT_CHANGED',
      });
      expect(conversationCalls(h).map((call) => call[2])).toEqual([
        { shouldBypassPermissionChecks: true },
        rolePermissionConfig,
      ]);
      const queries = conversationQueries(h);
      expect(queries).toHaveLength(denial === 'conversationRead' ? 1 : 2);
      expect(queries[0][0]).not.toContain('LIKE');
      if (denial === 'conversationRLS') expect(queries[1][0]).toContain('LIKE');
      expect(h.checkout).not.toHaveBeenCalled();
      expect(h.provider.startChat).not.toHaveBeenCalled();
      expect(h.provider.sendMessage).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing candidate', []],
    [
      'extra candidate',
      [conversationId, '00000000-0000-4000-8000-000000000003'],
    ],
    ['equal count but different ID', ['00000000-0000-4000-8000-000000000003']],
  ] as const)(
    'fails closed when the role reread has %s',
    async (_name, ids) => {
      const h = await buildHarness();
      const execute = h.query.getMockImplementation()!;
      // Controlled SQL transport drift between real permission-aware SELECTs.
      h.query.mockImplementation(async (sql: string) => {
        const result = await execute(sql);
        if (sql.includes('"workspace_test"."_myahSocialConversation"')) {
          h.state.conversationIds = [...ids];
        }
        return result;
      });
      await expect(
        h.recipient.prepare({ recipient: { rawHandle: 'recipient' } }, context),
      ).resolves.toEqual({
        status: 'BLOCKED',
        code: 'CONTEXT_CHANGED',
      });
      expect(conversationCalls(h).map((call) => call[2])).toEqual([
        { shouldBypassPermissionChecks: true },
        rolePermissionConfig,
      ]);
      expect(conversationQueries(h)).toHaveLength(2);
      expect(h.checkout).not.toHaveBeenCalled();
      expect(h.provider.startChat).not.toHaveBeenCalled();
      expect(h.provider.sendMessage).not.toHaveBeenCalled();
    },
  );
});

describe('Instagram composer real conditional update event boundary', () => {
  it('documents the shared builder keeps the now-false null predicate for its after-read', async () => {
    const h = await buildHarness();
    const { bufferedEvents } = await runWithWorkspaceDatabaseEventBuffer(
      h.update,
    );
    expect(h.state.linked).toBe(true);
    expect(h.emitted.mock.calls).toEqual([[undefined], [undefined]]);
    expect(bufferedEvents).toHaveLength(0);
  });

  it('buffers exactly one UPDATED and UPSERTED link event with canonical metadata/auth and by-ID snapshots', async () => {
    const h = await buildHarness();
    const { bufferedEvents } = await runWithWorkspaceDatabaseEventBuffer(
      h.link,
    );
    expect(h.listener).not.toHaveBeenCalled();
    expect(bufferedEvents).toHaveLength(2);
    expect(h.checkout).not.toHaveBeenCalled();
    h.state.committed = true;
    h.state.released = true;
    flushBufferedWorkspaceDatabaseEvents(bufferedEvents, jest.fn());
    expect(h.listener.mock.calls.map((call) => call[0])).toEqual([
      'myahSocialConversation.updated',
      'myahSocialConversation.upserted',
    ]);
    expect(h.listener.mock.calls[0][1]).toMatchObject({
      workspaceId: context.workspaceId,
      events: [
        {
          recordId: conversationId,
          userWorkspaceId: 'user-workspace',
          workspaceMemberId: 'member',
          properties: {
            before: { creatorId: null },
            after: { creatorId },
            updatedFields: ['creator', 'creatorId'],
            diff: {
              creator: { before: { id: null }, after: { id: creatorId } },
            },
          },
        },
      ],
    });
  });

  it('discards link events on rollback', async () => {
    const h = await buildHarness();
    await expect(
      runWithWorkspaceDatabaseEventBuffer(async () => {
        await h.link();
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(h.listener).not.toHaveBeenCalled();
  });

  it.each(['update', 'field', 'linkRLS'] as const)(
    'still enforces real mutation %s permissions',
    async (denial) => {
      const h = await buildHarness(denial);
      await expect(runWithWorkspaceDatabaseEventBuffer(h.link)).rejects.toThrow(
        denial === 'linkRLS' ? /row-level security/ : /permission|Permission/,
      );
      expect(h.state.linked).toBe(false);
      expect(h.listener).not.toHaveBeenCalled();
    },
  );
});
