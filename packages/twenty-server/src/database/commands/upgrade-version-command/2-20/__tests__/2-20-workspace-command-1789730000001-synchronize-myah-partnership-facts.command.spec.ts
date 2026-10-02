import type { DataSource } from 'typeorm';
import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import type { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { SynchronizeSourceControlledMyahMetadataService } from 'src/database/commands/upgrade-version-command/2-19/services/synchronize-source-controlled-myah-metadata.service';
import { SynchronizeMyahPartnershipFactsCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789730000001-synchronize-myah-partnership-facts.command';
import { getRegisteredWorkspaceCommandMetadata } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import type { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';

const campaignCreatorId =
  MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier;

const createCommand = (campaignCreatorExists = true, ready = true) => {
  const events: string[] = [];
  const runner = {
    isTransactionActive: false,
    connect: jest.fn(async () => {
      events.push('connect');
    }),
    startTransaction: jest.fn(async () => {
      runner.isTransactionActive = true;
      events.push('begin');
    }),
    commitTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
      events.push('commit');
    }),
    rollbackTransaction: jest.fn(async () => {
      runner.isTransactionActive = false;
      events.push('rollback');
    }),
    release: jest.fn(async () => {
      events.push('release');
    }),
    query: jest.fn(async (sql: string) => {
      events.push(sql.startsWith('SELECT') ? 'verify' : 'ddl');
      return sql.startsWith('SELECT') ? [{ ready }] : [];
    }),
  };
  const coreDataSource = { createQueryRunner: jest.fn(() => runner) };
  const synchronizeWorkspace = jest.fn().mockImplementation(async () => {
    events.push('metadata');
  });
  const getOrRecompute = jest.fn().mockResolvedValue({
    flatObjectMetadataMaps: {
      byUniversalIdentifier: campaignCreatorExists
        ? { [campaignCreatorId]: {} }
        : {},
    },
  });
  const command = new SynchronizeMyahPartnershipFactsCommand(
    {} as WorkspaceIteratorService,
    {
      synchronizeWorkspace,
    } as unknown as SynchronizeSourceControlledMyahMetadataService,
    { getOrRecompute } as unknown as WorkspaceCacheService,
    coreDataSource as unknown as DataSource,
  );
  return { command, synchronizeWorkspace, coreDataSource, runner, events };
};

const args = {
  workspaceId: '20202020-0000-0000-0000-000000000001',
  options: { dryRun: false },
  index: 0,
  total: 1,
  dataSource: {} as never,
};

describe('SynchronizeMyahPartnershipFactsCommand', () => {
  it('registers the upgrade and selects both objects, all bidirectional relations and read-only permissions', async () => {
    expect(
      getRegisteredWorkspaceCommandMetadata(
        SynchronizeMyahPartnershipFactsCommand,
      ),
    ).toMatchObject({ version: '2.20.0', timestamp: 1789730000001 });
    const { command, synchronizeWorkspace, runner, events } = createCommand();
    await command.runOnWorkspace(args);
    expect(events.indexOf('verify')).toBeLessThan(events.indexOf('commit'));
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('metadata'));
    expect(events.filter((event) => event === 'verify')).toHaveLength(1);
    expect(
      runner.query.mock.calls.some(([sql]) =>
        sql.includes(
          'CREATE TABLE IF NOT EXISTS core."campaignPartnershipWorkItem"',
        ),
      ),
    ).toBe(true);
    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
    const selection = synchronizeWorkspace.mock.calls[0][1];
    expect(selection.objectMetadata).toEqual(
      new Set([
        MYAH_STANDARD_OBJECTS.partnershipOfferVersion.universalIdentifier,
        MYAH_STANDARD_OBJECTS.partnershipObligation.universalIdentifier,
      ]),
    );
    for (const id of [
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.offerVersions
        .universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaignCreator.fields.partnershipObligations
        .universalIdentifier,
      MYAH_STANDARD_OBJECTS.partnershipObligation.fields.task
        .universalIdentifier,
      STANDARD_OBJECTS.task.fields.partnershipObligations.universalIdentifier,
    ])
      expect(selection.fieldMetadata.has(id)).toBe(true);
    expect(selection.index).toEqual(
      new Set([
        MYAH_STANDARD_OBJECTS.partnershipOfferVersion.indexes
          .campaignCreatorVersionUniqueIndex.universalIdentifier,
        MYAH_STANDARD_OBJECTS.partnershipObligation.indexes
          .offerVersionPurposeUniqueIndex.universalIdentifier,
      ]),
    );
    expect(selection.objectPermission.size).toBe(2);
    const catalogSql =
      runner.query.mock.calls[runner.query.mock.calls.length - 1][0];
    expect(catalogSql).toContain('pg_catalog.pg_attribute');
    expect(catalogSql).toContain('a.attnotnull = expected.required');
    expect(catalogSql).toContain('i.indpred IS NULL');
    expect(catalogSql).toContain(
      'c.confrelid = to_regclass(\'core."workspace"\')',
    );
    expect(catalogSql).toContain("c.confdeltype = 'c'");
    expect(catalogSql).toContain('c.confkey = ARRAY[');
    expect(catalogSql).toContain('c.conkey = ARRAY[');
    expect(catalogSql).toContain(
      'pg_catalog.pg_get_expr(c.conbin, c.conrelid) = expected.expression',
    );
    expect(catalogSql).toContain('c.convalidated');
  });

  it('requires the exact PG16 column defaults, including absent defaults', async () => {
    const { command, runner } = createCommand();
    await command.runOnWorkspace(args);
    const sql = runner.query.mock.calls[runner.query.mock.calls.length - 1][0];
    expect(sql).toContain('LEFT JOIN pg_catalog.pg_attrdef d');
    expect(sql).toContain('d.adrelid = a.attrelid AND d.adnum = a.attnum');
    expect(sql).toContain('pg_catalog.pg_get_expr(d.adbin, d.adrelid)');
    expect(sql).toContain('IS NOT DISTINCT FROM expected.default_expr');
    for (const expected of [
      "('id', 'uuid', true, 'uuid_generate_v4()')",
      "('state', 'character varying(32)', true, $default$'PENDING'::character varying$default$)",
      "('contextGeneration', 'integer', true, '0')",
      "('attempts', 'integer', true, '0')",
      "('createdAt', 'timestamp with time zone', true, 'now()')",
      "('updatedAt', 'timestamp with time zone', true, 'now()')",
      "('workspaceId', 'uuid', true, NULL::text)",
      "('receiptId', 'uuid', false, NULL)",
    ])
      expect(sql).toContain(expected);
    // A mutated default is not equivalent to the stored source-owned default.
    expect(sql).not.toContain("$default$'HELD'::character varying$default$");
  });

  it('compares regex CHECK deparse without changing literal whitespace', async () => {
    const { command, runner } = createCommand();
    await command.runOnWorkspace(args);
    const sql = runner.query.mock.calls[runner.query.mock.calls.length - 1][0];
    const expected = sql.match(
      /\('CHK_CAMPAIGN_PARTNERSHIP_WORK_ITEM_TRIGGER',\s*\$check\$(.*?)\$check\$\)/s,
    )?.[1];
    expect(expected).toBeDefined();
    expect(expected).toContain('[0-9a-f]{8}');
    expect(expected).not.toEqual(expected?.replace('[0-9a-f]', '[0-9 a-f]'));
    expect(sql).toContain(
      'pg_catalog.pg_get_expr(c.conbin, c.conrelid) = expected.expression',
    );
    expect(sql).not.toContain('regexp_replace(pg_catalog.pg_get_expr(c.conbin');
  });

  it('fails before core DDL when CampaignCreator metadata or the datasource is missing', async () => {
    const { command, synchronizeWorkspace, coreDataSource } = createCommand(false);
    await expect(command.runOnWorkspace(args)).rejects.toThrow(
      'CampaignCreator metadata prerequisite is absent',
    );
    await expect(
      command.runOnWorkspace({ ...args, dataSource: undefined }),
    ).rejects.toThrow('workspace datasource');
    expect(coreDataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('never issues core DDL on dry-run, while retaining the metadata simulation', async () => {
    const { command, coreDataSource, synchronizeWorkspace } = createCommand();
    await command.runOnWorkspace({ ...args, options: { dryRun: true } });
    expect(coreDataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).toHaveBeenCalledTimes(1);
  });

  it('rejects an incompatible catalog result before installing metadata', async () => {
    // Catalog predicates above cover partial indexes, wrong CHECK/FK and
    // nullable columns; the mocked database boundary returns their failed result.
    const { command, runner, synchronizeWorkspace } = createCommand(
      true,
      false,
    );
    await expect(command.runOnWorkspace(args)).rejects.toThrow(
      'physical contract',
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('rolls back failed DDL and does not start metadata', async () => {
    const { command, runner, synchronizeWorkspace } = createCommand();
    runner.query.mockRejectedValueOnce(new Error('DDL failed'));
    await expect(command.runOnWorkspace(args)).rejects.toThrow('DDL failed');
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(synchronizeWorkspace).not.toHaveBeenCalled();
  });

  it('commits core independently so failed metadata can retry without touching peer workspace cursors', async () => {
    const { command, runner, synchronizeWorkspace, events } = createCommand();
    synchronizeWorkspace.mockImplementationOnce(async () => {
      events.push('metadata');
      throw new Error('metadata failed');
    });
    await expect(command.runOnWorkspace(args)).rejects.toThrow(
      'metadata failed',
    );
    expect(events.slice(-2)).toEqual(['release', 'metadata']);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    await command.runOnWorkspace({
      ...args,
      workspaceId: '20202020-0000-0000-0000-000000000002',
    });
    expect(runner.commitTransaction).toHaveBeenCalledTimes(2);
    expect(synchronizeWorkspace).toHaveBeenCalledTimes(2);
    expect(
      runner.query.mock.calls.every(
        ([sql]) =>
          sql.includes('campaignPartnershipWorkItem') ||
          sql.includes('protectCampaignPartnershipWorkItemIdentity') ||
          sql.includes('CAMPAIGN_PARTNERSHIP_WORK_ITEM'),
      ),
    ).toBe(true);
  });
});
