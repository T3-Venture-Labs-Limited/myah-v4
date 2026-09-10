import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { SEED_YCOMBINATOR_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { computeObjectTargetTable } from 'src/engine/utils/compute-object-target-table.util';

const COMMAND_NAME =
  'upgrade:2-20:synchronize-myah-campaign-sequence-authorization-metadata';
const FLAT_CACHE_INVALIDATE_COMMAND_NAME = 'cache:flat-cache-invalidate';
const SEQUENCE_AUTHORIZATION_COLUMN_NAME = 'sequenceAuthorization';
const CUSTOM_CAMPAIGN_LABEL = 'Workspace-customized Campaign';
const execFileAsync = promisify(execFile);
const workspaceSchemaName = getWorkspaceSchemaName(
  SEED_YCOMBINATOR_WORKSPACE_ID,
);

const runWorkspaceCommand = (
  commandName: string,
  additionalArgs: string[] = [],
) =>
  execFileAsync(
    process.execPath,
    [
      'dist/command/command.js',
      commandName,
      '--workspace-id',
      SEED_YCOMBINATOR_WORKSPACE_ID,
      ...additionalArgs,
    ],
    { cwd: process.cwd(), env: process.env },
  );

const runCommand = () => runWorkspaceCommand(COMMAND_NAME);

const invalidateMetadataCache = () =>
  runWorkspaceCommand(FLAT_CACHE_INVALIDATE_COMMAND_NAME, [
    '--metadataName',
    'objectMetadata',
    '--metadataName',
    'fieldMetadata',
  ]);

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

const readFieldSnapshot = async () =>
  global.testDataSource.query<{ snapshot: Record<string, unknown> }[]>(
    `SELECT to_jsonb(fm) AS snapshot
       FROM core."fieldMetadata" fm
      WHERE fm."workspaceId" = $1
        AND fm."universalIdentifier" = $2`,
    [
      SEED_YCOMBINATOR_WORKSPACE_ID,
      MYAH_STANDARD_OBJECTS.campaign.fields.sequenceAuthorization
        .universalIdentifier,
    ],
  );

const readCampaign = async () =>
  global.testDataSource.query<
    {
      fingerprint: string;
      applicationUniversalIdentifier: string;
      labelSingular: string;
      nameSingular: string;
    }[]
  >(
    `SELECT app."universalIdentifier" AS "applicationUniversalIdentifier",
            om."labelSingular", om."nameSingular",
            md5(to_jsonb(om)::text) AS fingerprint
       FROM core."objectMetadata" om
       JOIN core.application app ON app.id = om."applicationId"
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
    const [seededField] = await readField();
    const [seededFieldSnapshot] = await readFieldSnapshot();

    expect(seededCampaign).toBeDefined();
    expect(seededField).toBeDefined();
    expect(seededFieldSnapshot).toBeDefined();

    const campaignTableName = computeObjectTargetTable(seededCampaign);

    expect(campaignTableName).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);

    let primaryError: unknown;

    try {
      await global.testDataSource.query(
        `ALTER TABLE "${workspaceSchemaName}"."${campaignTableName}"
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
      expect(await readPhysicalColumn(campaignTableName)).toEqual([]);

      const [preUpgradeCampaign] = await readCampaign();

      expect(preUpgradeCampaign).toMatchObject({
        labelSingular: CUSTOM_CAMPAIGN_LABEL,
        nameSingular: seededCampaign.nameSingular,
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
      expect(await readPhysicalColumn(campaignTableName)).toEqual([
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
      expect(await readPhysicalColumn(campaignTableName)).toEqual([
        {
          column_name: SEQUENCE_AUTHORIZATION_COLUMN_NAME,
          data_type: 'jsonb',
          is_nullable: 'YES',
        },
      ]);
      expect(await readCampaign()).toEqual([preUpgradeCampaign]);
    } catch (error) {
      primaryError = error;
    }

    let cleanupError: unknown;

    try {
      await global.testDataSource.query(
        `UPDATE core."objectMetadata"
            SET "labelSingular" = $3
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = $2`,
        [
          SEED_YCOMBINATOR_WORKSPACE_ID,
          MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
          seededCampaign.labelSingular,
        ],
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
        `INSERT INTO core."fieldMetadata"
         SELECT (jsonb_populate_record(NULL::core."fieldMetadata", $1::jsonb)).*`,
        [JSON.stringify(seededFieldSnapshot.snapshot)],
      );
      await global.testDataSource.query(
        `ALTER TABLE "${workspaceSchemaName}"."${campaignTableName}"
           ADD COLUMN IF NOT EXISTS "${SEQUENCE_AUTHORIZATION_COLUMN_NAME}" jsonb`,
      );
      await invalidateMetadataCache();

      expect(await readCampaign()).toEqual([seededCampaign]);
      expect(await readField()).toEqual([seededField]);
      expect(await readPhysicalColumn(campaignTableName)).toEqual([
        {
          column_name: SEQUENCE_AUTHORIZATION_COLUMN_NAME,
          data_type: 'jsonb',
          is_nullable: 'YES',
        },
      ]);
    } catch (error) {
      cleanupError = error;
    }

    if (primaryError !== undefined && cleanupError !== undefined) {
      throw new AggregateError(
        [primaryError, cleanupError],
        'Integration assertions and fixture cleanup both failed',
      );
    }

    if (primaryError !== undefined) {
      throw primaryError;
    }

    if (cleanupError !== undefined) {
      throw cleanupError;
    }
  });
});
