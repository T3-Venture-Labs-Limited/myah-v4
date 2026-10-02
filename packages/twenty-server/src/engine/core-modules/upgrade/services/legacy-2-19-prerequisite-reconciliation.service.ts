import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type QueryRunner } from 'typeorm';

import { CreateManagedProviderBillingFoundationFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963056-create-managed-provider-billing-foundation';
import { EvolveInstagramApprovalToActionAuthorityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963058-evolve-instagram-approval-to-action-authority';
import { CreateManagedProviderFundingActionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784266302003-create-managed-provider-funding-action';
import { CreateManagedProviderPoolFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784486000000-create-managed-provider-pool';
import { AddMetronomeAuditPropertiesFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784487000000-add-metronome-audit-properties';
import { RepairManagedProviderOperationRetentionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784488000000-repair-managed-provider-operation-retention';
import { AddActionApprovalContextFingerprintFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1785453079000-add-action-approval-context-fingerprint';
import { AddActionReceiptProviderIdentifiersFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1785453081000-add-action-receipt-provider-identifiers';
import { LEGACY_2_19_PREREQUISITE_RECONCILIATION_NAME as RECEIPT_NAME } from 'src/engine/core-modules/upgrade/constants/legacy-2-19-prerequisite-reconciliation-name.constant';
import { type FastInstanceCommand } from 'src/engine/core-modules/upgrade/interfaces/fast-instance-command.interface';
import { InstanceCommandRunnerService } from 'src/engine/core-modules/upgrade/services/instance-command-runner.service';
import {
  UpgradeMigrationService,
  type WorkspaceLastAttemptedCommand,
} from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { type UpgradeStep } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';

const REBRAND =
  '2.19.0_RebrandEmailSenderToMyahSlowInstanceCommand_1784005792206';
const BINDING_166 =
  '2.19.0_AddInstagramReplyApprovalProviderBindingSlowInstanceCommand_1784106536001';
const FINALIZE_167 =
  '2.19.0_FinalizeInstagramApprovalActionAuthoritySlowInstanceCommand_1784112963059';
const INITIAL_WORKSPACE =
  '2.19.0_BackfillSystemUniqueIndexUniversalIdentifierCommand_1783093620000';
const AUTHORITY = [
  'instagramReplyApprovalRequest',
  'instagramReplyExecutionReceipt',
  'actionApprovalBinding',
  'actionApprovalBindingEvidenceLink',
  'actionExecutionReceipt',
] as const;
const BILLING = [
  'myahWorkspaceInstallation',
  'managedProviderOperation',
  'managedProviderFundingAction',
  'managedProviderPool',
] as const;

// This service is deliberately limited to the two inventoried physical prefixes.
// A populated pre-existing billing foundation requires a separate shape/data audit.
type AuthorityState = 'absent' | 'legacy' | 'generic';
type Catalog = {
  tables: Set<string>;
  columns: Map<string, Map<string, string>>;
  enums: Map<string, string[]>;
  constraints: Map<string, Map<string, string>>;
  indexes: Map<string, Map<string, string>>;
};

const reject = (reason: string): never => {
  throw new Error(`Unsupported authentic 2.19 prerequisite state: ${reason}`);
};

const expectedColumns = (
  catalog: Catalog,
  table: string,
  entries: string[],
) => {
  const actual = catalog.columns.get(table);
  if (!actual || actual.size !== entries.length)
    return reject(`${table} column count`);
  for (const entry of entries) {
    const [name, type, nullable] = entry.split(':');
    if (actual.get(name) !== `${type}:${nullable}`)
      reject(`${table}.${name} type/nullability`);
  }
};
const expectedEnum = (catalog: Catalog, name: string, labels: string[]) => {
  if (catalog.enums.get(name)?.join(',') !== labels.join(','))
    reject(`${name} enum labels`);
};
const expectedDefinition = (
  catalog: Catalog,
  table: string,
  kind: 'constraints' | 'indexes',
  name: string,
  fragments: string[],
) => {
  const actual = catalog[kind].get(table)?.get(name);
  if (!actual || fragments.some((part) => !actual.includes(part)))
    reject(`${table}.${name} ${kind}`);
};

const legacyBinding = [
  'workspaceId:uuid:NO',
  'id:uuid:NO',
  'userWorkspaceId:uuid:NO',
  'threadId:uuid:NO',
  'approvalId:uuid:NO',
  'toolName:character varying:NO',
  'connectedAccountId:character varying:NO',
  'draftId:uuid:NO',
  'conversationId:uuid:NO',
  'previewTextSha256:character varying:NO',
  'state:instagramReplyApprovalRequest_state_enum:NO',
  'expiresAt:timestamp with time zone:NO',
  'decidedAt:timestamp with time zone:YES',
  'createdAt:timestamp with time zone:NO',
  'updatedAt:timestamp with time zone:NO',
  'providerConversationId:text:YES',
  'recipientIgsid:text:YES',
];
const legacyReceipt = [
  'id:uuid:NO',
  'approvalRequestId:uuid:NO',
  'state:instagramReplyExecutionReceipt_state_enum:NO',
  'providerMessageId:text:YES',
  'failureCode:text:YES',
  'failureReason:text:YES',
  'createdAt:timestamp with time zone:NO',
  'updatedAt:timestamp with time zone:NO',
];
const installationBase = [
  'workspaceId:uuid:NO',
  'id:uuid:NO',
  'customerAccountId:uuid:NO',
  'createdAt:timestamp with time zone:NO',
  'updatedAt:timestamp with time zone:NO',
];

const assertLegacy = (catalog: Catalog) => {
  expectedColumns(catalog, AUTHORITY[0], legacyBinding);
  expectedColumns(catalog, AUTHORITY[1], legacyReceipt);
  expectedEnum(catalog, 'instagramReplyApprovalRequest_state_enum', [
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CHANGES_REQUESTED',
  ]);
  expectedEnum(catalog, 'instagramReplyExecutionReceipt_state_enum', [
    'PROCESSING',
    'SENT',
    'FAILED',
    'BLOCKED',
    'UNKNOWN',
  ]);
  expectedDefinition(
    catalog,
    AUTHORITY[0],
    'constraints',
    'PK_0570e6a0a7170ee067a969dcf27',
    ['PRIMARY KEY (id)'],
  );
  expectedDefinition(
    catalog,
    AUTHORITY[0],
    'constraints',
    'IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID',
    ['UNIQUE ("workspaceId", "approvalId")'],
  );
  expectedDefinition(
    catalog,
    AUTHORITY[0],
    'constraints',
    'FK_617792f9cfed9d503e2333b2a83',
    ['FOREIGN KEY ("workspaceId")', 'ON DELETE CASCADE'],
  );
  expectedDefinition(
    catalog,
    AUTHORITY[1],
    'constraints',
    'PK_1ecd8d74d2ebde2854db62b469e',
    ['PRIMARY KEY (id)'],
  );
  expectedDefinition(
    catalog,
    AUTHORITY[1],
    'constraints',
    'IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST',
    ['UNIQUE ("approvalRequestId")'],
  );
  if (
    catalog.constraints
      .get(AUTHORITY[1])
      ?.has('FK_INSTAGRAM_REPLY_RECEIPT_APPROVAL_REQUEST')
  )
    reject('legacy receipt FK was not repaired');
  expectedDefinition(
    catalog,
    AUTHORITY[0],
    'indexes',
    'IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_THREAD',
    ['("workspaceId", "threadId")'],
  );
  expectedDefinition(
    catalog,
    AUTHORITY[1],
    'indexes',
    'IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_STATE',
    ['(state)'],
  );
};

const assertInstallation = (catalog: Catalog, completed: boolean) => {
  expectedColumns(
    catalog,
    BILLING[0],
    completed
      ? [...installationBase, 'metronomeCustomerId:uuid:YES']
      : installationBase,
  );
  expectedDefinition(
    catalog,
    BILLING[0],
    'constraints',
    'PK_9a296caaa5236bba54537955435',
    ['PRIMARY KEY (id)'],
  );
  expectedDefinition(
    catalog,
    BILLING[0],
    'indexes',
    'IDX_MYAH_WORKSPACE_INSTALLATION_WORKSPACE_ID_UNIQUE',
    ['UNIQUE', '("workspaceId")'],
  );
  expectedDefinition(
    catalog,
    BILLING[0],
    'indexes',
    'IDX_MYAH_WORKSPACE_INSTALLATION_CUSTOMER_ACCOUNT_ID',
    ['("customerAccountId")'],
  );
  if (completed) {
    expectedDefinition(
      catalog,
      BILLING[0],
      'indexes',
      'IDX_MYAH_WORKSPACE_INSTALLATION_METRONOME_CUSTOMER_ID_UNIQUE',
      ['UNIQUE', '("metronomeCustomerId")', 'WHERE', 'IS NOT NULL'],
    );
  } else if (
    catalog.indexes
      .get(BILLING[0])
      ?.has('IDX_MYAH_WORKSPACE_INSTALLATION_METRONOME_CUSTOMER_ID_UNIQUE')
  ) {
    reject('installation already has billing index');
  }
};

const assertAuthorityPostcondition = (
  catalog: Catalog,
  legacyOrigin: boolean,
) => {
  const binding = AUTHORITY[2],
    evidence = AUTHORITY[3],
    receipt = AUTHORITY[4];
  expectedEnum(catalog, 'actionApprovalBinding_state_enum', [
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CHANGES_REQUESTED',
    'EXPIRED',
    'CONSUMED',
  ]);
  expectedEnum(catalog, 'actionExecutionReceipt_state_enum', [
    'PROCESSING',
    'PROVIDER_ACCEPTED',
    'SENT',
    'BLOCKED',
    'FAILED',
    'UNKNOWN',
  ]);
  const genericBinding = [
    'workspaceId:uuid:NO',
    'id:uuid:NO',
    'initiatorUserWorkspaceId:uuid:NO',
    'actionName:character varying:NO',
    `actionVersion:integer:${legacyOrigin ? 'YES' : 'NO'}`,
    'draftId:uuid:NO',
    'contentDigest:character varying:NO',
    'inboundMessageId:text:YES',
    'inboundSenderIgsid:text:YES',
    'inboundDirection:text:YES',
    'inboundReceivedAt:timestamp with time zone:YES',
    'recipientFingerprint:character varying:YES',
    'sendingAccountFingerprint:character varying:YES',
    'threadId:uuid:NO',
    'state:actionApprovalBinding_state_enum:NO',
    'expiresAt:timestamp with time zone:NO',
    'decidedAt:timestamp with time zone:YES',
    'createdAt:timestamp with time zone:NO',
    'updatedAt:timestamp with time zone:NO',
    'actionContextFingerprint:character varying:YES',
  ];
  const legacyExtra = [
    'approvalId:uuid:NO',
    'connectedAccountId:character varying:NO',
    'conversationId:uuid:NO',
    'providerConversationId:text:YES',
    'recipientIgsid:text:YES',
  ];
  expectedColumns(
    catalog,
    binding,
    legacyOrigin ? [...genericBinding, ...legacyExtra] : genericBinding,
  );
  expectedColumns(catalog, evidence, [
    'id:uuid:NO',
    'actionApprovalBindingId:uuid:NO',
    'objectMetadataId:uuid:NO',
    'recordId:uuid:NO',
    'role:character varying:NO',
    'createdAt:timestamp with time zone:NO',
  ]);
  expectedColumns(catalog, receipt, [
    'id:uuid:NO',
    `workspaceId:uuid:${legacyOrigin ? 'YES' : 'NO'}`,
    'actionApprovalBindingId:uuid:NO',
    `idempotencyKey:character varying:${legacyOrigin ? 'YES' : 'NO'}`,
    'state:actionExecutionReceipt_state_enum:NO',
    'providerMessageId:text:YES',
    'providerCode:text:YES',
    'redactedOutcome:character varying:YES',
    'createdAt:timestamp with time zone:NO',
    'updatedAt:timestamp with time zone:NO',
    'providerExternalMessageId:text:YES',
    'providerThreadExternalId:text:YES',
    ...(legacyOrigin ? ['failureReason:text:YES'] : []),
  ]);
  expectedDefinition(
    catalog,
    evidence,
    'constraints',
    'UQ_ACTION_APPROVAL_BINDING_EVIDENCE_LINK',
    [
      'UNIQUE ("actionApprovalBindingId", "objectMetadataId", "recordId", role)',
    ],
  );
  expectedDefinition(
    catalog,
    evidence,
    'constraints',
    'FK_ACTION_APPROVAL_BINDING_EVIDENCE_LINK_BINDING',
    ['FOREIGN KEY ("actionApprovalBindingId")', 'ON DELETE CASCADE'],
  );
  expectedDefinition(
    catalog,
    receipt,
    'constraints',
    'UQ_ACTION_EXECUTION_RECEIPT_WORKSPACE_IDEMPOTENCY',
    ['UNIQUE ("workspaceId", "idempotencyKey")'],
  );
  if (legacyOrigin) {
    expectedDefinition(
      catalog,
      binding,
      'constraints',
      'IDX_INSTAGRAM_REPLY_APPROVAL_REQUEST_WORKSPACE_APPROVAL_ID',
      ['UNIQUE ("workspaceId", "approvalId")'],
    );
    expectedDefinition(
      catalog,
      receipt,
      'constraints',
      'IDX_INSTAGRAM_REPLY_EXECUTION_RECEIPT_APPROVAL_REQUEST',
      ['UNIQUE ("actionApprovalBindingId")'],
    );
  } else {
    expectedDefinition(
      catalog,
      binding,
      'constraints',
      'PK_ACTION_APPROVAL_BINDING',
      ['PRIMARY KEY (id)'],
    );
    expectedDefinition(
      catalog,
      binding,
      'constraints',
      'FK_ACTION_APPROVAL_BINDING_WORKSPACE',
      ['FOREIGN KEY ("workspaceId")', 'ON DELETE CASCADE'],
    );
    expectedDefinition(
      catalog,
      binding,
      'constraints',
      'CHK_ACTION_APPROVAL_BINDING_INBOUND_DIRECTION',
      ['CHECK', 'inboundDirection'],
    );
    expectedDefinition(
      catalog,
      receipt,
      'constraints',
      'UQ_ACTION_EXECUTION_RECEIPT_BINDING',
      ['UNIQUE ("actionApprovalBindingId")'],
    );
    expectedDefinition(
      catalog,
      receipt,
      'constraints',
      'FK_ACTION_EXECUTION_RECEIPT_BINDING',
      ['FOREIGN KEY ("actionApprovalBindingId")', 'ON DELETE RESTRICT'],
    );
    expectedDefinition(
      catalog,
      receipt,
      'constraints',
      'FK_ACTION_EXECUTION_RECEIPT_WORKSPACE',
      ['FOREIGN KEY ("workspaceId")', 'ON DELETE CASCADE'],
    );
    expectedDefinition(
      catalog,
      binding,
      'indexes',
      'IDX_ACTION_APPROVAL_BINDING_WORKSPACE_THREAD',
      ['("workspaceId", "threadId")'],
    );
    expectedDefinition(
      catalog,
      receipt,
      'indexes',
      'IDX_ACTION_EXECUTION_RECEIPT_STATE',
      ['(state)'],
    );
  }
};

const assertBillingPostcondition = (catalog: Catalog) => {
  assertInstallation(catalog, true);
  const operation = BILLING[1],
    funding = BILLING[2],
    pool = BILLING[3];
  expectedColumns(catalog, operation, [
    'workspaceId:uuid:NO',
    'id:uuid:NO',
    'actorUserWorkspaceId:uuid:YES',
    'requestId:text:NO',
    'providerKey:text:NO',
    'providerConfigurationKey:text:NO',
    'operationKey:text:NO',
    'metronomeEventType:text:NO',
    'maximumUsageProperties:jsonb:NO',
    'actualUsageProperties:jsonb:YES',
    'reservedAmountCents:bigint:NO',
    'quotedActualAmountCents:bigint:YES',
    'providerExecutionId:text:YES',
    'providerCostMicrousd:bigint:YES',
    'state:text:NO',
    'deliveryAttemptCount:integer:NO',
    'settlementAttemptCount:integer:NO',
    'nextDeliveryAttemptAt:timestamp with time zone:YES',
    'settleAfter:timestamp with time zone:YES',
    'lastDeliveryErrorCode:text:YES',
    'createdAt:timestamp with time zone:NO',
    'updatedAt:timestamp with time zone:NO',
    'completedAt:timestamp with time zone:YES',
    'metronomeAcceptedAt:timestamp with time zone:YES',
    'settledAt:timestamp with time zone:YES',
    'releasedAt:timestamp with time zone:YES',
    'maximumMetronomeProperties:jsonb:NO',
    'actualMetronomeProperties:jsonb:YES',
    'expectedProductIds:jsonb:NO',
    'expectedBillableMetricIds:jsonb:NO',
    'completionOutcome:text:YES',
    'deliveryEventAt:timestamp with time zone:YES',
  ]);
  expectedColumns(catalog, funding, [
    'id:uuid:NO',
    'workspaceId:uuid:YES',
    'fundingType:text:NO',
    'actionType:text:NO',
    'operatorIdentity:text:NO',
    'permissionUsed:text:NO',
    'idempotencyKey:text:NO',
    'externalReference:text:NO',
    'metronomeUniquenessKey:text:NO',
    'amountCents:bigint:NO',
    'currency:text:NO',
    'reason:text:NO',
    'expiresAt:timestamp with time zone:YES',
    'applicability:jsonb:YES',
    'paymentEvidence:jsonb:YES',
    'correctedOperationId:uuid:YES',
    'correctionOfActionId:uuid:YES',
    'state:text:NO',
    'metronomeEditId:text:YES',
    'creditId:text:YES',
    'commitmentId:text:YES',
    'externalResourceId:text:YES',
    'safeErrorCode:text:YES',
    'failureCode:text:YES',
    'createdAt:timestamp with time zone:NO',
    'updatedAt:timestamp with time zone:NO',
    'applicableProductIds:jsonb:YES',
    'creditProductId:text:YES',
  ]);
  expectedColumns(catalog, pool, [
    'providerKey:text:NO',
    'state:text:NO',
    'activeTariffVersion:text:YES',
    'activeConfigurationDigest:text:YES',
    'appliedDesiredStateEpoch:bigint:NO',
    'appliedDesiredStateDigest:text:YES',
    'rowVersion:integer:NO',
    'createdAt:timestamp with time zone:NO',
    'updatedAt:timestamp with time zone:NO',
  ]);
  for (const [table, names] of [
    [
      operation,
      [
        'PK_MANAGED_PROVIDER_OPERATION',
        'UQ_MANAGED_PROVIDER_OPERATION_WORKSPACE_REQUEST',
        'CHK_MANAGED_PROVIDER_OPERATION_RESERVED_AMOUNT_NON_NEGATIVE',
        'CHK_MANAGED_PROVIDER_OPERATION_QUOTED_AMOUNT_NON_NEGATIVE',
        'CHK_MANAGED_PROVIDER_OPERATION_PROVIDER_COST_NON_NEGATIVE',
        'CHK_MANAGED_PROVIDER_OPERATION_STATE',
        'CHK_MANAGED_PROVIDER_OPERATION_STATE_FIELDS',
      ],
    ],
    [
      funding,
      [
        'PK_MANAGED_PROVIDER_FUNDING_ACTION',
        'UQ_MANAGED_PROVIDER_FUNDING_ACTION_IDEMPOTENCY',
        'UQ_MANAGED_PROVIDER_FUNDING_ACTION_EXTERNAL_REFERENCE',
        'UQ_MANAGED_PROVIDER_FUNDING_ACTION_METRONOME_KEY',
        'CHK_MANAGED_PROVIDER_FUNDING_ACTION_AMOUNT_POSITIVE',
        'CHK_MANAGED_PROVIDER_FUNDING_ACTION_STATE',
        'FK_MANAGED_PROVIDER_FUNDING_ACTION_WORKSPACE',
      ],
    ],
  ] as [string, string[]][]) {
    for (const name of names)
      expectedDefinition(catalog, table, 'constraints', name, [
        name.startsWith('CHK_')
          ? 'CHECK'
          : name.startsWith('FK_')
            ? 'FOREIGN KEY'
            : name.startsWith('PK_')
              ? 'PRIMARY KEY'
              : 'UNIQUE',
      ]);
  }
  expectedDefinition(
    catalog,
    funding,
    'constraints',
    'FK_MANAGED_PROVIDER_FUNDING_ACTION_WORKSPACE',
    ['("workspaceId")', 'ON DELETE SET NULL'],
  );
  expectedDefinition(catalog, pool, 'constraints', 'managedProviderPool_pkey', [
    'PRIMARY KEY ("providerKey")',
  ]);
  if (
    catalog.constraints
      .get(operation)
      ?.has('FK_MANAGED_PROVIDER_OPERATION_WORKSPACE')
  )
    reject('operation retention FK');
  for (const [table, index, fragments] of [
    [
      operation,
      'IDX_MANAGED_PROVIDER_OPERATION_PROVIDER_EXECUTION_UNIQUE',
      [
        'UNIQUE',
        '"providerKey", "providerConfigurationKey", "providerExecutionId"',
        'WHERE',
        'IS NOT NULL',
      ],
    ],
    [
      operation,
      'IDX_MANAGED_PROVIDER_OPERATION_DELIVERY_DUE',
      ['("nextDeliveryAttemptAt")', 'WHERE', 'USAGE_PENDING'],
    ],
    [
      operation,
      'IDX_MANAGED_PROVIDER_OPERATION_STALE_RESERVATION',
      ['("createdAt")', 'WHERE', 'RECONCILIATION_REQUIRED'],
    ],
    [
      funding,
      'IDX_MANAGED_PROVIDER_FUNDING_ACTION_PENDING',
      ['("state", "createdAt")', 'WHERE', 'RECONCILIATION_REQUIRED'],
    ],
  ] as [string, string, string[]][])
    expectedDefinition(catalog, table, 'indexes', index, fragments);
};

const catalogQuery = async (queryRunner: QueryRunner): Promise<Catalog> => {
  const names = [...AUTHORITY, ...BILLING];
  const tables = new Set<string>();
  const columns = new Map<string, Map<string, string>>();
  const enums = new Map<string, string[]>();
  const constraints = new Map<string, Map<string, string>>();
  const indexes = new Map<string, Map<string, string>>();
  const relations: { name: string; kind: string }[] = await queryRunner.query(
    `SELECT c.relname AS name, c.relkind AS kind FROM pg_class c
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='core' AND c.relname = ANY($1)`,
    [names],
  );
  for (const row of relations) {
    if (row.kind !== 'r') reject(`${row.name} is not an ordinary table`);
    tables.add(row.name);
  }
  const fields: {
    table: string;
    name: string;
    type: string;
    nullable: string;
  }[] = await queryRunner.query(
    `SELECT table_name AS "table", column_name AS name,
       CASE WHEN data_type='USER-DEFINED' THEN udt_name ELSE data_type END AS type,
       is_nullable AS nullable FROM information_schema.columns
       WHERE table_schema='core' AND table_name=ANY($1)`,
    [names],
  );
  for (const row of fields) {
    if (!columns.has(row.table)) columns.set(row.table, new Map());
    columns.get(row.table)!.set(row.name, `${row.type}:${row.nullable}`);
  }
  const labels: { name: string; label: string }[] = await queryRunner.query(
    `SELECT t.typname AS name, e.enumlabel AS label FROM pg_type t
     JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid
     WHERE n.nspname='core' AND t.typname=ANY($1)
     ORDER BY t.typname, e.enumsortorder`,
    [
      'instagramReplyApprovalRequest_state_enum',
      'instagramReplyExecutionReceipt_state_enum',
      'actionApprovalBinding_state_enum',
      'actionExecutionReceipt_state_enum',
    ],
  );
  for (const row of labels)
    enums.set(row.name, [...(enums.get(row.name) ?? []), row.label]);
  const rules: { table: string; name: string; definition: string }[] =
    await queryRunner.query(
      `SELECT c.relname AS "table", p.conname AS name, pg_get_constraintdef(p.oid) AS definition
     FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='core' AND c.relname=ANY($1)`,
      [names],
    );
  for (const row of rules) {
    if (!constraints.has(row.table)) constraints.set(row.table, new Map());
    constraints.get(row.table)!.set(row.name, row.definition);
  }
  const keys: { table: string; name: string; definition: string }[] =
    await queryRunner.query(
      `SELECT tablename AS "table", indexname AS name, indexdef AS definition
     FROM pg_indexes WHERE schemaname='core' AND tablename=ANY($1)`,
      [names],
    );
  for (const row of keys) {
    if (!indexes.has(row.table)) indexes.set(row.table, new Map());
    indexes.get(row.table)!.set(row.name, row.definition);
  }
  return { tables, columns, enums, constraints, indexes };
};

const classifyAuthority = (catalog: Catalog): AuthorityState => {
  const present = AUTHORITY.filter((name) => catalog.tables.has(name));
  if (present.length === 0) {
    if (
      [...catalog.enums.keys()].some(
        (name) =>
          name.startsWith('actionApproval') ||
          name.startsWith('actionExecution') ||
          name.startsWith('instagramReply'),
      )
    )
      reject('orphan authority enums');
    return 'absent';
  }
  if (
    present.length === 2 &&
    present.every((name) => AUTHORITY.slice(0, 2).includes(name as never))
  ) {
    assertLegacy(catalog);
    return 'legacy';
  }
  if (
    present.length === 3 &&
    present.every((name) => AUTHORITY.slice(2).includes(name as never))
  )
    return 'generic';
  return reject('mixed or partial authority tables');
};

const assertAbsentBilling = (catalog: Catalog) => {
  if (
    !catalog.tables.has(BILLING[0]) ||
    BILLING.slice(1).some((name) => catalog.tables.has(name))
  )
    reject('partial or existing billing foundation');
  assertInstallation(catalog, false);
};

const assertPostcondition = (catalog: Catalog, origin: 'absent' | 'legacy') => {
  if (classifyAuthority(catalog) !== 'generic')
    reject('authority transformation did not complete');
  if (AUTHORITY.slice(0, 2).some((name) => catalog.tables.has(name)))
    reject('legacy authority remains');
  assertAuthorityPostcondition(catalog, origin === 'legacy');
  if (BILLING.some((name) => !catalog.tables.has(name)))
    reject('billing foundation missing');
  assertBillingPostcondition(catalog);
};

export type Legacy219Inspection = {
  eligible: boolean;
  authority: AuthorityState;
  receiptCompleted: boolean;
  action: 'reconcile' | 'already-reconciled';
};

@Injectable()
export class Legacy219PrerequisiteReconciliationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly migrations: UpgradeMigrationService,
    private readonly runner: InstanceCommandRunnerService,
  ) {}

  private async checkLineage({
    workspaceIds,
    workspaceCursors,
    sequence,
  }: {
    workspaceIds: string[];
    workspaceCursors: Map<string, WorkspaceLastAttemptedCommand>;
    sequence: UpgradeStep[];
  }) {
    if (
      !(await this.migrations.isLastAttemptCompleted({
        name: REBRAND,
        workspaceId: null,
      }))
    ) {
      reject('pinned completed Rebrand receipt missing');
    }
    const positions = [REBRAND, BINDING_166, FINALIZE_167].map((name) =>
      sequence.findIndex(
        (step) => step.name === name && step.kind === 'slow-instance',
      ),
    );
    if (
      positions.some((position) => position < 0) ||
      !(positions[0] < positions[1] && positions[1] < positions[2])
    )
      reject('pinned sequence order');
    for (const id of workspaceIds) {
      const cursor = workspaceCursors.get(id);
      if (
        !cursor ||
        !(
          (cursor.name === INITIAL_WORKSPACE &&
            cursor.status === 'completed' &&
            cursor.isInitial) ||
          (cursor.name === FINALIZE_167 &&
            cursor.status === 'failed' &&
            !cursor.isInitial)
        )
      )
        reject('workspace cursor is not a known authentic 2.19 position');
    }
    if (workspaceCursors.size !== workspaceIds.length)
      reject('workspace inventory is not complete');
    // A missing fast receipt is essential: do not replay on generic upgrades.
    const skipped = sequence.filter(
      (step) =>
        step.kind === 'fast-instance' &&
        step.version === '2.19.0' &&
        /_(1784106536000|1784112688976|1784112963055|1784112963056|1784112963058|1784266302003|1784486000000|1784487000000|1784488000000|1785453079000|1785453081000)$/.test(
          step.name,
        ),
    );
    if (
      skipped.length !== 11 ||
      skipped.some((step) => sequence.indexOf(step) >= positions[0])
    )
      reject('missing fast prerequisite identities');
    for (const step of skipped)
      if (await this.migrations.hasInstanceAttempt(step.name))
        reject(`inconsistent original receipt ${step.name}`);
  }

  async inspect(input: {
    workspaceIds: string[];
    workspaceCursors: Map<string, WorkspaceLastAttemptedCommand>;
    sequence: UpgradeStep[];
  }): Promise<Legacy219Inspection> {
    await this.checkLineage(input);
    const queryRunner = this.dataSource.createQueryRunner();
    try {
      await queryRunner.connect();
      const catalog = await catalogQuery(queryRunner);
      const authority = classifyAuthority(catalog);
      const receiptCompleted = await this.migrations.isLastAttemptCompleted({
        name: RECEIPT_NAME,
        workspaceId: null,
      });
      if (receiptCompleted) {
        // Both supported branches have different pre-Finalize shapes; do not guess
        // lineage from table existence. The legacy shape retains approvalId.
        const legacyOrigin =
          catalog.columns.get(AUTHORITY[2])?.has('approvalId') ?? false;
        assertPostcondition(catalog, legacyOrigin ? 'legacy' : 'absent');
        return {
          eligible: true,
          authority,
          receiptCompleted,
          action: 'already-reconciled',
        };
      }
      if (authority === 'generic')
        reject('generic authority without reconciliation receipt');
      assertAbsentBilling(catalog);
      return {
        eligible: true,
        authority,
        receiptCompleted,
        action: 'reconcile',
      };
    } finally {
      await queryRunner.release();
    }
  }

  async reconcile(input: {
    workspaceIds: string[];
    workspaceCursors: Map<string, WorkspaceLastAttemptedCommand>;
    sequence: UpgradeStep[];
    maintenanceWindowConfirmed: boolean;
    dryRun?: boolean;
    filtered?: boolean;
  }): Promise<Legacy219Inspection> {
    if (!input.maintenanceWindowConfirmed || input.filtered)
      reject('unfiltered single-writer maintenance window required');
    const inspection = await this.inspect(input);
    if (input.dryRun || inspection.action === 'already-reconciled')
      return inspection;
    const origin = inspection.authority;
    if (origin === 'generic')
      return reject('generic authority cannot be transformed');
    const commands: FastInstanceCommand[] = [
      new CreateManagedProviderBillingFoundationFastInstanceCommand(),
      new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand(),
      new CreateManagedProviderFundingActionFastInstanceCommand(),
      new CreateManagedProviderPoolFastInstanceCommand(),
      new AddMetronomeAuditPropertiesFastInstanceCommand(),
      new RepairManagedProviderOperationRetentionFastInstanceCommand(),
      new AddActionApprovalContextFingerprintFastInstanceCommand(),
      new AddActionReceiptProviderIdentifiersFastInstanceCommand(),
    ];
    const result = await this.runner.runFastInstanceCommand({
      name: RECEIPT_NAME,
      command: {
        up: async (queryRunner) => {
          // Recheck inside the same transaction as DDL and the native receipt.
          const before = await catalogQuery(queryRunner);
          if (classifyAuthority(before) !== origin)
            reject('authority changed since inspection');
          assertAbsentBilling(before);
          for (const command of commands) await command.up(queryRunner);
          assertPostcondition(await catalogQuery(queryRunner), origin);
        },
        down: async () => {
          throw new Error(
            'Prerequisite reconciliation cannot be reversed independently',
          );
        },
      },
    });
    if (result.status === 'failed') throw result.error;
    if (result.status === 'already-executed') {
      // The native runner check is not a lock. Do not trust a concurrent receipt.
      return this.inspect(input);
    }
    return {
      eligible: true,
      authority: 'generic',
      receiptCompleted: true,
      action: 'already-reconciled',
    };
  }
}
