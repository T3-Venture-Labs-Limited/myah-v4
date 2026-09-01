import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';

import { createClient } from 'redis';
import { DataSource } from 'typeorm';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  ConnectedAccountProvider,
  MessageChannelPendingGroupEmailsAction,
  MessageChannelSyncStage,
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
import { ActionReceiptWorkspaceProjectionWriterService } from 'src/engine/core-modules/action-approval/services/action-receipt-workspace-projection-writer.service';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { SendOutreachEmailTool } from 'src/engine/core-modules/tool/tools/outreach-email-tool/send-outreach-email-tool';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { createRequestApprovalTool } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
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
    if (outreachApprovalFieldNames.length !== 17) {
      throw new Error('MYAH-168 must own exactly 17 Outreach Action fields');
    }

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
  const threadId = randomUUID();
  const subject = 'Approved partnership subject';
  const body = 'Approved partnership body';
  const recipientEmail = 'creator@example.com';
  const senderEmail = 'sender@example.com';
  const providerDraftExternalId = 'provider-draft-integration';
  const providerThreadExternalId = 'provider-thread-integration';
  const persistedMessageId = randomUUID();
  const persistedMessageThreadId = randomUUID();
  const persistedAssociationId = randomUUID();
  const recoveryActionId = randomUUID();
  const recoveryReceiptId = randomUUID();
  const recoveryProviderMessageId = '<recovered@example.com>';
  const recoveryProviderExternalMessageId = 'recovered-provider-message-id';
  let dataSource: DataSource;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let schemaName: string;
  let userWorkspaceId: string;
  let approvalBindingId: string;
  let sender: SendOutreachEmailTool;
  let sendDraft: jest.Mock;
  let project: jest.Mock;
  let approvalDataSource: DataSource;

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
      `SELECT "id", "userId"
       FROM core."userWorkspace"
       WHERE "workspaceId" = $1
       ORDER BY "createdAt"
       LIMIT 1`,
      [workspaceId],
    );
    if (!userWorkspace) {
      throw new Error('A seeded Myah workspace member is required');
    }
    userWorkspaceId = userWorkspace.id;

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
        "type", "pendingGroupEmailsAction", "syncStage"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        messageChannelId,
        workspaceId,
        connectedAccountId,
        senderEmail,
        MessageChannelVisibility.SHARE_EVERYTHING,
        MessageChannelType.EMAIL,
        MessageChannelPendingGroupEmailsAction.NONE,
        MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
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

    const workspaceRepositories = {
      outreachAction: {
        findOneBy: async ({ id }: { id: string }) =>
          (
            await dataSource.query(
              `SELECT * FROM "${schemaName}"."outreachAction" WHERE "id" = $1`,
              [id],
            )
          )[0] ?? null,
        update: async (
          criteria: {
            id: string;
            subject: string;
            body: string;
            contentDigest: string;
            recipientEmail: string;
            connectedAccountId: string;
            messageChannelId: string;
            senderEmail: string;
            senderDisplayName: string;
            providerDraftExternalId: string;
            providerThreadExternalId: string | null;
          },
          values: { approvalBindingId: string },
        ) => {
          const [{ affected }] = await dataSource.query<{ affected: number }[]>(
            `WITH updated AS (
               UPDATE "${schemaName}"."outreachAction"
               SET "approvalBindingId" = $2
               WHERE "id" = $1
                 AND "channel" = 'EMAIL'
                 AND "status" = 'PENDING'
                 AND "subject" = $3
                 AND "body" = $4
                 AND "contentDigest" = $5
                 AND "recipientEmail" = $6
                 AND "connectedAccountId" = $7
                 AND "messageChannelId" = $8
                 AND "senderEmail" = $9
                 AND "senderDisplayName" = $10
                 AND "providerDraftExternalId" = $11
                 AND "providerThreadExternalId" IS NOT DISTINCT FROM $12
                 AND "messageThreadId" IS NULL
                 AND "inReplyTo" IS NULL
                 AND "approvalBindingId" IS NULL
                 AND "executionReceiptId" IS NULL
                 AND "completedAt" IS NULL
               RETURNING 1
             )
             SELECT COUNT(*)::int AS "affected" FROM updated`,
            [
              criteria.id,
              values.approvalBindingId,
              criteria.subject,
              criteria.body,
              criteria.contentDigest,
              criteria.recipientEmail,
              criteria.connectedAccountId,
              criteria.messageChannelId,
              criteria.senderEmail,
              criteria.senderDisplayName,
              criteria.providerDraftExternalId,
              criteria.providerThreadExternalId,
            ],
          );

          return { affected };
        },
      },
      campaignCreator: {
        findOneBy: async ({ id }: { id: string }) =>
          (
            await dataSource.query(
              `SELECT * FROM "${schemaName}"."campaignCreator" WHERE "id" = $1`,
              [id],
            )
          )[0] ?? null,
      },
      creator: {
        findOneBy: async ({ id }: { id: string }) =>
          (
            await dataSource.query(
              `SELECT * FROM "${schemaName}"."creator" WHERE "id" = $1`,
              [id],
            )
          )[0] ?? null,
      },
      campaign: {
        findOneBy: async ({ id }: { id: string }) =>
          (
            await dataSource.query(
              `SELECT * FROM "${schemaName}"."campaign" WHERE "id" = $1`,
              [id],
            )
          )[0] ?? null,
      },
      message: { find: async () => [] },
      messageChannelMessageAssociation: { find: async () => [] },
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: async (operation: () => unknown) =>
        operation(),
      getRepository: async (
        requestedWorkspaceId: string,
        objectName: keyof typeof workspaceRepositories,
      ) => {
        if (requestedWorkspaceId !== workspaceId) {
          throw new Error('Workspace isolation violation');
        }

        return workspaceRepositories[objectName];
      },
    };
    const workspaceRepository = {
      findOneBy: async ({ id }: { id: string }) =>
        (
          await dataSource.query(
            `SELECT * FROM core."workspace" WHERE "id" = $1`,
            [id],
          )
        )[0] ?? null,
    };
    const objectMetadataRepository = {
      find: async () =>
        dataSource.query(
          `SELECT *
           FROM core."objectMetadata"
           WHERE "workspaceId" = $1
             AND "universalIdentifier" = ANY($2::uuid[])`,
          [
            workspaceId,
            [
              MYAH_STANDARD_OBJECTS.outreachAction.universalIdentifier,
              MYAH_STANDARD_OBJECTS.campaignCreator.universalIdentifier,
              MYAH_STANDARD_OBJECTS.creator.universalIdentifier,
              MYAH_STANDARD_OBJECTS.campaign.universalIdentifier,
              '20202020-3f6b-4425-80ab-e468899ab4b2',
            ],
          ],
        ),
    };
    const userWorkspaceRepository = {
      findOne: async () => ({
        id: userWorkspace.id,
        workspaceId,
        user: { id: userWorkspace.userId },
      }),
    };
    const connectedAccountRepository = {
      findOne: async () =>
        (
          await dataSource.query(
            `SELECT * FROM core."connectedAccount"
             WHERE "id" = $1 AND "workspaceId" = $2 AND "archivedAt" IS NULL`,
            [connectedAccountId, workspaceId],
          )
        )[0] ?? null,
    };
    const messageChannelRepository = {
      find: async () =>
        dataSource.query(
          `SELECT * FROM core."messageChannel"
           WHERE "id" = $1 AND "workspaceId" = $2
             AND "connectedAccountId" = $3`,
          [messageChannelId, workspaceId, connectedAccountId],
        ),
    };
    const workspaceMemberId = randomUUID();

    const actionDefinition = new OutreachEmailActionDefinition(
      workspaceRepository as never,
      globalWorkspaceOrmManager as never,
      objectMetadataRepository as never,
      userWorkspaceRepository as never,
      {
        getOrRecompute: async () => ({
          flatWorkspaceMemberMaps: {
            idByUserId: { [userWorkspace.userId]: workspaceMemberId },
            byId: { [workspaceMemberId]: { id: workspaceMemberId } },
          },
        }),
      } as never,
      connectedAccountRepository as never,
      messageChannelRepository as never,
      {
        assertEligible: async () => ({
          id: managedMailboxId,
          connectedAccountId,
          messageChannelId,
          effectiveDailyCap: 1,
        }),
      } as never,
    );
    project = jest.fn().mockResolvedValue(undefined);
    const projector = new ActionReceiptProjectorService(
      approvalDataSource.getRepository(ActionExecutionReceiptEntity),
      { project },
    );
    const actionApprovalService = new ActionApprovalService(
      approvalDataSource,
      projector,
    );
    const approvalOutput = await createRequestApprovalTool({
      workspaceId,
      userWorkspaceId,
      threadId,
      actionDefinitions: {
        send_instagram_reply: {} as never,
        send_outreach_email: actionDefinition,
      },
      actionApprovalService,
    }).execute({
      toolName: 'send_outreach_email',
      actionInput: { outreachActionId },
    });
    if (
      !approvalOutput.result ||
      approvalOutput.result.status !== 'pending' ||
      !('actionApprovalBindingId' in approvalOutput.result)
    ) {
      throw new Error('Email approval producer did not return a binding');
    }
    approvalBindingId = approvalOutput.result.actionApprovalBindingId;
    const [boundAction] = await dataSource.query<
      { approvalBindingId: string | null }[]
    >(
      `SELECT "approvalBindingId"
       FROM "${schemaName}"."outreachAction"
       WHERE "id" = $1`,
      [outreachActionId],
    );

    expect(boundAction).toEqual({ approvalBindingId });

    sendDraft = jest.fn().mockResolvedValue({
      headerMessageId: '<sent@example.com>',
      messageExternalId: 'provider-message-id',
      threadExternalId: providerThreadExternalId,
    });
    sender = new SendOutreachEmailTool(
      actionApprovalService,
      actionDefinition,
      { sendDraft } as never,
      projector,
    );
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized || !workspaceId) {
      return;
    }
    await dataSource.query(
      `DELETE FROM core."actionExecutionReceipt"
       WHERE "actionApprovalBindingId" IN (
         SELECT "id" FROM core."actionApprovalBinding"
         WHERE "workspaceId" = $1 AND "draftId" = $2
       )`,
      [workspaceId, outreachActionId],
    );
    await dataSource.query(
      `DELETE FROM core."actionApprovalBinding"
       WHERE "workspaceId" = $1 AND "draftId" = $2`,
      [workspaceId, outreachActionId],
    );
    if (schemaName) {
      await dataSource.query(
        `DELETE FROM "${schemaName}"."timelineActivity" WHERE "id" = $1`,
        [recoveryReceiptId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."messageChannelMessageAssociation"
         WHERE "id" = $1`,
        [persistedAssociationId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."message" WHERE "id" = $1`,
        [persistedMessageId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."messageThread" WHERE "id" = $1`,
        [persistedMessageThreadId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."outreachAction" WHERE "id" = $1`,
        [recoveryActionId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."outreachAction" WHERE "id" = $1`,
        [outreachActionId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."campaignCreator" WHERE "id" = $1`,
        [campaignCreatorId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."creator" WHERE "id" = $1`,
        [creatorId],
      );
      await dataSource.query(
        `DELETE FROM "${schemaName}"."campaign" WHERE "id" = $1`,
        [campaignId],
      );
    }
    await dataSource.query(
      `DELETE FROM core."messageChannel" WHERE "id" = $1`,
      [messageChannelId],
    );
    await dataSource.query(
      `DELETE FROM core."connectedAccount" WHERE "id" = $1`,
      [connectedAccountId],
    );
    if (approvalDataSource?.isInitialized) {
      await approvalDataSource.destroy();
    }
  });

  it('requires approval and sends the exact prepared email once in its workspace', async () => {
    const input = { actionApprovalBindingId: approvalBindingId };
    const context = { workspaceId, userWorkspaceId, threadId };

    await expect(sender.execute(input, context)).resolves.toMatchObject({
      success: false,
    });
    expect(sendDraft).not.toHaveBeenCalled();

    const actionApprovalService = new ActionApprovalService(
      approvalDataSource,
      new ActionReceiptProjectorService(
        approvalDataSource.getRepository(ActionExecutionReceiptEntity),
        { project },
      ),
    );
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
      {
        to: [recipientEmail],
        subject,
        body,
        html: body,
        attachments: [],
        inReplyTo: undefined,
        threadExternalId: providerThreadExternalId,
      },
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
    expect(project).toHaveBeenCalledTimes(1);
    await expect(
      approvalDataSource.getRepository(ActionExecutionReceiptEntity).find({
        where: { actionApprovalBindingId: approvalBindingId },
      }),
    ).resolves.toEqual([
      expect.objectContaining({ state: ActionExecutionReceiptState.SENT }),
    ]);
  });

  it('replays accepted Message persistence and projection without a provider send', async () => {
    const recoverySubject = 'Recovered partnership subject';
    const recoveryBody = 'Recovered partnership body';
    const recoveryContentDigest = computeActionContentDigest(
      JSON.stringify([recoverySubject, recoveryBody]),
    );

    await dataSource.query(
      `INSERT INTO "${schemaName}"."outreachAction" (
        "id", "name", "campaignCreatorId", "channel", "status",
        "subject", "body", "contentDigest", "recipientEmail",
        "connectedAccountId", "messageChannelId", "senderEmail",
        "senderDisplayName", "providerDraftExternalId",
        "providerThreadExternalId"
      ) VALUES (
        $1, 'Recovery action', $2, 'EMAIL', 'PENDING',
        $3, $4, $5, $6, $7, $8, $9, 'Approved Sender',
        'provider-draft-recovery', $10
      )`,
      [
        recoveryActionId,
        campaignCreatorId,
        recoverySubject,
        recoveryBody,
        recoveryContentDigest,
        recipientEmail,
        connectedAccountId,
        messageChannelId,
        senderEmail,
        providerThreadExternalId,
      ],
    );
    const connectedAccountRepository = {
      findOne: async () =>
        (
          await dataSource.query(
            `SELECT * FROM core."connectedAccount"
             WHERE "id" = $1 AND "workspaceId" = $2 AND "archivedAt" IS NULL`,
            [connectedAccountId, workspaceId],
          )
        )[0] ?? null,
    };
    const recoverPersistence = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(async () => {
        await dataSource.query(
          `INSERT INTO "${schemaName}"."messageThread" ("id") VALUES ($1)`,
          [persistedMessageThreadId],
        );
        await dataSource.query(
          `INSERT INTO "${schemaName}"."message" (
            "id", "headerMessageId", "messageThreadId"
          ) VALUES ($1, $2, $3)`,
          [
            persistedMessageId,
            recoveryProviderMessageId,
            persistedMessageThreadId,
          ],
        );
        await dataSource.query(
          `INSERT INTO "${schemaName}"."messageChannelMessageAssociation" (
            "id", "messageId", "messageChannelId",
            "messageExternalId", "messageThreadExternalId"
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            persistedAssociationId,
            persistedMessageId,
            messageChannelId,
            recoveryProviderExternalMessageId,
            providerThreadExternalId,
          ],
        );

        return {
          messageId: persistedMessageId,
          messageThreadId: persistedMessageThreadId,
        };
      });
    const writer = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource,
      connectedAccountRepository as never,
      { persistSentMessage: recoverPersistence } as never,
      {} as never,
    );
    const projection = {
      receiptId: recoveryReceiptId,
      workspaceId,
      draftId: recoveryActionId,
      actionVersion: 1,
      threadId: recoveryActionId,
      initiatorUserWorkspaceId: userWorkspaceId,
      contentDigest: recoveryContentDigest,
      actionName: 'send_outreach_email',
      providerMessageId: recoveryProviderMessageId,
      providerExternalMessageId: recoveryProviderExternalMessageId,
      providerThreadExternalId,
      recipientFingerprint: computeActionContentDigest(
        JSON.stringify([recipientEmail]),
      ),
      sendingAccountFingerprint: computeActionContentDigest(
        JSON.stringify([
          connectedAccountId,
          messageChannelId,
          senderEmail,
          'Approved Sender',
        ]),
      ),
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([null, null, providerThreadExternalId]),
      ),
      evidenceLinks: [
        {
          objectMetadataId: randomUUID(),
          recordId: campaignCreatorId,
          role: 'campaign_creator',
        },
        {
          objectMetadataId: randomUUID(),
          recordId: creatorId,
          role: 'creator',
        },
        {
          objectMetadataId: randomUUID(),
          recordId: campaignId,
          role: 'campaign',
        },
      ],
    } as const;

    await expect(writer.project(projection)).rejects.toThrow(
      'The sent outreach Message is unavailable for projection',
    );
    await expect(
      Promise.all([writer.project(projection), writer.project(projection)]),
    ).resolves.toEqual([undefined, undefined]);
    await expect(writer.project(projection)).resolves.toBeUndefined();

    expect(recoverPersistence).toHaveBeenCalledTimes(2);
    expect(recoverPersistence).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sendResult: {
          headerMessageId: recoveryProviderMessageId,
          messageExternalId: recoveryProviderExternalMessageId,
          threadExternalId: providerThreadExternalId,
        },
      }),
    );
    const [projectedAction] = await dataSource.query<
      {
        status: string;
        executionReceiptId: string | null;
        messageId: string | null;
        providerMessageExternalId: string | null;
      }[]
    >(
      `SELECT "status", "executionReceiptId", "messageId",
              "providerMessageExternalId"
       FROM "${schemaName}"."outreachAction"
       WHERE "id" = $1`,
      [recoveryActionId],
    );
    expect(projectedAction).toEqual({
      status: 'APPLIED',
      executionReceiptId: recoveryReceiptId,
      messageId: persistedMessageId,
      providerMessageExternalId: recoveryProviderExternalMessageId,
    });
    await expect(
      dataSource.query(
        `SELECT "id", "linkedRecordId", "linkedObjectMetadataId"
         FROM "${schemaName}"."timelineActivity"
         WHERE "id" = $1`,
        [recoveryReceiptId],
      ),
    ).resolves.toEqual([
      {
        id: recoveryReceiptId,
        linkedRecordId: campaignCreatorId,
        linkedObjectMetadataId: expect.any(String),
      },
    ]);
  });
});
