import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS,
  MYAH_STANDARD_OBJECTS,
} from 'twenty-shared/metadata';

import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { MYAH_CREATOR_PAGE_LAYOUT_CONFIG } from 'src/engine/workspace-manager/twenty-standard-application/utils/page-layout/myah-brand-brain-page-layout.config';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const INBOX_METADATA_COMMAND_NAME =
  'upgrade:2-19:synchronize-myah-inbox-metadata';
const CREATOR_PAGE_LAYOUT_METADATA_COMMAND_NAME =
  'upgrade:2-19:synchronize-myah-creator-page-layout-metadata';
const INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS = [
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.creator,
  MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS.myahCampaign,
  MYAH_STANDARD_OBJECTS.creator.fields.inboxThreads.universalIdentifier,
  MYAH_STANDARD_OBJECTS.campaign.fields.inboxThreads.universalIdentifier,
];
const INBOX_FIELD_UNIVERSAL_IDENTIFIERS = [
  ...Object.values(MYAH_INBOX_FIELD_UNIVERSAL_IDENTIFIERS),
  ...INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.slice(2),
];
const INBOX_RELATION_JOIN_COLUMNS = ['creatorId', 'myahCampaignId'];
const CREATOR_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS = Object.values(
  MYAH_CREATOR_PAGE_LAYOUT_CONFIG.tabs,
).map(({ universalIdentifier }) => universalIdentifier);
const CREATOR_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS = Object.values(
  MYAH_CREATOR_PAGE_LAYOUT_CONFIG.tabs,
).flatMap(({ widgets }) =>
  Object.values(widgets).map(({ universalIdentifier }) => universalIdentifier),
);
const CREATOR_RECORD_PAGE_FIELDS_VIEW =
  MYAH_STANDARD_OBJECTS.creator.views.creatorRecordPageFields;
const CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS =
  Object.values(CREATOR_RECORD_PAGE_FIELDS_VIEW.viewFields).map(
    ({ universalIdentifier }) => universalIdentifier,
  );

const execFileAsync = promisify(execFile);

const runWorkspaceCommand = async (commandName: string) => {
  await execFileAsync(
    process.execPath,
    [
      'dist/command/command.js',
      commandName,
      '--workspace-id',
      SEED_APPLE_WORKSPACE_ID,
    ],
    { cwd: process.cwd(), env: process.env },
  );
};

describe('MYAH-212 active-release metadata replay (integration)', () => {
  it('restores Inbox relations and the Creator layout, fields view, view fields, tabs, and widgets after their metadata is absent', async () => {
    await runWorkspaceCommand(INBOX_METADATA_COMMAND_NAME);

    const [deletedInboxRelationFields]: [
      { universalIdentifier: string }[],
      number,
    ] = await global.testDataSource.query(
      `DELETE FROM core."fieldMetadata"
      WHERE "workspaceId" = $1
        AND "universalIdentifier" = ANY($2::uuid[])
      RETURNING "universalIdentifier"`,
      [SEED_APPLE_WORKSPACE_ID, INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS],
    );

    expect(
      deletedInboxRelationFields
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
    ).toEqual(INBOX_RELATION_FIELD_UNIVERSAL_IDENTIFIERS.sort());

    const existingInboxRelationJoinColumns: { column_name: string }[] =
      await global.testDataSource.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'messageThread'
            AND column_name = ANY($2::text[])
          ORDER BY column_name`,
        [
          getWorkspaceSchemaName(SEED_APPLE_WORKSPACE_ID),
          INBOX_RELATION_JOIN_COLUMNS,
        ],
      );

    expect(
      existingInboxRelationJoinColumns.map(({ column_name }) => column_name),
    ).toEqual([...INBOX_RELATION_JOIN_COLUMNS].sort());

    await runWorkspaceCommand(INBOX_METADATA_COMMAND_NAME);

    const restoredInboxFields: { universalIdentifier: string }[] =
      await global.testDataSource.query(
        `SELECT "universalIdentifier"
           FROM core."fieldMetadata"
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = ANY($2::uuid[])`,
        [SEED_APPLE_WORKSPACE_ID, INBOX_FIELD_UNIVERSAL_IDENTIFIERS],
      );

    expect(
      restoredInboxFields
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
    ).toEqual(INBOX_FIELD_UNIVERSAL_IDENTIFIERS.sort());

    await global.testDataSource.query(
      `DELETE FROM core."pageLayoutWidget"
        WHERE "workspaceId" = $1
          AND "universalIdentifier" = ANY($2::uuid[])`,
      [
        SEED_APPLE_WORKSPACE_ID,
        CREATOR_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS,
      ],
    );
    await global.testDataSource.query(
      `DELETE FROM core."pageLayoutTab"
        WHERE "workspaceId" = $1
          AND "universalIdentifier" = ANY($2::uuid[])`,
      [SEED_APPLE_WORKSPACE_ID, CREATOR_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS],
    );
    const [deletedPageLayouts]: [{ universalIdentifier: string }[], number] =
      await global.testDataSource.query(
        `DELETE FROM core."pageLayout"
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = $2
          RETURNING "universalIdentifier"`,
        [
          SEED_APPLE_WORKSPACE_ID,
          MYAH_CREATOR_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ],
      );
    const [deletedCreatorViewFields]: [
      { universalIdentifier: string }[],
      number,
    ] = await global.testDataSource.query(
      `DELETE FROM core."viewField"
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = ANY($2::uuid[])
          RETURNING "universalIdentifier"`,
      [
        SEED_APPLE_WORKSPACE_ID,
        CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
      ],
    );
    const [deletedCreatorViews]: [{ universalIdentifier: string }[], number] =
      await global.testDataSource.query(
        `DELETE FROM core."view"
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = $2
          RETURNING "universalIdentifier"`,
        [
          SEED_APPLE_WORKSPACE_ID,
          CREATOR_RECORD_PAGE_FIELDS_VIEW.universalIdentifier,
        ],
      );

    expect(deletedPageLayouts).toEqual([
      {
        universalIdentifier:
          MYAH_CREATOR_PAGE_LAYOUT_CONFIG.universalIdentifier,
      },
    ]);
    expect(
      deletedCreatorViewFields
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
    ).toEqual(
      CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.sort(),
    );
    expect(deletedCreatorViews).toEqual([
      {
        universalIdentifier:
          CREATOR_RECORD_PAGE_FIELDS_VIEW.universalIdentifier,
      },
    ]);

    await runWorkspaceCommand(CREATOR_PAGE_LAYOUT_METADATA_COMMAND_NAME);

    const restoredPageLayouts: { universalIdentifier: string }[] =
      await global.testDataSource.query(
        `SELECT "universalIdentifier"
           FROM core."pageLayout"
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = $2`,
        [
          SEED_APPLE_WORKSPACE_ID,
          MYAH_CREATOR_PAGE_LAYOUT_CONFIG.universalIdentifier,
        ],
      );
    const restoredPageLayoutTabs: { universalIdentifier: string }[] =
      await global.testDataSource.query(
        `SELECT "universalIdentifier"
           FROM core."pageLayoutTab"
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = ANY($2::uuid[])`,
        [
          SEED_APPLE_WORKSPACE_ID,
          CREATOR_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS,
        ],
      );
    const restoredPageLayoutWidgets: { universalIdentifier: string }[] =
      await global.testDataSource.query(
        `SELECT "universalIdentifier"
           FROM core."pageLayoutWidget"
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = ANY($2::uuid[])`,
        [
          SEED_APPLE_WORKSPACE_ID,
          CREATOR_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS,
        ],
      );
    const restoredCreatorViews: { universalIdentifier: string }[] =
      await global.testDataSource.query(
        `SELECT "universalIdentifier"
           FROM core."view"
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = $2`,
        [
          SEED_APPLE_WORKSPACE_ID,
          CREATOR_RECORD_PAGE_FIELDS_VIEW.universalIdentifier,
        ],
      );
    const restoredCreatorViewFields: { universalIdentifier: string }[] =
      await global.testDataSource.query(
        `SELECT "universalIdentifier"
           FROM core."viewField"
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = ANY($2::uuid[])`,
        [
          SEED_APPLE_WORKSPACE_ID,
          CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS,
        ],
      );

    expect(restoredPageLayouts).toEqual([
      {
        universalIdentifier:
          MYAH_CREATOR_PAGE_LAYOUT_CONFIG.universalIdentifier,
      },
    ]);
    expect(
      restoredPageLayoutTabs
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
    ).toEqual(CREATOR_PAGE_LAYOUT_TAB_UNIVERSAL_IDENTIFIERS.sort());
    expect(
      restoredPageLayoutWidgets
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
    ).toEqual(CREATOR_PAGE_LAYOUT_WIDGET_UNIVERSAL_IDENTIFIERS.sort());
    expect(restoredCreatorViews).toEqual([
      {
        universalIdentifier:
          CREATOR_RECORD_PAGE_FIELDS_VIEW.universalIdentifier,
      },
    ]);
    expect(
      restoredCreatorViewFields
        .map(({ universalIdentifier }) => universalIdentifier)
        .sort(),
    ).toEqual(
      CREATOR_RECORD_PAGE_FIELDS_VIEW_FIELD_UNIVERSAL_IDENTIFIERS.sort(),
    );
  });
});
