import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { isUUID } from 'class-validator';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import type { GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';

import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

import { WorkspaceMigrationRunnerService } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/services/workspace-migration-runner.service';

export const OBSOLETE_SOURCE_CONTROLLED_CREATOR_VIEW_FIELD_UNIVERSAL_IDENTIFIERS =
  new Set([
    'cc5ed450-05fd-4c8e-b488-edae3cbd6586',
    '77c1fa17-1566-59d6-9a1f-6597537c72c0',
    '2856cfb7-33c3-5441-a871-85c09cd34688',
    '6a3edac7-0b7c-4874-861a-965efd4b873c',
  ]);

type CreatorSocialLinkFieldPair = {
  oldUniversalIdentifier: string;
  newUniversalIdentifier: string;
  oldColumnName: string;
  newPrimaryUrlColumnName: string;
  newPrimaryLabelColumnName: string;
  newSecondaryLinksColumnName: string;
};

const CREATOR_SOCIAL_LINK_FIELD_PAIRS = [
  {
    oldUniversalIdentifier: '8d99a67f-e472-5fa5-b6d1-dc6d5fd2705b',
    newUniversalIdentifier: 'f0d18169-7558-487c-bafd-eb0e6adaf63a',
    oldColumnName: 'instagramUrl',
    newPrimaryUrlColumnName: 'instagramLinkPrimaryLinkUrl',
    newPrimaryLabelColumnName: 'instagramLinkPrimaryLinkLabel',
    newSecondaryLinksColumnName: 'instagramLinkSecondaryLinks',
  },
  {
    oldUniversalIdentifier: 'e2b3b717-5d83-5dde-bb47-42c3a6cc6f31',
    newUniversalIdentifier: '184b0e66-11d9-45bd-8dde-e694355c57f1',
    oldColumnName: 'tiktokUrl',
    newPrimaryUrlColumnName: 'tiktokLinkPrimaryLinkUrl',
    newPrimaryLabelColumnName: 'tiktokLinkPrimaryLinkLabel',
    newSecondaryLinksColumnName: 'tiktokLinkSecondaryLinks',
  },
  {
    oldUniversalIdentifier: 'af645cc7-31fc-5175-af8d-427845ebe1ed',
    newUniversalIdentifier: 'dcb35d52-cad9-4871-8ae2-8e97e38578f1',
    oldColumnName: 'youtubeUrl',
    newPrimaryUrlColumnName: 'youtubeLinkPrimaryLinkUrl',
    newPrimaryLabelColumnName: 'youtubeLinkPrimaryLinkLabel',
    newSecondaryLinksColumnName: 'youtubeLinkSecondaryLinks',
  },
  {
    oldUniversalIdentifier: 'bbfda234-327c-5d9d-ac39-8a33fd06779d',
    newUniversalIdentifier: '8bb2d28c-cecf-4111-b043-89b6c7255710',
    oldColumnName: 'twitterUrl',
    newPrimaryUrlColumnName: 'twitterLinkPrimaryLinkUrl',
    newPrimaryLabelColumnName: 'twitterLinkPrimaryLinkLabel',
    newSecondaryLinksColumnName: 'twitterLinkSecondaryLinks',
  },
] as const satisfies readonly CreatorSocialLinkFieldPair[];

const MIGRATE_VIEW_REFERENCES_SQL = `
WITH duplicate_view_fields AS (
  UPDATE core."viewField" AS obsolete
  SET "deletedAt" = NOW()
  WHERE obsolete."workspaceId" = $1
    AND obsolete."fieldMetadataId" = $2
    AND obsolete."deletedAt" IS NULL
    AND EXISTS (
      SELECT 1
      FROM core."viewField" AS replacement
      WHERE replacement."workspaceId" = obsolete."workspaceId"
        AND replacement."viewId" = obsolete."viewId"
        AND replacement."fieldMetadataId" = $3
        AND replacement."deletedAt" IS NULL
    )
  RETURNING obsolete.id
), updated_view_fields AS (
  UPDATE core."viewField"
  SET "fieldMetadataId" = $3
  WHERE "workspaceId" = $1
    AND "fieldMetadataId" = $2
    AND "deletedAt" IS NULL
  RETURNING id
), duplicate_view_filters AS (
  UPDATE core."viewFilter" AS obsolete
  SET "deletedAt" = NOW()
  WHERE obsolete."workspaceId" = $1
    AND obsolete."fieldMetadataId" = $2
    AND obsolete."deletedAt" IS NULL
    AND EXISTS (
      SELECT 1
      FROM core."viewFilter" AS replacement
      WHERE replacement."workspaceId" = obsolete."workspaceId"
        AND replacement."viewId" = obsolete."viewId"
        AND replacement."fieldMetadataId" = $3
        AND replacement."operand" = obsolete."operand"
        AND replacement."value" = obsolete."value"
        AND replacement."viewFilterGroupId" IS NOT DISTINCT FROM obsolete."viewFilterGroupId"
        AND replacement."positionInViewFilterGroup" IS NOT DISTINCT FROM obsolete."positionInViewFilterGroup"
        AND replacement."deletedAt" IS NULL
    )
  RETURNING obsolete.id
), updated_view_filters AS (
  UPDATE core."viewFilter"
  SET
    "fieldMetadataId" = $3,
    "subFieldName" = 'primaryLinkUrl'
  WHERE "workspaceId" = $1
    AND "fieldMetadataId" = $2
    AND "deletedAt" IS NULL
  RETURNING id
), duplicate_view_sorts AS (
  UPDATE core."viewSort" AS obsolete
  SET "deletedAt" = NOW()
  WHERE obsolete."workspaceId" = $1
    AND obsolete."fieldMetadataId" = $2
    AND obsolete."deletedAt" IS NULL
    AND EXISTS (
      SELECT 1
      FROM core."viewSort" AS replacement
      WHERE replacement."workspaceId" = obsolete."workspaceId"
        AND replacement."viewId" = obsolete."viewId"
        AND replacement."fieldMetadataId" = $3
        AND replacement."deletedAt" IS NULL
    )
  RETURNING obsolete.id
), updated_view_sorts AS (
  UPDATE core."viewSort"
  SET
    "fieldMetadataId" = $3,
    "subFieldName" = 'primaryLinkUrl'
  WHERE "workspaceId" = $1
    AND "fieldMetadataId" = $2
    AND "deletedAt" IS NULL
  RETURNING id
)
SELECT
  (SELECT COUNT(*) FROM duplicate_view_fields) AS "deletedViewFieldCount",
  (SELECT COUNT(*) FROM updated_view_fields) AS "updatedViewFieldCount",
  (SELECT COUNT(*) FROM duplicate_view_filters) AS "deletedViewFilterCount",
  (SELECT COUNT(*) FROM updated_view_filters) AS "updatedViewFilterCount",
  (SELECT COUNT(*) FROM duplicate_view_sorts) AS "deletedViewSortCount",
  (SELECT COUNT(*) FROM updated_view_sorts) AS "updatedViewSortCount"
`;

const COPY_FIELD_PERMISSIONS_SQL = `
WITH merged_field_permissions AS (
  UPDATE core."fieldPermission" AS replacement
  SET
    "canReadFieldValue" = CASE
      WHEN replacement."canReadFieldValue" IS FALSE
        OR obsolete."canReadFieldValue" IS FALSE
      THEN FALSE
      ELSE NULL
    END,
    "canUpdateFieldValue" = CASE
      WHEN replacement."canUpdateFieldValue" IS FALSE
        OR obsolete."canUpdateFieldValue" IS FALSE
      THEN FALSE
      ELSE NULL
    END
  FROM core."fieldPermission" AS obsolete
  WHERE replacement."workspaceId" = $1
    AND replacement."fieldMetadataId" = $3
    AND obsolete."workspaceId" = replacement."workspaceId"
    AND obsolete."fieldMetadataId" = $2
    AND obsolete."roleId" = replacement."roleId"
)
INSERT INTO core."fieldPermission" (
  "workspaceId",
  "roleId",
  "objectMetadataId",
  "fieldMetadataId",
  "canReadFieldValue",
  "canUpdateFieldValue",
  "universalIdentifier",
  "applicationId"
)
SELECT
  obsolete."workspaceId",
  obsolete."roleId",
  obsolete."objectMetadataId",
  $3,
  obsolete."canReadFieldValue",
  obsolete."canUpdateFieldValue",
  gen_random_uuid(),
  obsolete."applicationId"
FROM core."fieldPermission" AS obsolete
WHERE obsolete."workspaceId" = $1
  AND obsolete."fieldMetadataId" = $2
  AND NOT EXISTS (
    SELECT 1
    FROM core."fieldPermission" AS replacement
    WHERE replacement."workspaceId" = obsolete."workspaceId"
      AND replacement."fieldMetadataId" = $3
      AND replacement."roleId" = obsolete."roleId"
  )
ON CONFLICT ("fieldMetadataId", "roleId") DO NOTHING
`;

type DatabaseColumnRow = { columnName: string };
type CountRow = { count: string };
type FieldMetadataRow = { id: string; universalIdentifier: string };

export type MigrateMyahCreatorSocialLinksArgs = {
  workspaceId: string;
  workspaceDataSource: GlobalWorkspaceDataSource;
  dryRun: boolean;
};

@Injectable()
export class MigrateMyahCreatorSocialLinksService {
  private readonly logger = new Logger(
    MigrateMyahCreatorSocialLinksService.name,
  );

  constructor(
    @InjectDataSource()
    private readonly coreDataSource: DataSource,
    private readonly workspaceMigrationRunnerService: WorkspaceMigrationRunnerService,
    private readonly workspaceMetadataVersionService: WorkspaceMetadataVersionService,
  ) {}

  // Dormant leaf only: the eventual outer adapter must verify the upgrade lock's
  // runner identity. This method never owns the transaction or its receipt.
  async migrateInUpgradeTransaction({
    workspaceId,
    schemaName,
    upgradeTransaction,
  }: {
    workspaceId: string;
    schemaName: string;
    upgradeTransaction: UpgradeWorkspaceTransaction;
  }): Promise<{ canDeleteOldFields: boolean }> {
    const runner = upgradeTransaction?.queryRunner;

    if (
      !isUUID(workspaceId) ||
      schemaName !== getWorkspaceSchemaName(workspaceId) ||
      !runner ||
      runner.isReleased ||
      !runner.isTransactionActive ||
      !runner.manager ||
      runner.manager.queryRunner !== runner ||
      typeof upgradeTransaction.afterCommit !== 'function'
    ) {
      throw new Error(
        'Creator social migration requires a bound upgrade transaction and workspace schema',
      );
    }

    const query = (sql: string, parameters: unknown[] = []): Promise<unknown> =>
      runner.query(sql, parameters);
    const rows = async <T>(
      sql: string,
      parameters: unknown[] = [],
    ): Promise<T[]> => {
      const result = await query(sql, parameters);

      if (!Array.isArray(result))
        throw new Error('Invalid Creator social query result');
      return result as T[];
    };
    const count = async (
      sql: string,
      parameters: unknown[] = [],
    ): Promise<number> => {
      const result = await rows<{ count: unknown }>(sql, parameters);
      const value = result[0]?.count;

      if (
        result.length !== 1 ||
        typeof value !== 'string' ||
        !/^(0|[1-9]\d*)$/.test(value) ||
        !Number.isSafeInteger(Number(value))
      )
        throw new Error('Invalid Creator social count');
      return Number(value);
    };

    const workspace = await rows<{ databaseSchema: string }>(
      `SELECT "databaseSchema" FROM core."workspace" WHERE id = $1`,
      [workspaceId],
    );

    if (workspace.length !== 1 || workspace[0].databaseSchema !== schemaName) {
      throw new Error('Creator social workspace schema mismatch');
    }
    if (
      (await count(
        `SELECT COUNT(*)::text AS count FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = 'creator' AND table_type = 'BASE TABLE'`,
        [schemaName],
      )) !== 1
    )
      throw new Error('Creator table is missing');

    const columnRows = await rows<{ columnName: string; dataType: string }>(
      `SELECT column_name AS "columnName", data_type AS "dataType"
       FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'creator'`,
      [schemaName],
    );
    const columns = new Map(
      columnRows.map(({ columnName, dataType }) => [columnName, dataType]),
    );

    if (
      columnRows.length === 0 ||
      columns.size !== columnRows.length ||
      columnRows.some(
        ({ columnName, dataType }) =>
          typeof columnName !== 'string' || typeof dataType !== 'string',
      )
    )
      throw new Error('Invalid Creator column catalog');

    const presentPairs = CREATOR_SOCIAL_LINK_FIELD_PAIRS.filter((pair) =>
      columns.has(pair.oldColumnName),
    );

    if (presentPairs.length === 0) {
      if (
        await count(
          `SELECT COUNT(*)::text AS count FROM core."fieldMetadata"
         WHERE "workspaceId" = $1 AND "universalIdentifier" = ANY($2::uuid[])`,
          [
            workspaceId,
            CREATOR_SOCIAL_LINK_FIELD_PAIRS.map(
              (pair) => pair.oldUniversalIdentifier,
            ),
          ],
        )
      )
        throw new Error(
          'Creator obsolete field metadata remains without data columns',
        );
      return { canDeleteOldFields: true };
    }

    for (const pair of presentPairs) {
      const textType = (name: string) =>
        ['text', 'character varying'].includes(columns.get(name) ?? '');

      if (
        !textType(pair.oldColumnName) ||
        !textType(pair.newPrimaryUrlColumnName) ||
        !textType(pair.newPrimaryLabelColumnName) ||
        columns.get(pair.newSecondaryLinksColumnName) !== 'jsonb'
      )
        throw new Error(
          'Creator social columns are missing or have incompatible types',
        );
    }

    // Only the fixed pair names interpolate into SQL; the schema identifier is
    // generated from the validated UUID and escaped by the installed PG driver.
    const creator = `${runner.connection.driver.escape(schemaName)}.${runner.connection.driver.escape('creator')}`;
    const fieldIds = presentPairs.flatMap((pair) => [
      pair.oldUniversalIdentifier,
      pair.newUniversalIdentifier,
    ]);
    const fields = await rows<{
      id: string;
      universalIdentifier: string;
      name: string;
      type: string;
      objectMetadataId: string;
      applicationId: string;
      objectUniversalIdentifier: string;
      objectName: string;
      objectApplicationId: string;
    }>(
      `SELECT f.id, f."universalIdentifier", f.name, f.type,
              f."objectMetadataId", f."applicationId",
              o."universalIdentifier" AS "objectUniversalIdentifier",
              o."nameSingular" AS "objectName", o."applicationId" AS "objectApplicationId"
       FROM core."fieldMetadata" f
       JOIN core."objectMetadata" o ON o.id = f."objectMetadataId"
         AND o."workspaceId" = f."workspaceId"
       JOIN core."application" a ON a.id = f."applicationId"
         AND a."workspaceId" = f."workspaceId" AND a."deletedAt" IS NULL
       WHERE f."workspaceId" = $1 AND f."universalIdentifier" = ANY($2::uuid[])`,
      [workspaceId, fieldIds],
    );
    const byUid = new Map(
      fields.map((field) => [field.universalIdentifier, field]),
    );

    if (fields.length !== fieldIds.length || byUid.size !== fieldIds.length) {
      throw new Error('Creator social field metadata is missing or ambiguous');
    }

    for (const pair of presentPairs) {
      const old = byUid.get(pair.oldUniversalIdentifier)!;
      const replacement = byUid.get(pair.newUniversalIdentifier)!;
      const newName = pair.newPrimaryUrlColumnName.replace(
        'PrimaryLinkUrl',
        '',
      );

      if (
        old.name !== pair.oldColumnName ||
        old.type !== 'TEXT' ||
        replacement.name !== newName ||
        replacement.type !== 'LINKS' ||
        old.objectMetadataId !== replacement.objectMetadataId ||
        old.applicationId !== replacement.applicationId ||
        old.applicationId !== old.objectApplicationId ||
        replacement.applicationId !== replacement.objectApplicationId ||
        old.objectUniversalIdentifier !==
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier ||
        replacement.objectUniversalIdentifier !==
          MYAH_STANDARD_OBJECTS.creator.universalIdentifier ||
        old.objectName !== 'creator' ||
        replacement.objectName !== 'creator'
      )
        throw new Error('Creator social field ownership or identity mismatch');
    }

    // All preflight checks precede every write. Unknown companion values and
    // duplicate view references have no approved lossless merge policy.
    for (const pair of presentPairs) {
      if (
        await count(
          `SELECT COUNT(*)::text AS count FROM ${creator}
         WHERE NULLIF(BTRIM("${pair.oldColumnName}"), '') IS NOT NULL
           AND (NULLIF(BTRIM("${pair.newPrimaryUrlColumnName}"), '') IS NOT NULL
             AND BTRIM("${pair.oldColumnName}") <> BTRIM("${pair.newPrimaryUrlColumnName}")
             OR "${pair.newSecondaryLinksColumnName}" IS NOT NULL
               AND jsonb_typeof("${pair.newSecondaryLinksColumnName}") <> 'array')`,
        )
      )
        throw new Error(
          'Creator social URL conflict or malformed secondary links',
        );

      const old = byUid.get(pair.oldUniversalIdentifier)!;
      const replacement = byUid.get(pair.newUniversalIdentifier)!;

      if (
        await count(
          `SELECT COUNT(*)::text AS count FROM core."fieldPermission" p
         LEFT JOIN core."role" r ON r.id = p."roleId" AND r."workspaceId" = p."workspaceId"
         WHERE p."workspaceId" = $1 AND p."fieldMetadataId" IN ($2, $3)
           AND (p."objectMetadataId" <> $4 OR p."applicationId" <> $5 OR r.id IS NULL
             OR p."canReadFieldValue" IS TRUE OR p."canUpdateFieldValue" IS TRUE)`,
          [
            workspaceId,
            old.id,
            replacement.id,
            old.objectMetadataId,
            old.applicationId,
          ],
        )
      )
        throw new Error(
          'Creator social field permissions have invalid owners or values',
        );

      for (const table of ['viewField', 'viewFilter', 'viewSort']) {
        if (
          await count(
            `SELECT COUNT(*)::text AS count FROM core."${table}" obsolete
           LEFT JOIN core."view" v ON v.id = obsolete."viewId" AND v."workspaceId" = obsolete."workspaceId"
           WHERE obsolete."workspaceId" = $1 AND obsolete."fieldMetadataId" IN ($2, $3)
             AND obsolete."deletedAt" IS NULL
             AND (v.id IS NULL OR v."deletedAt" IS NOT NULL OR
               (obsolete."fieldMetadataId" = $2 AND EXISTS (
                 SELECT 1 FROM core."${table}" replacement
                 WHERE replacement."workspaceId" = $1 AND replacement."viewId" = obsolete."viewId"
                   AND replacement."fieldMetadataId" = $3 AND replacement."deletedAt" IS NULL)))`,
            [workspaceId, old.id, replacement.id],
          )
        )
          throw new Error(
            'Creator social view ownership or duplicate reference is ambiguous',
          );
      }
    }

    for (const pair of presentPairs) {
      const old = byUid.get(pair.oldUniversalIdentifier)!;
      const replacement = byUid.get(pair.newUniversalIdentifier)!;
      const ids = [workspaceId, old.id, replacement.id];

      // Keep obsolete restrictions; FALSE on either side wins. The insert runs
      // after the update, so the two statements cannot update the same row.
      await query(
        `UPDATE core."fieldPermission" replacement SET
        "canReadFieldValue" = CASE WHEN replacement."canReadFieldValue" IS FALSE OR obsolete."canReadFieldValue" IS FALSE THEN FALSE ELSE NULL END,
        "canUpdateFieldValue" = CASE WHEN replacement."canUpdateFieldValue" IS FALSE OR obsolete."canUpdateFieldValue" IS FALSE THEN FALSE ELSE NULL END
        FROM core."fieldPermission" obsolete WHERE replacement."workspaceId" = $1
          AND obsolete."workspaceId" = $1 AND obsolete."fieldMetadataId" = $2
          AND replacement."fieldMetadataId" = $3 AND replacement."roleId" = obsolete."roleId"`,
        ids,
      );
      await query(
        `INSERT INTO core."fieldPermission" (
        "workspaceId", "roleId", "objectMetadataId", "fieldMetadataId",
        "canReadFieldValue", "canUpdateFieldValue", "universalIdentifier", "applicationId")
        SELECT obsolete."workspaceId", obsolete."roleId", obsolete."objectMetadataId", $3,
          obsolete."canReadFieldValue", obsolete."canUpdateFieldValue", gen_random_uuid(), obsolete."applicationId"
        FROM core."fieldPermission" obsolete WHERE obsolete."workspaceId" = $1
          AND obsolete."fieldMetadataId" = $2 AND NOT EXISTS (
            SELECT 1 FROM core."fieldPermission" replacement WHERE replacement."workspaceId" = $1
              AND replacement."fieldMetadataId" = $3 AND replacement."roleId" = obsolete."roleId")
        ON CONFLICT ("fieldMetadataId", "roleId") DO NOTHING`,
        ids,
      );

      await query(`UPDATE ${creator} SET
        "${pair.newPrimaryUrlColumnName}" = COALESCE(NULLIF(BTRIM("${pair.newPrimaryUrlColumnName}"), ''), BTRIM("${pair.oldColumnName}")),
        "${pair.newPrimaryLabelColumnName}" = COALESCE("${pair.newPrimaryLabelColumnName}", ''),
        "${pair.newSecondaryLinksColumnName}" = COALESCE("${pair.newSecondaryLinksColumnName}", '[]'::jsonb)
        WHERE NULLIF(BTRIM("${pair.oldColumnName}"), '') IS NOT NULL
          AND (NULLIF(BTRIM("${pair.newPrimaryUrlColumnName}"), '') IS NULL
            OR "${pair.newPrimaryLabelColumnName}" IS NULL
            OR "${pair.newSecondaryLinksColumnName}" IS NULL)`);

      for (const table of ['viewField', 'viewFilter', 'viewSort']) {
        await query(
          `UPDATE core."${table}" SET "fieldMetadataId" = $3${table === 'viewField' ? '' : ', "subFieldName" = \'primaryLinkUrl\''}
          WHERE "workspaceId" = $1 AND "fieldMetadataId" = $2 AND "deletedAt" IS NULL`,
          ids,
        );
      }
    }

    for (const pair of presentPairs) {
      if (
        await count(`SELECT COUNT(*)::text AS count FROM ${creator}
        WHERE NULLIF(BTRIM("${pair.oldColumnName}"), '') IS NOT NULL
          AND (NULLIF(BTRIM("${pair.newPrimaryUrlColumnName}"), '') IS NULL
            OR BTRIM("${pair.oldColumnName}") <> BTRIM("${pair.newPrimaryUrlColumnName}")
            OR "${pair.newPrimaryLabelColumnName}" IS NULL
            OR jsonb_typeof("${pair.newSecondaryLinksColumnName}") IS DISTINCT FROM 'array')`)
      ) {
        throw new Error('Creator social data verification failed');
      }
      const old = byUid.get(pair.oldUniversalIdentifier)!;
      const replacement = byUid.get(pair.newUniversalIdentifier)!;

      if (
        await count(
          `SELECT COUNT(*)::text AS count FROM core."fieldPermission" obsolete
        WHERE obsolete."workspaceId" = $1 AND obsolete."fieldMetadataId" = $2
          AND NOT EXISTS (SELECT 1 FROM core."fieldPermission" replacement
            WHERE replacement."workspaceId" = $1 AND replacement."roleId" = obsolete."roleId"
              AND replacement."fieldMetadataId" = $3
              AND (obsolete."canReadFieldValue" IS DISTINCT FROM FALSE OR replacement."canReadFieldValue" IS FALSE)
              AND (obsolete."canUpdateFieldValue" IS DISTINCT FROM FALSE OR replacement."canUpdateFieldValue" IS FALSE))`,
          [workspaceId, old.id, replacement.id],
        )
      )
        throw new Error('Creator social permissions verification failed');
    }
    if (
      await count(
        `SELECT (
      (SELECT COUNT(*) FROM core."viewField" WHERE "workspaceId" = $1 AND "fieldMetadataId" = ANY($2::uuid[]) AND "deletedAt" IS NULL) +
      (SELECT COUNT(*) FROM core."viewFilter" WHERE "workspaceId" = $1 AND "fieldMetadataId" = ANY($2::uuid[]) AND "deletedAt" IS NULL) +
      (SELECT COUNT(*) FROM core."viewSort" WHERE "workspaceId" = $1 AND "fieldMetadataId" = ANY($2::uuid[]) AND "deletedAt" IS NULL)
    )::text AS count`,
        [
          workspaceId,
          presentPairs.map(
            (pair) => byUid.get(pair.oldUniversalIdentifier)!.id,
          ),
        ],
      )
    ) {
      throw new Error('Creator social obsolete view references remain');
    }

    await this.workspaceMetadataVersionService.incrementMetadataVersion(
      workspaceId,
      upgradeTransaction,
    );
    upgradeTransaction.afterCommit(async () => {
      await this.workspaceMigrationRunnerService.invalidateCache({
        allFlatEntityMapsKeys: [
          'flatFieldPermissionMaps',
          'flatFieldMetadataMaps',
          'flatObjectMetadataMaps',
          'flatRoleMaps',
          'flatViewFieldMaps',
          'flatViewFilterMaps',
          'flatViewSortMaps',
        ],
        workspaceId,
        incrementVersion: false,
      });
    });
    return { canDeleteOldFields: true };
  }

  async migrate({
    workspaceId,
    workspaceDataSource,
    dryRun,
  }: MigrateMyahCreatorSocialLinksArgs): Promise<{
    canDeleteOldFields: boolean;
  }> {
    const columnRows = await workspaceDataSource.query<DatabaseColumnRow[]>(
      `
        SELECT "column_name" AS "columnName"
        FROM information_schema.columns
        WHERE "table_schema" = current_schema()
          AND "table_name" = 'creator'
      `,
      undefined,
      undefined,
      { shouldBypassPermissionChecks: true },
    );
    const availableColumns = new Set(
      columnRows.map(({ columnName }) => columnName),
    );
    const presentPairs = CREATOR_SOCIAL_LINK_FIELD_PAIRS.filter((pair) =>
      availableColumns.has(pair.oldColumnName),
    );

    if (presentPairs.length === 0) {
      return { canDeleteOldFields: true };
    }

    const hasMissingReplacementColumn = presentPairs.some(
      (pair) =>
        !availableColumns.has(pair.newPrimaryUrlColumnName) ||
        !availableColumns.has(pair.newPrimaryLabelColumnName) ||
        !availableColumns.has(pair.newSecondaryLinksColumnName),
    );

    if (hasMissingReplacementColumn) {
      if (dryRun) {
        this.logger.log(
          `Creator social link migration dry-run expects the preceding metadata sync to create replacement columns for workspace ${workspaceId}`,
        );

        return { canDeleteOldFields: true };
      }
      this.logger.error(
        `Cannot migrate Creator social links for workspace ${workspaceId}: replacement columns are missing`,
      );

      return { canDeleteOldFields: false };
    }

    for (const pair of presentPairs) {
      const conflictRows = await workspaceDataSource.query<CountRow[]>(
        `
          SELECT COUNT(*)::text AS "count"
          FROM "creator"
          WHERE NULLIF(BTRIM("${pair.oldColumnName}"), '') IS NOT NULL
            AND NULLIF(BTRIM("${pair.newPrimaryUrlColumnName}"), '') IS NOT NULL
            AND BTRIM("${pair.oldColumnName}") <> BTRIM("${pair.newPrimaryUrlColumnName}")
        `,
        undefined,
        undefined,
        { shouldBypassPermissionChecks: true },
      );

      if (Number(conflictRows[0]?.count ?? 0) > 0) {
        this.logger.error(
          `Cannot migrate Creator social links for workspace ${workspaceId}: ${pair.oldColumnName} conflicts with ${pair.newPrimaryUrlColumnName}`,
        );

        return { canDeleteOldFields: false };
      }
    }

    const metadataUniversalIdentifiers = presentPairs.flatMap((pair) => [
      pair.oldUniversalIdentifier,
      pair.newUniversalIdentifier,
    ]);
    const fieldMetadataRows = await this.coreDataSource.query<
      FieldMetadataRow[]
    >(
      `
        SELECT id, "universalIdentifier"
        FROM core."fieldMetadata"
        WHERE "workspaceId" = $1
          AND "universalIdentifier" = ANY($2::uuid[])
          AND "deletedAt" IS NULL
      `,
      [workspaceId, metadataUniversalIdentifiers],
    );
    const fieldMetadataIdByUniversalIdentifier = new Map(
      fieldMetadataRows.map(({ id, universalIdentifier }) => [
        universalIdentifier,
        id,
      ]),
    );
    const hasMissingFieldMetadata = presentPairs.some(
      (pair) =>
        !fieldMetadataIdByUniversalIdentifier.has(
          pair.oldUniversalIdentifier,
        ) ||
        !fieldMetadataIdByUniversalIdentifier.has(pair.newUniversalIdentifier),
    );

    if (hasMissingFieldMetadata) {
      if (dryRun) {
        this.logger.log(
          `Creator social link migration dry-run expects the preceding metadata sync to create replacement field metadata for workspace ${workspaceId}`,
        );

        return { canDeleteOldFields: true };
      }
      this.logger.error(
        `Cannot migrate Creator social links for workspace ${workspaceId}: field metadata is incomplete`,
      );

      return { canDeleteOldFields: false };
    }

    if (dryRun) {
      this.logger.log(
        `Creator social link migration dry-run succeeded for workspace ${workspaceId}`,
      );

      return { canDeleteOldFields: true };
    }

    try {
      for (const pair of presentPairs) {
        await this.coreDataSource.query(COPY_FIELD_PERMISSIONS_SQL, [
          workspaceId,
          fieldMetadataIdByUniversalIdentifier.get(pair.oldUniversalIdentifier),
          fieldMetadataIdByUniversalIdentifier.get(pair.newUniversalIdentifier),
        ]);
      }

      for (const pair of presentPairs) {
        await workspaceDataSource.query(
          `
            UPDATE "creator"
            SET
              "${pair.newPrimaryUrlColumnName}" = COALESCE(NULLIF(BTRIM("${pair.newPrimaryUrlColumnName}"), ''), BTRIM("${pair.oldColumnName}")),
              "${pair.newPrimaryLabelColumnName}" = COALESCE("${pair.newPrimaryLabelColumnName}", ''),
              "${pair.newSecondaryLinksColumnName}" = CASE
                WHEN jsonb_typeof("${pair.newSecondaryLinksColumnName}") = 'array'
                THEN "${pair.newSecondaryLinksColumnName}"
                ELSE '[]'::jsonb
              END
            WHERE NULLIF(BTRIM("${pair.oldColumnName}"), '') IS NOT NULL
              AND (
                NULLIF(BTRIM("${pair.newPrimaryUrlColumnName}"), '') IS NULL
                OR "${pair.newPrimaryLabelColumnName}" IS NULL
                OR jsonb_typeof("${pair.newSecondaryLinksColumnName}") IS DISTINCT FROM 'array'
              )
          `,
          undefined,
          undefined,
          { shouldBypassPermissionChecks: true },
        );
      }

      const queryRunner = this.coreDataSource.createQueryRunner();

      await queryRunner.connect();

      try {
        await queryRunner.startTransaction();

        for (const pair of presentPairs) {
          await queryRunner.manager.query(MIGRATE_VIEW_REFERENCES_SQL, [
            workspaceId,
            fieldMetadataIdByUniversalIdentifier.get(
              pair.oldUniversalIdentifier,
            ),
            fieldMetadataIdByUniversalIdentifier.get(
              pair.newUniversalIdentifier,
            ),
          ]);
        }

        await queryRunner.commitTransaction();
      } catch (error) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }

        throw error;
      } finally {
        await queryRunner.release();
      }

      for (const pair of presentPairs) {
        const mismatchRows = await workspaceDataSource.query<CountRow[]>(
          `
            SELECT COUNT(*)::text AS "count"
            FROM "creator"
            WHERE NULLIF(BTRIM("${pair.oldColumnName}"), '') IS NOT NULL
              AND (
                NULLIF(BTRIM("${pair.newPrimaryUrlColumnName}"), '') IS NULL
                OR BTRIM("${pair.oldColumnName}") <> BTRIM("${pair.newPrimaryUrlColumnName}")
                OR "${pair.newPrimaryLabelColumnName}" IS NULL
                OR jsonb_typeof("${pair.newSecondaryLinksColumnName}") IS DISTINCT FROM 'array'
              )
          `,
          undefined,
          undefined,
          { shouldBypassPermissionChecks: true },
        );

        if (Number(mismatchRows[0]?.count ?? 0) > 0) {
          return { canDeleteOldFields: false };
        }
      }

      const obsoleteFieldMetadataIds = presentPairs.map((pair) =>
        fieldMetadataIdByUniversalIdentifier.get(pair.oldUniversalIdentifier),
      );
      const remainingReferenceRows = await this.coreDataSource.query<
        CountRow[]
      >(
        `
          SELECT (
            (SELECT COUNT(*) FROM core."viewField"
              WHERE "workspaceId" = $1
                AND "fieldMetadataId" = ANY($2::uuid[])
                AND "deletedAt" IS NULL) +
            (SELECT COUNT(*) FROM core."viewFilter"
              WHERE "workspaceId" = $1
                AND "fieldMetadataId" = ANY($2::uuid[])
                AND "deletedAt" IS NULL) +
            (SELECT COUNT(*) FROM core."viewSort"
              WHERE "workspaceId" = $1
                AND "fieldMetadataId" = ANY($2::uuid[])
                AND "deletedAt" IS NULL)
          )::text AS "count"
        `,
        [workspaceId, obsoleteFieldMetadataIds],
      );

      return {
        canDeleteOldFields: Number(remainingReferenceRows[0]?.count ?? 0) === 0,
      };
    } finally {
      await this.invalidateMetadataCache(workspaceId);
    }
  }

  private async invalidateMetadataCache(workspaceId: string): Promise<void> {
    try {
      await this.workspaceMigrationRunnerService.invalidateCache({
        allFlatEntityMapsKeys: [
          'flatFieldPermissionMaps',
          'flatFieldMetadataMaps',
          'flatObjectMetadataMaps',
          'flatRoleMaps',
          'flatViewFieldMaps',
          'flatViewFilterMaps',
          'flatViewSortMaps',
        ],
        workspaceId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to invalidate Creator social link migration metadata cache for workspace ${workspaceId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
