import { randomUUID } from 'node:crypto';

import {
  MYAH_CAMPAIGN_CREATOR_STAGES,
  MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
  MYAH_STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';
import { type QueryRunner } from 'typeorm';

import { UpgradeMyahCampaignCreatorStageCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789066000000-upgrade-myah-campaign-creator-stage.command';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { computePostgresEnumName } from 'src/engine/workspace-manager/workspace-migration/utils/compute-postgres-enum-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

const stageFieldUniversalIdentifier =
  MYAH_STANDARD_OBJECTS.campaignCreator.fields.stage.universalIdentifier;
const campaignCreatorUniversalIdentifier =
  MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier;
const enumName = computePostgresEnumName({
  tableName: 'campaignCreator',
  columnName: 'stage',
});
const workspaceIds = Array.from({ length: 13 }, () => randomUUID());

type Fixture = {
  workspaceId: string;
  schemaName: string;
  table: string;
  enumType: string;
  metadataId: string;
};

const createFixture = async (
  workspaceId: string,
  values: readonly (string | null)[],
  storage: 'text' | 'varchar' = 'text',
  storageIsNullable = true,
): Promise<Fixture> => {
  const schemaName = getWorkspaceSchemaName(workspaceId);
  const table = `${escapeIdentifier(schemaName)}."campaignCreator"`;
  const enumType = `${escapeIdentifier(schemaName)}.${escapeIdentifier(enumName)}`;
  const objectMetadataId = randomUUID();
  const metadataId = randomUUID();

  await global.testDataSource.query(
    `CREATE SCHEMA IF NOT EXISTS ${escapeIdentifier(schemaName)}`,
  );
  await global.testDataSource.query(
    `CREATE TABLE ${table} ("id" uuid PRIMARY KEY, "stage" ${storage}${storageIsNullable ? '' : ' NOT NULL'})`,
  );
  await global.testDataSource.query(`
    CREATE TABLE ${escapeIdentifier(schemaName)}."stageObjectMetadata" (
      "id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL,
      "universalIdentifier" uuid NOT NULL
    )
  `);
  await global.testDataSource.query(`
    CREATE TABLE ${escapeIdentifier(schemaName)}."stageFieldMetadata" (
      "id" uuid PRIMARY KEY, "workspaceId" uuid NOT NULL,
      "universalIdentifier" uuid NOT NULL, "type" varchar NOT NULL,
      "options" jsonb, "defaultValue" jsonb, "isNullable" boolean,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await global.testDataSource.query(
    `INSERT INTO ${escapeIdentifier(schemaName)}."stageObjectMetadata"
      ("id", "workspaceId", "universalIdentifier") VALUES ($1, $2, $3)`,
    [objectMetadataId, workspaceId, campaignCreatorUniversalIdentifier],
  );
  await global.testDataSource.query(
    `INSERT INTO ${escapeIdentifier(schemaName)}."stageFieldMetadata"
      ("id", "workspaceId", "universalIdentifier", "type", "options", "defaultValue", "isNullable")
      VALUES ($1, $2, $3, $4, NULL, NULL, true)`,
    [
      metadataId,
      workspaceId,
      stageFieldUniversalIdentifier,
      FieldMetadataType.TEXT,
    ],
  );
  for (const value of values) {
    await global.testDataSource.query(
      `INSERT INTO ${table} ("id", "stage") VALUES ($1, $2)`,
      [randomUUID(), value],
    );
  }
  return { workspaceId, schemaName, table, enumType, metadataId };
};

const buildCommand = (
  fixture: Fixture,
  transform?: (runner: QueryRunner) => QueryRunner,
) => {
  const cache = { flush: jest.fn(), invalidateAndRecompute: jest.fn() };
  const versions = { incrementMetadataVersion: jest.fn() };
  const coreDataSource = transform
    ? {
        createQueryRunner: () =>
          transform(global.testDataSource.createQueryRunner()),
      }
    : global.testDataSource;
  class TestUpgradeCommand extends UpgradeMyahCampaignCreatorStageCommand {
    protected override objectMetadataTable(): string {
      return `${escapeIdentifier(fixture.schemaName)}."stageObjectMetadata"`;
    }

    protected override fieldMetadataTable(): string {
      return `${escapeIdentifier(fixture.schemaName)}."stageFieldMetadata"`;
    }
  }
  const command = new TestUpgradeCommand(
    {} as never,
    cache as never,
    versions as never,
  );
  return {
    cache,
    versions,
    run: () =>
      command.runOnWorkspace({
        workspaceId: fixture.workspaceId,
        options: {},
        index: 0,
        total: 1,
        dataSource: { coreDataSource } as never,
      }),
  };
};

const readStorage = async ({ schemaName }: Fixture) => {
  const [row] = await global.testDataSource.query(
    `SELECT "data_type" AS "dataType", "udt_name" AS "udtName",
            "column_default" AS "columnDefault",
            ("is_nullable" = 'YES') AS "isNullable"
       FROM information_schema.columns
      WHERE "table_schema" = $1 AND "table_name" = 'campaignCreator'
        AND "column_name" = 'stage'`,
    [schemaName],
  );
  return row;
};

const readMetadata = async ({ metadataId, schemaName }: Fixture) => {
  const [row] = await global.testDataSource.query(
    `SELECT "type", "options", "defaultValue", "isNullable"
       FROM ${escapeIdentifier(schemaName)}."stageFieldMetadata"
      WHERE "id" = $1`,
    [metadataId],
  );
  return row;
};

const readStages = async ({ table }: Fixture) =>
  global.testDataSource.query(
    `SELECT "stage" FROM ${table} ORDER BY "id"`,
  ) as Promise<{ stage: string | null }[]>;

describe('Campaign Creator stage durable PostgreSQL upgrade', () => {
  it('converts TEXT in place, normalizes approved values, preserves NULL, and permits approved edits', async () => {
    const fixture = await createFixture(workspaceIds[0], [
      ' ready ',
      'Contacted',
      null,
    ]);

    await buildCommand(fixture).run();

    expect(await readStorage(fixture)).toMatchObject({
      dataType: 'USER-DEFINED',
      udtName: enumName,
      columnDefault: expect.stringContaining("'READY'"),
    });
    expect(
      (await readStages(fixture)).map(({ stage }) => stage).sort(),
    ).toEqual([null, 'CONTACTED', 'READY'].sort());
    expect(await readMetadata(fixture)).toEqual({
      type: FieldMetadataType.SELECT,
      options: MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
      defaultValue: "'READY'",
      isNullable: true,
    });
    await global.testDataSource.query(
      `UPDATE ${fixture.table} SET "stage" = 'POSTED' WHERE "stage" = 'READY'`,
    );
    expect((await readStages(fixture)).map(({ stage }) => stage)).toContain(
      'POSTED',
    );
  });

  it('converts varchar storage', async () => {
    const fixture = await createFixture(
      workspaceIds[1],
      ['NEGOTIATING'],
      'varchar',
    );
    await buildCommand(fixture).run();
    expect(await readStorage(fixture)).toMatchObject({
      dataType: 'USER-DEFINED',
      udtName: enumName,
    });
  });

  it.each([
    [workspaceIds[2], ''],
    [workspaceIds[3], 'REPLIED'],
    [workspaceIds[4], 'SOMETHING_ELSE'],
  ])('refuses invalid TEXT %p with zero change', async (workspaceId, value) => {
    const fixture = await createFixture(workspaceId, [value]);
    const storage = await readStorage(fixture);
    const metadata = await readMetadata(fixture);
    const stages = await readStages(fixture);

    await expect(buildCommand(fixture).run()).rejects.toThrow(
      'blank, obsolete, or unknown',
    );

    expect(await readStorage(fixture)).toEqual(storage);
    expect(await readMetadata(fixture)).toEqual(metadata);
    expect(await readStages(fixture)).toEqual(stages);
  });

  it('refuses NOT NULL TEXT storage with zero change', async () => {
    const fixture = await createFixture(
      workspaceIds[8],
      ['READY'],
      'text',
      false,
    );
    const storage = await readStorage(fixture);
    const metadata = await readMetadata(fixture);

    await expect(buildCommand(fixture).run()).rejects.toThrow(
      'storage is not nullable',
    );
    expect(await readStorage(fixture)).toEqual(storage);
    expect(await readMetadata(fixture)).toEqual(metadata);
  });

  it('refuses NOT NULL canonical enum storage with zero change', async () => {
    const fixture = await createFixture(workspaceIds[12], ['READY']);
    await buildCommand(fixture).run();
    await global.testDataSource.query(
      `ALTER TABLE ${fixture.table} ALTER COLUMN "stage" SET NOT NULL`,
    );
    const storage = await readStorage(fixture);
    const metadata = await readMetadata(fixture);

    await expect(buildCommand(fixture).run()).rejects.toThrow(
      'storage is not nullable',
    );
    expect(await readStorage(fixture)).toEqual(storage);
    expect(await readMetadata(fixture)).toEqual(metadata);
  });

  it.each([
    [false, workspaceIds[9]],
    [null, workspaceIds[10]],
  ])(
    'refuses legacy metadata nullability %p with zero change',
    async (isNullable, workspaceId) => {
      const fixture = await createFixture(workspaceId as string, ['READY']);
      await global.testDataSource.query(
        `UPDATE ${escapeIdentifier(fixture.schemaName)}."stageFieldMetadata"
            SET "isNullable" = $2 WHERE "id" = $1`,
        [fixture.metadataId, isNullable],
      );
      const storage = await readStorage(fixture);
      const metadata = await readMetadata(fixture);

      await expect(buildCommand(fixture).run()).rejects.toThrow(
        'TEXT stage metadata is noncanonical',
      );
      expect(await readStorage(fixture)).toEqual(storage);
      expect(await readMetadata(fixture)).toEqual(metadata);
    },
  );

  it('rolls back DDL, data, and metadata when conversion fails', async () => {
    const fixture = await createFixture(workspaceIds[5], [' contacted ']);
    const transform = (runner: QueryRunner) => {
      const query = runner.query.bind(runner);
      runner.query = async (sql: string, parameters?: unknown[]) => {
        if (sql.includes('UPDATE') && sql.includes('"stageFieldMetadata"')) {
          throw new Error('injected metadata failure');
        }
        return query(sql, parameters);
      };
      return runner;
    };

    await expect(buildCommand(fixture, transform).run()).rejects.toThrow(
      'injected metadata failure',
    );
    expect(await readStorage(fixture)).toMatchObject({ dataType: 'text' });
    expect(await readStages(fixture)).toEqual([{ stage: ' contacted ' }]);
    expect(await readMetadata(fixture)).toMatchObject({
      type: FieldMetadataType.TEXT,
      options: null,
      defaultValue: null,
    });
  });

  it('accepts exact canonical storage and metadata and retries publication', async () => {
    const fixture = await createFixture(workspaceIds[6], ['READY']);
    await buildCommand(fixture).run();
    const rerun = buildCommand(fixture);
    rerun.cache.invalidateAndRecompute.mockRejectedValueOnce(
      new Error('cache unavailable'),
    );

    await expect(rerun.run()).rejects.toThrow('cache unavailable');
    await expect(rerun.run()).resolves.toBeUndefined();

    const labels = await global.testDataSource.query(
      `SELECT e.enumlabel AS label FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = $1 AND t.typname = $2 ORDER BY e.enumsortorder`,
      [fixture.schemaName, enumName],
    );
    expect(labels.map(({ label }: { label: string }) => label)).toEqual(
      MYAH_CAMPAIGN_CREATOR_STAGES,
    );
    expect(rerun.cache.invalidateAndRecompute).toHaveBeenCalledTimes(2);
  });

  it('refuses canonical enum metadata with an extra option property', async () => {
    const fixture = await createFixture(workspaceIds[11], ['READY']);
    await buildCommand(fixture).run();
    const extraOptions = MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS.map(
      (option, index) =>
        index === 0 ? { ...option, obsoleteProperty: true } : option,
    );
    await global.testDataSource.query(
      `UPDATE ${escapeIdentifier(fixture.schemaName)}."stageFieldMetadata"
          SET "options" = $2::jsonb WHERE "id" = $1`,
      [fixture.metadataId, JSON.stringify(extraOptions)],
    );
    const storage = await readStorage(fixture);
    const metadata = await readMetadata(fixture);

    await expect(buildCommand(fixture).run()).rejects.toThrow(
      'SELECT stage metadata is noncanonical',
    );
    expect(await readStorage(fixture)).toEqual(storage);
    expect(await readMetadata(fixture)).toEqual(metadata);
  });

  it('refuses the old nine-value enum without changing metadata', async () => {
    const fixture = await createFixture(workspaceIds[7], []);
    await global.testDataSource.query(
      `CREATE TYPE ${fixture.enumType} AS ENUM
       ('READY','CONTACTED','REPLIED','NEGOTIATING','AGREED','ONBOARDING','LIVE','COMPLETED','DROPPED')`,
    );
    await global.testDataSource.query(
      `ALTER TABLE ${fixture.table} ALTER COLUMN "stage" TYPE ${fixture.enumType}
       USING "stage"::text::${fixture.enumType}`,
    );
    const metadata = await readMetadata(fixture);

    await expect(buildCommand(fixture).run()).rejects.toThrow(
      'noncanonical SELECT enum storage',
    );
    expect(await readMetadata(fixture)).toEqual(metadata);
  });
});
