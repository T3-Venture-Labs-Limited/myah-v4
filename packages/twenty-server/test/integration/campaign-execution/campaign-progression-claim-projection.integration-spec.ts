import { randomUUID } from 'node:crypto';
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
import { CampaignEmailRuntimeService } from 'src/modules/campaign-execution/services/campaign-email-runtime.service';
import { CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import { OutboundEmailDispatchService } from 'src/modules/campaign-execution/services/outbound-email-dispatch.service';
import { computeCampaignProjectedMessageId } from 'src/modules/campaign-execution/utils/campaign-execution-identity.util';

setPgDateTypeParser();

const id = {
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
  let reservationLocalDate: string;

  beforeAll(async () => {
    dataSource = await new DataSource(
      global.testDataSource.options,
    ).initialize();
    const capacity = new MailboxCapacityService();
    reservationLocalDate = new Date().toISOString().slice(0, 10);
    const capacityResult = () => {
      const observedAt = new Date();
      observedAt.setMilliseconds(573);
      const selected = {
        sender: mailbox,
        localDate: reservationLocalDate,
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
      // UUID-derived schema identifier; data values are bound.
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await manager.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
      await manager.query(
        `INSERT INTO core."connectedAccount" (id,"workspaceId",handle,provider,"userWorkspaceId",visibility,"dailySendLimit","minimumSendIntervalMs")
         SELECT $1,$2,'sender@example.com','google',"userWorkspaceId",visibility,100,0
           FROM core."connectedAccount" ORDER BY "createdAt" LIMIT 1`,
        [id.account, id.workspace],
      );
      await manager.query(
        `INSERT INTO core."messageChannel" (id,"workspaceId",visibility,handle,type,"pendingGroupEmailsAction","syncStage","connectedAccountId")
         SELECT $1,$2,visibility,'sender@example.com','EMAIL','NONE','MESSAGE_LIST_FETCH_PENDING',$3
           FROM core."messageChannel" ORDER BY "createdAt" LIMIT 1`,
        [id.channel, id.workspace, id.account],
      );
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
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await manager.query(
        `CREATE TABLE IF NOT EXISTS "${schema}".campaign (id uuid PRIMARY KEY,"lifecycleStatus" text NOT NULL,"sequenceAuthorization" jsonb)`,
      );
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await manager.query(
        `CREATE TABLE IF NOT EXISTS "${schema}"."campaignCreator" (id uuid PRIMARY KEY,"campaignId" uuid NOT NULL,stage text,"deletedAt" timestamptz,"updatedAt" timestamptz DEFAULT now())`,
      );
      // pi-lens-ignore: sql-injection, no-sql-in-code
      await manager.query(
        `INSERT INTO "${schema}".campaign VALUES ($1,'ACTIVE',$2::jsonb) ON CONFLICT DO NOTHING`,
        [id.campaign, JSON.stringify(projection)],
      );
      // pi-lens-ignore: sql-injection, no-sql-in-code
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

  it('preserves PostgreSQL reservation precision through runtime reconstruction and processing acquisition', async () => {
    const providerCalls: string[] = [];
    const outbound = {
      getProviderRequestTimeoutMs: jest.fn(() => 30_000),
      sendMessage: jest.fn(async () => {
        const [processing] = await dataSource.query(
          `SELECT "attemptState","finalEvidenceDigest" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
          [attemptId],
        );
        expect(processing.attemptState).toBe('PROCESSING');
        expect(processing.finalEvidenceDigest).toHaveLength(64);
        providerCalls.push('sendMessage');
        return {
          headerMessageId: '<header@example.com>',
          messageExternalId: 'provider-runtime',
        };
      }),
    };
    const dispatch = new OutboundEmailDispatchService(
      {
        runInTransaction: (work) => dataSource.transaction(work),
        runPreProviderTransaction: (work) => dataSource.transaction(work),
      },
      {
        revalidate: jest.fn(async ({ materialEvidence, submission }) => ({
          projectedMessageId: materialEvidence.projectedMessageId,
          status: 'AUTHORIZED' as const,
          submission,
        })),
      },
      { now: jest.fn(() => performance.now()) },
      attemptService,
      outbound as never,
    );
    const dispatchSpy = jest.spyOn(dispatch, 'dispatch');
    const progressionRoutes = {
      reconcileAcceptedInTransaction: jest.fn(),
      reconcileDefinitelyUnacceptedInTransaction: jest.fn(),
      reconcileUnknownInTransaction: jest.fn(),
    };
    const runtime = new CampaignEmailRuntimeService(
      {
        getGlobalWorkspaceDataSource: jest.fn(async () => dataSource),
      } as never,
      progressionRoutes as never,
      dispatch,
      { reconcile: jest.fn(async () => 'PROJECTED') } as never,
      { reconcilePendingMessageInTransaction: jest.fn() } as never,
    );
    const [before] = await dataSource.query(
      `SELECT "claimedAt","slotAt","unknownAfter","localDate" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
      [attemptId],
    );
    for (const value of [
      before.claimedAt,
      before.slotAt,
      before.unknownAfter,
    ]) {
      expect(value).toBeInstanceOf(Date);
      expect(value.getUTCMilliseconds()).toBe(573);
    }
    expect(before.localDate).toBe(reservationLocalDate);
    await (runtime as any).dispatchAttempt(
      id.workspace,
      id.campaign,
      attemptId,
    );

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    await expect(dispatchSpy.mock.results[0].value).resolves.toMatchObject({
      status: 'ACCEPTED_RECORDED',
    });
    expect(providerCalls).toEqual(['sendMessage']);
    expect(outbound.sendMessage).toHaveBeenCalledTimes(1);
    expect(
      progressionRoutes.reconcileAcceptedInTransaction,
    ).toHaveBeenCalledTimes(1);

    await dataSource.query(
      `UPDATE core."outboundEmailAttempt"
          SET "attemptState"='RESERVED',"capacityState"='RESERVED',"finalEvidenceDigest"=NULL,
              "providerMessageId"=NULL,"providerAcceptedAt"=NULL,"providerHeaderMessageId"=NULL,
              "providerMessageExternalId"=NULL,"providerThreadExternalId"=NULL,
              "resolvedThreadExternalId"=NULL,"providerDeliveredRecipients"=NULL,
              "safeOutcomeReason"=NULL,"retryable"=NULL
        WHERE "attemptId"=$1`,
      [attemptId],
    );
    await dataSource.query(
      `UPDATE core."mailboxCapacityDay" SET "reservedCount"=1,"acceptedCount"=0
        WHERE "workspaceId"=$1 AND "connectedAccountId"=$2`,
      [id.workspace, id.account],
    );
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
    // pi-lens-ignore: sql-injection, no-sql-in-code
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
      new Date(state.accepted_at).getTime() + 60_000,
    );
  });

  it('preserves a later Creator stage and suppresses routing/generation/version mismatches without mutation', async () => {
    // pi-lens-ignore: sql-injection, no-sql-in-code
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
    // pi-lens-ignore: sql-injection, no-sql-in-code
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
