import { Command } from 'nest-commander';
import {
  MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE,
  MYAH_CAMPAIGN_CREATOR_STAGES,
  MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS,
  MYAH_STANDARD_OBJECTS,
} from 'twenty-shared/metadata';
import { FieldMetadataType } from 'twenty-shared/types';
import { type QueryRunner } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { WorkspaceMetadataVersionService } from 'src/engine/metadata-modules/workspace-metadata-version/services/workspace-metadata-version.service';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { type WorkspaceCacheKeyName } from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { computePostgresEnumName } from 'src/engine/workspace-manager/workspace-migration/utils/compute-postgres-enum-name.util';
import {
  escapeIdentifier,
  escapeLiteral,
} from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';

const TABLE_NAME = 'campaignCreator';
const COLUMN_NAME = 'stage';
const STAGE_FIELD_UNIVERSAL_IDENTIFIER =
  MYAH_STANDARD_OBJECTS.campaignCreator.fields.stage.universalIdentifier;
const CACHE_KEYS = [
  'flatFieldMetadataMaps',
  'ORMEntityMetadatas',
  'graphQLResolverNameMap',
] satisfies WorkspaceCacheKeyName[];

type Storage = {
  dataType: string;
  udtName: string;
  udtSchema: string;
  columnDefault: string | null;
  isNullable: boolean;
};
type StageMetadata = {
  id: string;
  type: string;
  options: unknown;
  defaultValue: unknown;
  isNullable: boolean | null;
};

@RegisteredWorkspaceCommand('2.20.0', 1789066000000)
@Command({
  name: 'upgrade:2-20:upgrade-myah-campaign-creator-stage',
  description: 'Atomically upgrade canonical Campaign Creator stages to SELECT',
})
export class UpgradeMyahCampaignCreatorStageCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    private readonly workspaceCacheService: WorkspaceCacheService,
    private readonly workspaceMetadataVersionService: WorkspaceMetadataVersionService,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (args.dataSource === undefined) return;

    const runner = args.dataSource.coreDataSource.createQueryRunner();

    await runner.connect();
    try {
      await runner.startTransaction();
      await runner.query(`SET LOCAL lock_timeout = '8s'`);

      const campaignCreatorExists = await this.campaignCreatorExists(
        runner,
        args.workspaceId,
      );
      const metadata = await this.readMetadata(runner, args.workspaceId, true);

      // Workspaces without the optional Campaign Creator model are unaffected.
      if (!campaignCreatorExists) {
        await runner.rollbackTransaction();
        return;
      }
      if (metadata === undefined) {
        throw new Error(
          `Campaign Creator stage metadata is unavailable for workspace ${args.workspaceId}`,
        );
      }

      const schemaName = getWorkspaceSchemaName(args.workspaceId);
      const table = `${escapeIdentifier(schemaName)}.${escapeIdentifier(TABLE_NAME)}`;

      // ACCESS EXCLUSIVE is deliberately short-lived and fences all writes
      // between the final value check and the in-place type conversion.
      await runner.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
      const storage = await this.readStorage(runner, schemaName);

      if (storage === undefined) {
        throw new Error(
          `Campaign Creator stage storage is unavailable for workspace ${args.workspaceId}`,
        );
      }

      if (storage.isNullable !== true) {
        throw new Error(
          `Campaign Creator stage storage is not nullable for workspace ${args.workspaceId}`,
        );
      }

      if (storage.dataType === 'text' || storage.dataType === 'character varying') {
        this.assertLegacyTextMetadata(metadata, args.workspaceId);
        await this.assertCanonicalTextValues(runner, table, args.workspaceId);

        if (args.options.dryRun !== true) {
          await this.convertTextStorage(runner, schemaName, table);
          await runner.query(
            `UPDATE ${this.fieldMetadataTable()}
                SET "type" = $1, "options" = $2::jsonb,
                    "defaultValue" = $3::jsonb, "updatedAt" = now()
              WHERE "id" = $4 AND "workspaceId" = $5`,
            [
              FieldMetadataType.SELECT,
              JSON.stringify(MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS),
              JSON.stringify(`'${MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE}'`),
              metadata.id,
              args.workspaceId,
            ],
          );
        }
      } else if (storage.dataType === 'USER-DEFINED') {
        await this.assertCanonicalEnum(runner, storage, args.workspaceId);
        this.assertCanonicalMetadata(metadata, args.workspaceId);
      } else {
        throw new Error(
          `Unsupported Campaign Creator stage storage type ${storage.dataType} for workspace ${args.workspaceId}`,
        );
      }

      if (args.options.dryRun === true) {
        await runner.rollbackTransaction();
        return;
      }

      await runner.commitTransaction();
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }

    // Publication is intentionally post-commit. A failure is recoverable:
    // reruns recognize exact storage+metadata and retry these operations.
    await this.workspaceCacheService.flush(args.workspaceId, CACHE_KEYS);
    await this.workspaceMetadataVersionService.incrementMetadataVersion(
      args.workspaceId,
    );
    await this.workspaceCacheService.invalidateAndRecompute(
      args.workspaceId,
      CACHE_KEYS,
    );
  }

  protected objectMetadataTable(): string {
    return '"core"."objectMetadata"';
  }

  protected fieldMetadataTable(): string {
    return '"core"."fieldMetadata"';
  }

  private async campaignCreatorExists(
    runner: QueryRunner,
    workspaceId: string,
  ): Promise<boolean> {
    const rows = (await runner.query(
      `SELECT 1 FROM ${this.objectMetadataTable()}
        WHERE "workspaceId" = $1 AND "universalIdentifier" = $2`,
      [
        workspaceId,
        MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
      ],
    )) as unknown[];

    return rows.length === 1;
  }

  private async readMetadata(
    runner: QueryRunner,
    workspaceId: string,
    forUpdate: boolean,
  ): Promise<StageMetadata | undefined> {
    const rows = (await runner.query(
      `SELECT "id", "type", "options", "defaultValue", "isNullable"
         FROM ${this.fieldMetadataTable()}
        WHERE "workspaceId" = $1 AND "universalIdentifier" = $2
        ${forUpdate ? 'FOR UPDATE' : ''}`,
      [workspaceId, STAGE_FIELD_UNIVERSAL_IDENTIFIER],
    )) as StageMetadata[];

    if (rows.length > 1) {
      throw new Error(`Multiple Campaign Creator stage metadata rows for workspace ${workspaceId}`);
    }
    return rows[0];
  }

  private async readStorage(
    runner: QueryRunner,
    schemaName: string,
  ): Promise<Storage | undefined> {
    const rows = (await runner.query(
      `SELECT "data_type" AS "dataType", "udt_name" AS "udtName",
              "udt_schema" AS "udtSchema", "column_default" AS "columnDefault",
              ("is_nullable" = 'YES') AS "isNullable"
         FROM information_schema.columns
        WHERE "table_schema" = $1 AND "table_name" = $2 AND "column_name" = $3`,
      [schemaName, TABLE_NAME, COLUMN_NAME],
    )) as Storage[];
    if (rows.length > 1) throw new Error('Multiple Campaign Creator stage columns found');
    return rows[0];
  }

  private assertLegacyTextMetadata(metadata: StageMetadata, workspaceId: string) {
    if (
      metadata.type !== FieldMetadataType.TEXT ||
      metadata.options !== null ||
      metadata.defaultValue !== null ||
      metadata.isNullable !== true
    ) {
      throw new Error(`Campaign Creator TEXT stage metadata is noncanonical for workspace ${workspaceId}`);
    }
  }

  private async assertCanonicalTextValues(
    runner: QueryRunner,
    table: string,
    workspaceId: string,
  ) {
    const [{ invalidValues }] = (await runner.query(
      `SELECT COALESCE(array_agg(DISTINCT "stage"::text), ARRAY[]::text[]) AS "invalidValues"
         FROM ${table}
        WHERE "stage" IS NOT NULL
          AND UPPER(TRIM("stage")) NOT IN (${MYAH_CAMPAIGN_CREATOR_STAGES.map(escapeLiteral).join(', ')})`,
    )) as { invalidValues: string[] }[];
    if (invalidValues.length > 0) {
      throw new Error(
        `Campaign Creator stage has blank, obsolete, or unknown TEXT values for workspace ${workspaceId}: ${invalidValues.join(', ')}`,
      );
    }
  }

  private async assertCanonicalEnum(
    runner: QueryRunner,
    storage: Storage,
    workspaceId: string,
  ) {
    const expectedEnumName = computePostgresEnumName({
      tableName: TABLE_NAME,
      columnName: COLUMN_NAME,
    });
    if (
      storage.udtName !== expectedEnumName ||
      storage.udtSchema !== getWorkspaceSchemaName(workspaceId) ||
      storage.columnDefault === null ||
      !storage.columnDefault.includes(
        `'${MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE}'`,
      )
    ) {
      throw new Error(
        `Campaign Creator stage has noncanonical SELECT enum storage for workspace ${workspaceId}`,
      );
    }

    const labels = (await runner.query(
      `SELECT e.enumlabel AS "enumLabel"
         FROM pg_catalog.pg_enum e
         JOIN pg_catalog.pg_type t ON t.oid = e.enumtypid
         JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1 AND t.typname = $2
        ORDER BY e.enumsortorder`,
      [storage.udtSchema, storage.udtName],
    )) as { enumLabel: string }[];
    if (
      labels.length !== MYAH_CAMPAIGN_CREATOR_STAGES.length ||
      labels.some(({ enumLabel }, index) => enumLabel !== MYAH_CAMPAIGN_CREATOR_STAGES[index])
    ) {
      throw new Error(`Campaign Creator stage has noncanonical SELECT enum storage for workspace ${workspaceId}`);
    }
  }

  private assertCanonicalMetadata(metadata: StageMetadata, workspaceId: string) {
    const hasCanonicalOptions =
      Array.isArray(metadata.options) &&
      metadata.options.length === MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS.length &&
      metadata.options.every((option, index) => {
        if (typeof option !== 'object' || option === null) return false;
        const expected = MYAH_CAMPAIGN_CREATOR_STAGE_OPTIONS[index];
        const candidate = option as Record<string, unknown>;

        const expectedEntries = Object.entries(expected);

        return (
          Object.keys(candidate).length === expectedEntries.length &&
          expectedEntries.every(([key, value]) => candidate[key] === value)
        );
      });

    if (
      metadata.type !== FieldMetadataType.SELECT ||
      !hasCanonicalOptions ||
      metadata.defaultValue !== `'${MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE}'` ||
      metadata.isNullable !== true
    ) {
      throw new Error(`Campaign Creator SELECT stage metadata is noncanonical for workspace ${workspaceId}`);
    }
  }

  private async convertTextStorage(
    runner: QueryRunner,
    schemaName: string,
    table: string,
  ) {
    const enumName = computePostgresEnumName({ tableName: TABLE_NAME, columnName: COLUMN_NAME });
    const enumType = `${escapeIdentifier(schemaName)}.${escapeIdentifier(enumName)}`;
    const collision = (await runner.query(
      `SELECT 1 FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = $1 AND t.typname = $2`,
      [schemaName, enumName],
    )) as unknown[];
    if (collision.length > 0) {
      throw new Error(`Campaign Creator stage enum name collision in workspace schema ${schemaName}`);
    }

    await runner.query(
      `CREATE TYPE ${enumType} AS ENUM (${MYAH_CAMPAIGN_CREATOR_STAGES.map(escapeLiteral).join(', ')})`,
    );
    await runner.query(`ALTER TABLE ${table} ALTER COLUMN "stage" DROP DEFAULT`);
    await runner.query(
      `ALTER TABLE ${table} ALTER COLUMN "stage" TYPE ${enumType}
       USING CASE WHEN "stage" IS NULL THEN NULL ELSE UPPER(TRIM("stage"))::${enumType} END`,
    );
    await runner.query(
      `ALTER TABLE ${table} ALTER COLUMN "stage" SET DEFAULT ${escapeLiteral(MYAH_CAMPAIGN_CREATOR_DEFAULT_STAGE)}::${enumType}`,
    );
  }
}
