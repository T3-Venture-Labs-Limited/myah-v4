import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { SEED_YCOMBINATOR_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const COMMAND_NAME =
  'upgrade:2-20:synchronize-myah-campaign-sequence-authorization-metadata';
const SEQUENCE_AUTHORIZATION_COLUMN_NAME = 'sequenceAuthorization';
const CUSTOM_CAMPAIGN_LABEL = 'Workspace-customized Campaign';
const execFileAsync = promisify(execFile);
const workspaceSchemaName = getWorkspaceSchemaName(
  SEED_YCOMBINATOR_WORKSPACE_ID,
);

const runCommand = () =>
  execFileAsync(
    process.execPath,
    [
      'dist/command/command.js',
      COMMAND_NAME,
      '--workspace-id',
      SEED_YCOMBINATOR_WORKSPACE_ID,
    ],
    { cwd: process.cwd(), env: process.env },
  );

const readField = async () =>
  global.testDataSource.query(
    `SELECT fm."universalIdentifier", fm.name, fm."isNullable", fm."isUIEditable",
            fm."isSystem", fm.type, md5(to_jsonb(fm)::text) AS fingerprint
       FROM core."fieldMetadata" fm
       JOIN core."objectMetadata" om ON om.id = fm."objectMetadataId"
      WHERE fm."workspaceId" = $1
        AND om."universalIdentifier" = $2
        AND fm."universalIdentifier" = $3`,
    [
      SEED_YCOMBINATOR_WORKSPACE_ID,
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
      MYAH_STANDARD_OBJECTS.campaign.fields.sequenceAuthorization
        .universalIdentifier,
    ],
  );

const readCampaign = async () =>
  global.testDataSource.query<
    { fingerprint: string; labelSingular: string; targetTableName: string }[]
  >(
    `SELECT om."labelSingular", om."targetTableName",
            md5(to_jsonb(om)::text) AS fingerprint
       FROM core."objectMetadata" om
      WHERE om."workspaceId" = $1
        AND om."universalIdentifier" = $2`,
    [
      SEED_YCOMBINATOR_WORKSPACE_ID,
      MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
    ],
  );

const readPhysicalColumn = async (targetTableName: string) =>
  global.testDataSource.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3`,
    [workspaceSchemaName, targetTableName, SEQUENCE_AUTHORIZATION_COLUMN_NAME],
  );

describe('SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand (integration)', () => {
  it('adds only the missing Campaign system field and remains idempotent', async () => {
    const [seededCampaign] = await readCampaign();

    expect(seededCampaign).toBeDefined();
    expect(seededCampaign.targetTableName).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);

    await global.testDataSource.query(
      `ALTER TABLE "${workspaceSchemaName}"."${seededCampaign.targetTableName}"
         DROP COLUMN IF EXISTS "${SEQUENCE_AUTHORIZATION_COLUMN_NAME}"`,
    );
    await global.testDataSource.query(
      `DELETE FROM core."fieldMetadata"
        WHERE "workspaceId" = $1
          AND "universalIdentifier" = $2`,
      [
        SEED_YCOMBINATOR_WORKSPACE_ID,
        MYAH_STANDARD_OBJECTS.campaign.fields.sequenceAuthorization
          .universalIdentifier,
      ],
    );
    await global.testDataSource.query(
      `UPDATE core."objectMetadata"
          SET "labelSingular" = $3
        WHERE "workspaceId" = $1
          AND "universalIdentifier" = $2`,
      [
        SEED_YCOMBINATOR_WORKSPACE_ID,
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
        CUSTOM_CAMPAIGN_LABEL,
      ],
    );

    expect(await readField()).toEqual([]);
    expect(await readPhysicalColumn(seededCampaign.targetTableName)).toEqual(
      [],
    );

    const [preUpgradeCampaign] = await readCampaign();

    expect(preUpgradeCampaign).toMatchObject({
      labelSingular: CUSTOM_CAMPAIGN_LABEL,
      targetTableName: seededCampaign.targetTableName,
    });

    const firstRun = await runCommand();

    expect(firstRun.stderr).not.toContain(
      `Error in workspace ${SEED_YCOMBINATOR_WORKSPACE_ID}`,
    );
    const fieldsAfterFirstRun = await readField();

    expect(fieldsAfterFirstRun).toEqual([
      {
        universalIdentifier:
          MYAH_STANDARD_OBJECTS.campaign.fields.sequenceAuthorization
            .universalIdentifier,
        name: SEQUENCE_AUTHORIZATION_COLUMN_NAME,
        isNullable: true,
        isUIEditable: false,
        isSystem: true,
        type: 'RAW_JSON',
        fingerprint: expect.any(String),
      },
    ]);
    expect(await readPhysicalColumn(seededCampaign.targetTableName)).toEqual([
      {
        column_name: SEQUENCE_AUTHORIZATION_COLUMN_NAME,
        data_type: 'jsonb',
        is_nullable: 'YES',
      },
    ]);
    expect(await readCampaign()).toEqual([preUpgradeCampaign]);

    const secondRun = await runCommand();

    expect(secondRun.stderr).not.toContain(
      `Error in workspace ${SEED_YCOMBINATOR_WORKSPACE_ID}`,
    );
    expect(await readField()).toEqual(fieldsAfterFirstRun);
    expect(await readPhysicalColumn(seededCampaign.targetTableName)).toEqual([
      {
        column_name: SEQUENCE_AUTHORIZATION_COLUMN_NAME,
        data_type: 'jsonb',
        is_nullable: 'YES',
      },
    ]);
    expect(await readCampaign()).toEqual([preUpgradeCampaign]);
  });
});
