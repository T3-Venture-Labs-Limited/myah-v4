import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ActiveOrSuspendedWorkspaceCommandRunner } from 'src/database/commands/command-runners/active-or-suspended-workspace.command-runner';
import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { type RunOnWorkspaceArgs } from 'src/database/commands/command-runners/workspace.command-runner';
import { BackfillComposioInstagramHistoryWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619373-backfill-composio-instagram-history.command';
import { InvalidateComposioInstagramAuthoritiesWorkspaceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-workspace-command-1789307619370-invalidate-composio-instagram-authorities.command';
import { repairInstagramSecurityChecks } from 'src/database/commands/upgrade-version-command/2-20/utils/repair-instagram-security-checks.util';
import { RegisteredWorkspaceCommand } from 'src/engine/core-modules/upgrade/decorators/registered-workspace-command.decorator';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const PERMISSIONS = [
  ['SEND_INSTAGRAM_REPLY_TOOL', 'b955e9a9-2d3e-4001-a43d-cf6a9608c122'],
  ['SEND_INSTAGRAM_FIRST_MESSAGE_TOOL', '05f383be-dcf2-4510-8fb0-386705d90506'],
  ['RESOLVE_INSTAGRAM_SEND_OUTCOME', '7e3b0a66-3730-43e9-ab10-993e721b8403'],
] as const;

type InvalidationTarget = {
  bindingId: string;
  objectMetadataId: string | null;
  recordId: string | null;
};

@Injectable()
@RegisteredWorkspaceCommand('2.20.0', 1789313971534)
export class VerifyInstagramSecurityCutoverWorkspaceCommand extends ActiveOrSuspendedWorkspaceCommandRunner {
  constructor(
    workspaceIteratorService: WorkspaceIteratorService,
    @InjectDataSource() private readonly coreDataSource: DataSource,
    private readonly invalidator: InvalidateComposioInstagramAuthoritiesWorkspaceCommand,
    private readonly backfill: BackfillComposioInstagramHistoryWorkspaceCommand,
  ) {
    super(workspaceIteratorService);
  }

  // Only the normal upgrade runner may record this registered step. The release
  // sweep is the separate CLI, never the inherited partial-workspace shortcut.
  override async run(): Promise<void> {
    throw new Error(
      'Use upgrade or upgrade:2-20:repair-instagram-security-cutover',
    );
  }

  async preflight(args: RunOnWorkspaceArgs): Promise<void> {
    if (
      !args.workspaceId ||
      !args.dataSource ||
      args.dataSource === this.coreDataSource ||
      args.dataSource.coreDataSource !== this.coreDataSource
    ) {
      throw new Error(
        'Instagram cutover requires a workspace and its dedicated data source',
      );
    }
    const schema = getWorkspaceSchemaName(args.workspaceId);
    const workspaces = await this.coreDataSource.query(
      `SELECT w.id FROM core.workspace w
       JOIN pg_catalog.pg_namespace n ON n.nspname = w."databaseSchema"
       WHERE w.id = $1 AND w."databaseSchema" = $2 AND w."deletedAt" IS NULL`,
      [args.workspaceId, schema],
    );
    if (workspaces.length !== 1) {
      throw new Error(
        'Instagram cutover workspace/schema prerequisite missing',
      );
    }
    const applications = (await this.coreDataSource.query(
      `SELECT id, "universalIdentifier" FROM core.application
       WHERE "workspaceId" = $1 AND "deletedAt" IS NULL
       AND "universalIdentifier" = ANY($2::uuid[])`,
      [
        args.workspaceId,
        [
          '4738ebcd-6662-4ecc-a190-374fa0525951',
          '20202020-64aa-4b6f-b003-9c74b97cee20',
        ],
      ],
    )) as { id: string; universalIdentifier: string }[];
    const instagram = applications.filter(
      (app) =>
        app.universalIdentifier === '4738ebcd-6662-4ecc-a190-374fa0525951',
    );
    const standard = applications.filter(
      (app) =>
        app.universalIdentifier === '20202020-64aa-4b6f-b003-9c74b97cee20',
    );
    if (instagram.length !== 1 || standard.length !== 1) {
      throw new Error(
        'Instagram cutover application ownership prerequisite missing',
      );
    }
    const definitions = (await this.coreDataSource.query(
      `SELECT key, "universalIdentifier", "applicationId", "permissionType"
       FROM core."permissionFlag" WHERE "workspaceId" = $1
       AND (key = ANY($2::text[]) OR "universalIdentifier" = ANY($3::uuid[]))`,
      [
        args.workspaceId,
        PERMISSIONS.map(([key]) => key),
        PERMISSIONS.map(([, id]) => id),
      ],
    )) as {
      key: string;
      universalIdentifier: string;
      applicationId: string;
      permissionType: string;
    }[];
    if (
      definitions.length !== 3 ||
      PERMISSIONS.some(
        ([key, id]) =>
          definitions.filter(
            (definition) =>
              definition.key === key &&
              definition.universalIdentifier === id &&
              definition.applicationId === standard[0].id &&
              definition.permissionType === 'tool',
          ).length !== 1,
      )
    ) {
      throw new Error(
        'Instagram cutover permission definition ownership mismatch',
      );
    }
    await this.backfill.runOnWorkspace({
      ...args,
      options: { ...args.options, dryRun: true },
    });
    await this.preflightInvalidator();
  }

  private async preflightInvalidator(): Promise<void> {
    const columns = (await this.coreDataSource.query(
      `SELECT c.relname AS "tableName", a.attname AS name,
         pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
         a.attnotnull AS "notNull", pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS "defaultValue",
         ARRAY(SELECT e.enumlabel::text FROM pg_catalog.pg_enum e WHERE e.enumtypid = a.atttypid) AS labels
       FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
       LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
       WHERE n.nspname = 'core' AND c.relname = ANY($1::text[])
         AND c.relkind = 'r' AND NOT c.relispartition
         AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid = c.oid OR i.inhparent = c.oid)
         AND a.attnum > 0 AND NOT a.attisdropped`,
      [['actionApprovalBinding', 'actionApprovalBindingEvidenceLink']],
    )) as {
      tableName: string;
      name: string;
      type: string;
      notNull: boolean;
      defaultValue: string | null;
      labels: string[];
    }[];
    const required = [
      ['actionApprovalBinding', 'id', 'uuid', true],
      ['actionApprovalBinding', 'workspaceId', 'uuid', true],
      ['actionApprovalBinding', 'actionName', 'character varying', true],
      ['actionApprovalBinding', 'state', 'enum', true],
      ['actionApprovalBinding', 'decidedAt', 'timestamp with time zone', false],
      ['actionApprovalBinding', 'updatedAt', 'timestamp with time zone', true],
      ['actionApprovalBindingEvidenceLink', 'id', 'uuid', true],
      [
        'actionApprovalBindingEvidenceLink',
        'actionApprovalBindingId',
        'uuid',
        true,
      ],
      ['actionApprovalBindingEvidenceLink', 'objectMetadataId', 'uuid', true],
      ['actionApprovalBindingEvidenceLink', 'recordId', 'uuid', true],
      ['actionApprovalBindingEvidenceLink', 'role', 'character varying', true],
      [
        'actionApprovalBindingEvidenceLink',
        'createdAt',
        'timestamp with time zone',
        true,
      ],
    ] as const;
    for (const [table, name, type, notNull] of required) {
      const column = columns.find(
        (column) => column.tableName === table && column.name === name,
      );
      if (
        !column ||
        column.notNull !== notNull ||
        (type === 'enum'
          ? !['PENDING', 'APPROVED', 'EXPIRED'].every((label) =>
              column.labels.includes(label),
            )
          : column.type !== type)
      ) {
        throw new Error(
          'Instagram cutover invalidator column prerequisite mismatch',
        );
      }
      if (
        table === 'actionApprovalBindingEvidenceLink' &&
        ((name === 'id' &&
          ![
            'uuid_generate_v4()',
            'public.uuid_generate_v4()',
            'core.uuid_generate_v4()',
          ].includes(column.defaultValue ?? '')) ||
          (name === 'createdAt' && column.defaultValue !== 'now()'))
      ) {
        throw new Error(
          'Instagram cutover evidence default prerequisite mismatch',
        );
      }
    }
    const unique = await this.coreDataSource.query(
      `SELECT i.indexrelid FROM pg_catalog.pg_index i
       JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'core' AND c.relname = 'actionApprovalBindingEvidenceLink'
         AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
         AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts = 4
         AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(num, position)
           JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.num
           WHERE k.position <= i.indnkeyatts ORDER BY a.attname)
           = ARRAY['actionApprovalBindingId', 'objectMetadataId', 'recordId', 'role']::text[]`,
    );
    if (unique.length === 0) {
      throw new Error(
        'Instagram cutover evidence uniqueness prerequisite missing',
      );
    }
  }

  override async runOnWorkspace(args: RunOnWorkspaceArgs): Promise<void> {
    await this.preflight(args);
    const core = await repairInstagramSecurityChecks(this.coreDataSource, {
      dryRun: args.options.dryRun,
    });
    let targets: InvalidationTarget[] = [];
    if (!args.options.dryRun) {
      // Internal identity-only snapshot; historical EXPIRED bindings are not targets.
      targets = await this.coreDataSource.query(
        `SELECT b.id AS "bindingId", e."objectMetadataId", e."recordId"
         FROM core."actionApprovalBinding" b LEFT JOIN core."actionApprovalBindingEvidenceLink" e
           ON e."actionApprovalBindingId" = b.id AND e.role = 'draft'
         WHERE b."workspaceId" = $1 AND b."actionName" = 'send_instagram_reply'
           AND b.state IN ('PENDING', 'APPROVED')`,
        [args.workspaceId],
      );
      await this.invalidator.runOnWorkspace(args);
      await this.backfill.runOnWorkspace(args);
    }
    const remaining = await this.remainingWork(args);
    if (!args.options.dryRun) {
      const uncopied = await this.coreDataSource.query(
        `SELECT count(*)::text AS count FROM jsonb_to_recordset($1::jsonb)
           AS t("bindingId" uuid, "objectMetadataId" uuid, "recordId" uuid)
         WHERE NOT EXISTS (SELECT 1 FROM core."actionApprovalBinding" b
           WHERE b.id = t."bindingId" AND b."workspaceId" = $2
             AND b."actionName" = 'send_instagram_reply' AND b.state = 'EXPIRED')
         OR (t."objectMetadataId" IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM core."actionApprovalBindingEvidenceLink" e
           WHERE e."actionApprovalBindingId" = t."bindingId" AND e."objectMetadataId" = t."objectMetadataId"
             AND e."recordId" = t."recordId" AND e.role = 'PROVIDER_CUTOVER'))`,
        [JSON.stringify(targets), args.workspaceId],
      );
      if (remaining !== '0' || uncopied[0]?.count !== '0') {
        throw new Error(
          'Instagram cutover postconditions failed; partial changes may be committed, retry after prerequisite review',
        );
      }
    }
    this.logger.log(
      `Instagram cutover ${args.options.dryRun ? 'dry-run' : 'verified'}: remaining=${remaining}, coreProposed=${core.proposedRepairs}, coreRepaired=${core.completedRepairs}`,
    );
  }

  private async remainingWork(args: RunOnWorkspaceArgs): Promise<string> {
    const schema = getWorkspaceSchemaName(args.workspaceId);
    const rows = await args.dataSource!.query(
      `SELECT (
        (SELECT count(*) FROM core."actionApprovalBinding" WHERE "workspaceId" = $1
          AND "actionName" = 'send_instagram_reply' AND state IN ('PENDING', 'APPROVED')) +
        (SELECT count(*) FROM "${schema}"."_myahSocialMessage" m
          JOIN "${schema}"."_myahSocialConversation" c ON c.id = m."conversationId"
          WHERE m.provider IS DISTINCT FROM 'UNIPILE' AND c.provider IS DISTINCT FROM 'UNIPILE'
            AND m.provider IS DISTINCT FROM 'COMPOSIO_HISTORY') +
        (SELECT count(*) FROM "${schema}"."_myahSocialConversation" c
          WHERE c.provider IS DISTINCT FROM 'UNIPILE'
            AND (c.provider IS DISTINCT FROM 'COMPOSIO_HISTORY' OR c.lifecycle IS DISTINCT FROM 'HISTORICAL')) +
        (SELECT count(*) FROM "${schema}"."_myahInstagramReplyDraft" d
          JOIN "${schema}"."_myahSocialConversation" c ON c.id = d."conversationId"
          WHERE c.provider IS DISTINCT FROM 'UNIPILE' AND d."sentAt" IS NULL
            AND d.status IN ('NEEDS_REVIEW', 'APPROVED'))
        )::text AS count`,
      [args.workspaceId],
    );
    if (!/^\d+$/.test(rows[0]?.count ?? '')) {
      throw new Error('Instagram cutover postcondition count unavailable');
    }
    return rows[0].count;
  }
}
