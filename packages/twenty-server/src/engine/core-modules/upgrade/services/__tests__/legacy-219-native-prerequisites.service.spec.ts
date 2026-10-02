import { type QueryRunner } from 'typeorm';

import { ORIGINAL_ABSENT_POST_CATALOG } from 'src/engine/core-modules/upgrade/services/legacy-219-original-postcondition.catalog';
import { Legacy219NativePrerequisitesService } from 'src/engine/core-modules/upgrade/services/legacy-219-native-prerequisites.service';
import { type UpgradeWriteLockService } from 'src/engine/core-modules/upgrade/services/upgrade-write-lock.service';

const INITIAL =
  '2.19.0_BackfillSystemUniqueIndexUniversalIdentifierCommand_1783093620000';
// Fixed name-only historical inventory; no fixture hash or private receipt data.
const globalNames = [
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
const workspace = { id: 'workspace-a', activationStatus: 'ACTIVE' };
const receipt = (name: string, workspaceId: string | null = null) => ({
  name,
  workspaceId,
  status: 'completed',
  attempt: 1,
  isInitial: workspaceId !== null,
  createdAt: '2026-01-01T00:00:00Z',
});
const originalReceipts = () => [
  ...globalNames.map((name) => receipt(name)),
  receipt(INITIAL, workspace.id),
];

// Native 1783922687955 installation catalog, from the physical original projection.
const originalCatalog = {
  columns: [
    {
      table_name: 'myahWorkspaceInstallation',
      column_name: 'workspaceId',
      data_type: 'uuid',
      udt_name: 'uuid',
      character_maximum_length: null,
      is_nullable: 'NO',
      column_default: null,
    },
    {
      table_name: 'myahWorkspaceInstallation',
      column_name: 'id',
      data_type: 'uuid',
      udt_name: 'uuid',
      character_maximum_length: null,
      is_nullable: 'NO',
      column_default: 'uuid_generate_v4()',
    },
    {
      table_name: 'myahWorkspaceInstallation',
      column_name: 'customerAccountId',
      data_type: 'uuid',
      udt_name: 'uuid',
      character_maximum_length: null,
      is_nullable: 'NO',
      column_default: null,
    },
    {
      table_name: 'myahWorkspaceInstallation',
      column_name: 'createdAt',
      data_type: 'timestamp with time zone',
      udt_name: 'timestamptz',
      character_maximum_length: null,
      is_nullable: 'NO',
      column_default: 'now()',
    },
    {
      table_name: 'myahWorkspaceInstallation',
      column_name: 'updatedAt',
      data_type: 'timestamp with time zone',
      udt_name: 'timestamptz',
      character_maximum_length: null,
      is_nullable: 'NO',
      column_default: 'now()',
    },
  ],
  constraints: [
    {
      table_name: 'myahWorkspaceInstallation',
      name: 'FK_ba6cef6db9843fee885ae523b20',
      definition:
        'FOREIGN KEY ("workspaceId") REFERENCES core.workspace(id) ON DELETE CASCADE',
      validated: true,
    },
    {
      table_name: 'myahWorkspaceInstallation',
      name: 'FK_ffc7c3969dace403842f00c38ab',
      definition:
        'FOREIGN KEY ("customerAccountId") REFERENCES core."customerAccount"(id)',
      validated: true,
    },
    {
      table_name: 'myahWorkspaceInstallation',
      name: 'PK_9a296caaa5236bba54537955435',
      definition: 'PRIMARY KEY (id)',
      validated: true,
    },
  ],
  indexes: [
    {
      table_name: 'myahWorkspaceInstallation',
      index_name: 'IDX_MYAH_WORKSPACE_INSTALLATION_CUSTOMER_ACCOUNT_ID',
      definition:
        'CREATE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_CUSTOMER_ACCOUNT_ID" ON core."myahWorkspaceInstallation" USING btree ("customerAccountId")',
      valid: true,
      ready: true,
      unique_index: false,
      primary_index: false,
    },
    {
      table_name: 'myahWorkspaceInstallation',
      index_name: 'IDX_MYAH_WORKSPACE_INSTALLATION_WORKSPACE_ID_UNIQUE',
      definition:
        'CREATE UNIQUE INDEX "IDX_MYAH_WORKSPACE_INSTALLATION_WORKSPACE_ID_UNIQUE" ON core."myahWorkspaceInstallation" USING btree ("workspaceId")',
      valid: true,
      ready: true,
      unique_index: true,
      primary_index: false,
    },
    {
      table_name: 'myahWorkspaceInstallation',
      index_name: 'PK_9a296caaa5236bba54537955435',
      definition:
        'CREATE UNIQUE INDEX "PK_9a296caaa5236bba54537955435" ON core."myahWorkspaceInstallation" USING btree (id)',
      valid: true,
      ready: true,
      unique_index: true,
      primary_index: true,
    },
  ],
  enums: [],
};

// This is a bounded behavioral fake, not a physical PostgreSQL acceptance test.
const setup = (
  overrides: {
    workspaces?: Array<{ id: string; activationStatus: string }>;
    receipts?: ReturnType<typeof receipt>[];
    relations?: Array<{ name: string; kind: string }>;
    columns?: unknown[];
    constraints?: unknown[];
    indexes?: unknown[];
    enums?: unknown[];
    invalidRows?: Array<{ invalid: number }>;
    postCatalog?: typeof ORIGINAL_ABSENT_POST_CATALOG;
    postMutation?: {
      section: keyof typeof ORIGINAL_ABSENT_POST_CATALOG;
      row: number;
      patch: Record<string, unknown>;
    };
    postRows?: number;
    driftReceipt?: boolean;
    missingPostRelation?: boolean;
    installationRows?: number;
  } = {},
) => {
  let catalogReads = 0;
  let receiptSnapshotReads = 0;
  const query = jest.fn().mockImplementation(async (sql: string) => {
    if (
      sql.includes(
        'SELECT count(*)::int AS total FROM core."myahWorkspaceInstallation"',
      )
    )
      return [{ total: overrides.installationRows ?? 0 }];
    if (sql.includes('UNION ALL SELECT count(*)::int FROM core.'))
      return Array.from({ length: 7 }, (_, index) => ({
        total: index === 0 ? (overrides.postRows ?? 0) : 0,
      }));
    if (sql.includes('SELECT row_to_json(m)')) {
      receiptSnapshotReads++;
      return overrides.driftReceipt && receiptSnapshotReads > 1
        ? [{ row: { changed: true } }]
        : [];
    }
    if (sql.includes('SELECT row_to_json')) return [];
    if (sql.includes('to_regclass($1)')) return [{ exists: false }];
    if (sql.includes('to_regclass')) return [{ present: null }];
    if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
    if (sql.includes('SELECT id, "activationStatus"'))
      return overrides.workspaces ?? [workspace];
    if (sql.includes('FROM core."upgradeMigration"'))
      return overrides.receipts ?? originalReceipts();
    if (sql.includes('FROM pg_class c') && sql.includes('relkind'))
      return catalogReads > 0 && !overrides.relations
        ? [
            'actionApprovalBinding',
            'actionApprovalBindingEvidenceLink',
            'actionExecutionReceipt',
            'managedProviderFundingAction',
            'managedProviderOperation',
            'managedProviderPool',
            'myahWorkspaceInstallation',
          ]
            .filter(
              (name) =>
                !overrides.missingPostRelation ||
                name !== 'actionExecutionReceipt',
            )
            .map((name) => ({ name, kind: 'r' }))
        : (overrides.relations ?? [
            { name: 'myahWorkspaceInstallation', kind: 'r' },
          ]);
    if (sql.includes('information_schema.columns')) catalogReads++;
    const section = sql.includes('information_schema.columns')
      ? 'columns'
      : sql.includes('FROM pg_constraint')
        ? 'constraints'
        : sql.includes('FROM pg_index')
          ? 'indexes'
          : sql.includes('FROM pg_type')
            ? 'enums'
            : null;
    if (section && catalogReads > 1) {
      const rows = [
        ...(overrides.postCatalog?.[section] ??
          ORIGINAL_ABSENT_POST_CATALOG[section]),
      ];
      if (overrides.postMutation?.section === section)
        rows[overrides.postMutation.row] = {
          ...rows[overrides.postMutation.row],
          ...overrides.postMutation.patch,
        } as never;
      return rows;
    }
    if (sql.includes('information_schema.columns'))
      return overrides.columns ?? originalCatalog.columns;
    if (sql.includes('FROM pg_constraint'))
      return overrides.constraints ?? originalCatalog.constraints;
    if (sql.includes('FROM pg_index'))
      return overrides.indexes ?? originalCatalog.indexes;
    if (sql.includes('FROM pg_type'))
      return overrides.enums ?? originalCatalog.enums;
    if (sql.includes('invalid'))
      return overrides.invalidRows ?? [{ invalid: 0 }];
    return [];
  });
  const runner = {
    query,
    startTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    isTransactionActive: true,
  } as unknown as QueryRunner;
  const service = new Legacy219NativePrerequisitesService({
    currentRunner: () => runner,
  } as unknown as UpgradeWriteLockService);
  const rejectBeforeDDL = async (reason: RegExp) => {
    await expect(service.reconcile()).rejects.toThrow(reason);
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(
      query.mock.calls.some(([sql]) => /\b(ALTER|CREATE|DROP)\b/.test(sql)),
    ).toBe(false);
  };
  return { query, runner, service, rejectBeforeDDL };
};

describe('Legacy219NativePrerequisitesService (unwired, rollback-only)', () => {
  it('rejects non-active retained workspaces before billing DDL', async () => {
    await setup({
      workspaces: [{ id: 'workspace-a', activationStatus: 'ONGOING_CREATION' }],
    }).rejectBeforeDDL(/non-active retained workspace/);
  });

  it('rejects an unknown completed historical receipt before billing DDL', async () => {
    await setup({
      receipts: [
        ...originalReceipts(),
        receipt('2.19.0_UnknownFastInstanceCommand_1784000000000'),
      ],
    }).rejectBeforeDDL(/receipt|lineage|inventory/);
  });

  it('rejects orphan workspace receipts, including inactive workspace references', async () => {
    await setup({
      receipts: [
        ...globalNames.map((name) => receipt(name)),
        receipt(INITIAL, 'deleted-workspace'),
      ],
    }).rejectBeforeDDL(/receipt|lineage|inventory/);
  });

  it('rejects missing historical global attempts before billing DDL', async () => {
    await setup({ receipts: originalReceipts().slice(1) }).rejectBeforeDDL(
      /inventory/,
    );
  });

  it('rejects reordered completed global attempts before billing DDL', async () => {
    const receipts = originalReceipts();
    [receipts[0], receipts[1]] = [receipts[1], receipts[0]];
    await setup({ receipts }).rejectBeforeDDL(/inventory/);
  });

  it('rejects a retried historical attempt before billing DDL', async () => {
    await setup({
      receipts: originalReceipts().map((row, index) =>
        index === 0 ? { ...row, attempt: 2 } : row,
      ),
    }).rejectBeforeDDL(/inventory/);
  });

  it('rejects suspended or inactive workspace receipts missing their initial attempt', async () => {
    await setup({
      workspaces: [
        workspace,
        { id: 'workspace-b', activationStatus: 'SUSPENDED' },
      ],
    }).rejectBeforeDDL(/inventory|lineage/);
  });

  it('rejects a partial installation catalog before billing DDL', async () => {
    await setup({
      columns: [
        { table_name: 'myahWorkspaceInstallation', column_name: 'workspaceId' },
      ],
    }).rejectBeforeDDL(/catalog|column/);
  });

  it('admits the original native prefix through preflight, then still rolls back unconditionally', async () => {
    const { query, runner, service } = setup();
    await expect(service.reconcile()).rejects.toThrow(
      /postconditions observed; commit\/receipt forbidden/,
    );
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('information_schema.columns'),
      ),
    ).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('ALTER TABLE'))).toBe(
      true,
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['index readiness', 'indexes', 0, { ready: false }],
    ['enum order', 'enums', 0, { enumsortorder: 99 }],
    ['constraint validation', 'constraints', 0, { validated: false }],
    ['column nullability', 'columns', 0, { is_nullable: 'YES' }],
  ] as const)(
    'rejects post-DDL %s and rolls back',
    async (_label, section, row, patch) => {
      const { service, runner } = setup({
        postMutation: { section, row, patch },
      });
      await expect(service.reconcile()).rejects.toThrow(
        /postcondition.*mismatch/,
      );
      expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects rows inserted into newly created authority tables', async () => {
    const { service, runner } = setup({ postRows: 1 });
    await expect(service.reconcile()).rejects.toThrow(/postcondition.*rows/);
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing post-DDL authority table', async () => {
    const { service, runner } = setup({ missingPostRelation: true });
    await expect(service.reconcile()).rejects.toThrow(
      /postcondition relation mismatch/,
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects ledger row drift even with the exact catalog', async () => {
    const { service, runner } = setup({ driftReceipt: true });
    await expect(service.reconcile()).rejects.toThrow(
      /postcondition workspace\/ledger drift/,
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects populated installations before DDL', async () => {
    const { service, runner, query } = setup({ installationRows: 1 });
    await expect(service.reconcile()).rejects.toThrow(
      /populated original installation/,
    );
    expect(
      query.mock.calls.some(([sql]) => /\b(ALTER|CREATE|DROP)\b/.test(sql)),
    ).toBe(false);
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('observes exact canonical postconditions but never completes or commits', async () => {
    const { service, runner } = setup();
    await expect(service.reconcile()).rejects.toThrow(
      /postconditions observed; commit\/receipt forbidden/,
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect((runner as QueryRunner).commitTransaction).toBeUndefined();
  });

  it('accounts for a suspended workspace with its own initial attempt (mock-only)', async () => {
    const { service, runner } = setup({
      workspaces: [
        workspace,
        { id: 'workspace-b', activationStatus: 'SUSPENDED' },
      ],
      receipts: [...originalReceipts(), receipt(INITIAL, 'workspace-b')],
    });
    await expect(service.reconcile()).rejects.toThrow(
      /postconditions observed; commit\/receipt forbidden/,
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid original indexes before native billing DDL', async () => {
    await setup({
      indexes: originalCatalog.indexes.map((index, i) =>
        i === 1 ? { ...index, valid: false } : index,
      ),
    }).rejectBeforeDDL(/catalog/);
  });

  it('rejects legacy authority tables on the original prefix before billing DDL', async () => {
    await setup({
      relations: [
        { name: 'myahWorkspaceInstallation', kind: 'r' },
        { name: 'instagramReplyApprovalRequest', kind: 'r' },
      ],
    }).rejectBeforeDDL(/partial, mixed/);
  });

  it('rejects a changed installation default before native billing DDL', async () => {
    await setup({
      columns: originalCatalog.columns.map((column) =>
        column.column_name === 'id'
          ? { ...column, column_default: null }
          : column,
      ),
    }).rejectBeforeDDL(/catalog/);
  });

  it('rejects an unvalidated FK before native billing DDL', async () => {
    await setup({
      constraints: originalCatalog.constraints.map((constraint, i) =>
        i === 0 ? { ...constraint, validated: false } : constraint,
      ),
    }).rejectBeforeDDL(/catalog/);
  });

  it('rejects a leftover empty family enum before native billing DDL', async () => {
    await setup({
      enums: [
        {
          typname: 'actionApprovalBinding_state_enum',
          typtype: 'e',
          enumlabel: null,
          enumsortorder: null,
        },
      ],
    }).rejectBeforeDDL(/catalog/);
  });

  it('rejects installation orphan rows before native billing DDL', async () => {
    await setup({ invalidRows: [{ invalid: 1 }] }).rejectBeforeDDL(
      /row integrity/,
    );
  });

  it('rejects a failed167 cursor before billing DDL, even if legacy tables exist', async () => {
    await setup({
      receipts: [
        ...originalReceipts(),
        receipt(
          '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059',
        ),
      ],
      relations: [
        { name: 'myahWorkspaceInstallation', kind: 'r' },
        { name: 'instagramReplyApprovalRequest', kind: 'r' },
        { name: 'instagramReplyExecutionReceipt', kind: 'r' },
      ],
    }).rejectBeforeDDL(/failed167|legacy phase/);
  });
});
