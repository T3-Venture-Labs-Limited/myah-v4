import { InjectDataSource } from '@nestjs/typeorm';
import { Command } from 'nest-commander';
import { DataSource } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const REQUIRED_COLUMNS_BY_TABLE = {
  _myahSocialConversation: [
    'id',
    'provider',
    'lifecycle',
    'providerConversationId',
    'recipientIgsid',
  ],
  _myahSocialMessage: [
    'id',
    'provider',
    'conversationId',
    'text',
    'providerCreatedAt',
  ],
  _myahInstagramReplyDraft: [
    'id',
    'conversationId',
    'status',
    'sentAt',
    'sendBlockedReason',
  ],
} as const;

type AppSyncedTableColumn = {
  tableName: keyof typeof REQUIRED_COLUMNS_BY_TABLE;
  columnName: string | null;
};

@RegisteredWorkspaceCommand('2.20.0', 1789307619373)
@Command({
  name: 'upgrade:2-20:backfill-composio-instagram-history',
  description:
    'Preserve legacy Composio Instagram history and invalidate obsolete reply drafts',
})
export class BackfillComposioInstagramHistoryWorkspaceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    @InjectDataSource() private readonly coreDataSource: DataSource,
  ) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    const schemaName = getWorkspaceSchemaName(args.workspaceId);
    const [workspace] = (await this.coreDataSource.query(
      `SELECT w."databaseSchema" FROM core.workspace w
       WHERE w.id = $1 AND w."deletedAt" IS NULL
         AND (w."databaseSchema" IS NULL OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_namespace n
           WHERE n.nspname = w."databaseSchema"
         ))`,
      [args.workspaceId],
    )) as { databaseSchema: string | null }[];

    if (workspace?.databaseSchema === null) {
      return;
    }
    if (workspace?.databaseSchema !== schemaName) {
      throw new Error(
        'Cannot backfill Composio Instagram history: workspace schema prerequisite mismatch',
      );
    }

    const appSyncedColumns = (await this.coreDataSource.query(
      `SELECT
        tables.table_name AS "tableName",
        columns.column_name AS "columnName"
      FROM information_schema.tables tables
      LEFT JOIN information_schema.columns columns
        ON columns.table_schema = tables.table_schema
        AND columns.table_name = tables.table_name
      WHERE tables.table_schema = $1
        AND tables.table_name = ANY($2::text[])`,
      [schemaName, Object.keys(REQUIRED_COLUMNS_BY_TABLE)],
    )) as AppSyncedTableColumn[];

    if (appSyncedColumns.length === 0) {
      return;
    }

    const availableColumnsByTable = new Map<string, Set<string>>();

    for (const { tableName, columnName } of appSyncedColumns) {
      const availableColumns =
        availableColumnsByTable.get(tableName) ?? new Set<string>();

      if (columnName !== null) {
        availableColumns.add(columnName);
      }
      availableColumnsByTable.set(tableName, availableColumns);
    }
    const missingAppSyncedColumns = Object.entries(
      REQUIRED_COLUMNS_BY_TABLE,
    ).flatMap(([tableName, requiredColumns]) => {
      const availableColumns = availableColumnsByTable.get(tableName);

      return requiredColumns
        .filter((columnName) => !availableColumns?.has(columnName))
        .map((columnName) => `${tableName}.${columnName}`);
    });

    if (missingAppSyncedColumns.length > 0) {
      throw new Error(
        `Cannot backfill Composio Instagram history: app-synced Instagram history fields are missing (${missingAppSyncedColumns.join(', ')})`,
      );
    }

    if (args.options.dryRun) {
      return;
    }

    await this.coreDataSource.query(`
      WITH "legacyMessages" AS (
        UPDATE "${schemaName}"."_myahSocialMessage" AS "message"
        SET "provider" = 'COMPOSIO_HISTORY'
        FROM "${schemaName}"."_myahSocialConversation" AS "conversation"
        WHERE "message"."conversationId" = "conversation"."id"
          AND "message"."provider" IS DISTINCT FROM 'UNIPILE'
          AND "conversation"."provider" IS DISTINCT FROM 'UNIPILE'
          AND "message"."provider" IS DISTINCT FROM 'COMPOSIO_HISTORY'
        RETURNING "message"."id"
      ),
      "legacyConversations" AS (
        UPDATE "${schemaName}"."_myahSocialConversation" AS "conversation"
        SET
          "provider" = 'COMPOSIO_HISTORY',
          "lifecycle" = 'HISTORICAL'
        WHERE "conversation"."provider" IS DISTINCT FROM 'UNIPILE'
          AND (
            "conversation"."provider" IS DISTINCT FROM 'COMPOSIO_HISTORY'
            OR "conversation"."lifecycle" IS DISTINCT FROM 'HISTORICAL'
          )
        RETURNING "conversation"."id"
      )
      UPDATE "${schemaName}"."_myahInstagramReplyDraft" AS "draft"
      SET
        "status" = 'DISCARDED',
        "sendBlockedReason" = 'PROVIDER_CUTOVER'
      FROM "${schemaName}"."_myahSocialConversation" AS "conversation"
      WHERE "draft"."conversationId" = "conversation"."id"
        AND "conversation"."provider" IS DISTINCT FROM 'UNIPILE'
        AND "draft"."sentAt" IS NULL
        AND "draft"."status" IN ('NEEDS_REVIEW', 'APPROVED')
    `);
  }
}
