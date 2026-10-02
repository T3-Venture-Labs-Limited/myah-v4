import { Injectable } from '@nestjs/common';
import { type QueryRunner } from 'typeorm';

import { CreateManagedProviderBillingFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963056-create-managed-provider-billing-foundation';
import { EvolveInstagramApprovalToActionAuthorityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963058-evolve-instagram-approval-to-action-authority';
import { CreateManagedProviderFundingActionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784266302003-create-managed-provider-funding-action';
import { CreateManagedProviderPoolFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784486000000-create-managed-provider-pool';
import { AddMetronomeAuditPropertiesFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784487000000-add-metronome-audit-properties';
import { RepairManagedProviderOperationRetentionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784488000000-repair-managed-provider-operation-retention';
import { AddActionApprovalContextFingerprintFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1785453079000-add-action-approval-context-fingerprint';
import { AddActionReceiptProviderIdentifiersFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1785453081000-add-action-receipt-provider-identifiers';
import { ORIGINAL_ABSENT_POST_CATALOG } from 'src/engine/core-modules/upgrade/services/legacy-219-original-postcondition.catalog';
import { UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';

const REBRAND =
  '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206';
const FINALIZE =
  '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059';
// Explicit native original-prefix global command inventory, extracted by name
// from the historical completed-Rebrand phase; no receipt IDs, timestamps,
// workspace identities or entire-ledger fixture hash are eligibility inputs.
// A different historical prefix needs independent admission, not interpolation.
const ORIGINAL_GLOBAL_ORDER = [
  '1.21.0_AddViewFieldGroupIdIndexOnViewFieldFastInstanceCommand_1775129420309',
  '1.21.0_MigrateMessagingCalendarToCoreFastInstanceCommand_1775165049548',
  '1.21.0_AddEmailThreadWidgetTypeFastInstanceCommand_1775200000000',
  '1.22.0_AddPermissionFlagRoleIdIndexFastInstanceCommand_1775749486425',
  '1.22.0_AddWorkspaceIdToIndirectEntitiesFastInstanceCommand_1775758621017',
  '1.22.0_AddWorkspaceIdIndexesAndFksFastInstanceCommand_1775761294897',
  '1.22.0_DropObjectMetadataDataSourceFkFastInstanceCommand_1775804361516',
  '1.22.0_AddCreditBalanceToBillingCustomerFastInstanceCommand_1776078919203',
  '1.22.0_BackfillWorkspaceIdOnIndirectEntitiesSlowInstanceCommand_1775758621018',
  '1.23.0_AddConditionalAvailabilityExpressionToPageLayoutWidgetFastInstanceCommand_1775654781000',
  '1.23.0_AddTableWidgetViewTypeFastInstanceCommand_1775752190522',
  '1.23.0_AddStandalonePageFastInstanceCommand_1775752781995',
  '1.23.0_AddGlobalObjectContextToCommandMenuItemAvailabilityTypeFastInstanceCommand_1776090711153',
  '1.23.0_AddPageLayoutIdToCommandMenuItemFastInstanceCommand_1776168404836',
  '1.23.0_DropWorkspaceVersionColumnFastInstanceCommand_1785000000000',
  '2.1.0_AddIsPreInstalledToApplicationRegistrationFastInstanceCommand_1776886452831',
  '2.1.0_AddProviderExecutedToAgentMessagePartFastInstanceCommand_1777012800000',
  '2.1.0_BackfillPageLayoutWidgetPositionSlowInstanceCommand_1795000002000',
  '2.2.0_AddCacheTokensToAgentChatThreadFastInstanceCommand_1777455269302',
  '2.2.0_AddLogoToApplicationFastInstanceCommand_1777539664664',
  '2.3.0_AddSubFieldNameToViewSortEarlyFastInstanceCommand_1747234200000',
  '2.3.0_AddRelationTargetFieldMetadataIdToViewFilterEarlyFastInstanceCommand_1747234300000',
  '2.3.0_AddUpgradeMigrationWorkspaceIdIndexFastInstanceCommand_1777308014234',
  '2.3.0_AddDeletedAtToAgentChatThreadFastInstanceCommand_1777682000000',
  '2.3.0_ConnectionProviderSyncableEntityFastInstanceCommand_1777896012579',
  '2.3.0_RemoveUserDefaultAvatarUrlFastInstanceCommand_1777915958318',
  '2.3.0_TransformApplicationVariableToSyncableEntityFastInstanceCommand_1777966965587',
  '2.3.0_AddToolAndWorkflowActionTriggerSettingsFastInstanceCommand_1797000001000',
  '2.3.0_BackfillApplicationVariableUniversalIdentifierSlowInstanceCommand_1777966965588',
  '2.3.0_MigrateToolTriggerSettingsSlowInstanceCommand_1797000002000',
  '2.4.0_AddRelationTargetFieldMetadataIdToViewFilterEarly2_4FastInstanceCommand_1747234400000',
  '2.4.0_AddMetadataToBillingPriceFastInstanceCommand_1777100000000',
  '2.4.0_AddEmailGroupChannelTypeFastInstanceCommand_1778256809018',
  '2.4.0_AddApplicationIdToPublicDomainFastInstanceCommand_1798000003000',
  '2.5.0_AddRelationTargetFieldMetadataIdToViewFilterEarly2_5FastInstanceCommand_1747234500000',
  '2.5.0_AddSubFieldNameToViewSortFastInstanceCommand_1778502963794',
  '2.5.0_AddIsInternalMessagesImportEnabledFastInstanceCommand_1778525104406',
  '2.5.0_CreateSigningKeyTableFastInstanceCommand_1778550000000',
  '2.5.0_DropPostgresCredentialsTableFastInstanceCommand_1798500000000',
  '2.5.0_EncryptConnectedAccountTokensSlowInstanceCommand_1798000004000',
  '2.5.0_EncryptApplicationVariableSlowInstanceCommand_1798000005000',
  '2.5.0_EncryptApplicationRegistrationVariableSlowInstanceCommand_1798000006000',
  '2.5.0_EncryptSigningKeyPrivateKeysSlowInstanceCommand_1798000007000',
  '2.5.0_EncryptSensitiveConfigStorageSlowInstanceCommand_1798000008000',
  '2.5.0_EncryptTotpSecretsSlowInstanceCommand_1798000009000',
  '2.6.0_RenamePermissionFlagToRolePermissionFlagFastInstanceCommand_1778235340020',
  '2.6.0_PermissionFlagSyncableEntityFastInstanceCommand_1778235340021',
  '2.6.0_LinkRolePermissionFlagToPermissionFlagFastInstanceCommand_1778235340022',
  '2.6.0_AddRelationTargetFieldMetadataIdToViewFilterFastInstanceCommand_1798000005000',
  '2.6.0_AddChannelSyncStageIndexesFastInstanceCommand_1798000010000',
  '2.6.0_BackfillRolePermissionFlagPermissionFlagIdSlowInstanceCommand_1778235340023',
  '2.7.0_FinalizeRolePermissionFlagCutoverFastInstanceCommand_1779600000000',
  '2.7.0_EncryptConnectionParametersSlowInstanceCommand_1798000010000',
  '2.8.0_AddSubFieldNameToIndexFieldMetadataFastInstanceCommand_1798200000000',
  '2.8.0_DropFieldMetadataIsUniqueColumnFastInstanceCommand_1798300000000',
  '2.9.0_EmailingDomainTenantStatusAndGlobalUniquenessFastInstanceCommand_1799000020000',
  '2.9.0_AddLogicFunctionExecutionModeFastInstanceCommand_1799000030000',
  '2.9.0_EncryptNonSecretApplicationVariableSlowInstanceCommand_1798400000000',
  '2.9.0_MigrateAiModelPreferencesSlowInstanceCommand_1799000010000',
  '2.11.0_DropEmailingDomainDriverColumnFastInstanceCommand_1780926908000',
  '2.12.0_DropIsCustomFromObjectAndFieldMetadataFastInstanceCommand_1780579070012',
  '2.12.0_ViewOverridableEntityFastInstanceCommand_1781114009075',
  '2.13.0_AddEmailingDomainUnsubscribeHostFastInstanceCommand_1780088214774',
  '2.13.0_AddArchivedAtToConnectedAccountFastInstanceCommand_1781171103000',
  '2.13.0_CreateMessageSuppressionCoreTableFastInstanceCommand_1781250000000',
  '2.13.0_CommandMenuItemOverridableEntityFastInstanceCommand_1781253016028',
  '2.13.0_CreateUnsubscribeTopicCoreTableFastInstanceCommand_1781260000000',
  '2.13.0_RenameIsUiReadOnlyToIsUiEditableFastInstanceCommand_1781277453604',
  '2.13.0_BackfillNonUiCreatableStandardSystemObjectsSlowInstanceCommand_1781277480000',
  '2.14.0_SetTableWidgetViewsVisibilityToWorkspaceSlowInstanceCommand_1781515653781',
  '2.15.0_AddHasPaymentMethodToBillingCustomerFastInstanceCommand_1781280240009',
  '2.15.0_AddIsSystemSideEffectFastInstanceCommand_1781600000000',
  '2.15.0_AddFolderImportToMessageFolderPendingSyncActionFastInstanceCommand_1781714499016',
  '2.15.0_AddViewKanbanColumnWidthFastInstanceCommand_1781900000000',
  '2.15.0_BackfillConnectionSecuritySlowInstanceCommand_1781461753981',
  '2.16.0_AddChannelWebhookSubscriptionFieldsFastInstanceCommand_1782152096938',
  '2.16.0_AddUniversalIdentifierAndApplicationIdToSearchFieldMetadataFastInstanceCommand_1782200000000',
  '2.16.0_AddServerTriggerSettingsToLogicFunctionFastInstanceCommand_1782211913427',
  '2.16.0_AddPrimaryPublicDomainToApplicationFastInstanceCommand_1782281874768',
  '2.16.0_MakePublicDomainApplicationIdNotNullSlowInstanceCommand_1782281874769',
  '2.17.0_CreateDpaAgreementCoreTableFastInstanceCommand_1801000020000',
  '2.17.0_CreateApplicationTranslationCoreTableFastInstanceCommand_1801000100000',
  '2.18.0_AddTsVectorFieldMetadataIdToSearchFieldMetadataFastInstanceCommand_1810000001000',
  '2.18.0_BackfillTsVectorFieldMetadataIdOnSearchFieldMetadataSlowInstanceCommand_1810000003000',
  '2.19.0_AddMetadataOverridesColumnFastInstanceCommand_1782986475000',
  '2.19.0_AddLastStreamErrorToAgentChatThreadFastInstanceCommand_1782996657000',
  '2.19.0_AddPendingQuestionMessageIdToAgentChatThreadFastInstanceCommand_1782999138000',
  '2.19.0_AddWorkspaceDiscoverabilityToWorkspaceFastInstanceCommand_1783004140000',
  '2.19.0_AddLogoFileIdToApplicationFastInstanceCommand_1783062755137',
  '2.19.0_AddTypeAndOptionsToApplicationVariablesFastInstanceCommand_1783065514000',
  '2.19.0_AddLogoToApplicationRegistrationFastInstanceCommand_1783069672191',
  '2.19.0_AddDisplayFieldsToApplicationRegistrationFastInstanceCommand_1783073776590',
  '2.19.0_AddStatusToFileFastInstanceCommand_1783082964705',
  '2.19.0_CreateCustomerAccountControlPlaneFastInstanceCommand_1783922687955',
  '2.19.0_BackfillMetadataOverridesSlowInstanceCommand_1782986476000',
  '2.19.0_BackfillLogoOnApplicationRegistrationSlowInstanceCommand_1783069673191',
  '2.19.0_BackfillDisplayFieldsOnApplicationRegistrationSlowInstanceCommand_1783073776591',
  '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206',
];
const ORIGINAL_GLOBAL_NAMES = new Set(ORIGINAL_GLOBAL_ORDER);
const ORIGINAL_INITIAL =
  '2.19.0_BackfillSystemUniqueIndexUniversalIdentifierCommand_1783093620000';
const LEGACY = [
  'instagramReplyApprovalRequest',
  'instagramReplyExecutionReceipt',
];
const GENERIC = [
  'actionApprovalBinding',
  'actionApprovalBindingEvidenceLink',
  'actionExecutionReceipt',
];
const BILLING = [
  'managedProviderOperation',
  'managedProviderFundingAction',
  'managedProviderPool',
];

type Receipt = {
  name: string;
  status: string;
  attempt: number;
  workspaceId: string | null;
  isInitial: boolean;
  createdAt: Date | string;
};
type Phase = 'absent';

const unsupported = (detail: string): never => {
  throw new Error(`Unsupported native 2.19 prerequisite phase: ${detail}`);
};

/**
 * Bounded composer for the original completed-Rebrand prefix. Deliberately NOT an
 * ordinary sequence command: only an ordered pre-cursor caller may schedule R.
 * This service is NOT registered in UpgradeModule and cannot emit an R receipt.
 * Even observed canonical postconditions always roll back.
 */
@Injectable()
export class Legacy219NativePrerequisitesService {
  constructor(private readonly lock: UpgradeWriteLockService) {}

  private async catalog(runner: QueryRunner, names: string[]) {
    const columns = await runner.query(
      `SELECT table_name,column_name,data_type,udt_name,character_maximum_length,is_nullable,column_default
       FROM information_schema.columns WHERE table_schema='core' AND table_name=ANY($1)
       ORDER BY table_name,ordinal_position`,
      [names],
    );
    const constraints = await runner.query(
      `SELECT c.relname table_name,con.conname name,pg_get_constraintdef(con.oid) definition,con.convalidated validated
       FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='core' AND c.relname=ANY($1) ORDER BY c.relname,con.conname`,
      [names],
    );
    const indexes = await runner.query(
      `SELECT c.relname table_name,i.relname index_name,pg_get_indexdef(i.oid) definition,
       x.indisvalid valid,x.indisready ready,x.indisunique unique_index,x.indisprimary primary_index
       FROM pg_index x JOIN pg_class c ON c.oid=x.indrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class i ON i.oid=x.indexrelid
       WHERE n.nspname='core' AND c.relname=ANY($1) ORDER BY c.relname,i.relname`,
      [names],
    );
    const enums = await runner.query(
      `SELECT t.typname,t.typtype,e.enumlabel,e.enumsortorder FROM pg_type t
       JOIN pg_namespace n ON n.oid=t.typnamespace
       LEFT JOIN pg_enum e ON e.enumtypid=t.oid
       WHERE n.nspname='core' AND (t.typname LIKE 'instagramReply%' OR t.typname LIKE 'action%' OR t.typname LIKE 'managedProvider%')
         AND right(t.typname,5)='_enum'
       ORDER BY t.typname,e.enumsortorder`,
    );
    return { columns, constraints, indexes, enums };
  }

  private async assertOriginalPostconditions(
    runner: QueryRunner,
    before: { workspaceRows: unknown[]; receiptRows: unknown[] },
  ) {
    const names = [...GENERIC, ...BILLING, 'myahWorkspaceInstallation'];
    const relations: { name: string; kind: string }[] = await runner.query(
      `SELECT c.relname AS name, c.relkind AS kind FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='core' AND c.relname=ANY($1) ORDER BY c.relname`,
      [[...LEGACY, ...names]],
    );
    if (
      JSON.stringify(relations) !==
      JSON.stringify([...names].sort().map((name) => ({ name, kind: 'r' })))
    )
      unsupported('postcondition relation mismatch');

    const catalog = await this.catalog(runner, [...LEGACY, ...names]);
    for (const section of [
      'columns',
      'constraints',
      'indexes',
      'enums',
    ] as const) {
      if (
        JSON.stringify(catalog[section]) !==
        JSON.stringify(ORIGINAL_ABSENT_POST_CATALOG[section])
      )
        unsupported(`postcondition ${section} mismatch`);
    }
    const rowCounts: { total: number }[] = await runner.query(
      `SELECT (SELECT count(*) FROM core."actionApprovalBinding")::int AS total
       UNION ALL SELECT count(*)::int FROM core."actionApprovalBindingEvidenceLink"
       UNION ALL SELECT count(*)::int FROM core."actionExecutionReceipt"
       UNION ALL SELECT count(*)::int FROM core."managedProviderOperation"
       UNION ALL SELECT count(*)::int FROM core."managedProviderFundingAction"
       UNION ALL SELECT count(*)::int FROM core."managedProviderPool"
       UNION ALL SELECT count(*)::int FROM core."myahWorkspaceInstallation"`,
    );
    if (
      rowCounts.length !== names.length ||
      rowCounts.some((row) => row.total !== 0)
    )
      unsupported('postcondition family rows changed');
    const after = await this.preservedRows(runner);
    if (
      JSON.stringify(after.workspaceRows) !==
        JSON.stringify(before.workspaceRows) ||
      JSON.stringify(after.receiptRows) !== JSON.stringify(before.receiptRows)
    )
      unsupported('postcondition workspace/ledger drift');
  }

  private async preservedRows(runner: QueryRunner) {
    const workspaceRows: { row: unknown }[] = await runner.query(
      'SELECT row_to_json(w) AS row FROM core.workspace w ORDER BY w.id',
    );
    const receiptRows: { row: unknown }[] = await runner.query(
      'SELECT row_to_json(m) AS row FROM core."upgradeMigration" m ORDER BY m."createdAt", m.id',
    );
    return { workspaceRows, receiptRows };
  }

  private async assertOriginalCatalog(runner: QueryRunner, names: string[]) {
    // Mirror the native 1783922687955 installation DDL, including defaults,
    // FK actions, index predicates/uniqueness and index/constraint validity.
    // Compare exact arrays rather than fragments: partial upgrades and extra
    // columns, constraints, indexes or family enums must fail before 154.
    const { columns, constraints, indexes, enums } = await this.catalog(
      runner,
      names,
    );
    const table = 'myahWorkspaceInstallation';
    const expectedColumns = [
      ['workspaceId', 'uuid', 'uuid', null, 'NO', null],
      ['id', 'uuid', 'uuid', null, 'NO', 'uuid_generate_v4()'],
      ['customerAccountId', 'uuid', 'uuid', null, 'NO', null],
      [
        'createdAt',
        'timestamp with time zone',
        'timestamptz',
        null,
        'NO',
        'now()',
      ],
      [
        'updatedAt',
        'timestamp with time zone',
        'timestamptz',
        null,
        'NO',
        'now()',
      ],
    ].map(
      ([
        column_name,
        data_type,
        udt_name,
        character_maximum_length,
        is_nullable,
        column_default,
      ]) => ({
        table_name: table,
        column_name,
        data_type,
        udt_name,
        character_maximum_length,
        is_nullable,
        column_default,
      }),
    );
    const expectedConstraints = [
      [
        'FK_ba6cef6db9843fee885ae523b20',
        'FOREIGN KEY ("workspaceId") REFERENCES core.workspace(id) ON DELETE CASCADE',
      ],
      [
        'FK_ffc7c3969dace403842f00c38ab',
        'FOREIGN KEY ("customerAccountId") REFERENCES core."customerAccount"(id)',
      ],
      ['PK_9a296caaa5236bba54537955435', 'PRIMARY KEY (id)'],
    ].map(([name, definition]) => ({
      table_name: table,
      name,
      definition,
      validated: true,
    }));
    const expectedIndexes = [
      [
        'IDX_MYAH_WORKSPACE_INSTALLATION_CUSTOMER_ACCOUNT_ID',
        'CREATE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_CUSTOMER_ACCOUNT_ID" ON core."myahWorkspaceInstallation" USING btree ("customerAccountId")',
        false,
        false,
      ],
      [
        'IDX_MYAH_WORKSPACE_INSTALLATION_WORKSPACE_ID_UNIQUE',
        'CREATE UNIQUE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_WORKSPACE_ID_UNIQUE" ON core."myahWorkspaceInstallation" USING btree ("workspaceId")',
        true,
        false,
      ],
      [
        'PK_9a296caaa5236bba54537955435',
        'CREATE UNIQUE INDEX "PK_9a296caaa5236bba54537955435" ON core."myahWorkspaceInstallation" USING btree (id)',
        true,
        true,
      ],
    ].map(([index_name, definition, unique_index, primary_index]) => ({
      table_name: table,
      index_name,
      definition,
      valid: true,
      ready: true,
      unique_index,
      primary_index,
    }));
    if (
      JSON.stringify(columns) !== JSON.stringify(expectedColumns) ||
      JSON.stringify(constraints) !== JSON.stringify(expectedConstraints) ||
      JSON.stringify(indexes) !== JSON.stringify(expectedIndexes) ||
      enums.length !== 0
    )
      unsupported('original installation catalog/enum mismatch');

    // The validated FKs and unique index are necessary but cannot replace
    // checking rows when triggers have previously been disabled or data drifted.
    const integrity: { invalid: number }[] = await runner.query(
      `SELECT count(*)::int AS invalid FROM core."myahWorkspaceInstallation" i
       LEFT JOIN core.workspace w ON w.id=i."workspaceId"
       LEFT JOIN core."customerAccount" a ON a.id=i."customerAccountId"
       WHERE w.id IS NULL OR a.id IS NULL`,
    );
    if (integrity.length !== 1 || integrity[0].invalid !== 0)
      unsupported('installation row integrity');
  }

  private async inspect(
    runner: QueryRunner,
  ): Promise<{ phase: Phase; workspaceIds: string[]; receipts: Receipt[] }> {
    const workspaces: { id: string; activationStatus: string }[] =
      await runner.query(
        'SELECT id, "activationStatus" FROM core.workspace ORDER BY id',
      );
    if (
      workspaces.some(
        (row) => !['ACTIVE', 'SUSPENDED'].includes(row.activationStatus),
      )
    )
      unsupported(
        'non-active retained workspace needs separate lineage review',
      );
    const workspaceIds = workspaces.map((row) => row.id);
    const receipts: Receipt[] = await runner.query(
      `SELECT name, status, attempt, "workspaceId", "isInitial", "createdAt"
       FROM core."upgradeMigration" ORDER BY "createdAt", id`,
    );
    const globals = receipts.filter((row) => row.workspaceId === null);
    if (globals.some((row) => row.name === FINALIZE))
      unsupported(
        'failed167 legacy phase requires separate physical admission',
      );
    // Check the entire inventory, including failed/retried/unknown and stale
    // workspace attempts, not just the current cursor for active workspaces.
    if (
      globals.length !== ORIGINAL_GLOBAL_NAMES.size ||
      new Set(globals.map((row) => row.name)).size !== globals.length ||
      globals.some(
        (row, index) =>
          row.name !== ORIGINAL_GLOBAL_ORDER[index] ||
          row.status !== 'completed' ||
          row.attempt !== 1 ||
          row.isInitial !== false,
      ) ||
      globals[globals.length - 1]?.name !== REBRAND ||
      receipts.length !== globals.length + workspaceIds.length
    )
      unsupported('original global receipt inventory or cursor');
    for (const id of workspaceIds) {
      const scoped = receipts.filter((row) => row.workspaceId === id);
      if (
        scoped.length !== 1 ||
        scoped[0].name !== ORIGINAL_INITIAL ||
        scoped[0].status !== 'completed' ||
        scoped[0].attempt !== 1 ||
        scoped[0].isInitial !== true
      )
        unsupported('workspace receipt lineage');
    }

    const names = [
      ...LEGACY,
      ...GENERIC,
      ...BILLING,
      'myahWorkspaceInstallation',
    ];
    const relations: { name: string; kind: string }[] = await runner.query(
      `SELECT c.relname AS name, c.relkind AS kind FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='core' AND c.relname=ANY($1)`,
      [names],
    );
    if (relations.some((row) => row.kind !== 'r'))
      unsupported('unexpected relation kind');
    const present = new Set(relations.map((row) => row.name));
    const phase: Phase = 'absent';
    if (
      !present.has('myahWorkspaceInstallation') ||
      BILLING.some((name) => present.has(name)) ||
      GENERIC.some((name) => present.has(name)) ||
      LEGACY.some((name) => present.has(name))
    )
      unsupported(
        'partial, mixed, or already-evolved authority/billing family',
      );
    await this.assertOriginalCatalog(runner, names);
    return { phase, workspaceIds, receipts };
  }

  async reconcile(): Promise<void> {
    const runner = this.lock.currentRunner();
    // Important: no eligibility read outside the lock or before table locks.
    await runner.startTransaction();
    try {
      await runner.query(
        'LOCK TABLE core.workspace, core."upgradeMigration" IN SHARE ROW EXCLUSIVE MODE',
      );
      await runner.query(
        'LOCK TABLE core."myahWorkspaceInstallation" IN ACCESS EXCLUSIVE MODE',
      );
      // Lock only existing authority tables; the absent case cannot lock what
      // does not yet exist. The session advisory lock serializes upgrade DDL.
      const legacyPresent: { present: string | null }[] = await runner.query(
        `SELECT to_regclass('core."instagramReplyApprovalRequest"')::text AS present`,
      );
      if (legacyPresent[0]?.present) {
        await runner.query(
          'LOCK TABLE core."instagramReplyApprovalRequest", core."instagramReplyExecutionReceipt" IN ACCESS EXCLUSIVE MODE',
        );
      }
      await this.inspect(runner);
      // Unknown populated installation states need an independent preservation
      // proof; the original-absent empty state is the only admitted data phase.
      const installation: { total: number }[] = await runner.query(
        'SELECT count(*)::int AS total FROM core."myahWorkspaceInstallation"',
      );
      if (installation.length !== 1 || installation[0].total !== 0)
        unsupported('populated original installation requires separate proof');
      const before = await this.preservedRows(runner);
      await new CreateManagedProviderBillingFoundationFastInstanceCommand().up(
        runner,
      );
      await new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand().up(
        runner,
      );
      await new CreateManagedProviderFundingActionFastInstanceCommand().up(
        runner,
      );
      await new CreateManagedProviderPoolFastInstanceCommand().up(runner);
      await new AddMetronomeAuditPropertiesFastInstanceCommand().up(runner);
      await new RepairManagedProviderOperationRetentionFastInstanceCommand().up(
        runner,
      );
      await new AddActionApprovalContextFingerprintFastInstanceCommand().up(
        runner,
      );
      await new AddActionReceiptProviderIdentifiersFastInstanceCommand().up(
        runner,
      );

      await this.assertOriginalPostconditions(runner, before);
      // R remains unwired: observation is not authority to persist or receipt.
      unsupported('postconditions observed; commit/receipt forbidden');
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      // This unwired composer records no attempt while its postcondition proof
      // is incomplete. A future scheduled emitter must record failed R only
      // after authoritative phase admission and a verified workspace set.
      throw error;
    }
  }
}
