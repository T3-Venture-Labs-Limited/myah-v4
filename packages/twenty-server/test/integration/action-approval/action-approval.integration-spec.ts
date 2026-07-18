import { DataSource } from 'typeorm';

import { EvolveInstagramApprovalToActionAuthorityFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-19/2-19-instance-command-fast-1784112963058-evolve-instagram-approval-to-action-authority';
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
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { SEED_EMPTY_WORKSPACE_3_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { InstagramReplyActionDefinition } from 'src/engine/core-modules/action-approval/definitions/instagram-reply-action.definition';
import { InstagramReplyDraftService } from 'src/engine/core-modules/instagram-reply/services/instagram-reply-draft.service';
import { SendInstagramReplyTool } from 'src/engine/core-modules/tool/tools/instagram-tool/send-instagram-reply-tool';
import { AgentChatService } from 'src/engine/metadata-modules/ai/ai-chat/services/agent-chat.service';
import { createRequestApprovalTool } from 'src/engine/metadata-modules/ai/ai-chat/tools/request-approval.tool';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { createWorkspace } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-workspace.util';

jest.mock(
  'src/engine/core-modules/code-interpreter/code-interpreter.service',
  () => ({ CodeInterpreterService: class CodeInterpreterService {} }),
);

const workspaceId = SEED_EMPTY_WORKSPACE_3_ID;
const workspaceCustomApplicationId = '90000000-0000-4000-8000-000000000001';
const bindingId = '90000000-0000-4000-8000-000000000002';
const draftId = '90000000-0000-4000-8000-000000000003';
const threadId = '90000000-0000-4000-8000-000000000004';
const initiatorUserWorkspaceId = '90000000-0000-4000-8000-000000000005';
const objectMetadataId = '90000000-0000-4000-8000-000000000006';
const recordId = '90000000-0000-4000-8000-000000000007';
const projectionWorkspaceId = workspaceId;
const projectionBindingId = '90000000-0000-4000-8000-000000000010';
const projectionReceiptId = '90000000-0000-4000-8000-000000000011';
const projectionDraftId = '90000000-0000-4000-8000-000000000012';
const projectionConversationId = '90000000-0000-4000-8000-000000000014';
const projectionSchemaName = getWorkspaceSchemaName(projectionWorkspaceId);
const integrationAccountId = '90000000-0000-4000-8000-000000000013';
const integrationConnectedAccountId = 'integration-connected-account';
const integrationRecipientIgsid = 'integration-recipient-igsid';
const integrationRecipientLabel = '@integration-recipient';
const integrationProviderConversationId = 'integration-provider-conversation';
const integrationInboundMessageId = 'integration-inbound-message-id';
const integrationInboundReceivedAt = new Date(Date.now() - 60_000);

const expectedBinding = {
  workspaceId,
  actionName: 'send_instagram_reply' as const,
  actionVersion: 1 as const,
  draftId,
  contentDigest: computeActionContentDigest('  Cafe\u0301\r\n  '),
  recipientFingerprint: 'a'.repeat(64),
  sendingAccountFingerprint: 'b'.repeat(64),
  inboundMessageId: integrationInboundMessageId,
  inboundSenderIgsid: integrationRecipientIgsid,
  inboundDirection: 'INBOUND' as const,
  inboundReceivedAt: integrationInboundReceivedAt,
  threadId,
  initiatorUserWorkspaceId,
  evidenceLinks: [{ objectMetadataId, recordId, role: 'recipient' }],
};

describe('ActionApprovalService (PostgreSQL)', () => {
  let dataSource: DataSource;
  let service: ActionApprovalService;

  const clearIntegrationWorkspaceGraph = async () => {
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahSocialMessage"
        WHERE "conversationId" IN (
          SELECT "id"
          FROM "${projectionSchemaName}"."_myahSocialConversation"
          WHERE "instagramAccountId" = $1
        )`,
      [integrationAccountId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahInstagramReplyDraft"
        WHERE "conversationId" IN (
          SELECT "id"
          FROM "${projectionSchemaName}"."_myahSocialConversation"
          WHERE "instagramAccountId" = $1
        )`,
      [integrationAccountId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahSocialConversation"
        WHERE "instagramAccountId" = $1`,
      [integrationAccountId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahInstagramAccount"
        WHERE "id" = $1`,
      [integrationAccountId],
    );
  };

  const hasResolvedBindingPayload = (
    value: unknown,
  ): value is { status: string; actionApprovalBindingId: string } =>
    Boolean(
      value &&
      typeof value === 'object' &&
      'status' in value &&
      typeof value.status === 'string' &&
      'actionApprovalBindingId' in value &&
      typeof value.actionApprovalBindingId === 'string',
    );

  const prepareApprovedSender = async () => {
    const workspaceRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }),
    };
    const draftRepository = {
      findOneBy: async ({ id }: { id: string }) => {
        const [draft] = await dataSource.query(
          `SELECT * FROM "${projectionSchemaName}"."_myahInstagramReplyDraft"
           WHERE "id" = $1`,
          [id],
        );

        return draft ?? null;
      },
    };
    const conversationRepository = {
      findOneBy: async ({ id }: { id: string }) => {
        const [conversation] = await dataSource.query(
          `SELECT * FROM "${projectionSchemaName}"."_myahSocialConversation"
           WHERE "id" = $1`,
          [id],
        );

        return conversation ?? null;
      },
    };
    const accountRepository = {
      findOneBy: async ({ id }: { id: string }) => {
        const [account] = await dataSource.query(
          `SELECT * FROM "${projectionSchemaName}"."_myahInstagramAccount"
           WHERE "id" = $1`,
          [id],
        );

        return account ?? null;
      },
      find: async () =>
        dataSource.query(
          `SELECT * FROM "${projectionSchemaName}"."_myahInstagramAccount"
           WHERE "status" = 'ACTIVE'`,
        ),
    };
    const socialMessageRepository = {
      find: async ({
        where: { id, conversationId, providerMessageId },
      }: {
        where: {
          id: string;
          conversationId: string;
          providerMessageId: string;
        };
      }) =>
        dataSource.query(
          `SELECT * FROM "${projectionSchemaName}"."_myahSocialMessage"
           WHERE "id" = $1
             AND "conversationId" = $2
             AND "providerMessageId" = $3
             AND "direction" = 'INBOUND'`,
          [id, conversationId, providerMessageId],
        ),
    };
    const globalWorkspaceOrmManager = {
      executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
        callback(),
      ),
      getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue(dataSource),
      getRepository: jest.fn(
        async (_workspaceId: string, objectName: string) => {
          switch (objectName) {
            case 'myahInstagramReplyDraft':
              return draftRepository;
            case 'myahSocialConversation':
              return conversationRepository;
            case 'myahInstagramAccount':
              return accountRepository;
            case 'myahSocialMessage':
              return socialMessageRepository;
            default:
              throw new Error(`Unexpected workspace repository: ${objectName}`);
          }
        },
      ),
    };
    const objectMetadataRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: '90000000-0000-4000-8000-000000000015',
          universalIdentifier: '85762d24-541b-407f-9d6a-cdf89552c665',
        },
        {
          id: '90000000-0000-4000-8000-000000000016',
          universalIdentifier: '36817464-855f-42db-9fbb-f8853643f8d6',
        },
        {
          id: '90000000-0000-4000-8000-000000000018',
          universalIdentifier: '7241bd44-e474-4904-8636-339276b3feff',
        },
        {
          id: '90000000-0000-4000-8000-000000000017',
          universalIdentifier: '2d357469-831a-4629-ad4b-47335900e883',
        },
      ]),
    };
    const userWorkspaceRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: initiatorUserWorkspaceId,
        workspaceId,
        user: { id: 'integration-user-id' },
      }),
    };
    const workspaceCacheService = {
      getOrRecompute: jest.fn().mockResolvedValue({
        flatWorkspaceMemberMaps: {
          idByUserId: { 'integration-user-id': 'integration-member-id' },
          byId: { 'integration-member-id': { id: 'integration-member-id' } },
        },
      }),
    };
    const providerCalls = jest.fn(async ({ toolSlug }: { toolSlug: string }) =>
      toolSlug === 'INSTAGRAM_LIST_ALL_MESSAGES'
        ? {
            kind: 'success' as const,
            data: {
              data: [
                {
                  id: integrationInboundMessageId,
                  message: 'Integration inbound message',
                  direction: 'INBOUND',
                  from: { id: integrationRecipientIgsid },
                  to: { data: [{ id: 'integration-sending-account-igsid' }] },
                  created_time: integrationInboundReceivedAt.toISOString(),
                },
              ],
            },
          }
        : {
            kind: 'success' as const,
            data: { message_id: 'provider-message-id' },
          },
    );
    const myahComposioService = {
      getActiveInstagramAccount: jest.fn().mockResolvedValue({
        connectedAccountId: integrationConnectedAccountId,
        composioUserId: `workspace:${workspaceId}:instagram`,
      }),
      executeInstagramTool: providerCalls,
    };
    const actionDefinition = new InstagramReplyActionDefinition(
      workspaceRepository as never,
      globalWorkspaceOrmManager as never,
      objectMetadataRepository as never,
      userWorkspaceRepository as never,
      workspaceCacheService as never,
    );
    const draftService = new InstagramReplyDraftService(
      workspaceRepository as never,
      globalWorkspaceOrmManager as never,
      myahComposioService as never,
    );
    const sender = new SendInstagramReplyTool(
      service,
      actionDefinition,
      {
        getActiveInstagramAccount: jest.fn().mockResolvedValue({
          connectedAccountId: integrationConnectedAccountId,
          composioUserId: `workspace:${workspaceId}:instagram`,
        }),
        executeInstagramTool: providerCalls,
      } as never,
      new ActionReceiptProjectorService(
        dataSource.getRepository(ActionExecutionReceiptEntity),
        new ActionReceiptWorkspaceProjectionWriterService(dataSource),
      ),
    );

    await dataSource.query(
      `INSERT INTO "${projectionSchemaName}"."_myahInstagramAccount" (
        "id", "name", "label", "connectedAccountId", "composioUserId", "igUserId", "status"
      ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
      [
        integrationAccountId,
        'Integration account',
        '@integration-account',
        integrationConnectedAccountId,
        `workspace:${workspaceId}:instagram`,
        'integration-sending-account-igsid',
      ],
    );
    const prepared = await draftService.prepare({
      workspaceId,
      userWorkspaceId: initiatorUserWorkspaceId,
      connectedAccountId: integrationConnectedAccountId,
      providerConversationId: integrationProviderConversationId,
      recipientIgsid: integrationRecipientIgsid,
      recipientLabel: integrationRecipientLabel,
      body: 'A real approved reply.',
      inboundMessageId: integrationInboundMessageId,
    });
    const pendingOutput = await createRequestApprovalTool({
      workspaceId,
      userWorkspaceId: initiatorUserWorkspaceId,
      threadId,
      actionDefinition,
      actionApprovalService: service,
    }).execute({
      toolName: 'send_instagram_reply',
      actionInput: { draftId: prepared.draftId },
    });
    if (!hasResolvedBindingPayload(pendingOutput.result)) {
      throw new Error('The registered producer did not return a binding ID.');
    }
    const pendingBindingId = pendingOutput.result.actionApprovalBindingId;
    const threadRepository = {
      findOne: jest.fn().mockResolvedValue({ id: threadId }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      withManager: jest.fn(),
    };
    threadRepository.withManager.mockReturnValue(threadRepository);
    const messagePartRepository = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      withManager: jest.fn(),
    };
    messagePartRepository.withManager.mockReturnValue(messagePartRepository);
    const messageRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'integration-message-id',
        turnId: 'integration-turn-id',
        parts: [
          {
            id: 'integration-part-id',
            toolName: 'request_approval',
            toolOutput: pendingOutput,
          },
        ],
      }),
      withManager: jest.fn(),
    };
    messageRepository.withManager.mockReturnValue(messageRepository);
    const decisionRouter = new AgentChatService(
      threadRepository as never,
      {} as never,
      messageRepository as never,
      messagePartRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      service,
    );
    await decisionRouter.resolvePendingApproval({
      workspaceId,
      userWorkspaceId: initiatorUserWorkspaceId,
      threadId,
      messageId: 'integration-message-id',
      streamId: 'integration-stream-id',
      decision: { decision: 'approved' },
    });
    const transactionManager = threadRepository.withManager.mock.calls[0][0];
    expect(transactionManager).toBeDefined();
    expect(messageRepository.withManager).toHaveBeenCalledWith(
      transactionManager,
    );
    expect(messagePartRepository.withManager).toHaveBeenCalledWith(
      transactionManager,
    );
    const persistedOutput =
      messagePartRepository.update.mock.calls[
        messagePartRepository.update.mock.calls.length - 1
      ][2].toolOutput;
    const senderPayload = {
      status: 'resolved' as const,
      actionApprovalBindingId: pendingBindingId,
    };
    expect(persistedOutput).toEqual({ result: senderPayload });

    return {
      actionDefinition,
      prepared,
      pendingBindingId,
      providerCalls,
      sender,
      senderPayload,
    };
  };

  beforeAll(async () => {
    dataSource = new DataSource({
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
    await dataSource.initialize();
    const workspaceQueryRunner = dataSource.createQueryRunner();

    await workspaceQueryRunner.connect();
    await workspaceQueryRunner.startTransaction();
    try {
      await createWorkspace({
        queryRunner: workspaceQueryRunner,
        schemaName: 'core',
        createWorkspaceInput: {
          id: workspaceId,
          displayName: 'Action approval integration',
          subdomain: 'action-approval-integration',
          inviteHash: 'action-approval-integration.dev-invite-hash',
          logo: '',
          activationStatus: WorkspaceActivationStatus.PENDING_CREATION,
          isTwoFactorAuthenticationEnforced: false,
          workspaceCustomApplicationId,
        },
      });
      await workspaceQueryRunner.query(
        `INSERT INTO core."application" (
          "id",
          "universalIdentifier",
          "name",
          "sourcePath",
          "workspaceId"
        )
        VALUES ($1, $1, 'action-approval-integration', '', $2)
        ON CONFLICT ("id") DO NOTHING`,
        [workspaceCustomApplicationId, workspaceId],
      );
      await workspaceQueryRunner.commitTransaction();
    } catch (error) {
      await workspaceQueryRunner.rollbackTransaction();
      throw error;
    } finally {
      await workspaceQueryRunner.release();
    }

    const [{ exists }] = await dataSource.query<{ exists: boolean }[]>(
      `SELECT to_regclass('core."actionApprovalBinding"') IS NOT NULL AS "exists"`,
    );
    if (!exists) {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await new EvolveInstagramApprovalToActionAuthorityFastInstanceCommand().up(
          queryRunner,
        );
      } finally {
        await queryRunner.release();
      }
    }

    const projectionWriter = new ActionReceiptWorkspaceProjectionWriterService(
      dataSource,
    );
    service = new ActionApprovalService(
      dataSource,
      new ActionReceiptProjectorService(
        dataSource.getRepository(ActionExecutionReceiptEntity),
        projectionWriter,
      ),
    );
    await dataSource.query(
      `CREATE SCHEMA IF NOT EXISTS "${projectionSchemaName}"`,
    );
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${projectionSchemaName}"."_myahInstagramAccount" (
        "id" uuid PRIMARY KEY,
        "name" varchar NOT NULL DEFAULT '',
        "label" varchar,
        "connectedAccountId" varchar NOT NULL,
        "composioUserId" varchar NOT NULL,
        "igUserId" varchar,
        "status" varchar NOT NULL DEFAULT 'ACTIVE',
        "deletedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT NOW(),
        "updatedAt" timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${projectionSchemaName}"."_myahSocialConversation" (
        "id" uuid PRIMARY KEY,
        "name" varchar NOT NULL DEFAULT '',
        "label" varchar,
        "providerConversationId" varchar NOT NULL,
        "recipientIgsid" varchar NOT NULL,
        "instagramAccountId" uuid NOT NULL,
        "deletedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT NOW(),
        "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
        "createdBySource" varchar,
        "createdByWorkspaceMemberId" uuid,
        "createdByName" varchar,
        "createdByContext" jsonb,
        "updatedBySource" varchar,
        "updatedByWorkspaceMemberId" uuid,
        "updatedByName" varchar,
        "updatedByContext" jsonb
      )
    `);
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${projectionSchemaName}"."_myahInstagramReplyDraft" (
        "id" uuid PRIMARY KEY,
        "name" varchar,
        "title" varchar,
        "body" text NOT NULL,
        "conversationId" uuid,
        "inboundMessageRecordId" uuid,
        "inboundProviderMessageId" varchar,
        "status" varchar NOT NULL,
        "source" varchar,
        "generatedAt" timestamptz,
        "sentAt" timestamptz,
        "deletedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT NOW(),
        "updatedAt" timestamptz NOT NULL DEFAULT NOW(),
        "createdBySource" varchar,
        "createdByWorkspaceMemberId" uuid,
        "createdByName" varchar,
        "createdByContext" jsonb,
        "updatedBySource" varchar,
        "updatedByWorkspaceMemberId" uuid,
        "updatedByName" varchar,
        "updatedByContext" jsonb
      )
    `);
    await dataSource.query(`
      CREATE TABLE IF NOT EXISTS "${projectionSchemaName}"."_myahSocialMessage" (
        "id" uuid PRIMARY KEY,
        "text" text NOT NULL,
        "conversationId" uuid,
        "direction" varchar NOT NULL,
        "sentVia" varchar NOT NULL,
        "providerMessageId" varchar,
        "providerCreatedAt" timestamptz,
        "deletedAt" timestamptz,
        "createdAt" timestamptz NOT NULL,
        "updatedAt" timestamptz NOT NULL,
        "createdBySource" varchar NOT NULL,
        "createdByWorkspaceMemberId" uuid,
        "createdByName" varchar NOT NULL,
        "createdByContext" jsonb NOT NULL,
        "updatedBySource" varchar NOT NULL,
        "updatedByWorkspaceMemberId" uuid,
        "updatedByName" varchar NOT NULL,
        "updatedByContext" jsonb NOT NULL
      )
    `);
    await dataSource.query(`
      ALTER TABLE "${projectionSchemaName}"."_myahInstagramReplyDraft"
        ADD COLUMN IF NOT EXISTS "name" varchar,
        ADD COLUMN IF NOT EXISTS "title" varchar,
        ADD COLUMN IF NOT EXISTS "conversationId" uuid,
        ADD COLUMN IF NOT EXISTS "source" varchar,
        ADD COLUMN IF NOT EXISTS "generatedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS "createdBySource" varchar,
        ADD COLUMN IF NOT EXISTS "inboundMessageRecordId" uuid,
        ADD COLUMN IF NOT EXISTS "inboundProviderMessageId" varchar,
        ADD COLUMN IF NOT EXISTS "createdByWorkspaceMemberId" uuid,
        ADD COLUMN IF NOT EXISTS "createdByName" varchar,
        ADD COLUMN IF NOT EXISTS "createdByContext" jsonb,
        ADD COLUMN IF NOT EXISTS "updatedBySource" varchar,
        ADD COLUMN IF NOT EXISTS "updatedByWorkspaceMemberId" uuid,
        ADD COLUMN IF NOT EXISTS "updatedByName" varchar,
        ADD COLUMN IF NOT EXISTS "updatedByContext" jsonb
    `);
    await dataSource.query(`
      ALTER TABLE "${projectionSchemaName}"."_myahInstagramAccount"
        ADD COLUMN IF NOT EXISTS "igUserId" varchar
    `);
    await dataSource.query(`
      ALTER TABLE "${projectionSchemaName}"."_myahSocialMessage"
        ADD COLUMN IF NOT EXISTS "conversationId" uuid,
        ADD COLUMN IF NOT EXISTS "providerMessageId" varchar,
        ADD COLUMN IF NOT EXISTS "providerCreatedAt" timestamptz,
        ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz
    `);
  });

  afterAll(async () => {
    await dataSource.query(
      'DELETE FROM core."actionExecutionReceipt" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await dataSource.query(
      'DELETE FROM core."actionApprovalBinding" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahSocialMessage"
      WHERE "createdByContext" ->> 'actionReceiptId' = $1`,
      [projectionReceiptId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahInstagramReplyDraft" WHERE "id" = $1`,
      [projectionDraftId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahSocialConversation" WHERE "id" = $1`,
      [projectionConversationId],
    );
    await clearIntegrationWorkspaceGraph();
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(
      'DELETE FROM core."actionExecutionReceipt" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await dataSource.query(
      'DELETE FROM core."actionApprovalBinding" WHERE "workspaceId" = $1',
      [workspaceId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahSocialMessage"
      WHERE "createdByContext" ->> 'actionReceiptId' = $1`,
      [projectionReceiptId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahInstagramReplyDraft" WHERE "id" = $1`,
      [projectionDraftId],
    );
    await dataSource.query(
      `DELETE FROM "${projectionSchemaName}"."_myahSocialConversation" WHERE "id" = $1`,
      [projectionConversationId],
    );
    await clearIntegrationWorkspaceGraph();
    await dataSource.getRepository(ActionApprovalBindingEntity).save({
      id: bindingId,
      workspaceId,
      initiatorUserWorkspaceId,
      actionName: expectedBinding.actionName,
      actionVersion: expectedBinding.actionVersion,
      draftId,
      contentDigest: expectedBinding.contentDigest,
      recipientFingerprint: expectedBinding.recipientFingerprint,
      sendingAccountFingerprint: expectedBinding.sendingAccountFingerprint,
      inboundMessageId: expectedBinding.inboundMessageId,
      inboundSenderIgsid: expectedBinding.inboundSenderIgsid,
      inboundDirection: expectedBinding.inboundDirection,
      inboundReceivedAt: expectedBinding.inboundReceivedAt,
      threadId,
      state: ActionApprovalBindingState.APPROVED,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    await dataSource
      .getRepository(ActionApprovalBindingEvidenceLinkEntity)
      .save({
        actionApprovalBindingId: bindingId,
        objectMetadataId,
        recordId,
        role: 'recipient',
      });
  });

  it('atomically consumes one approved binding and returns one receipt under concurrent reservation', async () => {
    const [first, second] = await Promise.all([
      service.reserveExecution(expectedBinding),
      service.reserveExecution(expectedBinding),
    ]);

    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.receipt).toEqual(second.receipt);
    expect(first.receipt.state).toBe(ActionExecutionReceiptState.PROCESSING);
    expect(
      await dataSource.getRepository(ActionExecutionReceiptEntity).count({
        where: { workspaceId },
      }),
    ).toBe(1);
    expect(
      await dataSource
        .getRepository(ActionApprovalBindingEntity)
        .findOneByOrFail({
          id: bindingId,
        }),
    ).toMatchObject({ state: ActionApprovalBindingState.CONSUMED });
  });

  it('does not consume a binding whose rebuilt evidence differs', async () => {
    await expect(
      service.reserveExecution({
        ...expectedBinding,
        evidenceLinks: [{ objectMetadataId, recordId, role: 'different-role' }],
      }),
    ).rejects.toThrow('Action evidence does not match approved binding');

    expect(
      await dataSource.getRepository(ActionExecutionReceiptEntity).count({
        where: { workspaceId },
      }),
    ).toBe(0);
  });

  it('replays an existing receipt before considering a separately-created expired or mismatched approval', async () => {
    const first = await service.reserveExecution(expectedBinding);
    const competingBindingId = '90000000-0000-4000-8000-000000000008';
    await dataSource.getRepository(ActionApprovalBindingEntity).save({
      id: competingBindingId,
      workspaceId,
      initiatorUserWorkspaceId,
      actionName: expectedBinding.actionName,
      actionVersion: expectedBinding.actionVersion,
      draftId,
      contentDigest: expectedBinding.contentDigest,
      recipientFingerprint: expectedBinding.recipientFingerprint,
      sendingAccountFingerprint: expectedBinding.sendingAccountFingerprint,
      inboundMessageId: expectedBinding.inboundMessageId,
      inboundSenderIgsid: expectedBinding.inboundSenderIgsid,
      inboundDirection: expectedBinding.inboundDirection,
      inboundReceivedAt: expectedBinding.inboundReceivedAt,
      threadId,
      state: ActionApprovalBindingState.APPROVED,
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    await dataSource
      .getRepository(ActionApprovalBindingEvidenceLinkEntity)
      .save({
        actionApprovalBindingId: competingBindingId,
        objectMetadataId,
        recordId,
        role: 'mismatched-role',
      });

    const replay = await service.reserveExecution(expectedBinding);
    expect(replay).toMatchObject({ created: false });
    expect(replay.receipt).toEqual(first.receipt);
  });

  it('retries a real PostgreSQL workspace projection after post-projection loss', async () => {
    await dataSource.getRepository(ActionApprovalBindingEntity).save({
      id: projectionBindingId,
      workspaceId: projectionWorkspaceId,
      initiatorUserWorkspaceId,
      actionName: expectedBinding.actionName,
      actionVersion: expectedBinding.actionVersion,
      draftId: projectionDraftId,
      contentDigest: computeActionContentDigest('Projected message'),
      recipientFingerprint: expectedBinding.recipientFingerprint,
      sendingAccountFingerprint: expectedBinding.sendingAccountFingerprint,
      inboundMessageId: expectedBinding.inboundMessageId,
      inboundSenderIgsid: expectedBinding.inboundSenderIgsid,
      inboundDirection: expectedBinding.inboundDirection,
      inboundReceivedAt: expectedBinding.inboundReceivedAt,
      threadId,
      state: ActionApprovalBindingState.CONSUMED,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    await dataSource.getRepository(ActionExecutionReceiptEntity).save({
      id: projectionReceiptId,
      workspaceId: projectionWorkspaceId,
      actionApprovalBindingId: projectionBindingId,
      idempotencyKey: 'projection-retry-key',
      state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
      providerMessageId: null,
      providerCode: 'accepted',
      redactedOutcome: 'accepted',
    });
    await dataSource.query(
      `INSERT INTO "${projectionSchemaName}"."_myahSocialConversation" (
        "id", "name", "label", "providerConversationId", "recipientIgsid", "instagramAccountId"
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        projectionConversationId,
        'Projection recipient',
        'Projection recipient',
        'projection-provider-conversation',
        'projection-recipient-igsid',
        integrationAccountId,
      ],
    );
    await dataSource.query(
      `INSERT INTO "${projectionSchemaName}"."_myahInstagramReplyDraft" (
        "id", "body", "conversationId", "status"
      ) VALUES ($1, $2, $3, 'NEEDS_REVIEW')`,
      [projectionDraftId, 'Projected message', projectionConversationId],
    );

    const projector = new ActionReceiptProjectorService(
      dataSource.getRepository(ActionExecutionReceiptEntity),
      new ActionReceiptWorkspaceProjectionWriterService(dataSource),
    );

    await expect(
      projector.projectReceipt(projectionReceiptId, {
        afterWorkspaceProjection: async () => {
          throw new Error('lost after workspace projection');
        },
      }),
    ).rejects.toThrow('lost after workspace projection');

    await expect(
      projector.projectReceipt(projectionReceiptId),
    ).resolves.toEqual({
      projected: true,
    });
    await expect(
      dataSource.getRepository(ActionExecutionReceiptEntity).findOneByOrFail({
        id: projectionReceiptId,
      }),
    ).resolves.toMatchObject({ state: ActionExecutionReceiptState.SENT });
    await expect(
      dataSource.query<{ text: string; direction: string }[]>(
        `SELECT message."text", message."direction"
        FROM "${projectionSchemaName}"."_myahSocialConversation" AS conversation
        INNER JOIN "${projectionSchemaName}"."_myahSocialMessage" AS message
          ON message."conversationId" = conversation."id"
        WHERE conversation."id" = $1
          AND message."createdByContext" ->> 'actionReceiptId' = $2`,
        [projectionConversationId, projectionReceiptId],
      ),
    ).resolves.toEqual([{ text: 'Projected message', direction: 'OUTBOUND' }]);
    await expect(
      dataSource.query(
        `SELECT "status", "sentAt" IS NOT NULL AS "sent"
        FROM "${projectionSchemaName}"."_myahInstagramReplyDraft"
        WHERE "id" = $1`,
        [projectionDraftId],
      ),
    ).resolves.toEqual([{ status: 'SENT', sent: true }]);
  });

  it('marks a receipt UNKNOWN after an injected post-reservation loss without submitting to a provider', async () => {
    const submit = jest.fn();

    await expect(
      service.execute(expectedBinding, submit, {
        afterReservation: async () => {
          throw new Error('lost after reservation');
        },
      }),
    ).rejects.toThrow('lost after reservation');
    expect(submit).not.toHaveBeenCalled();

    const reconciled = await service.reconcile({
      processingBefore: new Date('2031-01-01T00:00:00.000Z'),
    });
    expect(reconciled).toEqual({ unknown: 1, projected: 0, failed: 0 });
  });

  it('preserves PROVIDER_ACCEPTED after injected post-response loss and replays with zero provider calls', async () => {
    const submit = jest.fn().mockResolvedValue({
      code: 'accepted',
      acceptedAt: new Date('2026-07-16T00:00:00.000Z'),
    });

    await expect(
      service.execute(expectedBinding, submit, {
        afterProviderAccepted: async () => {
          throw new Error('lost after provider success');
        },
      }),
    ).rejects.toThrow('lost after provider success');
    expect(submit).toHaveBeenCalledTimes(1);

    const replay = await service.execute(expectedBinding, submit);
    expect(replay).toMatchObject({
      state: ActionExecutionReceiptState.PROVIDER_ACCEPTED,
      providerCode: 'accepted',
      outcome: 'accepted',
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(
      await dataSource
        .getRepository(ActionExecutionReceiptEntity)
        .findOneByOrFail({ id: replay.id }),
    ).toMatchObject({ providerMessageId: null });
  });
  it('routes a real producer and decision binding into the strict sender while projecting through the conversation relation', async () => {
    const {
      actionDefinition,
      prepared,
      pendingBindingId,
      providerCalls,
      sender,
      senderPayload,
    } = await prepareApprovedSender();
    const senderInput = {
      actionApprovalBindingId: senderPayload.actionApprovalBindingId,
    };

    expect(senderPayload).toEqual({
      status: 'resolved',
      actionApprovalBindingId: pendingBindingId,
    });
    await expect(
      dataSource.getRepository(ActionApprovalBindingEntity).findOneByOrFail({
        id: pendingBindingId,
      }),
    ).resolves.toMatchObject({ state: ActionApprovalBindingState.APPROVED });
    await expect(
      dataSource.getRepository(ActionApprovalBindingEvidenceLinkEntity).find({
        where: { actionApprovalBindingId: pendingBindingId },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ recordId: prepared.draftId, role: 'draft' }),
        expect.objectContaining({
          recordId: prepared.conversationId,
          role: 'conversation',
        }),
        expect.objectContaining({
          recordId: integrationAccountId,
          role: 'sending_account',
        }),
      ]),
    );
    const binding = await service.getApprovedBinding({
      workspaceId,
      approvalBindingId: pendingBindingId,
      initiatorUserWorkspaceId,
      threadId,
    });
    await expect(
      actionDefinition.rebuildExecutionAuthority({ workspaceId, binding }),
    ).resolves.toBeDefined();

    await expect(
      sender.execute(senderInput, {
        workspaceId,
        userWorkspaceId: initiatorUserWorkspaceId,
        threadId,
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Instagram reply accepted.',
    });
    expect(
      providerCalls.mock.calls.filter(
        ([input]) => input.toolSlug === 'INSTAGRAM_SEND_TEXT_MESSAGE',
      ),
    ).toHaveLength(1);
    await expect(
      dataSource.getRepository(ActionExecutionReceiptEntity).findOneByOrFail({
        actionApprovalBindingId: pendingBindingId,
      }),
    ).resolves.toMatchObject({ state: ActionExecutionReceiptState.SENT });
    await expect(
      dataSource.query<{ text: string; direction: string }[]>(
        `SELECT message."text", message."direction"
        FROM "${projectionSchemaName}"."_myahSocialConversation" AS conversation
        INNER JOIN "${projectionSchemaName}"."_myahSocialMessage" AS message
          ON message."conversationId" = conversation."id"
        WHERE conversation."id" = $1
          AND message."createdByContext" ->> 'actionReceiptId' IS NOT NULL`,
        [prepared.conversationId],
      ),
    ).resolves.toEqual([{ text: prepared.body, direction: 'OUTBOUND' }]);
  });

  it('creates one receipt and sends once when real sender executions race for one binding', async () => {
    const { pendingBindingId, providerCalls, sender, senderPayload } =
      await prepareApprovedSender();
    const senderInput = {
      actionApprovalBindingId: senderPayload.actionApprovalBindingId,
    };

    await Promise.all([
      sender.execute(senderInput, {
        workspaceId,
        userWorkspaceId: initiatorUserWorkspaceId,
        threadId,
      }),
      sender.execute(senderInput, {
        workspaceId,
        userWorkspaceId: initiatorUserWorkspaceId,
        threadId,
      }),
    ]);

    expect(
      providerCalls.mock.calls.filter(
        ([input]) => input.toolSlug === 'INSTAGRAM_SEND_TEXT_MESSAGE',
      ),
    ).toHaveLength(1);
    expect(
      await dataSource.getRepository(ActionExecutionReceiptEntity).count({
        where: { actionApprovalBindingId: pendingBindingId },
      }),
    ).toBe(1);
  });
});
