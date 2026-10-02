import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { RetireBrandBrainMetadataCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';
import { WorkspaceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/workspace-command-runner.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { TWENTY_STANDARD_APPLICATION } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-applications';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
const expectedSchema = getWorkspaceSchemaName(workspaceId);
const otherSchema = getWorkspaceSchemaName(otherWorkspaceId);

const setup = () => {
  const rows: Record<string, Record<string, unknown>[]> = {};
  const expectedTables = [
    'application',
    'objectMetadata',
    'fieldMetadata',
    'indexMetadata',
    'searchFieldMetadata',
    'role',
    'roleTarget',
    'objectPermission',
    'fieldPermission',
    'view',
    'viewField',
    'viewFilter',
    'viewSort',
    'viewGroup',
    'navigationMenuItem',
    'pageLayout',
    'pageLayoutTab',
    'pageLayoutWidget',
  ];
  const columns = expectedTables.map((table) => ({
    table_name: table,
    columns: [
      'workspaceId',
      'id',
      'universalIdentifier',
      ...(table === 'application' ? [] : ['applicationId']),
      'deletedAt',
      'name',
      'nameSingular',
      'namePlural',
    ],
  }));
  let schemaExists = true;
  let physicalRetiredTables = false;
  let databaseSchema = expectedSchema;
  let malformedCatalogColumns = false;
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM "core"."workspace"')) {
      expect(sql).toContain('WHERE "id" = $1');
      expect(params).toEqual([workspaceId]);
      return [{ databaseSchema }];
    }
    if (sql.includes('pg_class')) {
      if (sql.includes('array_agg')) {
        // Installed pg decodes PostgreSQL name[] (OID 1003) as a string;
        // text[] is parsed as string[]. Do not conceal the real wire shape.
        if (malformedCatalogColumns || !sql.includes('a.attname::text'))
          return columns.map((row) => ({
            ...row,
            columns: `{${row.columns.join(',')}}`,
          }));
        return columns;
      }
      expect(sql).toContain(
        "lower(c.relname) IN ('brandbrainpage', 'brandbrainlink', 'brandbrainupdateproposal')",
      );
      expect(params).toEqual([expectedSchema]);
      return physicalRetiredTables ? [{ relname: 'brandBrainPage' }] : [];
    }
    if (sql.includes('pg_namespace')) {
      expect(sql).toContain('nspname = $1');
      expect(params).toEqual([expectedSchema]);
      return [{ exists: schemaExists }];
    }
    const table = sql.match(/FROM "core"\."([^"]+)"/i)?.[1];
    if (table) {
      expect(params?.[0]).toBe(workspaceId);
      const placeholders = [...sql.matchAll(/\$(\d+)/g)].map((match) =>
        Number(match[1]),
      );
      expect([...new Set(placeholders)].sort((a, b) => a - b)).toEqual(
        Array.from({ length: params?.length ?? 0 }, (_, i) => i + 1),
      );
      return rows[table] ?? [];
    }
    throw new Error(`Unexpected physical query: ${sql}`);
  });
  const runner = {
    query,
    startTransaction: jest.fn(async () => {
      runner.isTransactionActive = true;
    }),
    commitTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
    }),
    rollbackTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
    }),
    isTransactionActive: false,
    isReleased: false,
  };
  const command = new RetireBrandBrainMetadataCommand(
    null as never,
    {} as never,
    {} as never,
    { flush: jest.fn(async () => undefined) } as never,
    {} as never,
    { load: jest.fn(async () => ({
      allFlatEntityMaps: { flatObjectMetadataMaps: { byUniversalIdentifier: {} } },
      flatApplicationMaps: { idByUniversalIdentifier: {
        [TWENTY_STANDARD_APPLICATION.universalIdentifier]: 'standard',
      } },
    })) } as never,
    {} as never,
    {} as never,
    { publishCommittedMetadataVersion: jest.fn(async () => undefined) } as never,
  );
  const ledger = jest.fn(async () => undefined);
  const outer = new WorkspaceCommandRunnerService(
    { get: () => '2.20.0' } as never,
    { recordUpgradeMigration: ledger } as never,
    { invalidateInstanceAndAllWorkspacesStatus: jest.fn() } as never,
    { currentRunner: () => runner } as never,
  );
  const run = () =>
    outer.runWorkspaceCommands({
      iteratorContext: { workspaceId, index: 0, total: 1 } as never,
      options: { dryRun: false },
      workspaceCommands: [{ name: '0410', command }],
    });
  return {
    run,
    rows,
    columns,
    query,
    ledger,
    runner,
    setSchemaExists: (value: boolean) => {
      schemaExists = value;
    },
    setDatabaseSchema: (value: string) => {
      databaseSchema = value;
    },
    setMalformedCatalogColumns: (value: boolean) => {
      malformedCatalogColumns = value;
    },
    setPhysicalRetiredTables: (value: boolean) => {
      physicalRetiredTables = value;
    },
  };
};

describe('0410 verified-empty ordered upgrade', () => {
  it('records exactly one completed receipt after authoritative empty checks', async () => {
    const f = setup();
    await f.run();
    expect(f.ledger).toHaveBeenCalledTimes(1);
    expect(f.ledger).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '0410',
        status: 'completed',
        queryRunner: f.runner,
      }),
    );
    expect(f.runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "core"."workspace"'),
      [workspaceId],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM pg_namespace WHERE nspname = $1'),
      [expectedSchema],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "lower(c.relname) IN ('brandbrainpage', 'brandbrainlink', 'brandbrainupdateproposal')",
      ),
      [expectedSchema],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'array_agg(a.attname::text ORDER BY a.attname)::text[]',
      ),
    );
    const appRead = f.query.mock.calls.find(([sql]) =>
      sql.includes('FROM "core"."application"'),
    );
    expect(appRead?.[0]).toContain(
      't."universalIdentifier"::text = ANY($2::text[])',
    );
    expect(appRead?.[0]).toContain('unnest($3::text[])');
    expect(appRead?.[0]).not.toContain('t."applicationId"');
    expect(appRead?.[1]).toHaveLength(3);
    const objectRead = f.query.mock.calls.find(([sql]) =>
      sql.includes('FROM "core"."objectMetadata"'),
    );
    expect(objectRead?.[0]).toContain('t."applicationId"::text = $3');
    expect(objectRead?.[0]).toContain('unnest($4::text[])');
    expect(objectRead?.[1]).toHaveLength(4);
    const fieldRead = f.query.mock.calls.find(([sql]) =>
      sql.includes('FROM "core"."fieldMetadata"'),
    );
    expect(fieldRead?.[1]?.[1]).toContain(
      MYAH_STANDARD_OBJECTS.brandBrainPage.fields.id.universalIdentifier,
    );
  });

  it('uses contiguous parameters for a physical owner-only table without a UID column', async () => {
    const f = setup();
    f.columns.push({
      table_name: 'ownerOnlyMetadata',
      columns: ['id', 'workspaceId', 'applicationId'],
    });
    await f.run();
    const read = f.query.mock.calls.find(([sql]) =>
      sql.includes('FROM "core"."ownerOnlyMetadata"'),
    );
    expect(read?.[0]).toContain('t."applicationId"::text = $2');
    expect(read?.[0]).toContain('unnest($3::text[])');
    expect(read?.[0]).not.toContain('t."universalIdentifier"');
    expect(read?.[1]).toHaveLength(3);
    expect(f.ledger).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('refuses absent workspace schema or incomplete physical tables', async () => {
    const f = setup();
    f.query.mockResolvedValueOnce([]);
    await expect(f.run()).rejects.toThrow();
    expect(f.ledger).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
    const missingSchema = setup();
    missingSchema.setSchemaExists(false);
    await expect(missingSchema.run()).rejects.toThrow(/schema absent/);
    expect(missingSchema.ledger).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
    const g = setup();
    g.columns.pop();
    await expect(g.run()).rejects.toThrow();
    expect(g.ledger).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('rejects an unexpected catalog-array runtime shape before metadata scans or completion', async () => {
    const f = setup();
    f.setMalformedCatalogColumns(true);
    await expect(f.run()).rejects.toThrow(/unexpected catalog columns/);
    expect(
      f.query.mock.calls.some(([sql]) =>
        sql.includes('FROM "core"."application"'),
      ),
    ).toBe(false);
    expect(f.ledger).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('rejects a misbound A to B schema before scanning B or recording completion', async () => {
    const f = setup();
    f.setDatabaseSchema(otherSchema);
    await expect(f.run()).rejects.toThrow(/workspace schema/);
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "core"."workspace"'),
      [workspaceId],
    );
    expect(
      f.query.mock.calls.some(
        ([sql]) => sql.includes('pg_namespace') || sql.includes('pg_class'),
      ),
    ).toBe(false);
    expect(f.ledger).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('rejects orphan physical record tables in the correctly derived A schema before receipt', async () => {
    const f = setup();
    f.setPhysicalRetiredTables(true);
    await expect(f.run()).rejects.toThrow(/physical record table/);
    expect(f.ledger).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it.each([
    'application',
    'objectMetadata',
    'pageLayout',
    'navigationMenuItem',
    'viewField',
    'role',
  ])(
    'rejects even soft-deleted retired %s before completion',
    async (table) => {
      const f = setup();
      f.rows[table] = [{ id: 'historical', deletedAt: '2024-01-01' }];
      await expect(f.run()).rejects.toThrow(/Brand Brain/);
      expect(f.ledger).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' }),
      );
    },
  );

  it('rolls back rejected physical state and never commits a completed receipt', async () => {
    const f = setup();
    f.rows.pageLayoutWidget = [
      { id: 'soft-deleted-reference', deletedAt: '2024-01-01' },
    ];
    await expect(f.run()).rejects.toThrow(/Brand Brain/);
    expect(f.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(f.runner.commitTransaction).toHaveBeenCalledTimes(1); // separate failed-attempt receipt
    expect(f.ledger).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('does not contradict an uncertain COMMIT with failed receipt', async () => {
    const f = setup();
    f.runner.commitTransaction.mockRejectedValueOnce(new Error('uncertain'));
    await expect(f.run()).rejects.toThrow('uncertain');
    expect(f.ledger).toHaveBeenCalledTimes(1);
    expect(f.ledger).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
  });
});
