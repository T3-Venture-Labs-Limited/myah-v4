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
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { SendOutreachEmailTool } from 'src/engine/core-modules/tool/tools/outreach-email-tool/send-outreach-email-tool';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { createRequestApprovalTool } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import { getMetadataFlatEntityMapsKey } from 'src/engine/metadata-modules/flat-entity/utils/get-metadata-flat-entity-maps-key.util';
import { WORKSPACE_CACHE_KEYS_V2 } from 'src/engine/workspace-cache/types/workspace-cache-key.type';
import { TWENTY_STANDARD_ALL_METADATA_NAME } from 'src/engine/workspace-manager/twenty-standard-application/constants/twenty-standard-all-metadata-name.constant';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

const legacyActionId = randomUUID();
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
): Promise<CommandResult> => {
  const child = spawn(
    process.execPath,
    [
      commandEntryPoint,
      'upgrade:2-19:resynchronize-myah-standard-application',
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
  let retainedLegacyAction: { id: string; name: string };
  let restoredColumnNames: string[];
  let legacyRowInserted = false;

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
  }, 180_000);

  afterAll(async () => {
    if (dataSource?.isInitialized && schemaName && legacyRowInserted) {
      await dataSource.query(
        `DELETE FROM "${schemaName}"."outreachAction" WHERE "id" = $1`,
        [legacyActionId],
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

  it('retains existing Outreach Action values and restores every new column', () => {
    expect(retainedLegacyAction).toEqual({
      id: legacyActionId,
      name: 'Legacy outreach action',
    });
    expect(restoredColumnNames.sort()).toEqual(
      [...outreachApprovalFieldNames].sort(),
    );
  });
});

describe('outreach email approval and send (PostgreSQL)', () => {
  const creatorId = randomUUID();
  const campaignId = randomUUID();
  const campaignCreatorId = randomUUID();
  const outreachActionId = randomUUID();
  const connectedAccountId = randomUUID();
  const messageChannelId = randomUUID();
  const threadId = randomUUID();
  const subject = 'Approved partnership subject';
  const body = 'Approved partnership body';
  const recipientEmail = 'creator@example.com';
  const senderEmail = 'sender@example.com';
  const providerDraftExternalId = 'provider-draft-integration';
  const providerThreadExternalId = 'provider-thread-integration';
  let dataSource: DataSource;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let schemaName: string;
  let userWorkspaceId: string;
  let approvalBindingId: string;
  let sender: SendOutreachEmailTool;
  let sendDraft: jest.Mock;
  let persistSentMessage: jest.Mock;
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
        "id", "name", "creatorId", "campaignId", "selectedContactMethod"
      ) VALUES ($1, 'Launch Campaign: Creator Name', $2, $3, 'EMAIL')`,
      [campaignCreatorId, creatorId, campaignId],
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

    sendDraft = jest.fn().mockResolvedValue({
      headerMessageId: '<sent@example.com>',
      messageExternalId: 'provider-message-id',
      threadExternalId: providerThreadExternalId,
    });
    persistSentMessage = jest.fn().mockResolvedValue({
      messageId: randomUUID(),
      messageThreadId: randomUUID(),
    });
    sender = new SendOutreachEmailTool(
      actionApprovalService,
      actionDefinition,
      { sendDraft } as never,
      { persistSentMessage } as never,
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
    expect(persistSentMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        subject,
        body,
        messageChannelId,
        workspaceId,
        parentThreadExternalId: providerThreadExternalId,
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
});
