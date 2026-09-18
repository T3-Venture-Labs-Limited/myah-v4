import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  MYAH_STANDARD_OBJECTS,
  STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  SEED_APPLE_WORKSPACE_ID,
  SEED_YCOMBINATOR_WORKSPACE_ID,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

const COMMAND_NAME =
  'upgrade:2-20:synchronize-campaign-activity-control-metadata';
const execFileAsync = promisify(execFile);
const workspaces = [
  { kind: 'existing', id: SEED_YCOMBINATOR_WORKSPACE_ID },
  { kind: 'fresh', id: SEED_APPLE_WORKSPACE_ID },
];
const fieldUniversalIdentifiers = [
  MYAH_STANDARD_OBJECTS.campaignCreator.fields.stage.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaignCreator.fields.excludedAt.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaignCreator.fields.excludedByWorkspaceMemberId
    .universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaignCreator.fields.exclusionReason
    .universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaign.fields.timelineActivities.universalIdentifier,
  STANDARD_OBJECTS.timelineActivity.fields.targetCampaign.universalIdentifier,
];

const runCommand = (workspaceId: string) =>
  execFileAsync(
    process.execPath,
    ['dist/command/command.js', COMMAND_NAME, '--workspace-id', workspaceId],
    { cwd: process.cwd(), env: process.env },
  );

const readSelectedFields = (workspaceId: string) =>
  global.testDataSource.query<
    {
      universalIdentifier: string;
      name: string;
      options: { label: string; value: string }[] | null;
      fingerprint: string;
    }[]
  >(
    `SELECT "universalIdentifier",name,options,
            md5((to_jsonb(fm)-'updatedAt'-'createdAt')::text) AS fingerprint
       FROM core."fieldMetadata" fm
      WHERE "workspaceId"=$1 AND "universalIdentifier"=ANY($2::uuid[])
      ORDER BY "universalIdentifier"`,
    [workspaceId, fieldUniversalIdentifiers],
  );

const readPhysicalColumns = (workspaceId: string) =>
  global.testDataSource.query<{ table_name: string; column_name: string }[]>(
    `SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema=$1 AND
        ((table_name='campaignCreator' AND column_name=ANY($2::text[])) OR
         (table_name='timelineActivity' AND column_name='targetCampaignId'))
      ORDER BY table_name,column_name`,
    [
      getWorkspaceSchemaName(workspaceId),
      ['excludedAt', 'excludedByWorkspaceMemberId', 'exclusionReason'],
    ],
  );

describe('2.20 workspace command 1789313971536 seeded metadata (postgres)', () => {
  it.each(workspaces)(
    'synchronizes $kind seeded workspace $id non-destructively and remains idempotent',
    async ({ id: workspaceId }) => {
      const [campaignBefore] = await global.testDataSource.query<
        { labelSingular: string }[]
      >(
        `SELECT "labelSingular" FROM core."objectMetadata"
          WHERE "workspaceId"=$1 AND "universalIdentifier"=$2`,
        [workspaceId, MYAH_STANDARD_OBJECTS.campaign.universalIdentifier],
      );
      expect(campaignBefore).toBeDefined();

      const firstRun = await runCommand(workspaceId);
      expect(firstRun.stderr).not.toContain(
        `Error in workspace ${workspaceId}`,
      );
      const fieldsAfterFirstRun = await readSelectedFields(workspaceId);
      expect(fieldsAfterFirstRun).toHaveLength(
        fieldUniversalIdentifiers.length,
      );
      expect(
        fieldsAfterFirstRun
          .find(
            ({ universalIdentifier }) =>
              universalIdentifier ===
              MYAH_STANDARD_OBJECTS.campaignCreator.fields.stage
                .universalIdentifier,
          )
          ?.options?.find(({ value }) => value === 'PRODUCT_RECEIVED')?.label,
      ).toBe('Product received');
      expect(await readPhysicalColumns(workspaceId)).toEqual([
        { table_name: 'campaignCreator', column_name: 'excludedAt' },
        {
          table_name: 'campaignCreator',
          column_name: 'excludedByWorkspaceMemberId',
        },
        { table_name: 'campaignCreator', column_name: 'exclusionReason' },
        { table_name: 'timelineActivity', column_name: 'targetCampaignId' },
      ]);

      const secondRun = await runCommand(workspaceId);
      expect(secondRun.stderr).not.toContain(
        `Error in workspace ${workspaceId}`,
      );
      expect(await readSelectedFields(workspaceId)).toEqual(
        fieldsAfterFirstRun,
      );
      expect(
        await global.testDataSource.query(
          `SELECT "labelSingular" FROM core."objectMetadata"
            WHERE "workspaceId"=$1 AND "universalIdentifier"=$2`,
          [workspaceId, MYAH_STANDARD_OBJECTS.campaign.universalIdentifier],
        ),
      ).toEqual([campaignBefore]);
    },
  );
});
