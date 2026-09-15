import { DataSource } from 'typeorm';

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
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';

setPgDateTypeParser();

const id = {
  workspace: 'c43e698f-7728-4e77-8871-4440fbaaa86e',
  campaign: '2bb53476-7c63-449a-8005-fe7f6a901ff2',
  execution: 'f437132b-2d88-4da9-861b-4c4e3aee9636',
  authorization: 'de3f6527-7966-4379-8061-b201a34bdd63',
  activation: '3e213e2b-985a-43f2-8e0b-615dec216686',
  workflow: '7853d2f2-9987-4a68-b35c-3df8a0168b24',
  version: '75e18372-3bcb-43d1-a8d9-14ad64b47e9a',
  enrollment: 'a993cdf2-c775-4251-bc9e-c63d2af7cd8d',
  occurrence: '709b54d0-2947-4fa8-966d-4436db41cddc',
  campaignCreator: '5546b5d6-178a-456c-9f6b-355800295a67',
  creator: '34046bfe-02aa-40b5-84e3-df46a95b5b21',
  message: '67e6f072-7566-4196-b8ad-6f3c02645d9b',
  nextMessage: 'a8257028-d164-41e5-b36e-f21e8c22b18b',
  account: 'ecf079f6-25e0-4415-9eaa-ff4665247a53',
  channel: '218b67db-d266-427a-8638-957d75bc7231',
} as const;
const schema = getWorkspaceSchemaName(id.workspace);
const fingerprint = 'a'.repeat(64);
const poolFingerprint = 'b'.repeat(64);
const renderDigest = 'c'.repeat(64);

const mailbox = {
  campaignAccountId: '9ee3560a-f970-4571-8e0e-42e2768d1a7a',
  connectedAccountId: id.account,
  messageChannelId: id.channel,
  recoveryPath: null,
  bindingStatus: 'RESOLVED_BINDING',
  senderHandle: 'sender@example.com',
  provider: 'google',
  dailySendLimit: 100,
  minimumSendIntervalMs: 0,
  status: 'READY',
  reason: null,
  missingBinding: null,
};

const sequence = {
  loadExecutionPlanInTransaction: jest.fn(async () => ({
    kind: 'READY',
    nodes: [
      { messageId: id.message, channel: 'EMAIL', replyToThread: false },
      { messageId: id.nextMessage, channel: 'EMAIL', replyToThread: false },
    ],
    delaysSeconds: [60],
  })),
};
const audience = {
  reviewInTransaction: jest.fn(async () => ({
    eligible: [
      {
        campaignCreatorId: id.campaignCreator,
        creatorId: id.creator,
        normalizedEmail: 'recipient@example.com',
      },
    ],
    excluded: [],
  })),
};
const sender = {
  getCampaignEmailSenderPoolInTransaction: jest.fn(async () => ({
    senderPoolFingerprint: poolFingerprint,
    serializationRevision: 'campaign-sender-pool/v1',
    rotationPolicyId: 'campaign-email-rotation/v1',
    mailboxes: [mailbox],
  })),
};
const render = {
  renderSequenceEmail: jest.fn(async () => ({
    kind: 'READY',
    render: {
      renderDigest,
      rendererRevision: 'campaign-renderer/v1',
      subject: 'Subject',
      html: '<p>Body</p>',
      text: 'Body',
      bodyWithSignature: '<p>Body</p>',
      signature: null,
      composedEmail: {
        subject: 'Subject',
        body: 'Body',
        html: '<p>Body</p>',
        to: 'recipient@example.com',
        references: [],
      },
    },
  })),
};

const routing = (attemptId: string) => ({
  workspaceId: id.workspace,
  campaignId: id.campaign,
  campaignExecutionId: id.execution,
  authorizationId: id.authorization,
  authorizationGeneration: 1,
  activationId: id.activation,
  workflowVersionId: id.version,
  enrollmentId: id.enrollment,
  occurrenceId: id.occurrence,
  connectedAccountId: id.account,
  messageChannelId: id.channel,
  attemptId,
});

describe('Campaign progression retained PostgreSQL claim/projection', () => {
  let dataSource: DataSource;
  let attemptService: OutboundEmailAttemptService;
  let service: CampaignProgressionService;
  let attemptId: string;

  beforeAll(async () => {
    dataSource = await new DataSource(
      global.testDataSource.options,
    ).initialize();
    const capacity = new MailboxCapacityService();
    const localDate = new Date().toISOString().slice(0, 10);
    const capacityResult = () => {
      const observedAt = new Date();
      const selected = {
        sender: mailbox,
        localDate,
        acceptedCount: 0,
        reservedCount: 0,
        earliestEligibleAt: observedAt,
        nextEligibleAt: null,
        nextLocalMidnightAt: new Date(observedAt.getTime() + 86_400_000),
      };
      return {
        status: 'ELIGIBLE_NOW' as const,
        observedAt,
        selected,
        lockedCandidates: [selected],
      };
    };
    jest
      .spyOn(capacity, 'lockAndRankForReservation')
      .mockImplementation(async () => capacityResult() as never);
    jest
      .spyOn(capacity, 'revalidateForReservationMutation')
      .mockImplementation(async () => capacityResult() as never);
    jest
      .spyOn(capacity, 'lockReservationDay')
      .mockImplementation(async (input, manager) => {
        const rows = await manager.query(
          `SELECT "acceptedCount", "reservedCount" FROM core."mailboxCapacityDay"
           WHERE "workspaceId"=$1 AND "connectedAccountId"=$2 AND "localDate"=$3 FOR UPDATE`,
          [input.workspaceId, input.connectedAccountId, input.localDate],
        );
        return {
          workspaceId: input.workspaceId,
          connectedAccountId: input.connectedAccountId,
          localDate: input.localDate,
          acceptedCount: Number(rows[0]?.acceptedCount ?? 0),
          reservedCount: Number(rows[0]?.reservedCount ?? 0),
        };
      });
    jest
      .spyOn(capacity, 'incrementReservedAndAdvanceClock')
      .mockImplementation(async ({ lockedDay }, manager) => {
        await manager.query(
          `INSERT INTO core."mailboxCapacityDay" ("workspaceId","connectedAccountId","localDate","reservedCount")
           VALUES ($1,$2,$3,1) ON CONFLICT ("workspaceId","connectedAccountId","localDate")
           DO UPDATE SET "reservedCount"=core."mailboxCapacityDay"."reservedCount"+1`,
          [
            lockedDay.workspaceId,
            lockedDay.connectedAccountId,
            lockedDay.localDate,
          ],
        );
      });
    attemptService = new OutboundEmailAttemptService(capacity);
    service = new CampaignProgressionService(
      attemptService,
      capacity,
      sequence as never,
      audience as never,
      sender as never,
      render as never,
    );
    const binding = {
      campaignExecutionId: id.execution,
      authorizationId: id.authorization,
      generation: 1,
      workflowVersionId: id.version,
      request: {
        preparedProof: {
          preparedFingerprint: fingerprint,
          orderedMessageIds: [id.message, id.nextMessage],
          fixedMaterialProofs: [
            { messageId: id.message, orderedAttachmentProofs: [] },
            { messageId: id.nextMessage, orderedAttachmentProofs: [] },
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
      await manager.query(`ALTER TABLE core."outboundEmailAttempt"
        ADD COLUMN IF NOT EXISTS "providerHeaderMessageId" text,
        ADD COLUMN IF NOT EXISTS "reconciledProviderHeaderMessageId" text,
        ADD COLUMN IF NOT EXISTS "providerMessageExternalId" text,
        ADD COLUMN IF NOT EXISTS "providerThreadExternalId" text,
        ADD COLUMN IF NOT EXISTS "resolvedThreadExternalId" text,
        ADD COLUMN IF NOT EXISTS "providerDeliveredRecipients" jsonb,
        ADD COLUMN IF NOT EXISTS "projectedMessageThreadId" uuid`);
      await manager.query(`CREATE TABLE IF NOT EXISTS core."campaignOutboundRender" (
        "attemptId" uuid PRIMARY KEY,"workspaceId" uuid NOT NULL,"campaignId" uuid NOT NULL,
        "enrollmentId" uuid NOT NULL,"occurrenceId" uuid NOT NULL,"authorizationId" uuid NOT NULL,
        "workflowVersionId" uuid NOT NULL,"messageId" uuid NOT NULL,"renderDigest" text NOT NULL,
        "signatureDigest" text,"rendererRevision" text NOT NULL,subject text NOT NULL,html text NOT NULL,
        text text NOT NULL,"bodyWithSignature" text NOT NULL,"toRecipient" text NOT NULL,
        "inReplyTo" text,"threadExternalId" text,"references" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
      await manager.query(
        `CREATE TABLE IF NOT EXISTS "${schema}".campaign (id uuid PRIMARY KEY,"lifecycleStatus" text NOT NULL,"sequenceAuthorization" jsonb)`,
      );
      await manager.query(
        `CREATE TABLE IF NOT EXISTS "${schema}"."campaignCreator" (id uuid PRIMARY KEY,stage text,"deletedAt" timestamptz,"updatedAt" timestamptz DEFAULT now())`,
      );
      await manager.query(
        `INSERT INTO "${schema}".campaign VALUES ($1,'ACTIVE',$2::jsonb) ON CONFLICT DO NOTHING`,
        [id.campaign, JSON.stringify(projection)],
      );
      await manager.query(
        `INSERT INTO "${schema}"."campaignCreator" (id,stage) VALUES ($1,'READY') ON CONFLICT DO NOTHING`,
        [id.campaignCreator],
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
        `INSERT INTO core."campaignEnrollment" (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration","campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt") VALUES ($1,$2,$3,$4,$5,1,$6,$7,2,0,'ACTIVE',now()) ON CONFLICT DO NOTHING`,
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
  });

  afterAll(async () => dataSource.destroy());

  it('serializes competing full-coordinate claims to one reservation and one dispatchable result', async () => {
    const claim = () =>
      dataSource.transaction((manager) =>
        service.claimAndReserveDueOccurrenceInTransaction(
          {
            workspaceId: id.workspace,
            campaignId: id.campaign,
            occurrenceId: id.occurrence,
          },
          manager as never,
        ),
      );
    const results = await Promise.all([claim(), claim()]);
    expect(results.map(({ status }) => status).sort()).toEqual([
      'DISPATCHABLE_REPLAY',
      'RESERVED',
    ]);
    const reserved = results.find(
      (result): result is Extract<typeof result, { status: 'RESERVED' }> =>
        result.status === 'RESERVED',
    );
    expect(reserved).toBeDefined();
    attemptId = reserved!.attemptId;
    const [counts] = await dataSource.query(
      `SELECT
      (SELECT count(*)::int FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1 AND "occurrenceId"=$2) attempts,
      (SELECT count(*)::int FROM core."campaignOutboundRender" WHERE "workspaceId"=$1 AND "occurrenceId"=$2) renders,
      (SELECT coalesce(sum("reservedCount"),0)::int FROM core."mailboxCapacityDay" WHERE "workspaceId"=$1) reserved`,
      [id.workspace, id.occurrence],
    );
    expect(counts).toEqual({ attempts: 1, renders: 1, reserved: 1 });
  });

  it('replays a crash-redelivered RESERVED+IN_FLIGHT claim without rerender, rerank, or capacity increment', async () => {
    const rendersBefore = render.renderSequenceEmail.mock.calls.length;
    await expect(
      dataSource.transaction((manager) =>
        service.claimAndReserveDueOccurrenceInTransaction(
          {
            workspaceId: id.workspace,
            campaignId: id.campaign,
            occurrenceId: id.occurrence,
          },
          manager as never,
        ),
      ),
    ).resolves.toEqual({ status: 'DISPATCHABLE_REPLAY', attemptId });
    expect(render.renderSequenceEmail).toHaveBeenCalledTimes(rendersBefore);
    const [day] = await dataSource.query(
      `SELECT "reservedCount" FROM core."mailboxCapacityDay" WHERE "workspaceId"=$1 AND "connectedAccountId"=$2`,
      [id.workspace, id.account],
    );
    expect(day.reservedCount).toBe(1);
  });

  it('records accepted projected evidence and progresses exactly once with deterministic dueAt and READY-only stage CAS', async () => {
    const [attempt] = await dataSource.query(
      `SELECT * FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [attemptId],
    );
    const reservationBinding = {
      attemptNumber: attempt.attemptNumber,
      claimedAt: attempt.claimedAt,
      localDate: attempt.localDate,
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: 'ROTATE',
      senderPoolFingerprint: poolFingerprint,
      slotAt: attempt.slotAt,
      unknownAfter: attempt.unknownAfter,
    };
    const submission = {
      ...routing(attemptId),
      source: 'CAMPAIGN_SEQUENCE' as const,
      messageId: id.message,
      provider: 'google',
      normalizedSenderHandle: 'sender@example.com',
      normalizedRecipient: 'recipient@example.com',
      renderDigest,
      finalEvidenceDigest: 'd'.repeat(64),
      submissionCapability: {
        kind: 'CAMPAIGN_SEQUENCE_SUBMISSION' as const,
        attemptId,
        campaignExecutionId: id.execution,
        authorizationGeneration: 1,
        activationId: id.activation,
        renderDigest,
        reservationBinding,
        renderContext: {
          ...routing(attemptId),
          messageId: id.message,
          provider: 'google',
          normalizedSenderHandle: 'sender@example.com',
          normalizedRecipient: 'recipient@example.com',
        },
      },
    };
    await dataSource.transaction(async (manager) => {
      await expect(
        attemptService.beginSubmission(submission as never, manager),
      ).resolves.toMatchObject({ status: 'PROCESSING_ACQUIRED' });
      await expect(
        attemptService.recordAccepted(
          {
            ...submission,
            providerMessageId: 'provider-id',
            providerHeaderMessageId: '<provider@example.com>',
            providerMessageExternalId: 'provider-id',
            providerThreadExternalId: 'thread-id',
            resolvedThreadExternalId: 'thread-id',
            providerDeliveredRecipients: {
              to: ['recipient@example.com'],
              cc: [],
              bcc: [],
            },
            projectedMessageId: null,
            projectedMessageThreadId: null,
          } as never,
          manager,
        ),
      ).resolves.toMatchObject({ status: 'RECORDED' });
      await manager.query(
        `UPDATE core."outboundEmailAttempt" SET "projectedMessageId"=$1,"projectedMessageThreadId"=$2,"updatedAt"=now()
         WHERE "workspaceId"=$3 AND "attemptId"=$4 AND "attemptState"='ACCEPTED'`,
        [
          computeCampaignProjectedMessageId(attemptId),
          '89eb33fc-c652-4bd2-8ee1-dc8d62847a17',
          id.workspace,
          attemptId,
        ],
      );
    });
    const results = await Promise.all([
      dataSource.transaction((manager) =>
        service.reconcileAcceptedInTransaction(
          routing(attemptId),
          manager as never,
        ),
      ),
      dataSource.transaction((manager) =>
        service.reconcileAcceptedInTransaction(
          routing(attemptId),
          manager as never,
        ),
      ),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([
      'EXACT_REPLAY',
      'PROGRESSED',
    ]);
    const [state] = await dataSource.query(
      `SELECT
      (SELECT state FROM core."campaignOccurrence" WHERE id=$1) occurrence,
      (SELECT stage FROM "${schema}"."campaignCreator" WHERE id=$2) stage,
      (SELECT count(*)::int FROM core."campaignOccurrence" WHERE "enrollmentId"=$3 AND "authoredMessageIndex"=1) next_count,
      (SELECT "dueAt" FROM core."campaignOccurrence" WHERE "enrollmentId"=$3 AND "authoredMessageIndex"=1) next_due,
      (SELECT "providerAcceptedAt" FROM core."outboundEmailAttempt" WHERE "attemptId"=$4) accepted_at`,
      [id.occurrence, id.campaignCreator, id.enrollment, attemptId],
    );
    expect(state.occurrence).toBe('SUCCEEDED');
    expect(state.stage).toBe('CONTACTED');
    expect(state.next_count).toBe(1);
    expect(new Date(state.next_due).getTime()).toBe(
      Math.floor(new Date(state.accepted_at).getTime() / 1000) * 1000 + 60_000,
    );
  });

  it('preserves a later Creator stage and suppresses routing/generation/version mismatches without mutation', async () => {
    await dataSource.query(
      `UPDATE "${schema}"."campaignCreator" SET stage='NEGOTIATING' WHERE id=$1`,
      [id.campaignCreator],
    );
    const before = await dataSource.query(
      `SELECT state,"updatedAt" FROM core."campaignOccurrence" WHERE id=$1`,
      [id.occurrence],
    );
    await expect(
      dataSource.transaction((manager) =>
        service.reconcileAcceptedInTransaction(
          { ...routing(attemptId), authorizationGeneration: 2 },
          manager as never,
        ),
      ),
    ).resolves.toEqual({ status: 'TERMINAL_SUPPRESSED' });
    const [creator] = await dataSource.query(
      `SELECT stage FROM "${schema}"."campaignCreator" WHERE id=$1`,
      [id.campaignCreator],
    );
    const after = await dataSource.query(
      `SELECT state,"updatedAt" FROM core."campaignOccurrence" WHERE id=$1`,
      [id.occurrence],
    );
    expect(creator.stage).toBe('NEGOTIATING');
    expect(after).toEqual(before);
  });

  it('strict completion refuses unresolved work and UNKNOWN never advances or creates another attempt', async () => {
    const before = await dataSource.query(
      `SELECT count(*)::int count FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1`,
      [id.workspace],
    );
    const [next] = await dataSource.query(
      `SELECT id FROM core."campaignOccurrence" WHERE "enrollmentId"=$1 AND "authoredMessageIndex"=1`,
      [id.enrollment],
    );
    await dataSource.query(
      `UPDATE core."campaignOccurrence" SET state='CANCELLED', "terminalReason"='CAMPAIGN_PAUSED', "terminalAt"=now() WHERE id=$1`,
      [next.id],
    );
    await expect(
      dataSource.transaction((manager) =>
        service.claimAndReserveDueOccurrenceInTransaction(
          {
            workspaceId: id.workspace,
            campaignId: id.campaign,
            occurrenceId: next.id,
          },
          manager as never,
        ),
      ),
    ).resolves.toEqual({ status: 'TERMINAL' });
    await dataSource.query(
      `UPDATE core."campaignOccurrence" SET state='UNKNOWN', "terminalReason"=NULL, "terminalAt"=NULL WHERE id=$1`,
      [next.id],
    );
    await expect(
      dataSource.transaction((manager) =>
        service.claimAndReserveDueOccurrenceInTransaction(
          {
            workspaceId: id.workspace,
            campaignId: id.campaign,
            occurrenceId: next.id,
          },
          manager as never,
        ),
      ),
    ).resolves.toEqual({ status: 'ALREADY_CLAIMED' });
    await expect(
      dataSource.transaction((manager) =>
        service.tryCompleteCampaignInTransaction(
          { workspaceId: id.workspace, campaignId: id.campaign },
          manager as never,
        ),
      ),
    ).resolves.toEqual({ status: 'NOT_COMPLETE' });
    const after = await dataSource.query(
      `SELECT count(*)::int count FROM core."outboundEmailAttempt" WHERE "workspaceId"=$1`,
      [id.workspace],
    );
    expect(after).toEqual(before);
  });
});
