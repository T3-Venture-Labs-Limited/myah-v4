import { Command } from 'nest-commander';

import { type FieldMetadataType } from 'twenty-shared/types';
import { isValidUuid } from 'twenty-shared/utils';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import type { RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { computeSearchVectorAsExpressionFromSearchFieldMetadatas } from 'src/engine/metadata-modules/flat-search-field-metadata/utils/compute-search-vector-as-expression-from-search-field-metadatas.util';
import { buildSqlColumnDefinition } from 'src/engine/twenty-orm/workspace-schema-manager/utils/build-sql-column-definition.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

type Row = Record<string, unknown>;

// The physical Creator search column on pre-MYAH-409 workspaces was still
// generated from the legacy Instagram columns, so removing them (1791100000000)
// dropped it too and Creator search failed. Recreate it from the current search
// fields, exactly as Twenty builds it; a no-op where the column exists.
@RegisteredWorkspaceCommand('2.20.0', 1791100000001)
@Command({
  name: 'upgrade:2-20:repair-creator-search-vector',
  description: 'Recreate the Creator searchVector column where it is missing',
})
export class RepairCreatorSearchVectorCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(workspaceIteratorService: WorkspaceIteratorService) {
    super(workspaceIteratorService);
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    if (!args.dataSource || !isValidUuid(args.workspaceId)) return;
    const query = (sql: string, parameters: unknown[]) =>
      args.dataSource!.query(sql, parameters, undefined, {
        shouldBypassPermissionChecks: true,
      }) as Promise<Row[]>;
    const schema = getWorkspaceSchemaName(args.workspaceId);
    const [state] = await query(
      `SELECT to_regclass($1) IS NOT NULL AS "hasTable",
              EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema=$2 AND table_name='creator' AND column_name='searchVector') AS "hasColumn"`,
      [`"${schema}"."creator"`, schema],
    );
    if (state?.hasTable !== true || state.hasColumn === true) return;

    const searchFields = await query(
      `SELECT f.name, f.type, s.position, s."universalIdentifier"::text AS "sortKey"
         FROM core."searchFieldMetadata" s
         JOIN core."objectMetadata" o ON o.id = s."objectMetadataId"
         JOIN core."fieldMetadata" f ON f.id = s."fieldMetadataId"
        WHERE s."workspaceId" = $1 AND o."nameSingular" = 'creator'`,
      [args.workspaceId],
    );
    const asExpression = computeSearchVectorAsExpressionFromSearchFieldMetadatas(
      searchFields.map((field) => ({
        name: String(field.name),
        type: field.type as FieldMetadataType,
        position: Number(field.position),
        sortKey: String(field.sortKey),
      })),
    );
    const column = buildSqlColumnDefinition({
      name: 'searchVector',
      type: 'tsvector',
      asExpression,
      generatedType: 'STORED',
      isNullable: true,
    });

    this.logger.log(
      `Recreating Creator searchVector in workspace ${args.workspaceId}`,
    );
    if (args.options.dryRun) return;
    // pi-lens-ignore: sql-injection, no-sql-in-code — UUID-derived schema; column built by Twenty's guarded DDL builder.
    await args.dataSource.query(
      `ALTER TABLE "${schema}"."creator" ADD COLUMN IF NOT EXISTS ${column}`,
      [],
      undefined,
      { shouldBypassPermissionChecks: true },
    );
  }
}
