import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
  MYAH_STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import { SEED_YCOMBINATOR_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

const COMMAND_NAME =
  'upgrade:2-20:synchronize-campaign-activity-control-metadata';
const execFileAsync = promisify(execFile);
const workspaceId = SEED_YCOMBINATOR_WORKSPACE_ID;
const schemaName = getWorkspaceSchemaName(workspaceId);
const schema = escapeIdentifier(schemaName);
const fieldUniversalIdentifier =
  MYAH_STANDARD_OBJECTS.campaignCreator.fields.stage.universalIdentifier;
const testNames = ['PR164 known', 'PR164 null', 'PR164 unknown'];

const runCommand = () =>
  execFileAsync(
    process.execPath,
    ['dist/command/command.js', COMMAND_NAME, '--workspace-id', workspaceId],
    { cwd: process.cwd(), env: process.env },
  );

const readState = async () => {
  const [metadata] = await global.testDataSource.query<
    Array<{ id: string; type: string; options: unknown }>
  >(
    `SELECT id,type,options FROM core."fieldMetadata"
      WHERE "workspaceId"=$1 AND "universalIdentifier"=$2`,
    [workspaceId, fieldUniversalIdentifier],
  );
  const [column] = await global.testDataSource.query<
    Array<{ dataType: string; udtName: string }>
  >(
    `SELECT data_type AS "dataType",udt_name AS "udtName"
       FROM information_schema.columns
      WHERE table_schema=$1 AND table_name='campaignCreator' AND column_name='stage'`,
    [schemaName],
  );
  // SAFETY: schema is a UUID-derived escaped identifier.
  // pi-lens-ignore: sql-injection
  const rows = await global.testDataSource.query<
    Array<{ name: string; stage: string | null }>
  >(
    `SELECT name,stage::text AS stage FROM ${schema}."campaignCreator"
      WHERE name=ANY($1::text[]) ORDER BY name`,
    [testNames],
  );

  return { column, metadata, rows };
};

const prepareLegacyTextStage = async () => {
  // SAFETY: schema is a UUID-derived escaped identifier.
  // pi-lens-ignore: sql-injection
  await global.testDataSource.query(
    `ALTER TABLE ${schema}."campaignCreator" ALTER COLUMN stage DROP DEFAULT`,
  );
  // pi-lens-ignore: sql-injection
  await global.testDataSource.query(
    `ALTER TABLE ${schema}."campaignCreator" ALTER COLUMN stage TYPE text USING stage::text`,
  );
  // pi-lens-ignore: sql-injection
  await global.testDataSource.query(
    `ALTER TABLE ${schema}."campaignCreator" ALTER COLUMN stage SET DEFAULT 'READY'::text`,
  );
  await global.testDataSource.query(
    `UPDATE core."fieldMetadata" SET type='TEXT',options=NULL
      WHERE "workspaceId"=$1 AND "universalIdentifier"=$2`,
    [workspaceId, fieldUniversalIdentifier],
  );
};

describe('2.20 workspace command 1789313971536 legacy stage conversion (postgres)', () => {
  afterAll(async () => {
    // SAFETY: schema is a UUID-derived escaped identifier.
    // pi-lens-ignore: sql-injection
    await global.testDataSource.query(
      `DELETE FROM ${schema}."campaignCreator" WHERE name=ANY($1::text[])`,
      [testNames],
    );
    const state = await readState();
    if (state.metadata?.type === 'TEXT') await runCommand();
  });

  it('preserves known and null values, retries idempotently, and rejects unknown values without partial changes', async () => {
    const [{ id: fieldId }] = await global.testDataSource.query<
      Array<{ id: string }>
    >(
      `SELECT id FROM core."fieldMetadata"
        WHERE "workspaceId"=$1 AND "universalIdentifier"=$2`,
      [workspaceId, fieldUniversalIdentifier],
    );
    // SAFETY: schema is a UUID-derived escaped identifier.
    // pi-lens-ignore: sql-injection
    await global.testDataSource.query(
      `DELETE FROM ${schema}."campaignCreator" WHERE name=ANY($1::text[])`,
      [testNames],
    );
    await prepareLegacyTextStage();
    // pi-lens-ignore: sql-injection
    await global.testDataSource.query(
      `INSERT INTO ${schema}."campaignCreator" (name,stage)
       VALUES ('PR164 known','CONTACTED'),('PR164 null',NULL)`,
    );

    const firstRun = await runCommand();
    expect(firstRun.stderr).not.toContain(`Error in workspace ${workspaceId}`);
    const converted = await readState();
    expect(converted.metadata).toMatchObject({
      id: fieldId,
      type: 'SELECT',
      options: MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
    });
    expect(converted.column).toEqual({
      dataType: 'USER-DEFINED',
      udtName: 'campaignCreator_stage_enum',
    });
    expect(converted.rows).toEqual([
      { name: 'PR164 known', stage: 'CONTACTED' },
      { name: 'PR164 null', stage: null },
    ]);

    const retry = await runCommand();
    expect(retry.stderr).not.toContain(`Error in workspace ${workspaceId}`);
    expect(await readState()).toEqual(converted);

    await prepareLegacyTextStage();
    // SAFETY: schema is a UUID-derived escaped identifier.
    // pi-lens-ignore: sql-injection
    await global.testDataSource.query(
      `INSERT INTO ${schema}."campaignCreator" (name,stage)
       VALUES ('PR164 unknown','LEGACY_UNKNOWN')`,
    );
    const beforeRejectedRun = await readState();

    const rejectedRun = await runCommand();
    expect(rejectedRun.stderr).toContain(
      `Campaign Creator stage contains unsupported legacy values for workspace ${workspaceId}`,
    );
    expect(await readState()).toEqual(beforeRejectedRun);
  });
});
