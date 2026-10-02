import { randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { DataSource, EntitySchema, In, IsNull, QueryResult } from 'typeorm';
import {
  FieldMetadataType,
  type ObjectsPermissions,
} from 'twenty-shared/types';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceInternalContext } from 'src/engine/twenty-orm/interfaces/workspace-internal-context.interface';
import { WorkspaceUpdateQueryBuilder } from 'src/engine/twenty-orm/repository/workspace-update-query-builder';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

class MetadataOnlyDataSource extends DataSource {
  async buildTestMetadata() {
    await this.buildMetadatas();
  }
}

const ids = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
];

const buildHarness = async ({
  returning = '*',
  affected = 1,
  multiple = false,
  liveUrl,
  workspaceSchema = 'workspace_test',
  recordId = ids[0],
  denyUpdate = false,
}: {
  returning?: string | string[] | null;
  affected?: number;
  multiple?: boolean;
  liveUrl?: string;
  workspaceSchema?: string;
  recordId?: string;
  denyUpdate?: boolean;
}) => {
  const dataSource = new MetadataOnlyDataSource({
    type: 'postgres',
    ...(liveUrl ? { url: liveUrl } : {}),
    entities: [
      new EntitySchema({
        name: 'socialProfile',
        schema: workspaceSchema,
        tableName: 'socialProfile',
        columns: {
          id: { type: 'uuid', primary: true },
          platformAccountId: { type: 'text', nullable: true },
          name: { type: 'text' },
          platform: { type: 'text' },
        },
      }),
    ],
  });

  if (liveUrl) {
    await dataSource.initialize();
  } else {
    await dataSource.buildTestMetadata();
  }
  const runner = dataSource.createQueryRunner();
  const state = {
    updated: false,
    reads: [] as string[],
    readParams: [] as unknown[][],
    rows: [] as string[][],
  };
  const query = jest.spyOn(runner, 'query');

  if (!liveUrl)
    query.mockImplementation(async (sql: string, parameters?: unknown[]) => {
      const result = new QueryResult();

      if (sql.startsWith('UPDATE ')) {
        expect(sql).toContain('"platformAccountId" IS NULL');
        if (Array.isArray(returning) && returning.length > 0) {
          expect(sql).toContain(
            'RETURNING "name", "id" AS "__twentyOrmUpdatedRecordId"',
          );
        }
        state.updated = true;
        result.affected = affected;
        result.records = ids.slice(0, affected).map((id) => ({
          ...(returning === '*'
            ? { id, platformAccountId: 'stable-id', name: 'Profile' }
            : {}),
          ...(returning && (returning === '*' || returning.length > 0)
            ? { name: 'Profile' }
            : {}),
          ...(!returning || returning !== '*'
            ? { __twentyOrmUpdatedRecordId: id }
            : {}),
        }));
        result.raw = result.records;
      } else {
        expect(sql).toMatch(/^SELECT /);
        state.reads.push(sql);
        state.readParams.push(parameters ?? []);
        const isAfter = state.updated;
        const selectedIds = multiple ? ids : ids.slice(0, 1);
        // Simulate the actual SQL WHERE: the original IS NULL excludes changed
        // rows after the update, while the ID-based read returns those rows.
        const rows = selectedIds.filter((id) =>
          isAfter
            ? !sql.includes('"platformAccountId" IS NULL') &&
              parameters?.includes(id) &&
              ids.slice(0, affected).includes(id)
            : true,
        );
        state.rows.push(rows);
        result.records = rows.map((id) => ({
          [`${workspaceSchema}.socialProfile_id`]: id,
          [`${workspaceSchema}.socialProfile_platformAccountId`]: isAfter
            ? 'stable-id'
            : null,
          [`${workspaceSchema}.socialProfile_name`]: 'Profile',
        }));
        result.raw = result.records;
      }

      return result;
    });
  const fields = [
    { id: 'id-field', name: 'id', type: FieldMetadataType.UUID },
    {
      id: 'account-field',
      name: 'platformAccountId',
      type: FieldMetadataType.TEXT,
    },
    { id: 'name-field', name: 'name', type: FieldMetadataType.TEXT },
  ].map((field) => ({
    ...field,
    universalIdentifier: field.id,
    objectMetadataId: 'profile',
    isActive: true,
  }));
  const object = {
    id: 'profile',
    universalIdentifier: 'profile',
    nameSingular: 'socialProfile',
    namePlural: 'socialProfiles',
    isSystem: false,
    fieldIds: fields.map((field) => field.id),
  };
  const emit = jest.fn();
  const context = {
    workspaceId: 'workspace-test',
    objectIdByNameSingular: { socialProfile: 'profile' },
    flatObjectMetadataMaps: {
      byUniversalIdentifier: { profile: object },
      universalIdentifierById: { profile: 'profile' },
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
    apiKeyRoleMap: {},
    flatRowLevelPermissionPredicateMaps: {
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    },
    flatRowLevelPermissionPredicateGroupMaps: {
      byUniversalIdentifier: {},
      universalIdentifierById: {},
      universalIdentifiersByApplicationId: {},
    },
  } as unknown as WorkspaceInternalContext;
  const permissions = {
    profile: {
      canReadObjectRecords: true,
      canUpdateObjectRecords: !denyUpdate,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
      restrictedFields: {},
      rowLevelPermissionPredicates: [],
      rowLevelPermissionPredicateGroups: [],
    },
  } as ObjectsPermissions;
  const base = dataSource
    .createQueryBuilder(runner)
    .update('socialProfile')
    .set({ platformAccountId: 'stable-id' })
    .where(
      multiple
        ? { platformAccountId: IsNull() }
        : { id: recordId, platformAccountId: IsNull() },
    );

  if (returning) base.returning(returning);

  const builder = new WorkspaceUpdateQueryBuilder(
    base,
    permissions,
    context,
    false,
    {} as WorkspaceAuthContext,
    {} as never,
  );

  return { builder, query, emit, state, dataSource, runner };
};

describe('WorkspaceUpdateQueryBuilder affected-row events', () => {
  it.each(['*', ['name']] as const)(
    'emits native events after NULL-to-stable-ID CAS while preserving RETURNING %p',
    async (returning) => {
      const { builder, emit, state } = await buildHarness({
        returning: returning === '*' ? returning : [...returning],
      });
      const result = await builder.execute();

      expect(result.affected).toBe(1);
      expect(result.raw).toEqual(
        returning === '*'
          ? [{ id: ids[0], platformAccountId: 'stable-id', name: 'Profile' }]
          : [{ name: 'Profile' }],
      );
      expect(result.generatedMaps).toEqual(
        returning === '*'
          ? [{ id: ids[0], platformAccountId: 'stable-id', name: 'Profile' }]
          : [{ name: 'Profile' }],
      );
      expect(state.reads).toHaveLength(2);
      expect(state.reads[1]).toContain('WHERE');
      expect(state.reads[1]).toContain('"id"');
      expect(state.readParams[1]).toContain(ids[0]);
      expect(state.reads[1]).not.toContain('"platformAccountId" IS NULL');
      expect(state.rows).toEqual([[ids[0]], [ids[0]]]);
      expect(emit).toHaveBeenCalledTimes(2);
      for (const [event] of emit.mock.calls) {
        expect(event).toMatchObject({
          events: [
            {
              recordId: ids[0],
              properties: {
                before: { id: ids[0], platformAccountId: '' },
                after: { id: ids[0], platformAccountId: 'stable-id' },
              },
            },
          ],
        });
      }
    },
  );

  it('preserves empty RETURNING array result while still emitting affected-row events', async () => {
    const { builder, emit } = await buildHarness({ returning: [] });
    const result = await builder.execute();
    expect(result.raw).toEqual([]);
    expect(result.generatedMaps).toEqual([]);
    expect(
      emit.mock.calls.map(([event]) => event?.events?.[0]?.recordId),
    ).toEqual([ids[0], ids[0]]);
  });

  it('preserves the native refusal of direct updates without RETURNING', async () => {
    const { builder, query, emit } = await buildHarness({ returning: null });
    await expect(builder.execute()).rejects.toThrow(
      'Returning columns are not set',
    );
    expect(query).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('denies unauthorized updates before SQL or event emission', async () => {
    const { builder, query, emit } = await buildHarness({ denyUpdate: true });
    await expect(builder.execute()).rejects.toThrow(/permission/i);
    expect(query).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits no event when stale CAS affects zero rows', async () => {
    const { builder, emit, state } = await buildHarness({ affected: 0 });
    expect((await builder.execute()).affected).toBe(0);
    expect(state.reads).toHaveLength(1);
    expect(emit).toHaveBeenCalledWith(undefined);
  });

  it('emits only changed rows when a multi-row filter becomes false', async () => {
    const { builder, emit } = await buildHarness({
      multiple: true,
      affected: 1,
    });
    const result = await builder.execute();
    expect(result.affected).toBe(1);
    expect(
      emit.mock.calls.map(([event]) =>
        event.events.map((item: { recordId: string }) => item.recordId),
      ),
    ).toEqual([[ids[0]], [ids[0]]]);
  });
});

const isolatedDatabaseUrl = process.env.MYAH_409_ISOLATED_PG_DATABASE_URL;
const describeIsolated = isolatedDatabaseUrl ? describe : describe.skip;

describeIsolated(
  'WorkspaceUpdateQueryBuilder isolated PostgreSQL events',
  () => {
    let schema: string;

    beforeAll(async () => {
      if (process.env.PG_DATABASE_URL !== undefined) {
        throw new Error(
          'PG_DATABASE_URL must be absent for isolated event tests',
        );
      }
      const url = new URL(isolatedDatabaseUrl!);

      if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        url.port !== '5432' ||
        url.pathname !== '/myah_409_social_profiles_20260923_205615f0f1' ||
        url.username !== 'postgres' ||
        url.search ||
        url.hash
      ) {
        throw new Error('Isolated event test database not allowlisted');
      }

      const client = new Client({ connectionString: isolatedDatabaseUrl });

      try {
        await client.connect();
        const identity = await client.query<{
          database: string;
          username: string;
          recovery: boolean;
        }>(
          'SELECT current_database() AS database, current_user AS username, pg_is_in_recovery() AS recovery',
        );
        expect(identity.rows).toEqual([
          {
            database: 'myah_409_social_profiles_20260923_205615f0f1',
            username: 'postgres',
            recovery: false,
          },
        ]);
        const metadata = await client.query<{ workspaceId: string }>(
          'SELECT "workspaceId" FROM core."objectMetadata" WHERE "universalIdentifier" = $1 ORDER BY "workspaceId"',
          [MYAH_STANDARD_OBJECTS.socialProfile.universalIdentifier],
        );
        expect(metadata.rows).toHaveLength(2);
        schema = getWorkspaceSchemaName(metadata.rows[0].workspaceId);
        expect(schema).toMatch(/^workspace_[a-z0-9]+$/);
      } finally {
        await client.end();
      }
    });

    it.each(['*', ['name']] as const)(
      'reads successful CAS events in the same transaction with RETURNING %p',
      async (returning) => {
        const recordId = randomUUID();
        const { builder, emit, dataSource, runner } = await buildHarness({
          returning: returning === '*' ? returning : [...returning],
          liveUrl: isolatedDatabaseUrl,
          workspaceSchema: schema,
          recordId,
        });

        await runner.startTransaction();

        try {
          await dataSource
            .createQueryBuilder(runner)
            .insert()
            .into('socialProfile')
            .values({
              id: recordId,
              name: 'MYAH-409 event regression fixture',
              platform: 'INSTAGRAM',
            })
            .execute();
          const result = await builder.execute();
          expect(result.affected).toBe(1);
          expect(result.raw).toHaveLength(1);
          expect(result.raw[0]).toEqual(
            returning === '*'
              ? expect.objectContaining({
                  id: recordId,
                  platformAccountId: 'stable-id',
                })
              : { name: 'MYAH-409 event regression fixture' },
          );
          expect(result.generatedMaps).toHaveLength(1);
          expect(emit).toHaveBeenCalledTimes(2);
          for (const [event] of emit.mock.calls) {
            expect(event).toMatchObject({
              events: [
                {
                  recordId,
                  properties: {
                    before: { id: recordId, platformAccountId: '' },
                    after: { id: recordId, platformAccountId: 'stable-id' },
                  },
                },
              ],
            });
          }

          emit.mockClear();
          const stale = await builder.execute();
          expect(stale.affected).toBe(0);
          expect(emit.mock.calls).toEqual([[undefined], [undefined]]);
        } finally {
          await runner.rollbackTransaction();
          await runner.release();
          await dataSource.destroy();
        }
      },
    );

    it('pairs both affected rows when a multi-row predicate becomes false', async () => {
      const recordIds = [randomUUID(), randomUUID()];
      const { builder, emit, dataSource, runner } = await buildHarness({
        liveUrl: isolatedDatabaseUrl,
        workspaceSchema: schema,
        multiple: true,
      });

      builder.set({ name: 'After' });
      builder.where({ id: In(recordIds), name: 'Before' });
      await runner.startTransaction();

      try {
        await dataSource
          .createQueryBuilder(runner)
          .insert()
          .into('socialProfile')
          .values(
            recordIds.map((id) => ({
              id,
              name: 'Before',
              platform: 'INSTAGRAM',
            })),
          )
          .execute();
        const result = await builder.execute();
        expect(result.affected).toBe(2);
        expect(result.raw.map((row: { id: string }) => row.id).sort()).toEqual(
          [...recordIds].sort(),
        );
        expect(emit).toHaveBeenCalledTimes(2);
        for (const [event] of emit.mock.calls) {
          expect(
            event.events
              .map((item: { recordId: string }) => item.recordId)
              .sort(),
          ).toEqual([...recordIds].sort());
          for (const item of event.events) {
            expect(item.properties.before).toMatchObject({
              id: item.recordId,
              name: 'Before',
            });
            expect(item.properties.after).toMatchObject({
              id: item.recordId,
              name: 'After',
            });
          }
        }
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
        await dataSource.destroy();
      }
    });
  },
);
