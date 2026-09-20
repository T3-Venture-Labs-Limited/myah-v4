import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ConnectedAccountProvider } from 'twenty-shared/types';

// HTML serialization is unrelated to thread identity; retain the real materializer and renderer.
jest.mock(
  'src/engine/core-modules/tool/tools/email-tool/utils/render-rich-text-to-html.util',
  () => ({ renderRichTextToHtml: async () => '<p>Hello</p>' }),
);
jest.mock(
  'src/modules/myah-outreach/services/campaign-sequence.service',
  () => ({ CampaignSequenceService: class {} }),
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
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { EmailComposerService } from 'src/engine/core-modules/tool/tools/email-tool/email-composer.service';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { CampaignEmailRuntimeService } from 'src/modules/campaign-execution/services/campaign-email-runtime.service';
import { OutboundEmailDispatchService } from 'src/modules/campaign-execution/services/outbound-email-dispatch.service';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';
import { CampaignMessageRenderService } from 'src/modules/myah-outreach/services/campaign-message-render.service';
import { CampaignMessageMaterializerService } from 'src/modules/myah-outreach/services/campaign-message-materializer.service';
import { CampaignThreadMaterialAdapter } from 'src/modules/myah-outreach/adapters/campaign-thread-material.adapter';

setPgDateTypeParser();
const newIds = () => ({
  workspace: randomUUID(),
  campaign: randomUUID(),
  execution: randomUUID(),
  authorization: randomUUID(),
  activation: randomUUID(),
  workflow: randomUUID(),
  version: randomUUID(),
  enrollment: randomUUID(),
  occurrence: randomUUID(),
  campaignCreator: randomUUID(),
  creator: randomUUID(),
  message: randomUUID(),
  nextMessage: randomUUID(),
  account: randomUUID(),
  channel: randomUUID(),
  thirdMessage: randomUUID(),
  projectedThread: randomUUID(),
});
let id = newIds();

let schema: string;
const fingerprint = 'a'.repeat(64);
const poolFingerprint = 'b'.repeat(64);
const body = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
});

describe('Campaign three-email threaded continuation', () => {
  let dataSource: DataSource;
  let service: CampaignProgressionService;
  let runtime: CampaignEmailRuntimeService;
  let providerCalls: number;
  let seedSecondAsNewThread: boolean;

  beforeAll(async () => {
    dataSource = await new DataSource(
      global.testDataSource.options,
    ).initialize();
  });
  afterAll(async () => dataSource.destroy());

  beforeEach(async () => {
    id = newIds();
    schema = getWorkspaceSchemaName(id.workspace);
    providerCalls = 0;
    seedSecondAsNewThread = false;
    const reply = (messageId: string) =>
      messageId !== id.message &&
      !(seedSecondAsNewThread && messageId === id.nextMessage);
    const sequence = {
      loadExecutionPlanInTransaction: async () => ({
        kind: 'READY',
        nodes: [id.message, id.nextMessage, id.thirdMessage].map(
          (messageId) => ({
            messageId,
            channel: 'EMAIL',
            replyToThread: reply(messageId),
          }),
        ),
        delaysSeconds: [60, 60],
      }),
      loadEmailByVersionInTransaction: async (
        coordinates: Record<string, string>,
      ) => ({
        ...coordinates,
        workflowId: id.workflow,
        subject: 'Hello',
        body,
        files: [],
        replyToThread: reply(coordinates.messageId),
        issues: [],
      }),
    };
    const mailbox = {
      campaignAccountId: randomUUID(),
      connectedAccountId: id.account,
      messageChannelId: id.channel,
      recoveryPath: null,
      bindingStatus: 'RESOLVED_BINDING',
      senderHandle: 'sender@example.com',
      provider: ConnectedAccountProvider.GOOGLE,
      dailySendLimit: 100,
      minimumSendIntervalMs: 1000,
      status: 'READY',
      reason: null,
      missingBinding: null,
    };
    const audience = {
      reviewInTransaction: async () => ({
        eligible: [
          {
            campaignCreatorId: id.campaignCreator,
            creatorId: id.creator,
            normalizedEmail: 'recipient@example.com',
          },
        ],
        excluded: [],
      }),
    };
    const sender = {
      getCampaignEmailSenderPoolInTransaction: async () => ({
        senderPoolFingerprint: poolFingerprint,
        serializationRevision: 'campaign-sender-pool/v1',
        rotationPolicyId: 'campaign-email-rotation/v1',
        mailboxes: [mailbox],
      }),
    };
    const materializer = new CampaignMessageMaterializerService(
      sequence as never,
      {
        load: async () => ({
          kind: 'READY',
          value: {
            creatorId: id.creator,
            normalizedRecipient: 'recipient@example.com',
            variables: {
              'creator.email': 'recipient@example.com',
              'creator.name': 'Test Creator',
            },
          },
        }),
      },
      { load: async () => ({ kind: 'READY', value: { html: null } }) },
      {
        load: async () => ({
          kind: 'READY',
          value: {
            connectedAccountId: id.account,
            messageChannelId: id.channel,
            handle: 'sender@example.com',
            provider: ConnectedAccountProvider.GOOGLE,
            senderPoolFingerprint: poolFingerprint,
            authorizedEmailSenderPool: [],
            projectedSlotAt: null,
            isPreviewProjection: false,
          },
        }),
      },
      undefined,
      new CampaignThreadMaterialAdapter(),
    );
    // The fixture projects accepted receipts; composer reads that same persisted evidence.
    const composerOrm = {
      getRepository: async (_workspace: string, table: string) => ({
        findOne: async (
          { where }: { where: Record<string, string> },
          manager: DataSource['manager'],
        ) => {
          const records =
            table === 'message'
              ? await manager.query(
                  `SELECT "projectedMessageId" AS id,"projectedMessageThreadId" AS "messageThreadId","providerAcceptedAt" AS "receivedAt" FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "providerHeaderMessageId"=$2`,
                  [id.workspace, where.headerMessageId],
                )
              : await manager.query(
                  `SELECT "resolvedThreadExternalId" AS "messageThreadExternalId" FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "projectedMessageId"=$2 AND "messageChannelId"=$3`,
                  [id.workspace, where.messageId, where.messageChannelId],
                );
          return records[0] ?? null;
        },
        find: async (_options: unknown, manager: DataSource['manager']) =>
          manager.query(
            `SELECT "providerHeaderMessageId" AS "headerMessageId" FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "projectedMessageThreadId"=$2 ORDER BY "providerAcceptedAt"`,
            [id.workspace, id.projectedThread],
          ),
      }),
    };
    const render = new CampaignMessageRenderService(
      materializer,
      new EmailComposerService(
        composerOrm as never,
        {} as never,
        {} as never,
        {} as never,
      ),
    );
    const capacity = new MailboxCapacityService();
    const attemptService = new OutboundEmailAttemptService(capacity);
    service = new CampaignProgressionService(
      attemptService,
      capacity,
      sequence as never,
      audience as never,
      sender as never,
      render,
    );
    const dispatch = new OutboundEmailDispatchService(
      {
        runInTransaction: (work) => dataSource.transaction(work),
        runPreProviderTransaction: (work) => dataSource.transaction(work),
      },
      {
        revalidate: async ({ materialEvidence, submission }) => ({
          projectedMessageId: materialEvidence.projectedMessageId,
          status: 'AUTHORIZED',
          submission,
        }),
      },
      { now: () => performance.now() },
      attemptService,
      {
        getProviderRequestTimeoutMs: () => 30_000,
        sendMessage: async () => {
          providerCalls++;
          return {
            headerMessageId: `<email-${providerCalls}@example.com>`,
            messageExternalId: `email-${providerCalls}`,
            threadExternalId: 'test-thread',
            deliveredRecipients: {
              to: ['recipient@example.com'],
              cc: [],
              bcc: [],
            },
          };
        },
      } as never,
    );
    runtime = new CampaignEmailRuntimeService(
      { getGlobalWorkspaceDataSource: async () => dataSource } as never,
      service,
      dispatch,
      {
        reconcile: async ({ attemptId }: { attemptId: string }) => {
          await dataSource.query(
            `UPDATE core."outboundEmailAttempt" SET "projectedMessageId"=$1,"projectedMessageThreadId"=$2 WHERE "attemptId"=$3`,
            [
              computeCampaignProjectedMessageId(attemptId),
              id.projectedThread,
              attemptId,
            ],
          );
          return 'PROJECTED';
        },
      } as never,
    );
    const binding = {
      campaignExecutionId: id.execution,
      authorizationId: id.authorization,
      generation: 1,
      workflowVersionId: id.version,
      request: {
        preparedProof: {
          preparedFingerprint: fingerprint,
          orderedMessageIds: [id.message, id.nextMessage, id.thirdMessage],
          fixedMaterialProofs: [
            { messageId: id.message, orderedAttachmentProofs: [] },
            { messageId: id.nextMessage, orderedAttachmentProofs: [] },
            { messageId: id.thirdMessage, orderedAttachmentProofs: [] },
          ],
          fixedMaterialDigest: fingerprint,
          senderPoolFingerprint: poolFingerprint,
          senderPoolSerializationRevision: 'campaign-sender-pool/v1',
          senderPoolRotationPolicyId: 'campaign-email-rotation/v1',
          signatureDigest: null,
        },
      },
    };
    const projection = {
      authorizationId: id.authorization,
      generation: 1,
      workflowVersionId: id.version,
      state: 'ACTIVE',
      preparedFingerprint: fingerprint,
    };
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO core.workspace (id,"displayName",subdomain,"activationStatus","databaseSchema","workspaceCustomApplicationId","defaultRoleId")
         SELECT $1,'Phase2A retained proof',$2,'ACTIVE',$3,"workspaceCustomApplicationId","defaultRoleId"
         FROM core.workspace ORDER BY "createdAt" LIMIT 1 ON CONFLICT (id) DO NOTHING`,
        [id.workspace, `phase2a-${id.workspace.slice(0, 8)}`, schema],
      );
      await manager.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await manager.query(
        `INSERT INTO core."connectedAccount" (id,"workspaceId",handle,provider,"userWorkspaceId",visibility,"dailySendLimit","minimumSendIntervalMs")
         SELECT $1,$2,'sender@example.com','google',"userWorkspaceId",visibility,100,1000
           FROM core."connectedAccount" ORDER BY "createdAt" LIMIT 1`,
        [id.account, id.workspace],
      );
      await manager.query(
        `INSERT INTO core."messageChannel" (id,"workspaceId",visibility,handle,type,"pendingGroupEmailsAction","syncStage","connectedAccountId")
         SELECT $1,$2,visibility,'sender@example.com','EMAIL','NONE','MESSAGE_LIST_FETCH_PENDING',$3
           FROM core."messageChannel" ORDER BY "createdAt" LIMIT 1`,
        [id.channel, id.workspace, id.account],
      );
      await manager.query(
        `CREATE TABLE IF NOT EXISTS "${schema}".campaign (id uuid PRIMARY KEY,"lifecycleStatus" text NOT NULL,"sequenceAuthorization" jsonb)`,
      );
      await manager.query(
        `CREATE TABLE IF NOT EXISTS "${schema}"."campaignCreator" (id uuid PRIMARY KEY,"campaignId" uuid NOT NULL,stage text,"deletedAt" timestamptz,"updatedAt" timestamptz DEFAULT now())`,
      );
      await manager.query(
        `INSERT INTO "${schema}".campaign VALUES ($1,'ACTIVE',$2::jsonb) ON CONFLICT DO NOTHING`,
        [id.campaign, JSON.stringify(projection)],
      );
      await manager.query(
        `INSERT INTO "${schema}"."campaignCreator" (id,"campaignId",stage) VALUES ($1,$2,'READY') ON CONFLICT DO NOTHING`,
        [id.campaignCreator, id.campaign],
      );
      await manager.query(
        `INSERT INTO core."campaignExecution" (id,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone") VALUES ($1,$2,$3,'UTC','00:00','23:59','UTC') ON CONFLICT DO NOTHING`,
        [id.execution, id.workspace, id.campaign],
      );
      await manager.query(
        `INSERT INTO core."campaignSequenceAuthorization" ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,"startIdempotencyKey","preparedFingerprint","workflowId","workflowVersionId","initiatingUserWorkspaceId",state,"authorizedAt",binding) VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,'ACTIVE',now(),$10::jsonb) ON CONFLICT DO NOTHING`,
        [
          id.authorization,
          id.workspace,
          id.campaign,
          id.execution,
          '58d57d47-eaaa-4cce-805e-43d35dd4e351',
          fingerprint,
          id.workflow,
          id.version,
          '4b36fb75-6089-40b7-8f46-b67f511bd440',
          JSON.stringify(binding),
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignActivation" (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount") VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,1) ON CONFLICT DO NOTHING`,
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
        `INSERT INTO core."campaignEnrollment" (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt") VALUES ($1,$2,$3,$4,$5,1,$6,$7,3,0,'ACTIVE',now()) ON CONFLICT DO NOTHING`,
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
      await manager.query(
        `INSERT INTO core."campaignOccurrence" (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt") VALUES ($1,$2,$3,$4,$5,$6,0,'PENDING',now()-interval '1 minute') ON CONFLICT DO NOTHING`,
        [
          id.occurrence,
          id.workspace,
          id.campaign,
          id.enrollment,
          id.version,
          id.message,
        ],
      );
    });
    await dataSource.query(
      `UPDATE core."connectedAccount" SET scopes=ARRAY['email'] WHERE id=$1`,
      [id.account],
    );
  });

  const claim = async (index: number) => {
    const [occurrence] = await dataSource.query(
      `SELECT id FROM core."campaignOccurrence" WHERE "enrollmentId"=$1 AND "authoredMessageIndex"=$2`,
      [id.enrollment, index],
    );
    return dataSource.transaction((manager) =>
      service.claimAndReserveDueOccurrenceInTransaction(
        {
          workspaceId: id.workspace,
          campaignId: id.campaign,
          occurrenceId: occurrence.id,
        },
        manager as never,
      ),
    );
  };

  const send = async (index: number) => {
    const result = await claim(index);
    if (result.status !== 'RESERVED')
      throw new Error(`Email ${index + 1}: ${JSON.stringify(result)}`);
    await (
      runtime as unknown as {
        dispatchAttempt(
          workspace: string,
          campaign: string,
          attempt: string,
        ): Promise<void>;
      }
    ).dispatchAttempt(id.workspace, id.campaign, result.attemptId);
    const [attempt] = await dataSource.query(
      `SELECT * FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [result.attemptId],
    );
    expect(attempt.attemptState).toBe('ACCEPTED');
    return attempt;
  };

  // Advance only synthetic test timing, never sleep or alter application clock handling.
  const makeDue = async (index: number) => {
    await dataSource.query(
      `UPDATE core."campaignOccurrence" SET "dueAt"=now()-interval '1 second' WHERE "enrollmentId"=$1 AND "authoredMessageIndex"=$2`,
      [id.enrollment, index],
    );
    await dataSource.query(
      `UPDATE core."mailboxDispatchClock" SET "nextEligibleAt"=now()-interval '1 second' WHERE "workspaceId"=$1`,
      [id.workspace],
    );
  };

  it('continues through Emails 2 and 3 with distinct identities through the real thread material path', async () => {
    const first = await send(0);
    expect(await claim(1)).toMatchObject({ status: 'NOT_DUE' });
    await makeDue(1);
    const second = await send(1);
    expect(second.priorAcceptedEvidenceId).toBe(first.attemptId);
    expect(second.occurrenceId).not.toBe(first.occurrenceId);
    await makeDue(2);
    const third = await send(2);
    expect(third.priorAcceptedEvidenceId).toBe(second.attemptId);
    expect(new Set([first, second, third].map((a) => a.messageId)).size).toBe(
      3,
    );
    expect(
      new Set([first, second, third].map((a) => a.occurrenceId)).size,
    ).toBe(3);
    expect(await claim(2)).toEqual({ status: 'TERMINAL' });
    expect(providerCalls).toBe(3);
    const renders = await dataSource.query(
      `SELECT "inReplyTo","threadExternalId" FROM core."campaignOutboundRender" WHERE "enrollmentId"=$1 ORDER BY "createdAt"`,
      [id.enrollment],
    );
    expect(renders.slice(1)).toEqual([
      {
        inReplyTo: first.providerHeaderMessageId,
        threadExternalId: 'test-thread',
      },
      {
        inReplyTo: second.providerHeaderMessageId,
        threadExternalId: 'test-thread',
      },
    ]);
  });

  it.each([
    'older recipient',
    'older projection',
    'nearest projection',
    'future occurrence',
  ])(
    'blocks %s defects without hiding them behind the nearest accepted email',
    async (defect) => {
      seedSecondAsNewThread = true;
      const first = await send(0);
      await makeDue(1);
      const second = await send(1);
      seedSecondAsNewThread = false;
      await makeDue(2);
      if (defect === 'older recipient') {
        await dataSource.query(
          `UPDATE core."outboundEmailAttempt" SET "normalizedRecipient"='other@example.com' WHERE "attemptId"=$1`,
          [first.attemptId],
        );
      } else if (defect === 'future occurrence') {
        await dataSource.query(
          `UPDATE core."campaignOccurrence" SET "authoredMessageIndex"=3 WHERE id=$1`,
          [first.occurrenceId],
        );
      } else {
        await dataSource.query(
          `UPDATE core."outboundEmailAttempt" SET "projectedMessageId"=NULL,"projectedMessageThreadId"=NULL WHERE "attemptId"=$1`,
          [defect === 'older projection' ? first.attemptId : second.attemptId],
        );
      }
      expect(await claim(2)).toMatchObject({ status: 'HELD' });
      expect(providerCalls).toBe(2);
      const [{ count }] = await dataSource.query(
        `SELECT count(*)::int AS count FROM core."outboundEmailAttempt" WHERE "enrollmentId"=$1`,
        [id.enrollment],
      );
      expect(count).toBe(2);
    },
  );

  it('rejects a competing accepted attempt at the database boundary', async () => {
    const first = await send(0);
    await expect(
      dataSource.query(
        `INSERT INTO core."outboundEmailAttempt" SELECT (jsonb_populate_record(NULL::core."outboundEmailAttempt", to_jsonb(a) || jsonb_build_object('attemptId',$2::uuid,'attemptNumber',2,'providerMessageId',$2::text,'providerMessageExternalId',$2::text,'providerHeaderMessageId',$2::text,'projectedMessageId',$2::uuid))).* FROM core."outboundEmailAttempt" a WHERE "attemptId"=$1`,
        [first.attemptId, randomUUID()],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'UQ_OUTBOUND_EMAIL_ATTEMPT_ACCEPTED_OCCURRENCE',
    });
    expect(providerCalls).toBe(1);
  });

  it('fails closed when a threaded step has no accepted predecessor', async () => {
    await dataSource.query(
      `UPDATE core."campaignEnrollment" SET "nextAuthoredMessageIndex"=1 WHERE id=$1`,
      [id.enrollment],
    );
    await dataSource.query(
      `UPDATE core."campaignOccurrence" SET "authoredMessageIndex"=1,"messageId"=$2 WHERE id=$1`,
      [id.occurrence, id.nextMessage],
    );
    expect(await claim(1)).toMatchObject({ status: 'HELD' });
    expect(providerCalls).toBe(0);
  });

  it('retains mailbox spacing and daily capacity even with valid reply evidence', async () => {
    await send(0);
    await makeDue(1);
    await dataSource.query(
      `UPDATE core."mailboxDispatchClock" SET "nextEligibleAt"=now()+interval '1 minute' WHERE "workspaceId"=$1`,
      [id.workspace],
    );
    expect(await claim(1)).toMatchObject({ status: 'DEFERRED' });
    await makeDue(1);
    await dataSource.query(
      `UPDATE core."mailboxCapacityDay" SET "acceptedCount"=100 WHERE "workspaceId"=$1`,
      [id.workspace],
    );
    expect(await claim(1)).toMatchObject({ status: 'DEFERRED' });
    expect(providerCalls).toBe(1);
  });

  it('accepts Email 3 with two independently seeded accepted earlier emails', async () => {
    // Establish valid accepted predecessors without depending on the Email 2 reply bug.
    seedSecondAsNewThread = true;
    await send(0);
    await makeDue(1);
    const second = await send(1);
    seedSecondAsNewThread = false;
    await makeDue(2);
    const third = await send(2);
    expect(third.priorAcceptedEvidenceId).toBe(second.attemptId);
    expect(providerCalls).toBe(3);
  });
});
