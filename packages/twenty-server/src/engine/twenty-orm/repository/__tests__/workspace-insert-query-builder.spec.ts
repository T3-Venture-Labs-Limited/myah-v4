import { DataSource, EntitySchema, QueryResult } from 'typeorm';
import {
  FieldMetadataType,
  type ObjectsPermissions,
} from 'twenty-shared/types';

import { type WorkspaceInternalContext } from 'src/engine/twenty-orm/interfaces/workspace-internal-context.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceInsertQueryBuilder } from 'src/engine/twenty-orm/repository/workspace-insert-query-builder';
import {
  enqueueWorkspaceDatabaseEvent,
  flushBufferedWorkspaceDatabaseEvents,
  runWithWorkspaceDatabaseEventBuffer,
} from 'src/engine/workspace-event-emitter/utils/workspace-database-event-buffer';

class MetadataOnlyDataSource extends DataSource {
  async buildTestMetadata() {
    await this.buildMetadatas();
  }
}

const id = '00000000-0000-4000-8000-000000000001';

// Real TypeORM insert/select and WorkspaceInsertQueryBuilder. Only the driver's
// SQL boundary is simulated: no connection is initialized or checked out.
const buildHarness = async (denial?: 'object' | 'field' | 'RLS') => {
  const dataSource = new MetadataOnlyDataSource({
    type: 'postgres',
    entities: [
      new EntitySchema({
        name: 'creator',
        tableName: 'creator',
        schema: 'workspace_test',
        columns: {
          id: { type: 'uuid', primary: true, generated: 'uuid' },
          instagramUsername: { type: String },
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
  const state = { inserted: false, committed: false };
  const query = jest
    .spyOn(runner, 'query')
    .mockImplementation(async (sql: string) => {
      const result = new QueryResult();
      if (sql.startsWith('INSERT INTO')) {
        expect(sql).toContain('"workspace_test"."creator"');
        state.inserted = true;
        result.records = [{ id }];
        result.raw = result.records;
        result.affected = 1;
      } else {
        expect(sql).toMatch(/^SELECT /);
        expect(sql).toContain('"workspace_test"."creator"');
        expect(state.inserted).toBe(true);
        expect(state.committed).toBe(false);
        result.records = [
          { creator_id: id, creator_instagramUsername: 'recipient' },
        ];
        result.raw = result.records;
      }
      return result;
    });
  const readback = jest.spyOn(dataSource.manager, 'createQueryBuilder');
  const fields = [
    {
      id: 'id-field',
      universalIdentifier: 'id-field',
      name: 'id',
      type: FieldMetadataType.UUID,
      objectMetadataId: 'creator',
      isActive: true,
    },
    {
      id: 'username-field',
      universalIdentifier: 'username-field',
      name: 'instagramUsername',
      type: FieldMetadataType.TEXT,
      objectMetadataId: 'creator',
      isActive: true,
    },
  ];
  const object = {
    id: 'creator',
    universalIdentifier: 'creator',
    nameSingular: 'creator',
    namePlural: 'creators',
    isSystem: false,
    fieldIds: fields.map(({ id: fieldId }) => fieldId),
  };
  const listener = jest.fn();
  const emit = jest.fn((event) => {
    if (!enqueueWorkspaceDatabaseEvent(() => listener(event))) listener(event);
  });
  // SAFETY: this metadata-only fixture supplies exactly the fields used by the
  // real permission, formatting, file-diff and RLS paths; there is no live ORM.
  const context = {
    workspaceId: 'workspace-test',
    objectIdByNameSingular: { creator: 'creator' },
    flatObjectMetadataMaps: {
      byUniversalIdentifier: { creator: object },
      universalIdentifierById: { creator: 'creator' },
      universalIdentifiersByApplicationId: {},
    },
    flatFieldMetadataMaps: {
      byUniversalIdentifier: Object.fromEntries(
        fields.map((field) => [field.id, field]),
      ),
      universalIdentifierById: Object.fromEntries(
        fields.map((field) => [field.id, field.id]),
      ),
      universalIdentifiersByApplicationId: {},
    },
    coreDataSource: { getRepository: jest.fn(() => ({})) },
    eventEmitterService: { emitDatabaseBatchEvent: emit },
    userWorkspaceRoleMap: {},
    apiKeyRoleMap: { key: 'role' },
    flatRowLevelPermissionPredicateMaps: {
      byUniversalIdentifier:
        denial === 'RLS'
          ? {
              predicate: {
                id: 'predicate',
                universalIdentifier: 'predicate',
                roleId: 'role',
                objectMetadataId: 'creator',
                fieldMetadataId: 'username-field',
                operand: 'CONTAINS',
                value: 'another-recipient',
              },
            }
          : {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    },
    flatRowLevelPermissionPredicateGroupMaps: {
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    },
  } as unknown as WorkspaceInternalContext;
  const permissions: ObjectsPermissions = {
    creator: {
      canReadObjectRecords: true,
      canUpdateObjectRecords: denial !== 'object',
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
      restrictedFields:
        denial === 'field'
          ? { 'username-field': { canRead: true, canUpdate: false } }
          : {},
      rowLevelPermissionPredicates: [],
      rowLevelPermissionPredicateGroups: [],
    },
  };
  // SAFETY: the API-key RLS branch uses only type and key ID from auth context.
  const auth = {
    type: 'apiKey',
    apiKey: { id: 'key' },
  } as WorkspaceAuthContext;
  const base = dataSource
    .createQueryBuilder(runner)
    .insert()
    .into('creator')
    .values({ instagramUsername: 'recipient' })
    .returning(['id']);
  const builder = new WorkspaceInsertQueryBuilder(
    base,
    permissions,
    context,
    false,
    auth,
    {
      IS_UNIQUE_INDEXES_ENABLED: false,
      IS_JSON_FILTER_ENABLED: false,
      IS_MARKETPLACE_SETTING_TAB_VISIBLE: false,
      IS_EMAIL_GROUP_ENABLED: false,
      IS_JUNCTION_RELATIONS_ENABLED: false,
      IS_REST_METADATA_API_NEW_FORMAT_DIRECT: false,
      IS_LOGIC_FUNCTION_PREBUILT_MODE_ENABLED: false,
      IS_SETTINGS_DISCOVERY_HERO_ENABLED: false,
      IS_MESSAGING_CALENDAR_WEBHOOK_ENABLED: false,
    },
  );
  return { builder, runner, query, checkout, readback, emit, listener, state };
};

describe('WorkspaceInsertQueryBuilder transaction event readback', () => {
  it('reads uncommitted inserted rows with the actual runner, without a second checkout', async () => {
    const h = await buildHarness();
    const { result, bufferedEvents } =
      await runWithWorkspaceDatabaseEventBuffer(() => h.builder.execute());
    expect(result.identifiers).toEqual([{ id }]);
    expect(h.readback).toHaveBeenCalledWith('creator', 'creator', h.runner, {
      shouldBypassPermissionChecks: true,
    });
    expect(h.checkout).not.toHaveBeenCalled();
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(h.listener).not.toHaveBeenCalled();
    expect(h.emit).toHaveBeenCalledTimes(2);
    expect(h.emit.mock.calls[0][0]).toMatchObject({
      events: [
        {
          recordId: id,
          properties: { after: { id, instagramUsername: 'recipient' } },
        },
      ],
    });
    h.state.committed = true;
    flushBufferedWorkspaceDatabaseEvents(bufferedEvents, jest.fn());
    expect(h.listener).toHaveBeenCalledTimes(2);
  });

  it.each(['object', 'field', 'RLS'] as const)(
    'enforces real %s permission validation before insert/readback',
    async (denial) => {
      const h = await buildHarness(denial);
      await expect(h.builder.execute()).rejects.toThrow(
        denial === 'RLS' ? /row-level security/ : /permission|Permission/,
      );
      expect(h.query).not.toHaveBeenCalled();
      expect(h.checkout).not.toHaveBeenCalled();
      expect(h.emit).not.toHaveBeenCalled();
    },
  );

  it('does not flush real insert events when the containing transaction fails', async () => {
    const h = await buildHarness();
    await expect(
      runWithWorkspaceDatabaseEventBuffer(async () => {
        await h.builder.execute();
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(h.emit).toHaveBeenCalledTimes(2);
    expect(h.listener).not.toHaveBeenCalled();
  });
});
