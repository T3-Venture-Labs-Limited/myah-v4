import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';

import { createClient } from 'redis';
import { type Type } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  ConnectedAccountProvider,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
  MessageChannelType,
  MessageChannelVisibility,
} from 'twenty-shared/types';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { OutreachEmailActionDefinition } from 'src/engine/core-modules/action-approval/definitions/outreach-email-action.definition';
import {
  ActionApprovalBindingEntity,
  ActionApprovalBindingState,
} from 'src/engine/core-modules/action-approval/entities/action-approval-binding.entity';
import { ActionApprovalBindingEvidenceLinkEntity } from 'src/engine/core-modules/action-approval/entities/action-approval-binding-evidence-link.entity';
import {
  ActionExecutionReceiptEntity,
  ActionExecutionReceiptState,
} from 'src/engine/core-modules/action-approval/entities/action-execution-receipt.entity';
import { ActionApprovalService } from 'src/engine/core-modules/action-approval/services/action-approval.service';
import { ActionReceiptProjectorService } from 'src/engine/core-modules/action-approval/services/action-receipt-projector.service';
import { MANAGED_EMAIL_PRODUCT_DEFINITIONS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { SendOutreachEmailTool } from 'src/engine/core-modules/tool/tools/outreach-email-tool/send-outreach-email-tool';
import { CampaignEmailAccountHealth } from 'src/modules/myah-campaign/dtos/campaign-account.dto';
import { CampaignAccountService } from 'src/modules/myah-campaign/services/campaign-account.service';
import { GmailMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/drivers/gmail/services/gmail-message-outbound.service';
import { MessagingMessageOutboundService } from 'src/modules/messaging/message-outbound-manager/services/messaging-message-outbound.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { createRequestApprovalTool } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { WorkspaceCacheService } from 'src/engine/workspace-cache/services/workspace-cache.service';
import { WORKSPACE_CACHE_KEYS_V2 } from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const legacyActionId = randomUUID();
const legacyCampaignCreatorId = randomUUID();
const twentyServerRoot = resolve(__dirname, '../../..');
const commandEntryPoint = resolve(twentyServerRoot, 'dist/command/command.js');

const preMyah168FieldNames = new Set<string>([
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'position',
  'createdBy',
  'updatedBy',
  'searchVector',
  'name',
  'campaignCreator',
  'outreachStep',
  'channel',
  'status',
  'scheduledAt',
  'completedAt',
  'resultSummary',
]);
const outreachApprovalFieldNames = Object.keys(
  MYAH_STANDARD_OBJECTS.outreachAction.fields,
).filter((fieldName) => !preMyah168FieldNames.has(fieldName));
const requiredMyah168OutreachActionFieldIdentifiers = {
  subject: 'a3ecbb51-442c-589d-b944-4bf5f6ddc93d',
  body: 'fe19e40a-8f51-54df-b631-390b33a72359',
  contentDigest: 'ed7d3f38-2ebf-556a-bc7d-7507def97dab',
  recipientEmail: '21598e0a-077c-519b-b8d4-1a1a95966d90',
  connectedAccountId: 'df2e43ca-b6b4-50ea-a0db-6edbb46ab391',
  messageChannelId: 'a0b2e292-21e4-5226-aa88-e732345383e5',
  senderEmail: 'b9b351b6-7e75-52be-9eaa-21cd6f722c12',
  senderDisplayName: 'ec41fcc7-25d9-58b6-88a1-6749306e6947',
  approvalBindingId: '8b5bd6ca-b61f-5a0c-b225-37f515d649ba',
  executionReceiptId: '81731a47-27a7-5227-869c-284087244fa7',
  providerDraftExternalId: '63285ab2-bd0c-537e-999b-4e67119b3bcc',
  sentHeaderMessageId: '31e80297-1638-53b3-a607-3125905a63aa',
  providerMessageExternalId: '3835066d-3e92-5781-a926-54b01b73d3a2',
  providerThreadExternalId: 'f9dea5b1-f7a2-5c30-a5fe-8fbf082c87ad',
  messageId: '9cca420c-78b7-52b9-ac79-c1f797e47846',
  messageThreadId: '0a05accb-b4ca-5673-87be-41ea7d50c50b',
  inReplyTo: '8b2b7357-3662-54e7-8433-31b73899051b',
} as const;
const requiredMyah270OutreachActionFieldIdentifiers = {
  campaignAccountId: '417af66e-c311-53a8-8811-4d5818e01dc2',
} as const;
const workspaceMetadataCacheKeyNames = [
  ...TWENTY_STANDARD_ALL_METADATA_NAME.map(getMetadataFlatEntityMapsKey),
  'featureFlagsMap',
] as const;

const flushWorkspaceMetadataRedisCache = async (
  workspaceId: string,
): Promise<void> => {
  const redisClient = createClient({ url: process.env.REDIS_URL });

  await redisClient.connect();
  try {
    const keys = workspaceMetadataCacheKeyNames.flatMap((keyName) => {
      const baseKey = [
        CacheStorageNamespace.IntegrationTests,
        CacheStorageNamespace.EngineWorkspace,
        WORKSPACE_CACHE_KEYS_V2[keyName],
        workspaceId,
      ].join(':');

      return [`${baseKey}:data`, `${baseKey}:hash`];
    });

    await redisClient.del(keys);
  } finally {
    await redisClient.quit();
  }
};

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

const runWorkspaceMigration = async (
  workspaceId: string,
  commandName = 'upgrade:2-19:resynchronize-myah-standard-application',
): Promise<CommandResult> => {
  const child = spawn(
    process.execPath,
    [
      commandEntryPoint,
      commandName,
      '--workspace-id',
      workspaceId,
      '--verbose',
    ],
    {
      cwd: twentyServerRoot,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    stderr += chunk;
  });
  const [exitCode] = (await once(child, 'close')) as [number | null];

  return { exitCode, stdout, stderr };
};

describe('outreach email workflow migration (PostgreSQL)', () => {
  let dataSource: DataSource;
  let workspaceId: string;
  let schemaName: string;
  let commandResult: CommandResult;
  let managedEmailCommandResult: CommandResult;
  let retainedLegacyAction: { id: string; name: string };
  let retainedLegacyCampaignCreator: { id: string; name: string };
  let restoredColumnNames: string[];
  let managedMailboxAssignmentColumnNames: string[];
  let legacyRowInserted = false;
  let legacyCampaignCreatorRowInserted = false;

  beforeAll(async () => {
    dataSource = global.testDataSource;
    expect(MYAH_STANDARD_OBJECTS.outreachAction.fields).toMatchObject(
      Object.fromEntries(
        Object.entries({
          ...requiredMyah168OutreachActionFieldIdentifiers,
          ...requiredMyah270OutreachActionFieldIdentifiers,
        }).map(([name, universalIdentifier]) => [
          name,
          { universalIdentifier },
        ]),
      ),
    );

    const myahWorkspaces = await dataSource.query<{ id: string }[]>(
      `SELECT workspace."id"
       FROM core."workspace" workspace
       INNER JOIN core."objectMetadata" object_metadata
         ON object_metadata."workspaceId" = workspace."id"
       WHERE object_metadata."universalIdentifier" = $1
         AND workspace."activationStatus" IN ($2, $3)
       ORDER BY workspace."createdAt"`,
      [
        MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier,
        WorkspaceActivationStatus.ACTIVE,
        WorkspaceActivationStatus.SUSPENDED,
      ],
    );

    for (const candidate of myahWorkspaces) {
      const candidateSchemaName = getWorkspaceSchemaName(candidate.id);
      const [{ tableName }] = await dataSource.query<
        { tableName: string | null }[]
      >(
        `SELECT to_regclass(format('%I.%I', $1::text, $2::text))::text AS "tableName"`,
        [candidateSchemaName, 'outreachAction'],
      );

      if (tableName !== null) {
        workspaceId = candidate.id;
        schemaName = candidateSchemaName;
        break;
      }
    }

    if (!workspaceId || !schemaName) {
      throw new Error(
        'A seeded active or suspended Myah workspace with physical tables is required',
      );
    }

    await dataSource.query(
      `INSERT INTO "${schemaName}"."outreachAction" ("id", "name")
       VALUES ($1, $2)`,
      [legacyActionId, 'Legacy outreach action'],
    );
    legacyRowInserted = true;

    const fieldIds = (
      await dataSource.query<{ id: string }[]>(
        `SELECT field_metadata."id"
         FROM core."fieldMetadata" field_metadata
         INNER JOIN core."objectMetadata" object_metadata
           ON object_metadata."id" = field_metadata."objectMetadataId"
         WHERE object_metadata."workspaceId" = $1
           AND object_metadata."universalIdentifier" = $2
           AND field_metadata."name" = ANY($3::text[])`,
        [
          workspaceId,
          MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier,
          outreachApprovalFieldNames,
        ],
      )
    ).map(({ id }) => id);

    if (fieldIds.length !== outreachApprovalFieldNames.length) {
      throw new Error(
        'The seeded Myah profile did not contain every new field',
      );
    }

    await dataSource.query(
      'DELETE FROM core."fieldPermission" WHERE "fieldMetadataId" = ANY($1::uuid[])',
      [fieldIds],
    );
    await dataSource.query(
      'DELETE FROM core."fieldMetadata" WHERE "id" = ANY($1::uuid[])',
      [fieldIds],
    );

    for (const fieldName of outreachApprovalFieldNames) {
      await dataSource.query(
        `ALTER TABLE "${schemaName}"."outreachAction" DROP COLUMN IF EXISTS "${fieldName}"`,
      );
    }
    await flushWorkspaceMetadataRedisCache(workspaceId);

    commandResult = await runWorkspaceMigration(workspaceId);

    await dataSource.query(
      `INSERT INTO "${schemaName}"."campaignCreator" ("id", "name")
       VALUES ($1, $2)`,
      [legacyCampaignCreatorId, 'Legacy campaign creator'],
    );
    legacyCampaignCreatorRowInserted = true;

    const [managedMailboxAssignmentField] = await dataSource.query<
      { id: string }[]
    >(
      `SELECT field_metadata."id"
       FROM core."fieldMetadata" field_metadata
       INNER JOIN core."objectMetadata" object_metadata
         ON object_metadata."id" = field_metadata."objectMetadataId"
       WHERE object_metadata."workspaceId" = $1
         AND object_metadata."universalIdentifier" = $2
         AND field_metadata."universalIdentifier" = $3`,
      [
        workspaceId,
        MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
        MYAH_STANDARD_OBJECTS.campaignCreator.fields.assignedManagedMailboxId
          .universalIdentifier,
      ],
    );
    if (!managedMailboxAssignmentField) {
      throw new Error(
        'The seeded Myah profile did not contain managed mailbox assignment',
      );
    }
    await dataSource.query(
      'DELETE FROM core."fieldPermission" WHERE "fieldMetadataId" = $1',
      [managedMailboxAssignmentField.id],
    );
    await dataSource.query('DELETE FROM core."fieldMetadata" WHERE "id" = $1', [
      managedMailboxAssignmentField.id,
    ]);
    await dataSource.query(
      `ALTER TABLE "${schemaName}"."campaignCreator"
       DROP COLUMN "assignedManagedMailboxId"`,
    );
    await flushWorkspaceMetadataRedisCache(workspaceId);

    const [missingManagedMailboxAssignmentColumn] = await dataSource.query<
      { columnName: string | null }[]
    >(
      `SELECT column_name AS "columnName"
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = 'campaignCreator'
         AND column_name = 'assignedManagedMailboxId'`,
      [schemaName],
    );
    if (missingManagedMailboxAssignmentColumn !== undefined) {
      throw new Error(
        'Managed mailbox assignment column still exists before migration',
      );
    }

    managedEmailCommandResult = await runWorkspaceMigration(
      workspaceId,
      'upgrade:2-20:synchronize-managed-email-campaign-assignment-metadata',
    );
    [retainedLegacyCampaignCreator] = await dataSource.query<
      { id: string; name: string }[]
    >(
      `SELECT "id", "name"
       FROM "${schemaName}"."campaignCreator"
       WHERE "id" = $1`,
      [legacyCampaignCreatorId],
    );

    [retainedLegacyAction] = await dataSource.query<
      { id: string; name: string }[]
    >(
      `SELECT "id", "name"
       FROM "${schemaName}"."outreachAction"
       WHERE "id" = $1`,
      [legacyActionId],
    );
    restoredColumnNames = (
      await dataSource.query<{ columnName: string }[]>(
        `SELECT column_name AS "columnName"
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'outreachAction'
           AND column_name = ANY($2::text[])`,
        [schemaName, outreachApprovalFieldNames],
      )
    ).map(({ columnName }) => columnName);
    managedMailboxAssignmentColumnNames = (
      await dataSource.query<{ columnName: string }[]>(
        `SELECT column_name AS "columnName"
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'campaignCreator'
           AND column_name = 'assignedManagedMailboxId'`,
        [schemaName],
      )
    ).map(({ columnName }) => columnName);
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized && schemaName && legacyRowInserted) {
      await dataSource.query(
        `DELETE FROM "${schemaName}"."outreachAction" WHERE "id" = $1`,
        [legacyActionId],
      );
    }
    if (
      dataSource?.isInitialized &&
      schemaName &&
      legacyCampaignCreatorRowInserted
    ) {
      await dataSource.query(
        `DELETE FROM "${schemaName}"."campaignCreator" WHERE "id" = $1`,
        [legacyCampaignCreatorId],
      );
    }
  });

  it('runs the canonical command for the selected Myah workspace', () => {
    expect(commandResult.exitCode).toBe(0);
    expect(`${commandResult.stdout}\n${commandResult.stderr}`).toContain(
      `Running on workspace ${workspaceId} 1/1`,
    );
    expect(`${commandResult.stdout}\n${commandResult.stderr}`).toContain(
      'Command completed!',
    );
  });

  it('runs the managed email assignment migration for the selected workspace', () => {
    expect(managedEmailCommandResult.exitCode).toBe(0);
    expect(
      `${managedEmailCommandResult.stdout}\n${managedEmailCommandResult.stderr}`,
    ).toContain(`Running on workspace ${workspaceId} 1/1`);
    expect(
      `${managedEmailCommandResult.stdout}\n${managedEmailCommandResult.stderr}`,
    ).toContain('Command completed!');
  });

  it('retains existing Outreach Action values and restores every new column', () => {
    expect(retainedLegacyAction).toEqual({
      id: legacyActionId,
      name: 'Legacy outreach action',
    });
    expect(restoredColumnNames.sort()).toEqual(
      [...outreachApprovalFieldNames].sort(),
    );
  });

  it('adds managed mailbox assignment to existing Campaign Creator tables', () => {
    expect(managedMailboxAssignmentColumnNames).toEqual([
      'assignedManagedMailboxId',
    ]);
    expect(retainedLegacyCampaignCreator).toEqual({
      id: legacyCampaignCreatorId,
      name: 'Legacy campaign creator',
    });
  });
});

describe('outreach email approval and send (PostgreSQL)', () => {
  const creatorId = randomUUID();
  const campaignId = randomUUID();
  const campaignCreatorId = randomUUID();
  const outreachActionId = randomUUID();
  const connectedAccountId = randomUUID();
  const messageChannelId = randomUUID();
  const managedMailboxId = randomUUID();
  const managedEmailAcquisitionOperationId = randomUUID();
  const managedEmailDomainId = randomUUID();
  const managedEmailDomain = `managed-${managedMailboxId}.test`;
  const threadId = randomUUID();
  const subject = 'Approved partnership subject';
  const body = 'Approved partnership body';
  const recipientEmail = 'creator@example.com';
  const senderEmail = `sender-${managedMailboxId}@${managedEmailDomain}`;
  const providerDraftExternalId = 'provider-draft-integration';
  const providerThreadExternalId = 'provider-thread-integration';
  const persistedMessageId = randomUUID();
  const persistedMessageThreadId = randomUUID();
  const persistedAssociationId = randomUUID();
  const projectedMessageId = randomUUID();
  const projectedMessageThreadId = randomUUID();
  const projectedAssociationId = randomUUID();
  const recoveryActionId = randomUUID();
  const recoveryReceiptId = randomUUID();
  const linkedCreatorId = randomUUID();
  const linkedCampaignCreatorId = randomUUID();
  const linkedStaleActionId = randomUUID();
  const linkedActionId = randomUUID();
  const linkedRecoveryActionId = randomUUID();
  const linkedConnectedAccountId = randomUUID();
  const linkedMessageChannelId = randomUUID();
  const linkedCampaignAccountId = randomUUID();
  const linkedProjectedMessageId = randomUUID();
  const linkedProjectedMessageThreadId = randomUUID();
  const linkedProjectedAssociationId = randomUUID();
  const linkedRecoveryMessageId = randomUUID();
  const linkedRecoveryMessageThreadId = randomUUID();
  const linkedRecoveryAssociationId = randomUUID();
  const linkedSenderEmail = 'linked-sender@example.com';
  const linkedSubject = 'Linked sender partnership subject';
  const linkedBody = 'Linked sender partnership body';
  const linkedProviderDraftExternalId = 'provider-draft-linked';
  const linkedRecoveryProviderDraftExternalId =
    'provider-draft-linked-recovery';
  const linkedProviderThreadExternalId = 'provider-thread-linked';
  const linkedProviderMessageId = '<linked-sent@example.com>';
  const linkedRecoveryProviderMessageId = '<linked-recovered@example.com>';
  const linkedProviderExternalMessageId = 'linked-provider-message-id';
  const linkedRecoveryProviderExternalMessageId =
    'linked-recovered-provider-message-id';
  const recoveryProviderMessageId = '<recovered@example.com>';
  let dataSource: DataSource;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let schemaName: string;
  let userWorkspaceId: string;
  let workspaceMemberId: string;
  let approvalBindingId: string;
  let sender: SendOutreachEmailTool;
  let actionDefinition: OutreachEmailActionDefinition;
  let sendDraft: jest.SpiedFunction<GmailMessageOutboundService['sendDraft']>;
  let approvalDataSource: DataSource;
  let campaignAccountService: CampaignAccountService;
  let actionApprovalService: ActionApprovalService;
  let linkedApprovalBindingId: string;
  let linkedRecoveryApprovalBindingId: string;

  beforeAll(async () => {
    dataSource = global.testDataSource;
    approvalDataSource = new DataSource({
      type: 'postgres',
      url: process.env.PG_DATABASE_URL,
      schema: 'core',
      entities: [
        ActionApprovalBindingEntity,
        ActionApprovalBindingEvidenceLinkEntity,
        ActionExecutionReceiptEntity,
      ],
      synchronize: false,
    });
    await approvalDataSource.initialize();
    const candidates = await dataSource.query<{ id: string }[]>(
      `SELECT workspace."id"
       FROM core."workspace" workspace
       INNER JOIN core."objectMetadata" object_metadata
         ON object_metadata."workspaceId" = workspace."id"
       WHERE object_metadata."universalIdentifier" = $1
         AND workspace."activationStatus" IN ($2, $3)
       ORDER BY workspace."createdAt"`,
      [
        MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier,
        WorkspaceActivationStatus.ACTIVE,
        WorkspaceActivationStatus.SUSPENDED,
      ],
    );

    for (const candidate of candidates) {
      const candidateSchemaName = getWorkspaceSchemaName(candidate.id);
      const [{ tableName }] = await dataSource.query<
        { tableName: string | null }[]
      >(
        `SELECT to_regclass(format('%I.%I', $1::text, $2::text))::text AS "tableName"`,
        [candidateSchemaName, 'outreachAction'],
      );

      if (tableName !== null) {
        workspaceId = candidate.id;
        schemaName = candidateSchemaName;
        break;
      }
    }
    if (!workspaceId || !schemaName) {
      throw new Error('A physical Myah workspace is required');
    }

    const [otherWorkspace] = await dataSource.query<{ id: string }[]>(
      `SELECT "id" FROM core."workspace" WHERE "id" <> $1 LIMIT 1`,
      [workspaceId],
    );
    if (!otherWorkspace) {
      throw new Error('A second workspace is required for isolation proof');
    }
    otherWorkspaceId = otherWorkspace.id;

    const [userWorkspace] = await dataSource.query<
      { id: string; userId: string }[]
    >(
      `SELECT user_workspace."id", user_workspace."userId"
       FROM core."userWorkspace" user_workspace
       INNER JOIN core."roleTarget" role_target
         ON role_target."userWorkspaceId" = user_workspace."id"
       INNER JOIN core."role" role ON role."id" = role_target."roleId"
       WHERE user_workspace."workspaceId" = $1
         AND role."workspaceId" = $1
         AND role."label" = 'Admin'
       LIMIT 1`,
      [workspaceId],
    );
    if (!userWorkspace) {
      throw new Error('A seeded Myah workspace member is required');
    }
    userWorkspaceId = userWorkspace.id;
    const [workspaceMember] = await dataSource.query<{ id: string }[]>(
      `SELECT "id" FROM "${schemaName}"."workspaceMember"
       WHERE "userId" = $1 LIMIT 1`,
      [userWorkspace.userId],
    );
    if (!workspaceMember) {
      throw new Error('A seeded workspace member record is required');
    }
    workspaceMemberId = workspaceMember.id;

    await dataSource.query(
      `INSERT INTO core."connectedAccount" (
        "id", "workspaceId", "userWorkspaceId", "handle", "name",
        "provider", "visibility"
      ) VALUES ($1, $2, $3, $4, 'Approved Sender', $5, 'workspace')`,
      [
        connectedAccountId,
        workspaceId,
        userWorkspaceId,
        senderEmail,
        ConnectedAccountProvider.GOOGLE,
      ],
    );
    await dataSource.query(
      `INSERT INTO core."messageChannel" (
        "id", "workspaceId", "connectedAccountId", "handle", "visibility",
        "type", "pendingGroupEmailsAction", "syncStatus", "syncStage"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        messageChannelId,
        workspaceId,
        connectedAccountId,
        senderEmail,
        MessageChannelVisibility.SHARE_EVERYTHING,
        MessageChannelType.EMAIL,
        MessageChannelPendingGroupEmailsAction.NONE,
        MessageChannelSyncStatus.ACTIVE,
        MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      ],
    );
    await dataSource.query(
      `INSERT INTO core."connectedAccount" (
        "id", "workspaceId", "userWorkspaceId", "handle", "name",
        "provider", "visibility"
      ) VALUES ($1, $2, $3, $4, 'Linked Sender', $5, 'workspace')`,
      [
        linkedConnectedAccountId,
        workspaceId,
        userWorkspaceId,
        linkedSenderEmail,
        ConnectedAccountProvider.GOOGLE,
      ],
    );
    await dataSource.query(
      `INSERT INTO core."messageChannel" (
        "id", "workspaceId", "connectedAccountId", "handle", "visibility",
        "type", "pendingGroupEmailsAction", "syncStatus", "syncStage"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        linkedMessageChannelId,
        workspaceId,
        linkedConnectedAccountId,
        linkedSenderEmail,
        MessageChannelVisibility.SHARE_EVERYTHING,
        MessageChannelType.EMAIL,
        MessageChannelPendingGroupEmailsAction.NONE,
        MessageChannelSyncStatus.ACTIVE,
        MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      ],
    );

    const managedEmailResourceSnapshot = {
      proposal: {
        createdAt: '2026-08-02T12:00:00.000Z',
        expiresAt: '2026-08-02T12:15:00.000Z',
        policyVersion: 'outreach-integration',
      },
      domains: [
        {
          domain: managedEmailDomain,
          providerInventoryId: `inventory-${managedEmailDomainId}`,
          prewarmedProviderCosts: {
            domainPriceCents: 1_000,
            mailboxPriceCents: 250,
          },
          mailboxes: [senderEmail],
          providerQuote: {
            amountMinorUnits: 1_000,
            currency: 'USD',
            fingerprint: 'outreach-integration',
            observedAt: '2026-08-02T12:00:00.000Z',
            termCount: 1,
            termUnit: 'YEAR',
          },
        },
      ],
      personas: [
        {
          address: senderEmail,
          createdByWorkspaceMemberId: workspaceMemberId,
          firstName: 'Approved',
          lastName: 'Sender',
          localPart: `sender-${managedMailboxId}`,
          roleTitle: null,
          signature: 'Approved Sender',
          version: 1,
        },
      ],
    };
    const managedEmailExpectedLineItems = MANAGED_EMAIL_PRODUCT_DEFINITIONS.map(
      (definition, index) => ({
        billingFrequency: index === 0 ? 'ANNUAL' : 'MONTHLY',
        productKey: definition.key,
        productTag: definition.metronomeProductTag,
        metronomeProductId: randomUUID(),
        currency: 'USD',
        quantity: 1,
        unitPriceCents: 1_000,
        totalCents: 1_000,
        periodStart: '2026-08-02T00:00:00.000Z',
        periodEnd:
          index === 0 ? '2027-08-02T00:00:00.000Z' : '2026-09-02T00:00:00.000Z',
      }),
    );
    const managedEmailSafeFacts = { schemaVersion: 1, facts: [] };

    await dataSource.query(
      `INSERT INTO core."managedEmailAcquisitionOperation" (
        "id", "workspaceId", "idempotencyKey", "acquisitionMode",
        "providerConfigurationKey", "readinessPolicyVersion",
        "authorizedActorWorkspaceMemberId", "proposalHash", "quoteHash",
        "resourceSnapshot", "catalogVersion", "metronomeRateCardId",
        "metronomeRateCardAlias", "expectedLineItems", "expectedAmountCents",
        "currency", "servicePeriodStart", "servicePeriodEnd", "state",
        "reconciliationAttemptCount"
      ) VALUES (
        $1, $2, $3, 'PREWARMED_INVENTORY', 'outreach-integration',
        'outreach-integration', $4, 'proposal', 'quote', $5::jsonb,
        'outreach-integration', $6, 'outreach-integration', $7::jsonb,
        3000, 'USD', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day',
        'COMPLETE', 0
      )`,
      [
        managedEmailAcquisitionOperationId,
        workspaceId,
        `outreach-email-workflow:${managedMailboxId}`,
        workspaceMemberId,
        JSON.stringify(managedEmailResourceSnapshot),
        randomUUID(),
        JSON.stringify(managedEmailExpectedLineItems),
      ],
    );
    await dataSource.query(
      `INSERT INTO core."managedEmailDomain" (
        "id", "workspaceId", "acquisitionOperationId", "domain",
        "normalizedDomain", "acquisitionMode", "providerType",
        "providerConfigurationKey", "infrastructureState", "dnsReadinessFacts",
        "renewalEnabled", "cancelAtPeriodEnd"
      ) VALUES (
        $1, $2, $3, $4,
        $4, 'PREWARMED_INVENTORY',
        'outreach-integration', 'outreach-integration',
        'ACTIVE', $5::jsonb, true, false
      )`,
      [
        managedEmailDomainId,
        workspaceId,
        managedEmailAcquisitionOperationId,
        managedEmailDomain,
        JSON.stringify(managedEmailSafeFacts),
      ],
    );
    await dataSource.query(
      `INSERT INTO core."managedEmailMailbox" (
        "id", "workspaceId", "acquisitionOperationId", "managedEmailDomainId",
        "address", "normalizedAddress", "personaFirstName", "personaLastName",
        "personaDisplayName", "personaSignature", "personaCreatedByWorkspaceMemberId",
        "providerType", "providerConfigurationKey", "infrastructureState",
        "infrastructurePaidThrough", "connectedAccountId", "messageChannelId",
        "warmupMode", "warmupState", "warmupCancelAtPeriodEnd",
        "readinessPolicyVersion", "campaignEligibility", "policySafeDailyCapacity",
        "healthFacts"
      ) VALUES (
        $1, $2, $3, $4, $5, $5, 'Approved', 'Sender', 'Approved Sender',
        'Approved Sender', $6, 'outreach-integration', 'outreach-integration',
        'ACTIVE', NOW() + INTERVAL '1 day', $7, $8, 'PROVIDER_PREWARMED',
        'NOT_APPLICABLE', false, 'outreach-integration', 'ELIGIBLE', 1,
        $9::jsonb
      )`,
      [
        managedMailboxId,
        workspaceId,
        managedEmailAcquisitionOperationId,
        managedEmailDomainId,
        senderEmail,
        workspaceMemberId,
        connectedAccountId,
        messageChannelId,
        JSON.stringify(managedEmailSafeFacts),
      ],
    );

    await dataSource.query(
      `INSERT INTO "${schemaName}"."creator" ("id", "name", "email")
       VALUES ($1, 'Creator Name', $2)`,
      [creatorId, recipientEmail],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."campaign" ("id", "name")
       VALUES ($1, 'Launch Campaign')`,
      [campaignId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."campaignCreator" (
        "id", "name", "creatorId", "campaignId", "selectedContactMethod",
        "assignedManagedMailboxId"
      ) VALUES ($1, 'Launch Campaign: Creator Name', $2, $3, 'EMAIL', $4)`,
      [campaignCreatorId, creatorId, campaignId, managedMailboxId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."creator" ("id", "name", "email")
       VALUES ($1, 'Linked Creator Name', $2)`,
      [linkedCreatorId, recipientEmail],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."campaignCreator" (
        "id", "name", "creatorId", "campaignId", "selectedContactMethod",
        "assignedManagedMailboxId"
      ) VALUES ($1, 'Launch Campaign: Linked Creator Name', $2, $3, 'EMAIL', NULL)`,
      [linkedCampaignCreatorId, linkedCreatorId, campaignId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."campaignAccount" (
        "id", "campaignId", "connectedAccountId", "messageChannelId",
        "channel", "isDefault"
      ) VALUES ($1, $2, $3, $4, 'EMAIL', true)`,
      [
        linkedCampaignAccountId,
        campaignId,
        linkedConnectedAccountId,
        linkedMessageChannelId,
      ],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."outreachAction" (
        "id", "name", "campaignCreatorId", "channel", "status",
        "subject", "body", "contentDigest", "recipientEmail",
        "campaignAccountId", "connectedAccountId", "messageChannelId",
        "senderEmail", "senderDisplayName", "providerDraftExternalId",
        "providerThreadExternalId"
      ) VALUES (
        $1, 'Linked stale action', $2, 'EMAIL', 'PENDING',
        $3, $4, $5, $6, $7, $8, $9, $10, 'Linked Sender', $11, $12
      )`,
      [
        linkedStaleActionId,
        linkedCampaignCreatorId,
        linkedSubject,
        linkedBody,
        computeActionContentDigest(JSON.stringify([linkedSubject, linkedBody])),
        recipientEmail,
        linkedCampaignAccountId,
        linkedConnectedAccountId,
        linkedMessageChannelId,
        linkedSenderEmail,
        linkedProviderDraftExternalId,
        linkedProviderThreadExternalId,
      ],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."outreachAction" (
        "id", "name", "campaignCreatorId", "channel", "status",
        "subject", "body", "contentDigest", "recipientEmail",
        "connectedAccountId", "messageChannelId", "senderEmail",
        "senderDisplayName", "providerDraftExternalId",
        "providerThreadExternalId"
      ) VALUES (
        $1, 'Launch Campaign: Creator Name', $2, 'EMAIL', 'PENDING',
        $3, $4, $5, $6, $7, $8, $9, 'Approved Sender', $10, $11
      )`,
      [
        outreachActionId,
        campaignCreatorId,
        subject,
        body,
        computeActionContentDigest(JSON.stringify([subject, body])),
        recipientEmail,
        connectedAccountId,
        messageChannelId,
        senderEmail,
        providerDraftExternalId,
        providerThreadExternalId,
      ],
    );

    await flushWorkspaceMetadataRedisCache(workspaceId);

    const app = global.app as unknown as {
      container: {
        getModules(): Map<
          string,
          {
            providers: Map<
              unknown,
              { instance: unknown; metatype?: { name: string } }
            >;
          }
        >;
      };
    };
    const resolveProvider = <T>(type: Type<T>): T => {
      const provider = [...app.container.getModules().values()]
        .flatMap((module) => [...module.providers.entries()])
        .find(
          ([token, wrapper]) =>
            token === type || wrapper.metatype?.name === type.name,
        )?.[1];

      if (!provider?.instance) {
        throw new Error(`Missing provider ${type.name}`);
      }

      return provider.instance as T;
    };
    const workspaceCacheService = resolveProvider(WorkspaceCacheService);
    await workspaceCacheService.invalidateAndRecompute(workspaceId, [
      'flatObjectMetadataMaps',
      'flatFieldMetadataMaps',
      'flatIndexMaps',
      'featureFlagsMap',
      'rolesPermissions',
      'ORMEntityMetadatas',
      'userWorkspaceRoleMap',
      'apiKeyRoleMap',
      'flatRowLevelPermissionPredicateMaps',
      'flatRowLevelPermissionPredicateGroupMaps',
    ]);
    const { flatObjectMetadataMaps, rolesPermissions, userWorkspaceRoleMap } =
      await workspaceCacheService.getOrRecompute(workspaceId, [
        'flatObjectMetadataMaps',
        'rolesPermissions',
        'userWorkspaceRoleMap',
      ]);
    const roleId = userWorkspaceRoleMap[userWorkspaceId];
    const objectMetadataByName = Object.values(
      flatObjectMetadataMaps.byUniversalIdentifier,
    ).reduce(
      (objectsByName, objectMetadata) => {
        if (objectMetadata) {
          objectsByName[objectMetadata.nameSingular] = objectMetadata.id;
        }

        return objectsByName;
      },
      {} as Record<string, string>,
    );
    expect(roleId).toEqual(expect.any(String));
    for (const objectName of [
      'outreachAction',
      'campaignCreator',
      'creator',
      'campaign',
      'message',
      'messageChannelMessageAssociation',
    ]) {
      expect(
        rolesPermissions[roleId]?.[objectMetadataByName[objectName]],
      ).toMatchObject({ canReadObjectRecords: true });
    }
    campaignAccountService = resolveProvider(CampaignAccountService);
    actionDefinition = resolveProvider(OutreachEmailActionDefinition);
    actionApprovalService = resolveProvider(ActionApprovalService);
    const gmailMessageOutboundService = resolveProvider(
      GmailMessageOutboundService,
    );
    sender = new SendOutreachEmailTool(
      actionApprovalService,
      actionDefinition,
      resolveProvider(MessagingMessageOutboundService),
      resolveProvider(ActionReceiptProjectorService),
    );
    jest
      .spyOn(gmailMessageOutboundService, 'assertSendable')
      .mockResolvedValue(undefined);
    sendDraft = jest
      .spyOn(gmailMessageOutboundService, 'sendDraft')
      .mockImplementation(async (draftExternalId) => {
        if (draftExternalId === linkedProviderDraftExternalId) {
          return {
            headerMessageId: linkedProviderMessageId,
            messageExternalId: linkedProviderExternalMessageId,
            threadExternalId: linkedProviderThreadExternalId,
          };
        }
        if (draftExternalId === linkedRecoveryProviderDraftExternalId) {
          return {
            headerMessageId: linkedRecoveryProviderMessageId,
            messageExternalId: linkedRecoveryProviderExternalMessageId,
            threadExternalId: linkedProviderThreadExternalId,
          };
        }

        return {
          headerMessageId: '<sent@example.com>',
          messageExternalId: 'provider-message-id',
          threadExternalId: providerThreadExternalId,
        };
      });
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized || !workspaceId) {
      return;
    }
    if (schemaName) {
      await dataSource.query(
        `DELETE FROM "${schemaName}"."timelineActivity"
         WHERE "createdByContext" ->> 'actionReceiptId' IN (
           SELECT receipt."id"::text
           FROM core."actionExecutionReceipt" receipt
           INNER JOIN core."actionApprovalBinding" binding
             ON binding."id" = receipt."actionApprovalBindingId"
           WHERE binding."workspaceId" = $1
             AND binding."draftId" = ANY($2::uuid[])
         )`,
        [
          workspaceId,
          [
            outreachActionId,
            recoveryActionId,
            linkedStaleActionId,
            linkedActionId,
            linkedRecoveryActionId,
          ],
        ],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."timelineActivity" WHERE "id" = $1`,
        [recoveryReceiptId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."messageChannelMessageAssociation"
         WHERE "messageChannelId" = ANY($1::uuid[])`,
        [[messageChannelId, linkedMessageChannelId]],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."message"
         WHERE "headerMessageId" = ANY($1::text[])`,
        [
          [
            '<sent@example.com>',
            linkedProviderMessageId,
            linkedRecoveryProviderMessageId,
            recoveryProviderMessageId,
          ],
        ],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."messageChannelMessageAssociation"
         WHERE "id" = ANY($1::uuid[])`,
        [
          [
            persistedAssociationId,
            projectedAssociationId,
            linkedProjectedAssociationId,
            linkedRecoveryAssociationId,
          ],
        ],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."message" WHERE "id" = ANY($1::uuid[])`,
        [
          [
            persistedMessageId,
            projectedMessageId,
            linkedProjectedMessageId,
            linkedRecoveryMessageId,
          ],
        ],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."messageThread" WHERE "id" = ANY($1::uuid[])`,
        [
          [
            persistedMessageThreadId,
            projectedMessageThreadId,
            linkedProjectedMessageThreadId,
            linkedRecoveryMessageThreadId,
          ],
        ],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."outreachAction"
         WHERE "id" = ANY($1::uuid[])`,
        [
          [
            recoveryActionId,
            outreachActionId,
            linkedStaleActionId,
            linkedActionId,
            linkedRecoveryActionId,
          ],
        ],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."campaignCreator"
         WHERE "id" = ANY($1::uuid[])`,
        [[campaignCreatorId, linkedCampaignCreatorId]],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."creator" WHERE "id" = ANY($1::uuid[])`,
        [[creatorId, linkedCreatorId]],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."campaignAccount" WHERE "id" = $1`,
        [linkedCampaignAccountId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."campaign" WHERE "id" = $1`,
        [campaignId],
      );
    }
    await dataSource.query(
      `DELETE FROM core."actionExecutionReceipt"
       WHERE "actionApprovalBindingId" IN (
         SELECT "id" FROM core."actionApprovalBinding"
         WHERE "workspaceId" = $1 AND "draftId" = ANY($2::uuid[])
       )`,
      [
        workspaceId,
        [
          outreachActionId,
          recoveryActionId,
          linkedStaleActionId,
          linkedActionId,
          linkedRecoveryActionId,
        ],
      ],
    );
    await dataSource.query(
      `DELETE FROM core."actionApprovalBinding"
       WHERE "workspaceId" = $1 AND "draftId" = ANY($2::uuid[])`,
      [
        workspaceId,
        [
          outreachActionId,
          recoveryActionId,
          linkedStaleActionId,
          linkedActionId,
          linkedRecoveryActionId,
        ],
      ],
    );
    await dataSource.query(
      `DELETE FROM core."managedEmailMailbox" WHERE "id" = $1`,
      [managedMailboxId],
    );
    await dataSource.query(
      `DELETE FROM core."managedEmailDomain" WHERE "id" = $1`,
      [managedEmailDomainId],
    );
    await dataSource.query(
      `DELETE FROM core."managedEmailAcquisitionOperation" WHERE "id" = $1`,
      [managedEmailAcquisitionOperationId],
    );
    await dataSource.query(
      `DELETE FROM core."messageChannel" WHERE "id" = ANY($1::uuid[])`,
      [[messageChannelId, linkedMessageChannelId]],
    );
    await dataSource.query(
      `DELETE FROM core."connectedAccount" WHERE "id" = ANY($1::uuid[])`,
      [[connectedAccountId, linkedConnectedAccountId]],
    );
    await expect(
      dataSource.query(
        `SELECT COUNT(*)::int AS "count"
         FROM "${schemaName}"."outreachAction"
         WHERE "id" = ANY($1::uuid[])`,
        [
          [
            outreachActionId,
            recoveryActionId,
            linkedStaleActionId,
            linkedActionId,
            linkedRecoveryActionId,
          ],
        ],
      ),
    ).resolves.toEqual([{ count: 0 }]);
    await expect(
      dataSource.query(
        `SELECT COUNT(*)::int AS "count"
         FROM core."actionApprovalBinding"
         WHERE "workspaceId" = $1 AND "draftId" = ANY($2::uuid[])`,
        [
          workspaceId,
          [
            outreachActionId,
            recoveryActionId,
            linkedStaleActionId,
            linkedActionId,
            linkedRecoveryActionId,
          ],
        ],
      ),
    ).resolves.toEqual([{ count: 0 }]);
    if (approvalDataSource?.isInitialized) {
      await approvalDataSource.destroy();
    }
  });

  it('binds the persisted linked Campaign default before approval', async () => {
    await expect(
      campaignAccountService.resolveDefaultEmailAccount(
        campaignId,
        workspaceId,
      ),
    ).resolves.toMatchObject({
      id: linkedCampaignAccountId,
      connectedAccountId: linkedConnectedAccountId,
      messageChannelId: linkedMessageChannelId,
      isDefault: true,
      health: CampaignEmailAccountHealth.AVAILABLE,
    });

    const output = await createRequestApprovalTool({
      workspaceId,
      userWorkspaceId,
      threadId,
      actionDefinitions: {
        send_instagram_reply: {} as never,
        send_outreach_email: actionDefinition,
        send_myah_inbox_reply: {} as never,
      },
      actionApprovalService,
    }).execute({
      toolName: 'send_outreach_email',
      actionInput: { outreachActionId: linkedStaleActionId },
    });

    expect(output.result).toMatchObject({ status: 'pending' });
    if (!output.result || !('actionApprovalBindingId' in output.result)) {
      throw new Error('Linked approval producer did not return a binding');
    }
    linkedApprovalBindingId = output.result.actionApprovalBindingId;
    await expect(
      approvalDataSource
        .getRepository(ActionApprovalBindingEntity)
        .findOneOrFail({
          where: { id: linkedApprovalBindingId },
          relations: { evidenceLinks: true },
        }),
    ).resolves.toMatchObject({
      evidenceLinks: expect.arrayContaining([
        expect.objectContaining({
          recordId: linkedCampaignAccountId,
          role: 'campaign_account',
        }),
      ]),
    });

    await actionApprovalService.decidePendingBinding({
      workspaceId,
      userWorkspaceId,
      threadId,
      approvalBindingId: linkedApprovalBindingId,
      decision: 'approved',
    });
    await dataSource.query(
      `UPDATE "${schemaName}"."campaignAccount"
       SET "isDefault" = false WHERE "id" = $1`,
      [linkedCampaignAccountId],
    );
    await expect(
      sender.execute(
        { actionApprovalBindingId: linkedApprovalBindingId },
        { workspaceId, userWorkspaceId, threadId },
      ),
    ).resolves.toMatchObject({ success: false });
    expect(sendDraft).not.toHaveBeenCalled();
    await dataSource.query(
      `UPDATE "${schemaName}"."campaignAccount"
       SET "isDefault" = true WHERE "id" = $1`,
      [linkedCampaignAccountId],
    );
  });

  it('requires managed mailbox eligibility, approval, and real sent-message projection', async () => {
    const output = await createRequestApprovalTool({
      workspaceId,
      userWorkspaceId,
      threadId,
      actionDefinitions: {
        send_instagram_reply: {} as never,
        send_outreach_email: actionDefinition,
        send_myah_inbox_reply: {} as never,
      },
      actionApprovalService,
    }).execute({
      toolName: 'send_outreach_email',
      actionInput: { outreachActionId },
    });
    if (!output.result || !('actionApprovalBindingId' in output.result)) {
      throw new Error('Managed approval producer did not return a binding');
    }
    approvalBindingId = output.result.actionApprovalBindingId;
    const input = { actionApprovalBindingId: approvalBindingId };
    const context = { workspaceId, userWorkspaceId, threadId };

    await expect(sender.execute(input, context)).resolves.toMatchObject({
      success: false,
    });
    expect(sendDraft).not.toHaveBeenCalled();

    await actionApprovalService.decidePendingBinding({
      workspaceId,
      userWorkspaceId,
      threadId,
      approvalBindingId,
      decision: 'approved',
    });
    await expect(
      approvalDataSource
        .getRepository(ActionApprovalBindingEntity)
        .findOneByOrFail({ id: approvalBindingId }),
    ).resolves.toMatchObject({ state: ActionApprovalBindingState.APPROVED });

    await expect(
      sender.execute(input, { ...context, workspaceId: otherWorkspaceId }),
    ).resolves.toMatchObject({ success: false });
    expect(sendDraft).not.toHaveBeenCalled();

    await expect(sender.execute(input, context)).resolves.toEqual({
      success: true,
      message: 'Outreach email accepted.',
    });
    expect(sendDraft).toHaveBeenCalledTimes(1);
    expect(sendDraft).toHaveBeenCalledWith(
      providerDraftExternalId,
      expect.objectContaining({
        to: [recipientEmail],
        subject,
        body,
        threadExternalId: providerThreadExternalId,
      }),
      expect.objectContaining({
        id: connectedAccountId,
        workspaceId,
        handle: senderEmail,
      }),
    );
    await expect(sender.execute(input, context)).resolves.toMatchObject({
      success: true,
    });
    expect(sendDraft).toHaveBeenCalledTimes(1);
    await expect(
      approvalDataSource.getRepository(ActionExecutionReceiptEntity).find({
        where: { actionApprovalBindingId: approvalBindingId },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ state: ActionExecutionReceiptState.SENT }),
    ]);
    await expect(
      dataSource.query(
        `SELECT "status", "campaignAccountId", "messageId"
         FROM "${schemaName}"."outreachAction" WHERE "id" = $1`,
        [outreachActionId],
      ),
    ).resolves.toEqual([
      {
        status: 'APPLIED',
        campaignAccountId: null,
        messageId: expect.any(String),
      },
    ]);
  });

  it('sends and recovers linked Campaign approvals exactly once through real persistence', async () => {
    const insertLinkedAction = async (
      actionId: string,
      providerDraftExternalId: string,
    ) => {
      await dataSource.query(
        `INSERT INTO "${schemaName}"."outreachAction" (
          "id", "name", "campaignCreatorId", "channel", "status",
          "subject", "body", "contentDigest", "recipientEmail",
          "campaignAccountId", "connectedAccountId", "messageChannelId",
          "senderEmail", "senderDisplayName", "providerDraftExternalId",
          "providerThreadExternalId"
        ) VALUES (
          $1, 'Linked action', $2, 'EMAIL', 'PENDING',
          $3, $4, $5, $6, $7, $8, $9, $10, 'Linked Sender', $11, $12
        )`,
        [
          actionId,
          linkedCampaignCreatorId,
          linkedSubject,
          linkedBody,
          computeActionContentDigest(
            JSON.stringify([linkedSubject, linkedBody]),
          ),
          recipientEmail,
          linkedCampaignAccountId,
          linkedConnectedAccountId,
          linkedMessageChannelId,
          linkedSenderEmail,
          providerDraftExternalId,
          linkedProviderThreadExternalId,
        ],
      );
    };
    const createLinkedApproval = async (linkedOutreachActionId: string) => {
      const output = await createRequestApprovalTool({
        workspaceId,
        userWorkspaceId,
        threadId,
        actionDefinitions: {
          send_instagram_reply: {} as never,
          send_outreach_email: actionDefinition,
          send_myah_inbox_reply: {} as never,
        },
        actionApprovalService,
      }).execute({
        toolName: 'send_outreach_email',
        actionInput: { outreachActionId: linkedOutreachActionId },
      });
      if (!output.result || !('actionApprovalBindingId' in output.result)) {
        throw new Error('Linked approval producer did not return a binding');
      }
      await actionApprovalService.decidePendingBinding({
        workspaceId,
        userWorkspaceId,
        threadId,
        approvalBindingId: output.result.actionApprovalBindingId,
        decision: 'approved',
      });

      return output.result.actionApprovalBindingId;
    };

    await insertLinkedAction(linkedActionId, linkedProviderDraftExternalId);
    linkedApprovalBindingId = await createLinkedApproval(linkedActionId);
    await expect(
      approvalDataSource.getRepository(ActionApprovalBindingEntity).find({
        where: { workspaceId, draftId: linkedActionId },
        relations: { evidenceLinks: true },
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: linkedApprovalBindingId,
        evidenceLinks: expect.arrayContaining([
          expect.objectContaining({
            recordId: linkedCampaignAccountId,
            role: 'campaign_account',
          }),
        ]),
      }),
    ]);

    const sendsBeforeLinkedExecution = sendDraft.mock.calls.length;
    await expect(
      sender.execute(
        { actionApprovalBindingId: linkedApprovalBindingId },
        { workspaceId, userWorkspaceId, threadId },
      ),
    ).resolves.toEqual({ success: true, message: 'Outreach email accepted.' });
    expect(sendDraft).toHaveBeenCalledTimes(sendsBeforeLinkedExecution + 1);
    await expect(
      approvalDataSource
        .getRepository(ActionExecutionReceiptEntity)
        .findOneByOrFail({ actionApprovalBindingId: linkedApprovalBindingId }),
    ).resolves.toMatchObject({ state: ActionExecutionReceiptState.SENT });
    const [linkedAction] = await dataSource.query<
      { status: string; campaignAccountId: string; messageId: string }[]
    >(
      `SELECT "status", "campaignAccountId", "messageId"
       FROM "${schemaName}"."outreachAction" WHERE "id" = $1`,
      [linkedActionId],
    );
    expect(linkedAction).toEqual({
      status: 'APPLIED',
      campaignAccountId: linkedCampaignAccountId,
      messageId: expect.any(String),
    });
    await expect(
      dataSource.query(
        `SELECT COUNT(*)::int AS "count"
         FROM "${schemaName}"."message" message
         INNER JOIN "${schemaName}"."messageChannelMessageAssociation" association
           ON association."messageId" = message."id"
         WHERE message."headerMessageId" = $1
           AND association."messageChannelId" = $2`,
        [linkedProviderMessageId, linkedMessageChannelId],
      ),
    ).resolves.toEqual([{ count: 1 }]);
    await expect(
      sender.execute(
        { actionApprovalBindingId: linkedApprovalBindingId },
        { workspaceId, userWorkspaceId, threadId },
      ),
    ).resolves.toMatchObject({ success: true });
    expect(sendDraft).toHaveBeenCalledTimes(sendsBeforeLinkedExecution + 1);

    await insertLinkedAction(
      linkedRecoveryActionId,
      linkedRecoveryProviderDraftExternalId,
    );
    linkedRecoveryApprovalBindingId = await createLinkedApproval(
      linkedRecoveryActionId,
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."messageThread" ("id") VALUES ($1)`,
      [linkedRecoveryMessageThreadId],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."message" (
        "id", "headerMessageId", "messageThreadId"
      ) VALUES ($1, $2, $3)`,
      [
        linkedRecoveryMessageId,
        linkedRecoveryProviderMessageId,
        linkedRecoveryMessageThreadId,
      ],
    );
    await dataSource.query(
      `INSERT INTO "${schemaName}"."messageChannelMessageAssociation" (
        "id", "messageId", "messageChannelId", "messageExternalId",
        "messageThreadExternalId"
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        linkedRecoveryAssociationId,
        linkedRecoveryMessageId,
        linkedMessageChannelId,
        'mismatched-provider-message-id',
        linkedProviderThreadExternalId,
      ],
    );

    const sendsBeforeRecovery = sendDraft.mock.calls.length;
    await expect(
      sender.execute(
        { actionApprovalBindingId: linkedRecoveryApprovalBindingId },
        { workspaceId, userWorkspaceId, threadId },
      ),
    ).resolves.toEqual({ success: true, message: 'Outreach email accepted.' });
    expect(sendDraft).toHaveBeenCalledTimes(sendsBeforeRecovery + 1);
    await expect(
      approvalDataSource
        .getRepository(ActionExecutionReceiptEntity)
        .findOneByOrFail({
          actionApprovalBindingId: linkedRecoveryApprovalBindingId,
        }),
    ).resolves.toMatchObject({
      state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
    });

    await dataSource.query(
      `DELETE FROM "${schemaName}"."messageChannelMessageAssociation"
       WHERE "id" = $1`,
      [linkedRecoveryAssociationId],
    );
    await dataSource.query(
      `DELETE FROM "${schemaName}"."message" WHERE "id" = $1`,
      [linkedRecoveryMessageId],
    );
    await dataSource.query(
      `DELETE FROM "${schemaName}"."messageThread" WHERE "id" = $1`,
      [linkedRecoveryMessageThreadId],
    );
    await expect(
      sender.execute(
        { actionApprovalBindingId: linkedRecoveryApprovalBindingId },
        { workspaceId, userWorkspaceId, threadId },
      ),
    ).resolves.toEqual({ success: true, message: 'Outreach email accepted.' });
    expect(sendDraft).toHaveBeenCalledTimes(sendsBeforeRecovery + 1);
    await expect(
      approvalDataSource
        .getRepository(ActionExecutionReceiptEntity)
        .findOneByOrFail({
          actionApprovalBindingId: linkedRecoveryApprovalBindingId,
        }),
    ).resolves.toMatchObject({ state: ActionExecutionReceiptState.SENT });
    await expect(
      dataSource.query(
        `SELECT "status", "executionReceiptId", "messageId"
         FROM "${schemaName}"."outreachAction" WHERE "id" = $1`,
        [linkedRecoveryActionId],
      ),
    ).resolves.toEqual([
      {
        status: 'APPLIED',
        executionReceiptId: expect.any(String),
        messageId: expect.any(String),
      },
    ]);
  });
});
