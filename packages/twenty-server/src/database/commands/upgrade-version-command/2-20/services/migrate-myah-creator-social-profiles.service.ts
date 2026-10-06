import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';

import {
  LEGACY_CREATOR_MIGRATION_FIELDS,
  planMyahCreatorSocialProfileMigration,
  type LegacyCreatorRow,
} from 'src/database/commands/upgrade-version-command/2-20/services/plan-myah-creator-social-profile-migration.util';
import { type GlobalWorkspaceDataSource } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import {
  MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
  MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/myah-standard-role-permission-definitions.constant';
import { CreatorDataOperationService } from 'src/modules/myah-creator-social-profile/services/creator-data-operation.service';
import { CreatorDataOperationWriterService } from 'src/modules/myah-creator-social-profile/services/creator-data-operation-writer.service';

const MIGRATION_ATTEMPT_KEY = 'MYAH-409-legacy-creator-v1';
// Second pass for values the first pass skipped only because of a field
// restriction our standard role has since dropped. Kept separate so existing
// first-pass receipts still replay with their original digest.
const RELEASED_RESTRICTIONS_ATTEMPT_KEY =
  'MYAH-409-legacy-creator-v1-released-restrictions';

type RestrictedFieldRow = { name: string; retired: boolean };
type CreatorJsonRow = { data: LegacyCreatorRow };
type CountRow = { count: string };

export type CreatorSocialProfileMigrationReport = {
  scanned: number;
  plannedProfiles: number;
  plannedNotes: number;
  committedRows: number;
  replayedRows: number;
  conflicts: number;
  failures: number;
  skippedRestrictedValues: number;
  reconciliationMismatches: number;
};

@Injectable()
export class MigrateMyahCreatorSocialProfilesService {
  private readonly logger = new Logger(
    MigrateMyahCreatorSocialProfilesService.name,
  );

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly operationService: CreatorDataOperationService,
    private readonly writer: CreatorDataOperationWriterService,
  ) {}

  async migrate({
    workspaceId,
    workspaceDataSource,
    dryRun,
  }: {
    workspaceId: string;
    workspaceDataSource: GlobalWorkspaceDataSource;
    dryRun: boolean;
  }): Promise<CreatorSocialProfileMigrationReport> {
    const rows = await this.getCreatorRows(workspaceDataSource, workspaceId);
    const { allRestricted, currentRestricted } =
      await this.getRestrictedFields(workspaceId);
    const plans = rows.map((row) =>
      planMyahCreatorSocialProfileMigration({
        row,
        restrictedFields: allRestricted,
      }),
    );
    // Only the fields released from a retired restriction, nothing else.
    const releasedPlans =
      allRestricted.size === currentRestricted.size
        ? []
        : rows.map((row) =>
            planMyahCreatorSocialProfileMigration({
              row,
              restrictedFields: new Set(
                LEGACY_CREATOR_MIGRATION_FIELDS.filter(
                  (field) =>
                    !allRestricted.has(field) || currentRestricted.has(field),
                ),
              ),
            }),
          );
    const allPlans = [...plans, ...releasedPlans];
    const report: CreatorSocialProfileMigrationReport = {
      scanned: plans.length,
      plannedProfiles: allPlans.reduce(
        (count, plan) => count + plan.profiles.length,
        0,
      ),
      plannedNotes: allPlans.filter((plan) => plan.noteMarkdown !== null)
        .length,
      committedRows: 0,
      replayedRows: 0,
      conflicts: allPlans.filter((plan) => plan.conflicts.length > 0).length,
      failures: 0,
      skippedRestrictedValues: rows.reduce(
        (count, row) =>
          count +
          planMyahCreatorSocialProfileMigration({
            row,
            restrictedFields: currentRestricted,
          }).skippedRestrictedFields.length,
        0,
      ),
      reconciliationMismatches: 0,
    };

    if (dryRun) {
      this.logger.log(
        `MYAH-409 Creator migration dry-run workspace=${workspaceId} ${JSON.stringify(report)}`,
      );
      return report;
    }

    // A creator with a receipt was already migrated. The upgrade can replay this
    // command after the creator was edited or the legacy fields were removed, so
    // re-planning from current data would not match the original receipt.
    const migrated = await this.getMigratedOperationKeys(workspaceId);

    for (const [attemptKey, plan] of [
      ...plans.map((plan) => [MIGRATION_ATTEMPT_KEY, plan] as const),
      ...releasedPlans.map(
        (plan) => [RELEASED_RESTRICTIONS_ATTEMPT_KEY, plan] as const,
      ),
    ]) {
      if (
        plan.conflicts.length > 0 ||
        (plan.profiles.length === 0 && plan.noteMarkdown === null)
      ) {
        continue;
      }
      if (migrated.has(`${attemptKey}:${plan.creatorId}`)) {
        report.replayedRows += 1;
        continue;
      }

      try {
        const result = await this.operationService.execute({
          workspaceId,
          kind: 'LEGACY_MIGRATION',
          actorWorkspaceMemberId: null,
          attemptKey,
          operationKey: plan.creatorId,
          sourceDigest: plan.sourceDigest,
          write: async (manager, schemaName) => {
            const socialProfileIds: string[] = [];

            for (const profile of plan.profiles) {
              socialProfileIds.push(
                await this.writer.preserveSocialProfile(
                  manager,
                  schemaName,
                  plan.creatorId,
                  profile,
                  {
                    source: 'SYSTEM',
                    workspaceMemberId: null,
                    name: 'MYAH-409 migration',
                  },
                ),
              );
            }

            const note = await this.writer.createSupplementaryNote(
              manager,
              schemaName,
              plan.creatorId,
              'Legacy Creator context (MYAH-409)',
              plan.noteMarkdown,
              {
                source: 'SYSTEM',
                workspaceMemberId: null,
                name: 'MYAH-409 migration',
              },
            );

            return {
              creatorId: plan.creatorId,
              socialProfileIds,
              noteId: note.noteId,
              noteTargetId: note.noteTargetId,
            };
          },
        });

        if (result.replayed) report.replayedRows += 1;
        else report.committedRows += 1;
      } catch (error) {
        report.failures += 1;
        this.logger.error(
          `MYAH-409 Creator migration failed workspace=${workspaceId} creator=${plan.creatorId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    report.reconciliationMismatches = await this.countReconciliationMismatches(
      workspaceId,
    );
    this.logger.log(
      `MYAH-409 Creator migration completed workspace=${workspaceId} ${JSON.stringify(report)}`,
    );

    return report;
  }

  private async getMigratedOperationKeys(
    workspaceId: string,
  ): Promise<Set<string>> {
    const receipts = await this.dataSource.query<
      { attemptKey: string; operationKey: string }[]
    >(
      `SELECT "attemptKey", "operationKey" FROM core."creatorDataOperationReceipt"
       WHERE "workspaceId" = $1 AND "kind" = 'LEGACY_MIGRATION'
         AND "attemptKey" = ANY($2::text[])`,
      [workspaceId, [MIGRATION_ATTEMPT_KEY, RELEASED_RESTRICTIONS_ATTEMPT_KEY]],
    );

    return new Set(
      receipts.map(
        ({ attemptKey, operationKey }) => `${attemptKey}:${operationKey}`,
      ),
    );
  }

  private async getCreatorRows(
    workspaceDataSource: GlobalWorkspaceDataSource,
    workspaceId: string,
  ): Promise<LegacyCreatorRow[]> {
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const escapedSchemaName = workspaceDataSource.driver.escape(schemaName);
    // SAFETY: schemaName is derived from the workspace UUID and escaped by the active PostgreSQL driver.
    // pi-lens-ignore: sql-injection, no-sql-in-code
    const rows = await workspaceDataSource.query<CreatorJsonRow[]>(
      `SELECT to_jsonb(creator) AS "data"
       FROM ${escapedSchemaName}."creator"
       WHERE "deletedAt" IS NULL
       ORDER BY "id"`,
      undefined,
      undefined,
      { shouldBypassPermissionChecks: true },
    );

    return rows.map(({ data }) => data);
  }

  // allRestricted: every current restriction (the first pass's original view).
  // currentRestricted: excludes restrictions our standard role no longer
  // declares, which this same upgrade removes.
  private async getRestrictedFields(
    workspaceId: string,
  ): Promise<{ allRestricted: Set<string>; currentRestricted: Set<string> }> {
    const rows = await this.dataSource.query<RestrictedFieldRow[]>(
      `SELECT DISTINCT field."name",
         EXISTS (
           SELECT 1 FROM core."role" standard_role
           WHERE standard_role."id" = permission."roleId"
             AND standard_role."universalIdentifier" = $2
             AND permission."universalIdentifier" <> ALL($3::uuid[])
         ) AS "retired"
       FROM core."fieldMetadata" field
       INNER JOIN core."objectMetadata" object
         ON object."id" = field."objectMetadataId"
       INNER JOIN core."fieldPermission" permission
         ON permission."fieldMetadataId" = field."id"
       WHERE object."workspaceId" = $1
         AND object."nameSingular" = 'creator'
         AND object."isActive" IS TRUE
         AND field."isActive" IS TRUE
         AND permission."canReadFieldValue" IS FALSE
       UNION
       SELECT '*' AS "name", FALSE AS "retired"
       WHERE EXISTS (
         SELECT 1
         FROM core."role" role
         INNER JOIN core."objectMetadata" source_object
           ON source_object."workspaceId" = role."workspaceId"
          AND source_object."nameSingular" = 'creator'
         LEFT JOIN core."objectPermission" source_permission
           ON source_permission."objectMetadataId" = source_object."id"
          AND source_permission."roleId" = role."id"
         WHERE role."workspaceId" = $1
           AND (
             CASE WHEN source_object."isSystem" IS TRUE THEN TRUE
             ELSE COALESCE(
               source_permission."canReadObjectRecords",
               role."canReadAllObjectRecords"
             ) END
           ) IS FALSE
           AND EXISTS (
             SELECT 1
             FROM core."objectMetadata" destination_object
             LEFT JOIN core."objectPermission" destination_permission
               ON destination_permission."objectMetadataId" = destination_object."id"
              AND destination_permission."roleId" = role."id"
             WHERE destination_object."workspaceId" = $1
               AND destination_object."nameSingular" IN ('socialProfile', 'note')
               AND (
                 CASE WHEN destination_object."isSystem" IS TRUE THEN TRUE
                 ELSE COALESCE(
                   destination_permission."canReadObjectRecords",
                   role."canReadAllObjectRecords"
                 ) END
               ) IS TRUE
           )
       )`,
      [
        workspaceId,
        MYAH_CREATOR_OPS_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
        MYAH_STANDARD_FIELD_PERMISSION_DEFINITIONS.map(
          ({ universalIdentifier }) => universalIdentifier,
        ),
      ],
    );

    return {
      allRestricted: expandRestrictedFields(rows.map(({ name }) => name)),
      currentRestricted: expandRestrictedFields(
        rows.filter(({ retired }) => !retired).map(({ name }) => name),
      ),
    };
  }

  private async countReconciliationMismatches(
    workspaceId: string,
  ): Promise<number> {
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const escapedSchemaName = this.dataSource.driver.escape(schemaName);
    // SAFETY: schemaName comes from getWorkspaceSchemaName and is escaped by the active PostgreSQL driver.
    const [row] = await this.dataSource.query<CountRow[]>(
      `SELECT COUNT(*)::text AS "count"
       FROM core."creatorDataOperationReceipt" receipt
       WHERE receipt."workspaceId" = $1
         AND receipt."kind" = 'LEGACY_MIGRATION'
         AND receipt."attemptKey" = ANY($2::text[])
         AND (
           NOT EXISTS (
             SELECT 1 FROM ${escapedSchemaName}."creator" creator
             WHERE creator."id" = receipt."creatorId"
           )
           OR (
             receipt."noteId" IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM ${escapedSchemaName}."note" note
               WHERE note."id" = receipt."noteId"
             )
           )
           OR (
             receipt."noteTargetId" IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM ${escapedSchemaName}."noteTarget" target
               WHERE target."id" = receipt."noteTargetId"
                 AND target."targetCreatorId" = receipt."creatorId"
                 AND target."noteId" = receipt."noteId"
             )
           )
           OR EXISTS (
             SELECT 1
             FROM unnest(receipt."socialProfileIds") profile_id
             WHERE NOT EXISTS (
               SELECT 1 FROM ${escapedSchemaName}."socialProfile" profile
               WHERE profile."id" = profile_id
                 AND profile."creatorId" = receipt."creatorId"
             )
           )
         )`,
      [workspaceId, [MIGRATION_ATTEMPT_KEY, RELEASED_RESTRICTIONS_ATTEMPT_KEY]],
    );

    return Number(row?.count ?? 0);
  }
}

const expandRestrictedFields = (names: string[]): Set<string> => {
  const restricted = new Set(names);

  if (restricted.delete('*')) {
    LEGACY_CREATOR_MIGRATION_FIELDS.forEach((field) => restricted.add(field));
  }

  for (const platform of ['instagram', 'tiktok', 'youtube', 'twitter']) {
    if (restricted.has(`${platform}Link`)) {
      restricted.add(`${platform}LinkPrimaryLinkUrl`);
    }
  }

  return restricted;
};
