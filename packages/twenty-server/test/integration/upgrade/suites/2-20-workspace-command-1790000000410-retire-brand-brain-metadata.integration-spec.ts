import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import {
  RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS,
  RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS,
} from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1790000000410-retire-brand-brain-metadata.command';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';

const COMMAND_NAME = 'upgrade:2-20:retire-brand-brain-metadata';
const FLAT_CACHE_INVALIDATE_COMMAND_NAME = 'cache:flat-cache-invalidate';
const execFileAsync = promisify(execFile);
const workspaceId = SEED_APPLE_WORKSPACE_ID;
const workspaceSchemaName = getWorkspaceSchemaName(workspaceId);
const objectUniversalIdentifiers = [
  ...RETIRED_BRAND_BRAIN_OBJECT_UNIVERSAL_IDENTIFIERS,
];
const pageRecordIds = [randomUUID(), randomUUID(), randomUUID()];
const layoutId = randomUUID();
const tabId = randomUUID();
const widgetId = randomUUID();
const navigationId = randomUUID();

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
      workspaceId,
      ...additionalArgs,
    ],
    { cwd: process.cwd(), env: process.env },
  );

const invalidateMetadataCache = () =>
  runWorkspaceCommand(FLAT_CACHE_INVALIDATE_COMMAND_NAME, [
    '--metadataName',
    'objectMetadata',
    '--metadataName',
    'navigationMenuItem',
    '--metadataName',
    'pageLayout',
    '--metadataName',
    'pageLayoutTab',
    '--metadataName',
    'pageLayoutWidget',
    '--metadataName',
    'role',
    '--metadataName',
    'roleTarget',
    '--metadataName',
    'objectPermission',
  ]);

const readRecoveryMetadata = async () =>
  global.testDataSource.query(
    `SELECT 'field' AS kind, fm.id, fm."universalIdentifier"
       FROM core."fieldMetadata" fm
       JOIN core."objectMetadata" om ON om.id = fm."objectMetadataId"
      WHERE fm."workspaceId" = $1
        AND om."universalIdentifier" = ANY($2::uuid[])
      UNION ALL
     SELECT 'view' AS kind, v.id, v."universalIdentifier"
       FROM core.view v
       JOIN core."objectMetadata" om ON om.id = v."objectMetadataId"
      WHERE v."workspaceId" = $1
        AND om."universalIdentifier" = ANY($2::uuid[])
      ORDER BY kind, "universalIdentifier"`,
    [workspaceId, objectUniversalIdentifiers],
  );

const readObjectFlags = async () =>
  global.testDataSource.query(
    `SELECT "universalIdentifier", "isSearchable", "isUIEditable", "isUICreatable"
       FROM core."objectMetadata"
      WHERE "workspaceId" = $1
        AND "universalIdentifier" = ANY($2::uuid[])
      ORDER BY "universalIdentifier"`,
    [workspaceId, objectUniversalIdentifiers],
  );

const readPresentationMetadata = async () =>
  global.testDataSource.query(
    `SELECT 'navigationMenuItem' AS kind, "universalIdentifier"
       FROM core."navigationMenuItem"
      WHERE "workspaceId" = $1 AND "universalIdentifier" = $2
      UNION ALL
     SELECT 'pageLayout' AS kind, "universalIdentifier"
       FROM core."pageLayout"
      WHERE "workspaceId" = $1 AND "universalIdentifier" = $3
      UNION ALL
     SELECT 'pageLayoutTab' AS kind, "universalIdentifier"
       FROM core."pageLayoutTab"
      WHERE "workspaceId" = $1 AND "universalIdentifier" = $4
      UNION ALL
     SELECT 'pageLayoutWidget' AS kind, "universalIdentifier"
       FROM core."pageLayoutWidget"
      WHERE "workspaceId" = $1 AND "universalIdentifier" = $5
      ORDER BY kind`,
    [
      workspaceId,
      [
        ...RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS.navigationMenuItem,
      ][0],
      [...RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS.pageLayout][0],
      [
        ...RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS.pageLayoutTab,
      ][0],
      [
        ...RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS.pageLayoutWidget,
      ][0],
    ],
  );

describe('RetireBrandBrainMetadataCommand (integration)', () => {
  it('retires an upgraded workspace while preserving recovery metadata, records, and assignments', async () => {
    const originalObjectFlags = await readObjectFlags();
    const originalRecoveryMetadata = await readRecoveryMetadata();
    const [brandBrainPage] = await global.testDataSource.query(
      `SELECT id, "applicationId"
         FROM core."objectMetadata"
        WHERE "workspaceId" = $1 AND "universalIdentifier" = $2`,
      [workspaceId, MYAH_STANDARD_OBJECTS.brandBrainPage.universalIdentifier],
    );
    const [brandBrainRole] = await global.testDataSource.query(
      `SELECT id FROM core.role
        WHERE "workspaceId" = $1 AND "universalIdentifier" = $2`,
      [workspaceId, MYAH_BRAND_BRAIN_ADMIN_ROLE_UNIVERSAL_IDENTIFIER],
    );
    const [roleTarget] = await global.testDataSource.query(
      `SELECT id, "roleId" FROM core."roleTarget"
        WHERE "workspaceId" = $1
        ORDER BY "createdAt"
        LIMIT 1`,
      [workspaceId],
    );

    expect(originalObjectFlags).toHaveLength(3);
    expect(originalRecoveryMetadata.length).toBeGreaterThan(3);
    expect(brandBrainPage).toBeDefined();
    expect(brandBrainRole).toBeDefined();
    expect(roleTarget).toBeDefined();

    let primaryError: unknown;

    try {
      await global.testDataSource.query(
        `UPDATE core."objectMetadata"
            SET "isSearchable" = true, "isUIEditable" = true, "isUICreatable" = true
          WHERE "workspaceId" = $1
            AND "universalIdentifier" = ANY($2::uuid[])`,
        [workspaceId, objectUniversalIdentifiers],
      );
      await global.testDataSource.query(
        `UPDATE core.role
            SET "canBeAssignedToUsers" = true,
                "canBeAssignedToAgents" = true,
                "canBeAssignedToApiKeys" = true
          WHERE id = $1`,
        [brandBrainRole.id],
      );
      await global.testDataSource.query(
        `UPDATE core."objectPermission"
            SET "canUpdateObjectRecords" = true,
                "canSoftDeleteObjectRecords" = true,
                "canDestroyObjectRecords" = true
          WHERE "roleId" = $1`,
        [brandBrainRole.id],
      );
      await global.testDataSource.query(
        `UPDATE core."roleTarget" SET "roleId" = $2 WHERE id = $1`,
        [roleTarget.id, brandBrainRole.id],
      );

      await global.testDataSource.query(
        `INSERT INTO core."pageLayout"
         SELECT (jsonb_populate_record(
           NULL::core."pageLayout",
           to_jsonb(source) || jsonb_build_object(
             'id', $2::uuid,
             'name', 'Legacy Brand Brain record page',
             'workspaceId', $1::uuid,
             'objectMetadataId', $3::uuid,
             'universalIdentifier', $4::uuid,
             'applicationId', $5::uuid,
             'defaultTabToFocusOnMobileAndSidePanelId', NULL
           )
         )).*
           FROM core."pageLayout" source
          WHERE source."workspaceId" = $1
            AND source."objectMetadataId" IS NOT NULL
          LIMIT 1`,
        [
          workspaceId,
          layoutId,
          brandBrainPage.id,
          [
            ...RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS.pageLayout,
          ][0],
          brandBrainPage.applicationId,
        ],
      );
      await global.testDataSource.query(
        `INSERT INTO core."pageLayoutTab"
         SELECT (jsonb_populate_record(
           NULL::core."pageLayoutTab",
           to_jsonb(source) || jsonb_build_object(
             'id', $2::uuid,
             'title', 'Legacy Brand Brain fields',
             'workspaceId', $1::uuid,
             'pageLayoutId', $3::uuid,
             'universalIdentifier', $4::uuid,
             'applicationId', $5::uuid
           )
         )).*
           FROM core."pageLayoutTab" source
          WHERE source."workspaceId" = $1
          LIMIT 1`,
        [
          workspaceId,
          tabId,
          layoutId,
          [
            ...RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS.pageLayoutTab,
          ][0],
          brandBrainPage.applicationId,
        ],
      );
      await global.testDataSource.query(
        `INSERT INTO core."pageLayoutWidget"
         SELECT (jsonb_populate_record(
           NULL::core."pageLayoutWidget",
           to_jsonb(source) || jsonb_build_object(
             'id', $2::uuid,
             'title', 'Legacy Brand Brain fields',
             'workspaceId', $1::uuid,
             'pageLayoutTabId', $3::uuid,
             'objectMetadataId', $4::uuid,
             'universalIdentifier', $5::uuid,
             'applicationId', $6::uuid
           )
         )).*
           FROM core."pageLayoutWidget" source
          WHERE source."workspaceId" = $1
          LIMIT 1`,
        [
          workspaceId,
          widgetId,
          tabId,
          brandBrainPage.id,
          [
            ...RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS.pageLayoutWidget,
          ][0],
          brandBrainPage.applicationId,
        ],
      );
      await global.testDataSource.query(
        `INSERT INTO core."navigationMenuItem"
         SELECT (jsonb_populate_record(
           NULL::core."navigationMenuItem",
           to_jsonb(source) || jsonb_build_object(
             'id', $2::uuid,
             'name', 'Brand Brain',
             'workspaceId', $1::uuid,
             'targetObjectMetadataId', $3::uuid,
             'viewId', NULL,
             'pageLayoutId', $4::uuid,
             'universalIdentifier', $5::uuid,
             'applicationId', $6::uuid
           )
         )).*
           FROM core."navigationMenuItem" source
          WHERE source."workspaceId" = $1
            AND source."targetObjectMetadataId" IS NOT NULL
          LIMIT 1`,
        [
          workspaceId,
          navigationId,
          brandBrainPage.id,
          layoutId,
          [
            ...RETIRED_BRAND_BRAIN_PRESENTATION_UNIVERSAL_IDENTIFIERS.navigationMenuItem,
          ][0],
          brandBrainPage.applicationId,
        ],
      );

      // Workspace schema names are UUID-derived and cannot be bind parameters.
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `INSERT INTO "${workspaceSchemaName}"."brandBrainPage" (id, title)
         VALUES ($1, 'Preserved Brand Brain page')`,
        [pageRecordIds[0]],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `INSERT INTO "${workspaceSchemaName}"."brandBrainLink" (id, name)
         VALUES ($1, 'Preserved Brand Brain link')`,
        [pageRecordIds[1]],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `INSERT INTO "${workspaceSchemaName}"."brandBrainUpdateProposal" (id, title)
         VALUES ($1, 'Preserved Brand Brain proposal')`,
        [pageRecordIds[2]],
      );

      await invalidateMetadataCache();
      expect(await readPresentationMetadata()).toHaveLength(4);

      const firstRun = await runWorkspaceCommand(COMMAND_NAME);

      expect(firstRun.stderr).not.toContain(
        `Error in workspace ${workspaceId}`,
      );
      expect(await readObjectFlags()).toEqual(
        [...objectUniversalIdentifiers].sort().map((universalIdentifier) => ({
          universalIdentifier,
          isSearchable: false,
          isUIEditable: false,
          isUICreatable: false,
        })),
      );
      expect(await readPresentationMetadata()).toEqual([]);
      expect(await readRecoveryMetadata()).toEqual(originalRecoveryMetadata);
      expect(
        // pi-lens-ignore: sql-injection
        await global.testDataSource.query(
          `SELECT id FROM "${workspaceSchemaName}"."brandBrainPage" WHERE id = $1
           UNION ALL
           SELECT id FROM "${workspaceSchemaName}"."brandBrainLink" WHERE id = $2
           UNION ALL
           SELECT id FROM "${workspaceSchemaName}"."brandBrainUpdateProposal" WHERE id = $3
           ORDER BY id`,
          pageRecordIds,
        ),
      ).toEqual([...pageRecordIds].sort().map((id) => ({ id })));
      expect(
        await global.testDataSource.query(
          `SELECT "roleId" FROM core."roleTarget" WHERE id = $1`,
          [roleTarget.id],
        ),
      ).toEqual([{ roleId: brandBrainRole.id }]);
      expect(
        await global.testDataSource.query(
          `SELECT "canBeAssignedToUsers", "canBeAssignedToAgents", "canBeAssignedToApiKeys"
             FROM core.role WHERE id = $1`,
          [brandBrainRole.id],
        ),
      ).toEqual([
        {
          canBeAssignedToUsers: false,
          canBeAssignedToAgents: false,
          canBeAssignedToApiKeys: false,
        },
      ]);
      expect(
        await global.testDataSource.query(
          `SELECT "canReadObjectRecords", "canUpdateObjectRecords",
                  "canSoftDeleteObjectRecords", "canDestroyObjectRecords"
             FROM core."objectPermission"
            WHERE "roleId" = $1
            ORDER BY "universalIdentifier"`,
          [brandBrainRole.id],
        ),
      ).toEqual(
        expect.arrayContaining([
          {
            canReadObjectRecords: true,
            canUpdateObjectRecords: false,
            canSoftDeleteObjectRecords: false,
            canDestroyObjectRecords: false,
          },
        ]),
      );

      const secondRun = await runWorkspaceCommand(COMMAND_NAME);

      expect(secondRun.stderr).not.toContain(
        `Error in workspace ${workspaceId}`,
      );
      expect(await readPresentationMetadata()).toEqual([]);
      expect(await readRecoveryMetadata()).toEqual(originalRecoveryMetadata);
    } catch (error) {
      primaryError = error;
    }

    let cleanupError: unknown;

    try {
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `DELETE FROM "${workspaceSchemaName}"."brandBrainLink" WHERE id = $1`,
        [pageRecordIds[1]],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `DELETE FROM "${workspaceSchemaName}"."brandBrainUpdateProposal" WHERE id = $1`,
        [pageRecordIds[2]],
      );
      // pi-lens-ignore: sql-injection
      await global.testDataSource.query(
        `DELETE FROM "${workspaceSchemaName}"."brandBrainPage" WHERE id = $1`,
        [pageRecordIds[0]],
      );
      await global.testDataSource.query(
        `DELETE FROM core."navigationMenuItem" WHERE id = $1`,
        [navigationId],
      );
      await global.testDataSource.query(
        `DELETE FROM core."pageLayoutWidget" WHERE id = $1`,
        [widgetId],
      );
      await global.testDataSource.query(
        `DELETE FROM core."pageLayoutTab" WHERE id = $1`,
        [tabId],
      );
      await global.testDataSource.query(
        `DELETE FROM core."pageLayout" WHERE id = $1`,
        [layoutId],
      );
      await global.testDataSource.query(
        `UPDATE core."roleTarget" SET "roleId" = $2 WHERE id = $1`,
        [roleTarget.id, roleTarget.roleId],
      );
      for (const objectFlags of originalObjectFlags) {
        await global.testDataSource.query(
          `UPDATE core."objectMetadata"
              SET "isSearchable" = $3, "isUIEditable" = $4, "isUICreatable" = $5
            WHERE "workspaceId" = $1 AND "universalIdentifier" = $2`,
          [
            workspaceId,
            objectFlags.universalIdentifier,
            objectFlags.isSearchable,
            objectFlags.isUIEditable,
            objectFlags.isUICreatable,
          ],
        );
      }
      await invalidateMetadataCache();
    } catch (error) {
      cleanupError = error;
    }

    if (primaryError) throw primaryError;
    if (cleanupError) throw cleanupError;
  });
});
