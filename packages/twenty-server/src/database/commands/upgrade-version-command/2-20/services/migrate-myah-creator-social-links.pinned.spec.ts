import type { DataSource, QueryRunner } from 'typeorm';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { MigrateMyahCreatorSocialLinksService } from 'src/database/commands/upgrade-version-command/2-20/services/migrate-myah-creator-social-links.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

const workspaceId = '20202020-0000-4000-8000-000000000001';
const schemaName = getWorkspaceSchemaName(workspaceId);
const objectId = '30303030-0000-0000-0000-000000000001';
const applicationId = '40404040-0000-0000-0000-000000000001';
const pairs = [
  [
    'instagramUrl',
    'instagramLink',
    '8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b',
    'f0d18169-7558-487c-bafd-eb0e6adaf63a',
  ],
  [
    'tiktokUrl',
    'tiktokLink',
    'e2b3b717-5d83-5dde-bb47-42c3a6cc6f31',
    '184b0e66-11d9-45bd-8dde-e694355c57f1',
  ],
  [
    'youtubeUrl',
    'youtubeLink',
    'af645cc7-31fc-5175-af8d-427845ebe1ed',
    'dcb35d52-cad9-4871-8ae2-8e97e38578f1',
  ],
  [
    'twitterUrl',
    'twitterLink',
    'bbfda234-327c-5d9d-ac39-8a33fd06779d',
    '8bb2d28c-cecf-4111-b043-89b6c7255710',
  ],
] as const;

const columns = pairs.flatMap(([old, replacement]) => [
  { columnName: old, dataType: 'text' },
  { columnName: `${replacement}PrimaryLinkUrl`, dataType: 'text' },
  { columnName: `${replacement}PrimaryLinkLabel`, dataType: 'text' },
  { columnName: `${replacement}SecondaryLinks`, dataType: 'jsonb' },
]);
const fields = pairs.flatMap(([old, replacement, oldUid, newUid], index) =>
  ([old, replacement] as const).map((name, side) => ({
    id: `50505050-0000-0000-0000-0000000000${index * 2 + side + 10}`,
    universalIdentifier: side ? newUid : oldUid,
    name,
    type: side ? 'LINKS' : 'TEXT',
    objectMetadataId: objectId,
    applicationId,
    objectUniversalIdentifier:
      MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
    objectName: 'creator',
    objectApplicationId: applicationId,
  })),
);

const harness = () => {
  const callbacks: Array<() => Promise<void> | void> = [];
  const query = jest.fn((sql: string, _args?: unknown[]): unknown => {
    if (sql.includes('FROM core."workspace"'))
      return [{ databaseSchema: schemaName }];
    if (sql.includes('information_schema.tables')) return [{ count: '1' }];
    if (sql.includes('information_schema.columns')) return columns;
    if (sql.includes('COUNT(*)')) return [{ count: '0' }];
    if (sql.includes('FROM core."fieldMetadata"')) return fields;
    return [];
  });
  const runner = {
    query,
    isReleased: false,
    isTransactionActive: true,
    connection: {
      driver: { escape: (value: string) => `"${value.replace(/"/g, '""')}"` },
    },
    connect: jest.fn(() => {
      throw Error('nested connect');
    }),
    startTransaction: jest.fn(() => {
      throw Error('nested start');
    }),
    commitTransaction: jest.fn(() => {
      throw Error('nested commit');
    }),
    rollbackTransaction: jest.fn(() => {
      throw Error('nested rollback');
    }),
    release: jest.fn(() => {
      throw Error('nested release');
    }),
    manager: { queryRunner: undefined },
  } as unknown as QueryRunner;
  Object.assign(runner.manager, { queryRunner: runner });
  const afterCommit = jest.fn((callback: () => Promise<void> | void) =>
    callbacks.push(callback),
  );
  const upgradeTransaction = {
    queryRunner: runner,
    afterCommit,
  } as UpgradeWorkspaceTransaction;
  const core = {
    query: jest.fn(() => {
      throw Error('pooled core query');
    }),
    createQueryRunner: jest.fn(() => {
      throw Error('nested runner');
    }),
  } as unknown as DataSource;
  const invalidateCache = jest.fn().mockResolvedValue(undefined);
  const incrementMetadataVersion = jest.fn(
    async (_id: string, transaction: UpgradeWorkspaceTransaction) => {
      expect(transaction.queryRunner).toBe(runner);
      transaction.afterCommit(async () => undefined);
    },
  );
  const service = new MigrateMyahCreatorSocialLinksService(
    core,
    { invalidateCache } as never,
    { incrementMetadataVersion } as never,
  );
  const run = () =>
    service.migrateInUpgradeTransaction({
      workspaceId,
      schemaName,
      upgradeTransaction,
    });
  return {
    service,
    run,
    runner,
    query,
    callbacks,
    afterCommit,
    upgradeTransaction,
    core,
    invalidateCache,
    incrementMetadataVersion,
  };
};

// Source-only synthetic SQL contract: this spec is intentionally UNRUN until
// the peer's finite server validation slot is released.
describe('dormant pinned Creator social migration', () => {
  it('guards UUID, schema, runner lifetime and manager binding before any read', async () => {
    for (const change of [
      { workspaceId: 'not-a-uuid' },
      { schemaName: 'public' },
      { upgradeTransaction: undefined },
    ]) {
      const h = harness();
      await expect(
        h.service.migrateInUpgradeTransaction({
          workspaceId,
          schemaName,
          upgradeTransaction: h.upgradeTransaction,
          ...change,
        } as never),
      ).rejects.toThrow();
      expect(h.query).not.toHaveBeenCalled();
    }
    for (const edit of [
      (r: QueryRunner) => {
        Object.assign(r, { isReleased: true });
      },
      (r: QueryRunner) => {
        Object.assign(r, { isTransactionActive: false });
      },
      (r: QueryRunner) => {
        Object.assign(r.manager, { queryRunner: undefined });
      },
    ]) {
      const h = harness();
      edit(h.runner);
      await expect(h.run()).rejects.toThrow();
      expect(h.query).not.toHaveBeenCalled();
    }
  });

  it('distinguishes missing workspace/table from verified absent old columns', async () => {
    for (const needle of [
      'FROM core."workspace"',
      'information_schema.tables',
    ]) {
      const h = harness();
      const original = h.query.getMockImplementation()!;
      h.query.mockImplementation((sql, args) =>
        sql.includes(needle) ? [] : original(sql, args),
      );
      await expect(h.run()).rejects.toThrow();
      expect(h.incrementMetadataVersion).not.toHaveBeenCalled();
    }
    const h = harness();
    const original = h.query.getMockImplementation()!;
    h.query.mockImplementation((sql, args) =>
      sql.includes('information_schema.columns')
        ? [{ columnName: 'id', dataType: 'uuid' }]
        : original(sql, args),
    );
    await expect(h.run()).resolves.toEqual({ canDeleteOldFields: true });
    expect(h.incrementMetadataVersion).not.toHaveBeenCalled();
    expect(h.afterCommit).not.toHaveBeenCalled();
    const inconsistent = harness();
    const base = inconsistent.query.getMockImplementation()!;
    inconsistent.query.mockImplementation((sql, args) => {
      if (sql.includes('information_schema.columns'))
        return [{ columnName: 'id', dataType: 'uuid' }];
      if (sql.includes('FROM core."fieldMetadata"')) return [{ count: '1' }];
      return base(sql, args);
    });
    await expect(inconsistent.run()).rejects.toThrow(
      'obsolete field metadata remains',
    );
  });

  it('uses schema-qualified Creator, all four fixed pairs and only bound runner SQL; defers cache without a nested lifecycle', async () => {
    const h = harness();
    await expect(h.run()).resolves.toEqual({ canDeleteOldFields: true });
    const sql = h.query.mock.calls.map(([statement]) => statement as string);
    for (const [old, replacement] of pairs) {
      expect(
        sql.some(
          (text) =>
            text.includes(`UPDATE "${schemaName}"."creator"`) &&
            text.includes(`"${old}"`) &&
            text.includes(`"${replacement}PrimaryLinkUrl"`),
        ),
      ).toBe(true);
      expect(
        sql.some((text) => text.includes(`"${replacement}SecondaryLinks"`)),
      ).toBe(true);
    }
    expect(
      sql.filter((text) => /\b(?:FROM|UPDATE) "creator"/.test(text)),
    ).toEqual([]);
    expect(
      sql.find((text) => text.includes('information_schema.columns')),
    ).toContain('table_schema = $1');
    expect(h.query).toHaveBeenCalledWith(
      expect.stringContaining('information_schema.columns'),
      [schemaName],
    );
    expect(h.core.query).not.toHaveBeenCalled();
    expect(h.core.createQueryRunner).not.toHaveBeenCalled();
    for (const method of [
      'connect',
      'startTransaction',
      'commitTransaction',
      'rollbackTransaction',
      'release',
    ] as const)
      expect(h.runner[method]).not.toHaveBeenCalled();
    expect(h.incrementMetadataVersion).toHaveBeenCalledTimes(1);
    expect(h.afterCommit).toHaveBeenCalledTimes(2); // Version's publication and Social's invalidation.
    expect(h.invalidateCache).not.toHaveBeenCalled();
    await Promise.all(h.callbacks.map((callback) => callback()));
    expect(h.invalidateCache).toHaveBeenCalledWith({
      workspaceId,
      allFlatEntityMapsKeys: [
        'flatFieldPermissionMaps',
        'flatFieldMetadataMaps',
        'flatObjectMetadataMaps',
        'flatRoleMaps',
        'flatViewFieldMaps',
        'flatViewFilterMaps',
        'flatViewSortMaps',
      ],
      incrementVersion: false,
    });
    h.invalidateCache.mockRejectedValueOnce(new Error('cache failure'));
    await expect(h.callbacks[h.callbacks.length - 1]()).rejects.toThrow(
      'cache failure',
    );
  });

  it('keeps old permission rows and FALSE restrictions; reassigns view IDs without overlapping CTE updates', async () => {
    const h = harness();
    await h.run();
    const sql = h.query.mock.calls.map(([statement]) => statement as string);
    const merge = sql.find((text) =>
      text.startsWith('UPDATE core."fieldPermission" replacement'),
    )!;
    const insert = sql.find((text) =>
      text.startsWith('INSERT INTO core."fieldPermission"'),
    )!;
    expect(merge).toContain('obsolete."canReadFieldValue" IS FALSE');
    expect(merge).toContain('replacement."canUpdateFieldValue" IS FALSE');
    expect(insert).toContain('obsolete."applicationId"');
    expect(insert).toContain(
      'ON CONFLICT ("fieldMetadataId", "roleId") DO NOTHING',
    );
    expect(
      sql.some((text) => /DELETE FROM core\."fieldPermission"/.test(text)),
    ).toBe(false);
    for (const table of ['viewField', 'viewFilter', 'viewSort']) {
      const update = sql.find((text) =>
        text.startsWith(`UPDATE core."${table}" SET`),
      )!;
      expect(update).toContain('"fieldMetadataId" = $3');
      expect(update).not.toContain('WITH ');
      if (table !== 'viewField')
        expect(update).toContain('"subFieldName" = \'primaryLinkUrl\'');
    }
  });

  it.each([
    ['URL conflict', 'FROM "', 'Creator social URL conflict'],
    ['duplicate view', 'LEFT JOIN core."view"', 'ambiguous'],
    ['missing field metadata', 'FROM core."fieldMetadata"', 'missing'],
    ['malformed count', 'information_schema.tables', 'count'],
  ])(
    'refuses %s without version/callback registration',
    async (_, needle, message) => {
      const h = harness();
      const original = h.query.getMockImplementation()!;
      h.query.mockImplementation((sql, args) => {
        if (sql.includes(needle))
          return needle === 'FROM core."fieldMetadata"'
            ? []
            : needle === 'information_schema.tables'
              ? [{ wrong: '0' }]
              : [{ count: '1' }];
        return original(sql, args);
      });
      await expect(h.run()).rejects.toThrow(message);
      expect(h.incrementMetadataVersion).not.toHaveBeenCalled();
      expect(h.afterCommit).not.toHaveBeenCalled();
      expect(h.invalidateCache).not.toHaveBeenCalled();
    },
  );

  it('refuses misbound metadata, absent replacement column, failed verification, malformed counts and companions', async () => {
    for (const scenario of [
      'owner',
      'column',
      'verification',
      'count',
      'companion',
      'oldReferences',
    ]) {
      const h = harness();
      const original = h.query.getMockImplementation()!;
      h.query.mockImplementation((sql, args) => {
        if (scenario === 'owner' && sql.includes('FROM core."fieldMetadata"'))
          return [{ ...fields[0], objectName: 'other' }, ...fields.slice(1)];
        if (scenario === 'column' && sql.includes('information_schema.columns'))
          return columns.filter(
            (column) => column.columnName !== 'instagramLinkPrimaryLinkUrl',
          );
        if (
          scenario === 'verification' &&
          sql.includes('jsonb_typeof(') &&
          sql.includes('IS DISTINCT FROM')
        )
          return [{ count: '1' }];
        if (
          scenario === 'count' &&
          sql.includes('jsonb_typeof(') &&
          sql.includes('IS DISTINCT FROM')
        )
          return [];
        if (
          scenario === 'companion' &&
          sql.includes('jsonb_typeof(') &&
          sql.includes("<> 'array'")
        )
          return [{ count: '1' }];
        if (
          scenario === 'oldReferences' &&
          sql.includes('(SELECT COUNT(*) FROM core."viewField"')
        )
          return [{ count: '1' }];
        return original(sql, args);
      });
      await expect(h.run()).rejects.toThrow();
      expect(h.incrementMetadataVersion).not.toHaveBeenCalled();
      expect(h.afterCommit).not.toHaveBeenCalled();
    }
  });
});
