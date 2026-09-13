import { DataSource, EntityManager } from 'typeorm';
import { ConnectedAccountProvider } from 'twenty-shared/types';

jest.mock(
  'src/modules/myah-outreach/services/campaign-message-render.service',
  () => ({ CampaignMessageRenderService: class {} }),
);
jest.mock(
  'src/modules/myah-outreach/services/campaign-sequence.service',
  () => ({
    CampaignSequenceService: class {},
  }),
);
jest.mock(
  'src/modules/campaign-execution/services/campaign-outreach-audience-review.service',
  () => ({ CampaignOutreachAudienceReviewService: class {} }),
);
jest.mock(
  'src/modules/myah-campaign/services/campaign-sender-readiness.service',
  () => ({ CampaignSenderReadinessService: class {} }),
);

import { setPgDateTypeParser } from 'src/database/pg/set-pg-date-type-parser';
import {
  CAMPAIGN_SEND_EVIDENCE_IN_FLIGHT,
  CampaignMailboxDeletionFenceService,
} from 'src/engine/core-modules/campaign-execution/services/campaign-mailbox-deletion-fence.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CalendarChannelEntity } from 'src/engine/metadata-modules/calendar-channel/entities/calendar-channel.entity';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { ConnectedAccountMetadataService } from 'src/engine/metadata-modules/connected-account/connected-account-metadata.service';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessageChannelMetadataService } from 'src/engine/metadata-modules/message-channel/message-channel-metadata.service';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';
import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';
import { SentMessagePersistenceService } from 'src/modules/messaging/message-outbound-manager/services/sent-message-persistence.service';
import { CampaignMicrosoftHeaderReconciliationService } from 'src/modules/campaign-execution/services/campaign-microsoft-header-reconciliation.service';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignSentProjectionService } from 'src/modules/campaign-execution/services/campaign-sent-projection.service';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';
import { CampaignThreadMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-thread-material.adapter';

setPgDateTypeParser();

const id = {
  workspace: '15722fdb-bc53-4433-b781-4667ad83280e',
  campaign: 'a9c6faaf-2a07-4505-af89-919d0a9a7a1e',
  execution: 'e2c1f1d1-81f3-48a1-ab14-a9d077dc525a',
  authorization: '9893cfed-dc0e-41ee-9c4f-40c5f6e12209',
  activation: '14b2b4f7-e6b2-4503-a5d1-e3d1cc0dd240',
  enrollment: 'a8da22cf-b7d9-4fd5-b2f1-504e83aa6036',
  expiredOccurrence: '3dfea701-d032-4102-aacf-28023eb27242',
  projectionOccurrence: '209e70d9-dcb9-4158-8b11-9e892433f3cb',
  microsoftOccurrence: '69d73be2-4462-4e0b-a4d8-5fdeee947aec',
  currentOccurrence: '99f84f63-95dd-4e0a-85f8-b7b416eff455',
  expiredAttempt: 'bf59fad0-88ec-4cd3-9512-d6616d62a800',
  projectionAttempt: '0f54334e-6168-41ca-873b-3931e68b086c',
  microsoftAttempt: '25d03163-6457-4a4b-aec2-23f745e2ab6b',
  collisionAttempt: '008b8363-de08-46b8-bc42-939a52134478',
  account: '8d5094fa-ba1f-4323-a2de-9dbf1dbe15c7',
  channel: '2f3ee0d7-9600-4a53-976f-6da4419a1fcd',
  campaignCreator: 'ea83c64d-9684-4cce-b7d6-a5c123d8f200',
  creator: '4eda397a-9a5b-44bb-95d1-0dd4ead221dc',
  version: 'bf8172b3-e5a4-454c-a73f-8eea34004e44',
  workflow: 'a1ff94f8-169a-49be-b737-78841d7bb452',
  message1: 'd2b2b6f0-8093-4c85-949f-e75930427b75',
  message2: 'af7f5f73-fec8-4aeb-b1bd-c03e7955f16e',
  message3: '997fdabc-db89-4c92-b4eb-194bdd1e5a8c',
  message4: '924ada0e-ec36-4949-aa60-fd60decbe7ad',
  projectionThread: 'd18e77be-ccd3-4f2d-8f57-4b1104e4b274',
  microsoftThread: '99db205c-879b-41c8-b848-18a8c89cd8bf',
  collisionMessage: 'b2728c6d-d2df-4e07-b1a8-5066762316df',
  headerOwnerMessage: 'b617ea95-4dac-42aa-8aea-2d6b09a225a0',
} as const;
const schema = getWorkspaceSchemaName(id.workspace);
const digest = 'a'.repeat(64);
const acceptedAt = new Date('2026-09-11T04:00:00.123Z');
const expiredClaimedAt = new Date('2026-09-11T03:00:00.000Z');
const expiredSlotAt = new Date('2026-09-11T03:00:01.000Z');
const expiredUnknownAfter = new Date('2026-09-11T03:01:00.000Z');

const orm = (dataSource: DataSource) => ({
  getGlobalWorkspaceDataSource: async () => dataSource,
});

const insertAttempt = async (
  manager: EntityManager,
  input: {
    attemptId: string;
    occurrenceId: string;
    messageId: string;
    attemptNumber: number;
    state: 'RESERVED' | 'PROCESSING' | 'UNKNOWN' | 'ACCEPTED';
    providerExternalId: string | null;
    header: string | null;
    projectedMessageId?: string | null;
    projectedThreadId?: string | null;
  },
) => {
  const accepted = input.state === 'ACCEPTED';
  await manager.query(
    `INSERT INTO core."outboundEmailAttempt" (
      "attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",provider,
      "normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","senderPoolFingerprint","localDate","claimedAt","slotAt","unknownAfter",
      "campaignId","enrollmentId","occurrenceId","authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest","finalEvidenceDigest",
      "providerMessageId","providerAcceptedAt","safeOutcomeReason",retryable,"projectedMessageId","projectedMessageThreadId",
      "providerHeaderMessageId","providerMessageExternalId","providerThreadExternalId","resolvedThreadExternalId","providerDeliveredRecipients")
     VALUES ($1,$2,'CAMPAIGN_SEQUENCE',$3,$4,$5,$6,'microsoft','sender@example.com','recipient@example.com','ROTATE',$7,$8,$9,$10,$11,
       $12,$13,$14,$15,$16,$17,$18,$7,$19,$20,$21,NULL,$22,$23,$24,$25,$26,$27,$28,$29::jsonb)`,
    [
      input.attemptId,
      id.workspace,
      input.state,
      accepted ? 'CONSUMED' : 'RESERVED',
      id.account,
      id.channel,
      digest,
      '2026-09-11',
      accepted ? acceptedAt : expiredClaimedAt,
      accepted ? acceptedAt : expiredSlotAt,
      accepted ? new Date(acceptedAt.getTime() + 60_000) : expiredUnknownAfter,
      id.campaign,
      id.enrollment,
      input.occurrenceId,
      id.authorization,
      id.version,
      input.messageId,
      input.attemptNumber,
      accepted ? digest : null,
      accepted ? input.providerExternalId : null,
      accepted ? acceptedAt : null,
      accepted ? false : null,
      input.projectedMessageId ?? null,
      input.projectedThreadId ?? null,
      input.header,
      input.providerExternalId,
      accepted ? 'ms-thread' : null,
      accepted ? 'ms-thread' : null,
      accepted
        ? JSON.stringify({ to: ['recipient@example.com'], cc: [], bcc: [] })
        : null,
    ],
  );
  await manager.query(
    `INSERT INTO core."campaignOutboundRender" ("attemptId","workspaceId","campaignId","enrollmentId","occurrenceId","authorizationId","workflowVersionId","messageId","renderDigest","rendererRevision",subject,html,text,"bodyWithSignature","toRecipient","references")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'campaign-renderer/v1','Subject','<p>Body</p>','Body','<p>Body</p>','recipient@example.com','[]'::jsonb)`,
    [
      input.attemptId,
      id.workspace,
      id.campaign,
      id.enrollment,
      input.occurrenceId,
      id.authorization,
      id.version,
      input.messageId,
      digest,
    ],
  );
};

describe('Campaign Phase 2A final retained PostgreSQL evidence', () => {
  let dataSource: DataSource;
  let projection: CampaignSentProjectionService;
  let reconciliation: CampaignMicrosoftHeaderReconciliationService;
  const projectedMessageId = computeCampaignProjectedMessageId(
    id.projectionAttempt,
  );
  const microsoftMessageId = computeCampaignProjectedMessageId(
    id.microsoftAttempt,
  );

  beforeAll(async () => {
    dataSource = await new DataSource(
      global.testDataSource.options,
    ).initialize();
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","databaseSchema","workspaceCustomApplicationId","defaultRoleId")
         SELECT $1,'Phase2A final retained evidence',$2,'ACTIVE',$3,"workspaceCustomApplicationId","defaultRoleId"
         FROM core.workspace ORDER BY "createdAt" LIMIT 1`,
        [id.workspace, `phase2a-final-${id.workspace.slice(0, 8)}`, schema],
      );
      await manager.query(`CREATE SCHEMA "${schema}"`);
      await manager.query(`ALTER TABLE core."outboundEmailAttempt"
        ADD COLUMN IF NOT EXISTS "providerHeaderMessageId" text,
        ADD COLUMN IF NOT EXISTS "reconciledProviderHeaderMessageId" text,
        ADD COLUMN IF NOT EXISTS "providerMessageExternalId" text,
        ADD COLUMN IF NOT EXISTS "providerThreadExternalId" text,
        ADD COLUMN IF NOT EXISTS "resolvedThreadExternalId" text,
        ADD COLUMN IF NOT EXISTS "providerDeliveredRecipients" jsonb,
        ADD COLUMN IF NOT EXISTS "projectedMessageThreadId" uuid`);
      await manager.query(`CREATE TABLE IF NOT EXISTS core."campaignOutboundRender" (
        "attemptId" uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"campaignId" uuid NOT NULL,"enrollmentId" uuid NOT NULL,
        "occurrenceId" uuid NOT NULL,"authorizationId" uuid NOT NULL,"workflowVersionId" uuid NOT NULL,"messageId" uuid NOT NULL,
        "renderDigest" text NOT NULL,"signatureDigest" text,"rendererRevision" text NOT NULL,subject text NOT NULL,html text NOT NULL,
        text text NOT NULL,"bodyWithSignature" text NOT NULL,"toRecipient" text NOT NULL,"inReplyTo" text,"threadExternalId" text,
        "references" jsonb NOT NULL DEFAULT '[]'::jsonb,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now())`);
      await manager.query(
        `CREATE TABLE "${schema}".campaign (id uuid PRIMARY KEY,"lifecycleStatus" text NOT NULL,"sequenceAuthorization" jsonb)`,
      );
      await manager.query(
        `INSERT INTO "${schema}".campaign VALUES ($1,'ACTIVE',$2::jsonb)`,
        [
          id.campaign,
          JSON.stringify({
            authorizationId: id.authorization,
            generation: 1,
            workflowVersionId: id.version,
            state: 'ACTIVE',
          }),
        ],
      );
      await manager.query(
        `CREATE TABLE "${schema}"."messageThread" (id uuid PRIMARY KEY,"externalId" text NOT NULL)`,
      );
      await manager.query(
        `CREATE TABLE "${schema}".message (id uuid PRIMARY KEY,"messageThreadId" uuid NOT NULL,"headerMessageId" text,"externalId" text NOT NULL,"sentAt" timestamptz NOT NULL,subject text NOT NULL,body text NOT NULL)`,
      );
      await manager.query(
        `CREATE TABLE "${schema}"."messageChannelMessageAssociation" (id bigserial PRIMARY KEY,"messageId" uuid NOT NULL,"messageChannelId" uuid NOT NULL,"messageExternalId" text NOT NULL,"messageThreadExternalId" text NOT NULL)`,
      );
      await manager.query(
        `CREATE TABLE "${schema}"."messageParticipant" (id bigserial PRIMARY KEY,"messageId" uuid NOT NULL,role text NOT NULL,handle text NOT NULL)`,
      );
      await manager.query(
        `INSERT INTO core."connectedAccount" (id,"workspaceId",handle,provider,"userWorkspaceId",visibility,"dailySendLimit","minimumSendIntervalMs")
         SELECT $1,$2,'sender@example.com','microsoft',"userWorkspaceId",visibility,100,0 FROM core."connectedAccount" ORDER BY "createdAt" LIMIT 1`,
        [id.account, id.workspace],
      );
      await manager.query(
        `INSERT INTO core."messageChannel" (id,"workspaceId",visibility,handle,type,"pendingGroupEmailsAction","syncStage","connectedAccountId")
         SELECT $1,$2,visibility,'sender@example.com','EMAIL','NONE','MESSAGE_LIST_FETCH_PENDING',$3 FROM core."messageChannel" ORDER BY "createdAt" LIMIT 1`,
        [id.channel, id.workspace, id.account],
      );
      await manager.query(
        `INSERT INTO core."campaignExecution" (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone") VALUES ($1,$2,$3,'UTC','00:00','23:59','UTC')`,
        [id.execution, id.workspace, id.campaign],
      );
      await manager.query(
        `INSERT INTO core."campaignSequenceAuthorization" ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,"startIdempotencyKey","preparedFingerprint","workflowId","workflowVersionId","initiatingUserWorkspaceId",state,"authorizedAt",binding)
         VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,'ACTIVE',now(),$10::jsonb)`,
        [
          id.authorization,
          id.workspace,
          id.campaign,
          id.execution,
          'cb572f32-f78d-4cf8-a26a-b2136cf7954e',
          digest,
          id.workflow,
          id.version,
          '4b36fb75-6089-40b7-8f46-b67f511bd440',
          JSON.stringify({
            campaignExecutionId: id.execution,
            authorizationId: id.authorization,
            generation: 1,
            workflowVersionId: id.version,
          }),
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignActivation" (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount") VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,4)`,
        [
          id.activation,
          id.workspace,
          id.campaign,
          id.execution,
          id.authorization,
          id.version,
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignEnrollment" (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt") VALUES ($1,$2,$3,$4,$5,1,$6,$7,4,0,'ACTIVE',now())`,
        [
          id.enrollment,
          id.workspace,
          id.campaign,
          id.execution,
          id.authorization,
          id.campaignCreator,
          id.creator,
        ],
      );
      for (const [occurrenceId, messageId, index] of [
        [id.expiredOccurrence, id.message1, 0],
        [id.projectionOccurrence, id.message2, 1],
        [id.microsoftOccurrence, id.message3, 2],
        [id.currentOccurrence, id.message4, 3],
      ] as const)
        await manager.query(
          `INSERT INTO core."campaignOccurrence" (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'IN_FLIGHT',now())`,
          [
            occurrenceId,
            id.workspace,
            id.campaign,
            id.enrollment,
            id.version,
            messageId,
            index,
          ],
        );
      await insertAttempt(manager, {
        attemptId: id.expiredAttempt,
        occurrenceId: id.expiredOccurrence,
        messageId: id.message1,
        attemptNumber: 1,
        state: 'RESERVED',
        providerExternalId: null,
        header: null,
      });
      await insertAttempt(manager, {
        attemptId: id.projectionAttempt,
        occurrenceId: id.projectionOccurrence,
        messageId: id.message2,
        attemptNumber: 1,
        state: 'ACCEPTED',
        providerExternalId: 'projection-external',
        header: '<projection@example.com>',
      });
      await insertAttempt(manager, {
        attemptId: id.microsoftAttempt,
        occurrenceId: id.microsoftOccurrence,
        messageId: id.message3,
        attemptNumber: 1,
        state: 'ACCEPTED',
        providerExternalId: 'ms-external',
        header: null,
        projectedMessageId: null,
        projectedThreadId: null,
      });
      await insertAttempt(manager, {
        attemptId: id.collisionAttempt,
        occurrenceId: id.currentOccurrence,
        messageId: id.message4,
        attemptNumber: 1,
        state: 'ACCEPTED',
        providerExternalId: 'collision-external',
        header: null,
        projectedMessageId: id.collisionMessage,
        projectedThreadId: id.microsoftThread,
      });
      await manager.query(
        `INSERT INTO core."mailboxCapacityDay" ("workspaceId","connectedAccountId","localDate","reservedCount") VALUES ($1,$2,'2026-09-11',1)`,
        [id.workspace, id.account],
      );
      await manager.query(
        `INSERT INTO "${schema}"."messageThread" VALUES ($1,'ms-thread')`,
        [id.microsoftThread],
      );

      await manager.query(
        `INSERT INTO "${schema}".message VALUES ($1,$3,NULL,'collision-external',$4,'Collision','Body'),($2,$3,'<taken@example.com>','taken-external',$4,'Owner','Body')`,
        [
          id.collisionMessage,
          id.headerOwnerMessage,
          id.microsoftThread,
          acceptedAt,
        ],
      );
      await manager.query(
        `INSERT INTO "${schema}"."messageChannelMessageAssociation" ("messageId","messageChannelId","messageExternalId","messageThreadExternalId") VALUES ($1,$2,'collision-external','ms-thread')`,
        [id.collisionMessage, id.channel],
      );
    });

    const saveService = {
      saveMessagesAndEnqueueContactCreation: async (
        [message]: [any],
        channel: any,
        _account: any,
        _workspaceId: string,
        manager: EntityManager,
      ) => {
        const existing = await manager.query(
          `SELECT "externalId","headerMessageId",subject,body,"sentAt" FROM "${schema}".message WHERE id=$1 FOR UPDATE`,
          [message.expectedMessageId],
        );
        if (
          existing.length > 0 &&
          (existing[0].externalId !== message.externalId ||
            existing[0].headerMessageId !== message.headerMessageId ||
            existing[0].subject !== message.subject ||
            existing[0].body !== message.text ||
            new Date(existing[0].sentAt).getTime() !==
              new Date(message.receivedAt).getTime())
        )
          throw new Error(
            'Expected Message exact replay conflicts with persisted content',
          );
        if (existing.length === 0) {
          const threadId =
            message.messageThreadExternalId === 'ms-thread'
              ? id.microsoftThread
              : id.projectionThread;
          await manager.query(
            `INSERT INTO "${schema}"."messageThread" VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`,
            [threadId, message.messageThreadExternalId],
          );
          await manager.query(
            `INSERT INTO "${schema}".message VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
              message.expectedMessageId,
              threadId,
              message.headerMessageId,
              message.externalId,
              message.receivedAt,
              message.subject,
              message.text,
            ],
          );
          await manager.query(
            `INSERT INTO "${schema}"."messageChannelMessageAssociation" ("messageId","messageChannelId","messageExternalId","messageThreadExternalId") VALUES ($1,$2,$3,$4)`,
            [
              message.expectedMessageId,
              channel.id,
              message.externalId,
              message.messageThreadExternalId,
            ],
          );
          for (const participant of message.participants)
            await manager.query(
              `INSERT INTO "${schema}"."messageParticipant" ("messageId",role,handle) VALUES ($1,$2,$3)`,
              [message.expectedMessageId, participant.role, participant.handle],
            );
        }
        const threadId =
          message.messageThreadExternalId === 'ms-thread'
            ? id.microsoftThread
            : id.projectionThread;
        return {
          messageExternalIdsAndIdsMap: new Map([
            [message.externalId, message.expectedMessageId],
          ]),
          messageExternalIdToMessageThreadIdMap: new Map([
            [message.externalId, threadId],
          ]),
        };
      },
    };
    const sentPersistence = new SentMessagePersistenceService(
      {} as never,
      saveService as never,
    );
    const projectionDataSource = {
      transaction: (work: (manager: EntityManager) => unknown) =>
        dataSource.transaction(async (manager) => {
          manager.getRepository = ((entity: { name?: string }) => ({
            findOneOrFail: async () =>
              entity.name === 'ConnectedAccountEntity'
                ? {
                    id: id.account,
                    workspaceId: id.workspace,
                    handle: 'sender@example.com',
                    handleAliases: [],
                  }
                : {
                    id: id.channel,
                    workspaceId: id.workspace,
                    connectedAccountId: id.account,
                    handle: 'sender@example.com',
                    type: 'EMAIL',
                    connectedAccount: {
                      id: id.account,
                      workspaceId: id.workspace,
                      handle: 'sender@example.com',
                      handleAliases: [],
                    },
                  },
          })) as never;
          return work(manager);
        }),
    };
    projection = new CampaignSentProjectionService(
      {
        getGlobalWorkspaceDataSource: async () => projectionDataSource,
      } as never,
      sentPersistence,
    );

    reconciliation = new CampaignMicrosoftHeaderReconciliationService(
      orm(dataSource) as never,
      new MessagingMessageService({} as never),
    );
  });

  afterAll(async () => dataSource.destroy());

  it('blocks exact expired RESERVED evidence once, releases capacity, and holds the occurrence/enrollment', async () => {
    const progression = new CampaignProgressionService(
      new OutboundEmailAttemptService(new MailboxCapacityService()),
    );
    await dataSource.query(
      `UPDATE core.workspace SET "activationStatus"='INACTIVE' WHERE id=$1`,
      [id.workspace],
    );
    const claim = () =>
      dataSource.transaction((manager) =>
        progression.claimAndReserveDueOccurrenceInTransaction(
          {
            workspaceId: id.workspace,
            campaignId: id.campaign,
            occurrenceId: id.expiredOccurrence,
          },
          manager as never,
        ),
      );
    await expect(Promise.all([claim(), claim()])).resolves.toEqual([
      { status: 'HELD', reason: 'WORKSPACE_NOT_ACTIVE' },
      { status: 'HELD', reason: 'WORKSPACE_NOT_ACTIVE' },
    ]);
    const [row] = await dataSource.query(
      `SELECT a."attemptState",a."capacityState",a."safeOutcomeReason",d."reservedCount",o.state,o."holdReason",e."holdReason" enrollment_hold FROM core."outboundEmailAttempt" a JOIN core."mailboxCapacityDay" d ON d."workspaceId"=a."workspaceId" AND d."connectedAccountId"=a."connectedAccountId" AND d."localDate"=a."localDate" JOIN core."campaignOccurrence" o ON o.id=a."occurrenceId" JOIN core."campaignEnrollment" e ON e.id=a."enrollmentId" WHERE a."attemptId"=$1`,
      [id.expiredAttempt],
    );
    expect(row).toMatchObject({
      attemptState: 'BLOCKED',
      capacityState: 'RELEASED',
      safeOutcomeReason: 'WORKSPACE_NOT_ACTIVE',
      reservedCount: 0,
      state: 'HELD',
      holdReason: 'WORKSPACE_NOT_ACTIVE',
      enrollment_hold: 'WORKSPACE_NOT_ACTIVE',
    });
  });

  it('projects accepted evidence exactly once concurrently and rolls collision back without child rows', async () => {
    const coordinate = {
      workspaceId: id.workspace,
      campaignId: id.campaign,
      connectedAccountId: id.account,
      messageChannelId: id.channel,
      attemptId: id.projectionAttempt,
    };
    await expect(
      Promise.all([
        projection.reconcile(coordinate),
        projection.reconcile(coordinate),
      ]),
    ).resolves.toEqual(expect.arrayContaining(['PROJECTED', 'EXACT_REPLAY']));
    const [counts] = await dataSource.query(
      `SELECT (SELECT count(*)::int FROM "${schema}".message WHERE id=$1) messages,(SELECT count(*)::int FROM "${schema}"."messageChannelMessageAssociation" WHERE "messageId"=$1) associations,(SELECT count(*)::int FROM "${schema}"."messageParticipant" WHERE "messageId"=$1) participants,(SELECT "providerAcceptedAt" FROM core."outboundEmailAttempt" WHERE "attemptId"=$2) accepted_at`,
      [projectedMessageId, id.projectionAttempt],
    );
    expect(counts).toMatchObject({
      messages: 1,
      associations: 1,
      participants: 2,
    });
    expect(new Date(counts.accepted_at).getTime()).toBe(acceptedAt.getTime());
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE core."outboundEmailAttempt" SET "projectedMessageId"=NULL,"projectedMessageThreadId"=NULL WHERE "attemptId"=$1`,
        [id.projectionAttempt],
      );
      await manager.query(
        `UPDATE "${schema}".message SET "externalId"='collision' WHERE id=$1`,
        [projectedMessageId],
      );
    });
    const before = await dataSource.query(
      `SELECT count(*)::int associations FROM "${schema}"."messageChannelMessageAssociation" WHERE "messageId"=$1`,
      [projectedMessageId],
    );
    await expect(projection.reconcile(coordinate)).rejects.toThrow(
      'Expected Message exact replay conflicts',
    );
    const after = await dataSource.query(
      `SELECT count(*)::int associations FROM "${schema}"."messageChannelMessageAssociation" WHERE "messageId"=$1`,
      [projectedMessageId],
    );
    expect(after).toEqual(before);
  });

  it('monotonically reconciles Microsoft header and makes exact PINNED_REPLY material eligible', async () => {
    const adapter = new CampaignThreadMaterialAdapter();
    const evidence = {
      evidenceId: id.microsoftAttempt,
      enrollmentId: id.enrollment,
      occurrenceId: id.microsoftOccurrence,
      priorMessageId: id.message3,
      normalizedRecipient: 'recipient@example.com',
      connectedAccountId: id.account,
      messageChannelId: id.channel,
      senderHandle: 'sender@example.com',
      providerMessageId: '<trusted@example.com>',
      providerThreadId: 'ms-thread',
    };
    const load = () =>
      dataSource.transaction((manager) =>
        adapter.load({
          coordinates: {
            workspaceId: id.workspace,
            campaignId: id.campaign,
            campaignCreatorId: id.campaignCreator,
            workflowVersionId: id.version,
            messageId: id.message4,
          },
          context: {
            kind: 'DISPATCH',
            authContext: { type: 'system', workspace: { id: id.workspace } },
            transactionManager: manager,
            renderContext: {
              workspaceId: id.workspace,
              campaignId: id.campaign,
              campaignCreatorId: id.campaignCreator,
              workflowVersionId: id.version,
              messageId: id.message4,
              enrollmentId: id.enrollment,
              occurrenceId: id.currentOccurrence,
              replyEvidenceId: id.microsoftAttempt,
            },
            senderBinding: {
              connectedAccountId: id.account,
              messageChannelId: id.channel,
              senderHandle: 'sender@example.com',
            },
            replyEvidence: evidence,
          },
          replyToThread: true,
          normalizedRecipient: 'recipient@example.com',
          sender: {
            connectedAccountId: id.account,
            messageChannelId: id.channel,
            handle: 'sender@example.com',
          },
        } as never),
      );
    await expect(load()).resolves.toMatchObject({ kind: 'BLOCKED' });
    await expect(
      projection.reconcile({
        workspaceId: id.workspace,
        campaignId: id.campaign,
        connectedAccountId: id.account,
        messageChannelId: id.channel,
        attemptId: id.microsoftAttempt,
      }),
    ).resolves.toBe('PROJECTED');
    const [projectedWithoutHeader] = await dataSource.query(
      `SELECT "headerMessageId" FROM "${schema}".message WHERE id=$1`,
      [microsoftMessageId],
    );
    expect(projectedWithoutHeader.headerMessageId).toBeNull();
    const coordinate = {
      workspaceId: id.workspace,
      connectedAccountId: id.account,
      messageChannelId: id.channel,
      provider: ConnectedAccountProvider.MICROSOFT,
      direction: MessageDirection.OUTGOING,
      providerMessageExternalId: 'ms-external',
      trustedHeaderMessageId: '<trusted@example.com>',
    };
    await expect(
      Promise.all([
        reconciliation.reconcileImportedSentHeader(coordinate),
        reconciliation.reconcileImportedSentHeader(coordinate),
      ]),
    ).resolves.toEqual(expect.arrayContaining(['UPDATED', 'EXACT_REPLAY']));
    const before = await dataSource.query(
      `SELECT "reconciledProviderHeaderMessageId" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [id.microsoftAttempt],
    );
    await expect(
      reconciliation.reconcileImportedSentHeader({
        ...coordinate,
        providerMessageExternalId: 'wrong-external',
      }),
    ).resolves.toBe('DEFERRED');
    const after = await dataSource.query(
      `SELECT "reconciledProviderHeaderMessageId" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [id.microsoftAttempt],
    );
    expect(after).toEqual(before);
    const collisionCoordinate = {
      ...coordinate,
      providerMessageExternalId: 'collision-external',
      trustedHeaderMessageId: '<taken@example.com>',
    };
    const collisionRace = await Promise.allSettled([
      reconciliation.reconcileImportedSentHeader(collisionCoordinate),
      reconciliation.reconcileImportedSentHeader(collisionCoordinate),
    ]);
    expect(collisionRace).toHaveLength(2);
    for (const result of collisionRace) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected')
        expect(result.reason).toEqual(
          expect.objectContaining({
            message: expect.stringContaining(
              'Trusted Microsoft header collides',
            ),
          }),
        );
    }
    const [collision] = await dataSource.query(
      `SELECT a."reconciledProviderHeaderMessageId",m."headerMessageId"
         FROM core."outboundEmailAttempt" a CROSS JOIN "${schema}".message m
        WHERE a."attemptId"=$1 AND m.id=$2`,
      [id.collisionAttempt, id.collisionMessage],
    );
    expect(collision).toEqual({
      reconciledProviderHeaderMessageId: null,
      headerMessageId: null,
    });
    await expect(load()).resolves.toMatchObject({
      kind: 'READY',
      value: { kind: 'REPLY' },
    });
  });

  it('fences PROCESSING, UNKNOWN, and ACCEPTED-unprojected mailbox deletion; exact projection releases it', async () => {
    const fence = new CampaignMailboxDeletionFenceService();
    const eventEmitter = { emitCustomBatchEvent: jest.fn() };
    const repositoryManager = {
      transaction: (work: (manager: EntityManager) => unknown) =>
        dataSource.transaction(async (manager) => {
          manager.getRepository = ((entity: unknown) => {
            if (entity === CalendarChannelEntity)
              return { find: async () => [] };
            if (entity === ConnectedAccountEntity)
              return {
                findOneOrFail: async () => ({
                  id: id.account,
                  workspaceId: id.workspace,
                  name: 'Microsoft',
                  visibility: 'user',
                }),
                delete: async () => {
                  await manager.query(
                    `DELETE FROM core."connectedAccount" WHERE id=$1 AND "workspaceId"=$2`,
                    [id.account, id.workspace],
                  );
                  return { affected: 1 };
                },
              };
            if (entity === MessageChannelEntity)
              return {
                findOneOrFail: async () => ({
                  id: id.channel,
                  connectedAccountId: id.account,
                  workspaceId: id.workspace,
                }),
                delete: async () => {
                  await manager.query(
                    `DELETE FROM core."messageChannel" WHERE id=$1 AND "connectedAccountId"=$2 AND "workspaceId"=$3`,
                    [id.channel, id.account, id.workspace],
                  );
                  return { affected: 1 };
                },
              };
            throw new Error('Unexpected metadata repository');
          }) as never;
          return work(manager);
        }),
    };
    const channelService = new MessageChannelMetadataService(
      { manager: repositoryManager } as never,
      {} as never,
      {} as never,
      {} as never,
      eventEmitter as never,
      fence,
    );
    const accountService = new ConnectedAccountMetadataService(
      { manager: repositoryManager } as never,
      {} as never,
      {} as never,
      { revokeIfApp: jest.fn() } as never,
      eventEmitter as never,
      fence,
    );
    const deleteChannel = (channelId: string = id.channel) =>
      channelService.delete({
        messageChannelId: channelId,
        connectedAccountId: id.account,
        workspaceId: id.workspace,
      });
    await dataSource.query(
      `UPDATE core."outboundEmailAttempt" SET "attemptState"='PROCESSING',"capacityState"='RESERVED' WHERE "attemptId"=$1`,
      [id.expiredAttempt],
    );
    await expect(deleteChannel()).rejects.toThrow(
      CAMPAIGN_SEND_EVIDENCE_IN_FLIGHT,
    );
    await dataSource.query(
      `UPDATE core."outboundEmailAttempt" SET "attemptState"='UNKNOWN',"capacityState"='PROVISIONAL_UNKNOWN',"safeOutcomeReason"=NULL WHERE "attemptId"=$1`,
      [id.expiredAttempt],
    );
    await expect(deleteChannel()).rejects.toThrow(
      CAMPAIGN_SEND_EVIDENCE_IN_FLIGHT,
    );
    await dataSource.query(
      `UPDATE core."outboundEmailAttempt" SET "attemptState"='BLOCKED',"capacityState"='RELEASED',"safeOutcomeReason"='RESERVATION_EXPIRED',retryable=false,"projectedMessageId"=NULL,"projectedMessageThreadId"=NULL WHERE "attemptId"=$1`,
      [id.expiredAttempt],
    );
    await dataSource.query(
      `UPDATE core."outboundEmailAttempt" SET "projectedMessageId"=NULL,"projectedMessageThreadId"=NULL WHERE "attemptId"=$1`,
      [id.projectionAttempt],
    );
    await expect(deleteChannel()).rejects.toThrow(
      CAMPAIGN_SEND_EVIDENCE_IN_FLIGHT,
    );
    await dataSource.query(
      `UPDATE core."outboundEmailAttempt" SET "projectedMessageId"=$2,"projectedMessageThreadId"=$3 WHERE "attemptId"=$1`,
      [id.projectionAttempt, projectedMessageId, id.projectionThread],
    );
    await expect(
      deleteChannel('11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow();
    await expect(deleteChannel()).resolves.toMatchObject({ id: id.channel });
    await expect(
      accountService.delete({ id: id.account, workspaceId: id.workspace }),
    ).resolves.toMatchObject({ id: id.account });
    const [retained] = await dataSource.query(
      `SELECT (SELECT count(*)::int FROM core."connectedAccount" WHERE id=$1) accounts,(SELECT count(*)::int FROM core."messageChannel" WHERE id=$2) channels`,
      [id.account, id.channel],
    );
    expect(retained).toEqual({ accounts: 0, channels: 0 });
  });
});
