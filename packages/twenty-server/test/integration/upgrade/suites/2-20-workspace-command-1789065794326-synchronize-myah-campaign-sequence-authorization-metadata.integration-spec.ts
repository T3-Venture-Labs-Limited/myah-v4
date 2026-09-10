import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { SEED_YCOMBINATOR_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

const COMMAND_NAME =
  'upgrade:2-20:synchronize-myah-campaign-sequence-authorization-metadata';
const execFileAsync = promisify(execFile);

const runCommand = async () => {
  await execFileAsync(
    process.execPath,
    [
      'dist/command/command.js',
      COMMAND_NAME,
      '--workspace-id',
      SEED_YCOMBINATOR_WORKSPACE_ID,
    ],
    { cwd: process.cwd(), env: process.env },
  );
};

const readField = async () =>
  global.testDataSource.query(
    `SELECT fm."universalIdentifier", fm."isNullable", fm."isUIEditable", fm."isSystem", fm.type
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

describe('SynchronizeMyahCampaignSequenceAuthorizationMetadataCommand (integration)', () => {
  it('synchronizes the exact system field idempotently', async () => {
    await runCommand();
    await runCommand();

    expect(await readField()).toEqual([
      {
        universalIdentifier:
          MYAH_STANDARD_OBJECTS.campaign.fields.sequenceAuthorization
            .universalIdentifier,
        isNullable: true,
        isUIEditable: false,
        isSystem: true,
        type: 'RAW_JSON',
      },
    ]);
  });
});
