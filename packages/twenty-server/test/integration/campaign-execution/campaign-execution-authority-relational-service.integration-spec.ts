import { randomUUID } from 'node:crypto';

import { ConnectedAccountProvider } from 'twenty-shared/types';
import { DataSource, type QueryRunner } from 'typeorm';

import { setPgDateTypeParser } from 'src/database/pg/set-pg-date-type-parser';
import { MailboxCapacityService } from 'src/modules/campaign-execution/services/mailbox-capacity.service';
import { OutboundEmailAttemptService } from 'src/modules/campaign-execution/services/outbound-email-attempt.service';
import {
  type CampaignSequenceSubmissionInput,
  type DirectSubmissionInput,
  type OutboundEmailAttemptReceipt,
  type ReserveOutboundEmailAttemptInput,
} from 'src/modules/campaign-execution/types/outbound-email-attempt.type';
import { type ReadyCampaignSenderReadiness } from 'src/modules/myah-campaign/types/campaign-sender-pool.type';

setPgDateTypeParser();

const committedFixtureWorkspaceIds = new Set<string>();
const digest = (character: string) => character.repeat(64);
const boundFixtureConnections = (runners: QueryRunner[]) =>
  Promise.all(
    runners.map((runner) => runner.query(`SET statement_timeout = '10s'`)),
  );
const withBoundedFixtureQuery = async <Result>(
  dataSource: DataSource,
  operation: (runner: QueryRunner) => Promise<Result>,
): Promise<Result> => {
  const runner = dataSource.createQueryRunner();

  try {
    await runner.connect();
    await runner.query(`SET statement_timeout = '10s'`);

    return await operation(runner);
  } finally {
    if (!runner.isReleased) await runner.release();
  }
};

const cleanupCommittedFixtures = (dataSource: DataSource) =>
  withBoundedFixtureQuery(dataSource, async (cleanupRunner) => {
    for (const workspaceId of committedFixtureWorkspaceIds) {
      for (const table of [
        'outboundEmailAttempt',
        'mailboxCapacityDay',
        'mailboxDispatchClock',
        'campaignOccurrence',
        'campaignEnrollment',
        'campaignActivation',
        'campaignSequenceAuthorization',
        'campaignExecution',
      ]) {
        await cleanupRunner.query(
          `DELETE FROM core."${table}" WHERE "workspaceId"=$1`,
          [workspaceId],
        );
      }
      committedFixtureWorkspaceIds.delete(workspaceId);
    }
  });

const expectFailure = async (
  runner: QueryRunner,
  constraint: string,
  operation: () => Promise<unknown>,
) => {
  await runner.query('SAVEPOINT expected_failure');
  try {
    await operation();
    throw new Error(`Expected ${constraint}`);
  } catch (error) {
    expect(error).toMatchObject({
      code: constraint.startsWith('FK_') ? '23503' : '23505',
      constraint,
    });
  } finally {
    await runner.query('ROLLBACK TO SAVEPOINT expected_failure');
    await runner.query('RELEASE SAVEPOINT expected_failure');
  }
};

type Graph = ReturnType<typeof graphIds>;
const graphIds = () => ({
  workspaceId: randomUUID(),
  campaignId: randomUUID(),
  executionId: randomUUID(),
  authorizationId: randomUUID(),
  workflowId: randomUUID(),
  workflowVersionId: randomUUID(),
  userWorkspaceId: randomUUID(),
  activationId: randomUUID(),
  enrollmentId: randomUUID(),
  occurrenceId: randomUUID(),
  campaignCreatorId: randomUUID(),
  creatorId: randomUUID(),
  messageId: randomUUID(),
});

const insertGraph = async (runner: QueryRunner, ids = graphIds()) => {
  committedFixtureWorkspaceIds.add(ids.workspaceId);
  await runner.query(
    `INSERT INTO core."campaignExecution"
      (id, "workspaceId", "campaignId", "timeZone", "startLocalTime", "endLocalTime", "campaignCapacityTimeZone")
     VALUES ($1,$2,$3,'UTC','09:00','17:00','UTC')`,
    [ids.executionId, ids.workspaceId, ids.campaignId],
  );
  await runner.query(
    `INSERT INTO core."campaignSequenceAuthorization"
      ("authorizationId","workspaceId","campaignId","campaignExecutionId",generation,"startIdempotencyKey",
       "preparedFingerprint","workflowId","workflowVersionId","initiatingUserWorkspaceId",state,"authorizedAt",binding)
     VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,'ACTIVE',now(),'{}')`,
    [
      ids.authorizationId,
      ids.workspaceId,
      ids.campaignId,
      ids.executionId,
      randomUUID(),
      digest('a'),
      ids.workflowId,
      ids.workflowVersionId,
      ids.userWorkspaceId,
    ],
  );
  await runner.query(
    `INSERT INTO core."campaignActivation"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",
       "workflowVersionId","activatedAt","createdEnrollmentCount","createdOccurrenceCount")
     VALUES ($1,$2,$3,$4,$5,1,$6,now(),1,1)`,
    [
      ids.activationId,
      ids.workspaceId,
      ids.campaignId,
      ids.executionId,
      ids.authorizationId,
      ids.workflowVersionId,
    ],
  );
  await runner.query(
    `INSERT INTO core."campaignEnrollment"
      (id,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",
       "campaignCreatorId","creatorId","authoredMessageCount","nextAuthoredMessageIndex",state,"enrolledAt")
     VALUES ($1,$2,$3,$4,$5,1,$6,$7,2,0,'ACTIVE',now())`,
    [
      ids.enrollmentId,
      ids.workspaceId,
      ids.campaignId,
      ids.executionId,
      ids.authorizationId,
      ids.campaignCreatorId,
      ids.creatorId,
    ],
  );
  await runner.query(
    `INSERT INTO core."campaignOccurrence"
      (id,"workspaceId","campaignId","enrollmentId","workflowVersionId","messageId","authoredMessageIndex",state,"dueAt")
     VALUES ($1,$2,$3,$4,$5,$6,0,'PENDING',now())`,
    [
      ids.occurrenceId,
      ids.workspaceId,
      ids.campaignId,
      ids.enrollmentId,
      ids.workflowVersionId,
      ids.messageId,
    ],
  );
  return ids;
};

type Proof = ReturnType<typeof proofIds>;
const proofIds = (workspaceId = randomUUID()) => ({
  workspaceId,
  proofId: randomUUID(),
  confirmationId: randomUUID(),
  attemptId: randomUUID(),
  campaignId: randomUUID(),
  campaignCreatorId: randomUUID(),
  workflowVersionId: randomUUID(),
  messageId: randomUUID(),
  requesterUserId: randomUUID(),
  requesterUserWorkspaceId: randomUUID(),
  connectedAccountId: randomUUID(),
  messageChannelId: randomUUID(),
});
const insertProof = async (runner: QueryRunner, p: Proof) => {
  await runner.query(
    `INSERT INTO core."campaignTestPreparationProof"
      ("testPreparationProofId","confirmationId","attemptId","workspaceId","campaignId","campaignCreatorId",
       "workflowVersionId","messageId","requesterUserId","requesterUserWorkspaceId","normalizedRecipient",
       "connectedAccountId","messageChannelId",provider,"normalizedSenderHandle","senderPoolFingerprint",
       "campaignCapacityTimeZone","selectionConstraintKind","priorAcceptedEvidenceId","threadScopeKind",
       "plannedPriorMessageId","threadEnrollmentId","threadOccurrenceId","renderDigest","previewDigest",
       "testTransportDigest","confirmationIssuedAt","reservationEligibleUntil","testSubmissionCapabilityId","finalEvidenceDigest")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'recipient@example.com',$11,$12,'google','sender@example.com',
       $13,'UTC','ROTATE',NULL,'NEW_THREAD',NULL,NULL,NULL,$14,$15,$16,now(),now()+interval '1 hour',NULL,NULL)`,
    [
      p.proofId,
      p.confirmationId,
      p.attemptId,
      p.workspaceId,
      p.campaignId,
      p.campaignCreatorId,
      p.workflowVersionId,
      p.messageId,
      p.requesterUserId,
      p.requesterUserWorkspaceId,
      p.connectedAccountId,
      p.messageChannelId,
      digest('b'),
      digest('c'),
      digest('d'),
      digest('e'),
    ],
  );
};

const insertSequenceAttempt = (
  runner: QueryRunner,
  g: Graph,
  override: Partial<Graph & { attemptId: string; attemptNumber: number }> = {},
) => {
  const value = {
    ...g,
    attemptId: randomUUID(),
    attemptNumber: 1,
    ...override,
  };
  return runner.query(
    `INSERT INTO core."outboundEmailAttempt"
      ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
       provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","priorAcceptedEvidenceId",
       "senderPoolFingerprint","localDate","claimedAt","slotAt","unknownAfter","campaignId","enrollmentId",
       "occurrenceId","authorizationId","workflowVersionId","messageId","attemptNumber","renderDigest")
     VALUES ($1,$2,'CAMPAIGN_SEQUENCE','RESERVED','RESERVED',$3,$4,'google','sender@example.com','recipient@example.com',
       'ROTATE',NULL,$5,'2040-01-02','2040-01-02T10:00Z','2040-01-02T10:00Z','2040-01-02T10:01Z',
       $6,$7,$8,$9,$10,$11,$12,$13) RETURNING "attemptId"`,
    [
      value.attemptId,
      value.workspaceId,
      randomUUID(),
      randomUUID(),
      digest('f'),
      value.campaignId,
      value.enrollmentId,
      value.occurrenceId,
      value.authorizationId,
      value.workflowVersionId,
      value.messageId,
      value.attemptNumber,
      digest('1'),
    ],
  );
};

const insertTestAttempt = (
  runner: QueryRunner,
  p: Proof,
  override: Partial<Proof> = {},
) => {
  const value = { ...p, ...override };
  return runner.query(
    `INSERT INTO core."outboundEmailAttempt"
      ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
       provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","priorAcceptedEvidenceId",
       "senderPoolFingerprint","localDate","claimedAt","slotAt","unknownAfter","campaignId","workflowVersionId",
       "messageId","testPreparationProofId","requesterUserWorkspaceId","renderDigest","previewDigest","testTransportDigest")
     VALUES ($1,$2,'CAMPAIGN_TEST','RESERVED','RESERVED',$3,$4,'google','sender@example.com','recipient@example.com',
       'ROTATE',NULL,$5,'2040-01-02','2040-01-02T10:00Z','2040-01-02T10:00Z','2040-01-02T10:01Z',
       $6,$7,$8,$9,$10,$11,$12,$13) RETURNING "attemptId"`,
    [
      value.attemptId,
      value.workspaceId,
      value.connectedAccountId,
      value.messageChannelId,
      digest('2'),
      value.campaignId,
      value.workflowVersionId,
      value.messageId,
      value.proofId,
      value.requesterUserWorkspaceId,
      digest('c'),
      digest('d'),
      digest('e'),
    ],
  );
};

describe('campaign execution relational PostgreSQL contract', () => {
  let runner: QueryRunner;
  let dataSource: DataSource;
  beforeAll(async () => {
    dataSource = await new DataSource(
      global.testDataSource.options,
    ).initialize();
  });
  afterAll(async () => {
    try {
      await cleanupCommittedFixtures(dataSource);
    } finally {
      await dataSource.destroy();
    }
  });
  beforeEach(async () => {
    runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
  });
  afterEach(async () => {
    try {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      if (!runner.isReleased) await runner.release();
    }
    await cleanupCommittedFixtures(dataSource);
  });

  it('enforces each outbound sequence binding independently', async () => {
    const g = await insertGraph(runner);
    await expectFailure(runner, 'FK_OEA_OCCURRENCE_BINDING', () =>
      insertSequenceAttempt(runner, g, {
        messageId: randomUUID(),
      }),
    );

    const authorizationB = randomUUID();
    await runner.query(
      `INSERT INTO core."campaignSequenceAuthorization"
       SELECT $2,"workspaceId","campaignId","campaignExecutionId",2,$3,"preparedFingerprint","workflowId",
              "workflowVersionId","initiatingUserWorkspaceId",'REVOKED',now(),now(),'CAMPAIGN_PAUSED',binding,now(),now()
         FROM core."campaignSequenceAuthorization" WHERE "authorizationId"=$1`,
      [g.authorizationId, authorizationB, randomUUID()],
    );
    await runner.query(
      `INSERT INTO core."campaignActivation"
       SELECT $2,"workspaceId","campaignId","campaignExecutionId",$3,2,"workflowVersionId",now(),0,0
         FROM core."campaignActivation" WHERE id=$1`,
      [g.activationId, randomUUID(), authorizationB],
    );
    await expectFailure(runner, 'FK_OEA_ENROLLMENT_AUTHORIZATION_SCOPE', () =>
      insertSequenceAttempt(runner, g, {
        authorizationId: authorizationB,
      }),
    );

    const versionB = randomUUID();
    const messageB = randomUUID();
    await runner.query(
      `UPDATE core."campaignOccurrence" SET "workflowVersionId"=$2,"messageId"=$3 WHERE id=$1`,
      [g.occurrenceId, versionB, messageB],
    );
    await expectFailure(runner, 'FK_OEA_ACTIVATION_BINDING', () =>
      insertSequenceAttempt(runner, g, {
        workflowVersionId: versionB,
        messageId: messageB,
      }),
    );
  });

  it('enforces immediate attempt-to-proof ordering, independent mismatches, retention and recovery', async () => {
    const attemptFirst = proofIds();
    await expectFailure(runner, 'FK_OEA_TEST_PREPARATION_PROOF', () =>
      insertTestAttempt(runner, attemptFirst),
    );
    expect(
      await runner.query(
        `SELECT COUNT(*)::integer AS count FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
        [attemptFirst.attemptId],
      ),
    ).toEqual([{ count: 0 }]);

    const proofFirst = proofIds();
    await runner.query('SAVEPOINT proof_first');
    await insertProof(runner, proofFirst);
    expect(await insertTestAttempt(runner, proofFirst)).toHaveLength(1);
    await expectFailure(runner, 'FK_OEA_TEST_PREPARATION_PROOF', () =>
      runner.query(
        `DELETE FROM core."campaignTestPreparationProof" WHERE "testPreparationProofId"=$1`,
        [proofFirst.proofId],
      ),
    );
    expect(
      await runner.query(
        `SELECT (SELECT COUNT(*) FROM core."campaignTestPreparationProof" WHERE "testPreparationProofId"=$1)::integer AS proofs,
                (SELECT COUNT(*) FROM core."outboundEmailAttempt" WHERE "attemptId"=$2)::integer AS attempts`,
        [proofFirst.proofId, proofFirst.attemptId],
      ),
    ).toEqual([{ proofs: 1, attempts: 1 }]);
    await runner.query('ROLLBACK TO SAVEPOINT proof_first');
    expect(
      await runner.query(
        `SELECT (SELECT COUNT(*) FROM core."campaignTestPreparationProof" WHERE "testPreparationProofId"=$1)::integer AS proofs,
                (SELECT COUNT(*) FROM core."outboundEmailAttempt" WHERE "attemptId"=$2)::integer AS attempts`,
        [proofFirst.proofId, proofFirst.attemptId],
      ),
    ).toEqual([{ proofs: 0, attempts: 0 }]);
    await runner.query('RELEASE SAVEPOINT proof_first');

    for (const coordinate of ['workspace', 'attempt', 'proof'] as const) {
      const p = proofIds();
      await runner.query('SAVEPOINT mismatch_fixture');
      await insertProof(runner, p);
      const override =
        coordinate === 'workspace'
          ? { workspaceId: randomUUID() }
          : coordinate === 'attempt'
            ? { attemptId: randomUUID() }
            : { proofId: randomUUID() };
      await expectFailure(runner, 'FK_OEA_TEST_PREPARATION_PROOF', () =>
        insertTestAttempt(runner, p, override),
      );
      expect(
        await runner.query(
          `SELECT COUNT(*)::integer AS count FROM core."outboundEmailAttempt"
            WHERE "testPreparationProofId"=$1`,
          [override.proofId ?? p.proofId],
        ),
      ).toEqual([{ count: 0 }]);
      await runner.query('ROLLBACK TO SAVEPOINT mismatch_fixture');
      await runner.query('RELEASE SAVEPOINT mismatch_fixture');
    }
    expect(
      await runner.query(
        `SELECT condeferrable, condeferred, confdeltype, confupdtype
           FROM pg_constraint WHERE conname='FK_OEA_TEST_PREPARATION_PROOF'`,
      ),
    ).toEqual([
      {
        condeferrable: false,
        condeferred: false,
        confdeltype: 'a',
        confupdtype: 'a',
      },
    ]);
  });

  it('serializes beginSubmission CAS on the real attempt service', async () => {
    const setupRunner = dataSource.createQueryRunner();
    const g = graphIds();
    const attemptId = randomUUID();
    const claimedAt = new Date();
    const unknownAfter = new Date(claimedAt.getTime() + 60_000);
    let connectedAccountRows:
      | Array<{ connectedAccountId: string; messageChannelId: string }>
      | undefined;
    let setupRunnerConnected = false;
    try {
      await setupRunner.connect();
      setupRunnerConnected = true;
      await setupRunner.query(`SET statement_timeout = '10s'`);
      await insertGraph(setupRunner, g);
      await insertSequenceAttempt(setupRunner, g, { attemptId });
      await setupRunner.query(
        `UPDATE core."outboundEmailAttempt" SET "claimedAt"=$2,"slotAt"=$2,"unknownAfter"=$3 WHERE "attemptId"=$1`,
        [attemptId, claimedAt, unknownAfter],
      );
      connectedAccountRows = (await setupRunner.query(
        `SELECT "connectedAccountId","messageChannelId" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
        [attemptId],
      )) as Array<{ connectedAccountId: string; messageChannelId: string }>;
    } finally {
      if (setupRunnerConnected && !setupRunner.isReleased)
        await setupRunner.release();
    }
    const sender = connectedAccountRows?.[0];
    if (sender === undefined) throw new Error('Missing setup attempt sender');
    const binding = {
      attemptNumber: 1,
      claimedAt,
      localDate: '2040-01-02',
      priorAcceptedEvidenceId: null,
      selectionConstraintKind: 'ROTATE' as const,
      senderPoolFingerprint: digest('f'),
      slotAt: claimedAt,
      unknownAfter,
    };
    const input: CampaignSequenceSubmissionInput = {
      attemptId,
      authorizationId: g.authorizationId,
      campaignId: g.campaignId,
      connectedAccountId: sender.connectedAccountId,
      enrollmentId: g.enrollmentId,
      finalEvidenceDigest: digest('3'),
      messageChannelId: sender.messageChannelId,
      messageId: g.messageId,
      normalizedRecipient: 'recipient@example.com',
      normalizedSenderHandle: 'sender@example.com',
      occurrenceId: g.occurrenceId,
      provider: 'google',
      renderDigest: digest('1'),
      source: 'CAMPAIGN_SEQUENCE',
      submissionCapability: {
        attemptId,
        kind: 'CAMPAIGN_SEQUENCE_SUBMISSION',
        renderContext: {
          authorizationId: g.authorizationId,
          campaignId: g.campaignId,
          connectedAccountId: sender.connectedAccountId,
          enrollmentId: g.enrollmentId,
          messageChannelId: sender.messageChannelId,
          messageId: g.messageId,
          normalizedRecipient: 'recipient@example.com',
          normalizedSenderHandle: 'sender@example.com',
          occurrenceId: g.occurrenceId,
          provider: 'google',
          workflowVersionId: g.workflowVersionId,
          workspaceId: g.workspaceId,
        },
        renderDigest: digest('1'),
        reservationBinding: binding,
      },
      workflowVersionId: g.workflowVersionId,
      workspaceId: g.workspaceId,
    };
    const service = new OutboundEmailAttemptService(
      new MailboxCapacityService(),
    );
    const first = dataSource.createQueryRunner();
    const second = dataSource.createQueryRunner();
    let firstConnected = false;
    let secondConnected = false;
    let loserPromise: Promise<unknown> | undefined;
    try {
      await first.connect();
      firstConnected = true;
      await second.connect();
      secondConnected = true;
      await boundFixtureConnections([first, second]);
      await Promise.all([first.startTransaction(), second.startTransaction()]);
      const [{ pid: loserPid }] = (await second.query(
        'SELECT pg_backend_pid()::integer AS pid',
      )) as Array<{ pid: number }>;
      const [{ pid: winnerPid }] = (await first.query(
        'SELECT pg_backend_pid()::integer AS pid',
      )) as Array<{ pid: number }>;
      const winner = await service.beginSubmission(input, first.manager);
      expect(winner.status).toBe('PROCESSING_ACQUIRED');
      loserPromise = service.beginSubmission(input, second.manager);
      let blocked = false;
      for (let count = 0; count < 200; count += 1) {
        const [state] = await withBoundedFixtureQuery(
          dataSource,
          (observer) =>
            observer.query(
              `SELECT wait_event_type='Lock' AND $2=ANY(pg_blocking_pids($1)) AS blocked FROM pg_stat_activity WHERE pid=$1`,
              [loserPid, winnerPid],
            ) as Promise<Array<{ blocked: boolean }>>,
        );
        if (state?.blocked) {
          blocked = true;
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      if (!blocked)
        await withBoundedFixtureQuery(dataSource, (observer) =>
          observer.query('SELECT pg_cancel_backend($1)', [loserPid]),
        );
      expect(blocked).toBe(true);
      await first.commitTransaction();
      await expect(loserPromise).resolves.toMatchObject({
        currentState: 'PROCESSING',
        status: 'NOT_ACQUIRED',
      });
      await second.commitTransaction();
      expect(
        await dataSource.query(
          `SELECT "attemptState","finalEvidenceDigest" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
          [attemptId],
        ),
      ).toEqual([
        { attemptState: 'PROCESSING', finalEvidenceDigest: digest('3') },
      ]);
    } finally {
      if (first.isTransactionActive) await first.rollbackTransaction();
      if (loserPromise !== undefined) await Promise.allSettled([loserPromise]);
      if (second.isTransactionActive) await second.rollbackTransaction();
      await Promise.all([
        ...(firstConnected && !first.isReleased ? [first.release()] : []),
        ...(secondConnected && !second.isReleased ? [second.release()] : []),
      ]);
    }
  });

  it('serializes submission from a service-reserved direct receipt without double-counting capacity', async () => {
    const workspaceId = randomUUID();
    committedFixtureWorkspaceIds.add(workspaceId);
    const accountId = randomUUID();
    const channelId = randomUUID();
    const attemptId = randomUUID();
    const capabilityId = randomUUID();
    const sender = {
      bindingStatus: 'RESOLVED_BINDING',
      campaignAccountId: randomUUID(),
      connectedAccountId: accountId,
      dailySendLimit: 50,
      messageChannelId: channelId,
      minimumSendIntervalMs: 0,
      missingBinding: null,
      provider: ConnectedAccountProvider.GOOGLE,
      reason: null,
      recoveryPath: null,
      senderHandle: 'sender@example.com',
      status: 'READY',
    } satisfies ReadyCampaignSenderReadiness;
    const reservationInput = {
      attemptId,
      candidates: [sender],
      connectedAccountId: accountId,
      directReservationCapabilityId: capabilityId,
      messageChannelId: channelId,
      normalizedRecipient: 'recipient@example.com',
      normalizedSenderHandle: 'sender@example.com',
      priorAcceptedEvidenceId: null,
      provider: 'google',
      reservationEvidence: {
        kind: 'DIRECT_RESERVATION_CAPABILITY',
        directReservationCapabilityId: capabilityId,
      },
      selectionConstraintKind: 'EXPLICIT',
      source: 'INBOX',
      workspaceId,
      workspaceTimeZone: 'UTC',
    } satisfies ReserveOutboundEmailAttemptInput;
    const service = new OutboundEmailAttemptService(
      new MailboxCapacityService(),
    );
    const reservationRunner = dataSource.createQueryRunner();
    let reservationRunnerConnected = false;
    let receipt: OutboundEmailAttemptReceipt | undefined;
    try {
      await reservationRunner.connect();
      reservationRunnerConnected = true;
      await reservationRunner.query(`SET statement_timeout = '10s'`);
      await reservationRunner.startTransaction();
      const reservation = await service.reserveWithMailboxCapacity(
        reservationInput,
        reservationRunner.manager,
      );
      if (reservation.status !== 'RESERVED')
        throw new Error(`Unexpected reservation ${reservation.status}`);
      receipt = reservation.receipt;
      await reservationRunner.commitTransaction();
    } finally {
      if (reservationRunner.isTransactionActive)
        await reservationRunner.rollbackTransaction();
      if (reservationRunnerConnected && !reservationRunner.isReleased)
        await reservationRunner.release();
    }
    if (receipt === undefined)
      throw new Error('Missing direct reservation receipt');
    const beforeCapacity = await dataSource.query(
      `SELECT "reservedCount","acceptedCount" FROM core."mailboxCapacityDay"
        WHERE "workspaceId"=$1 AND "connectedAccountId"=$2`,
      [workspaceId, accountId],
    );
    const submissionInput = {
      attemptId,
      connectedAccountId: accountId,
      directReservationCapabilityId: capabilityId,
      finalEvidenceDigest: digest('3'),
      messageChannelId: channelId,
      normalizedRecipient: 'recipient@example.com',
      normalizedSenderHandle: 'sender@example.com',
      provider: 'google',
      source: 'INBOX',
      submissionCapability: {
        attemptId,
        connectedAccountId: accountId,
        directReservationCapabilityId: capabilityId,
        directSubmissionCapabilityId: randomUUID(),
        finalEvidenceDigest: digest('3'),
        kind: 'DIRECT_SUBMISSION_CAPABILITY',
        messageChannelId: channelId,
        normalizedRecipient: 'recipient@example.com',
        normalizedSenderHandle: 'sender@example.com',
        provider: 'google',
        reservationBinding: {
          claimedAt: receipt.claimedAt,
          directReservationCapabilityId: capabilityId,
          localDate: receipt.localDate,
          priorAcceptedEvidenceId: null,
          selectionConstraintKind: 'EXPLICIT',
          slotAt: receipt.slotAt,
          unknownAfter: receipt.unknownAfter,
        },
        workspaceId,
      },
      workspaceId,
    } satisfies DirectSubmissionInput;
    const first = dataSource.createQueryRunner();
    const second = dataSource.createQueryRunner();
    let firstConnected = false;
    let secondConnected = false;
    let loser: Promise<unknown> | undefined;
    try {
      await first.connect();
      firstConnected = true;
      await second.connect();
      secondConnected = true;
      await boundFixtureConnections([first, second]);
      const [[firstPid], [secondPid]] = (await Promise.all([
        first.query('SELECT pg_backend_pid() AS pid'),
        second.query('SELECT pg_backend_pid() AS pid'),
      ])) as [Array<{ pid: number }>, Array<{ pid: number }>];
      await Promise.all([first.startTransaction(), second.startTransaction()]);
      await expect(
        service.beginSubmission(submissionInput, first.manager),
      ).resolves.toMatchObject({ status: 'PROCESSING_ACQUIRED' });
      loser = service.beginSubmission(submissionInput, second.manager);
      let blocked = false;
      for (let count = 0; count < 500; count += 1) {
        const [activity] = await withBoundedFixtureQuery(
          dataSource,
          (observer) =>
            observer.query(
              `SELECT pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1`,
              [secondPid.pid],
            ) as Promise<Array<{ blockers: number[] }>>,
        );
        if (activity?.blockers.includes(firstPid.pid)) {
          blocked = true;
          break;
        }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      if (!blocked)
        await withBoundedFixtureQuery(dataSource, (observer) =>
          observer.query('SELECT pg_cancel_backend($1)', [secondPid.pid]),
        );
      expect(blocked).toBe(true);
      await first.commitTransaction();
      await expect(loser).resolves.toMatchObject({
        currentState: 'PROCESSING',
        status: 'NOT_ACQUIRED',
      });
      await second.commitTransaction();
    } finally {
      if (first.isTransactionActive) await first.rollbackTransaction();
      if (loser !== undefined) await Promise.allSettled([loser]);
      if (second.isTransactionActive) await second.rollbackTransaction();
      await Promise.all([
        ...(firstConnected && !first.isReleased ? [first.release()] : []),
        ...(secondConnected && !second.isReleased ? [second.release()] : []),
      ]);
    }
    expect(
      await dataSource.query(
        `SELECT "reservedCount","acceptedCount" FROM core."mailboxCapacityDay"
          WHERE "workspaceId"=$1 AND "connectedAccountId"=$2`,
        [workspaceId, accountId],
      ),
    ).toEqual(beforeCapacity);
    expect(
      await dataSource.query(
        `SELECT "attemptState","finalEvidenceDigest" FROM core."outboundEmailAttempt" WHERE "attemptId"=$1`,
        [attemptId],
      ),
    ).toEqual([
      { attemptState: 'PROCESSING', finalEvidenceDigest: digest('3') },
    ]);
  });

  it('behaviorally enforces activation, enrollment, occurrence, proof and capacity uniqueness', async () => {
    const g = await insertGraph(runner);
    await expectFailure(runner, 'UQ_CE_WORKSPACE_CAMPAIGN', () =>
      runner.query(
        `INSERT INTO core."campaignExecution" SELECT $2,"workspaceId","campaignId","timeZone","startLocalTime","endLocalTime","campaignCapacityTimeZone",now(),now() FROM core."campaignExecution" WHERE id=$1`,
        [g.executionId, randomUUID()],
      ),
    );
    await expectFailure(runner, 'UQ_CSA_ONE_ACTIVE_SCOPE', () =>
      runner.query(
        `INSERT INTO core."campaignSequenceAuthorization"
         SELECT $2,"workspaceId","campaignId","campaignExecutionId",2,$3,"preparedFingerprint","workflowId",
                "workflowVersionId","initiatingUserWorkspaceId",'ACTIVE',now(),NULL,NULL,binding,now(),now()
           FROM core."campaignSequenceAuthorization" WHERE "authorizationId"=$1`,
        [g.authorizationId, randomUUID(), randomUUID()],
      ),
    );
    await expectFailure(runner, 'UQ_CSA_SCOPE_GENERATION', () =>
      runner.query(
        `INSERT INTO core."campaignSequenceAuthorization"
         SELECT $2,"workspaceId","campaignId","campaignExecutionId",generation,$3,"preparedFingerprint","workflowId",
                "workflowVersionId","initiatingUserWorkspaceId",'REVOKED',now(),now(),'CAMPAIGN_PAUSED',binding,now(),now()
           FROM core."campaignSequenceAuthorization" WHERE "authorizationId"=$1`,
        [g.authorizationId, randomUUID(), randomUUID()],
      ),
    );
    await expectFailure(runner, 'UQ_CSA_SCOPE_START_KEY', () =>
      runner.query(
        `INSERT INTO core."campaignSequenceAuthorization"
         SELECT $2,"workspaceId","campaignId","campaignExecutionId",2,"startIdempotencyKey","preparedFingerprint","workflowId",
                "workflowVersionId","initiatingUserWorkspaceId",'REVOKED',now(),now(),'CAMPAIGN_PAUSED',binding,now(),now()
           FROM core."campaignSequenceAuthorization" WHERE "authorizationId"=$1`,
        [g.authorizationId, randomUUID()],
      ),
    );
    const revokedAuthorizationId = randomUUID();
    await expect(
      runner.query(
        `INSERT INTO core."campaignSequenceAuthorization"
         SELECT $2,"workspaceId","campaignId","campaignExecutionId",2,$3,"preparedFingerprint","workflowId",
                "workflowVersionId","initiatingUserWorkspaceId",'REVOKED',now(),now(),'CAMPAIGN_PAUSED',binding,now(),now()
           FROM core."campaignSequenceAuthorization" WHERE "authorizationId"=$1 RETURNING "authorizationId"`,
        [g.authorizationId, revokedAuthorizationId, randomUUID()],
      ),
    ).resolves.toHaveLength(1);
    await expectFailure(runner, 'UQ_CA_SCOPE_AUTHORIZATION', () =>
      runner.query(
        `INSERT INTO core."campaignActivation" SELECT $2,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",$3,now(),0,0 FROM core."campaignActivation" WHERE id=$1`,
        [g.activationId, randomUUID(), randomUUID()],
      ),
    );
    await expect(
      runner.query(
        `INSERT INTO core."campaignActivation" SELECT $2,"workspaceId","campaignId","campaignExecutionId",
          $3,2,"workflowVersionId",now(),0,0 FROM core."campaignActivation" WHERE id=$1 RETURNING id`,
        [g.activationId, randomUUID(), revokedAuthorizationId],
      ),
    ).resolves.toHaveLength(1);
    await expectFailure(runner, 'UQ_CEN_SCOPE_AUTH_CREATOR', () =>
      runner.query(
        `INSERT INTO core."campaignEnrollment" SELECT $2,"workspaceId","campaignId","campaignExecutionId","authorizationId","authorizationGeneration",$3,"creatorId","authoredMessageCount",0,'ACTIVE',NULL,NULL,NULL,now(),now(),now() FROM core."campaignEnrollment" WHERE id=$1`,
        [g.enrollmentId, randomUUID(), randomUUID()],
      ),
    );
    await expect(
      runner.query(
        `INSERT INTO core."campaignEnrollment" SELECT $2,"workspaceId","campaignId","campaignExecutionId",
          "authorizationId","authorizationGeneration",$3,$4,"authoredMessageCount",0,'ACTIVE',NULL,NULL,NULL,
          now(),now(),now() FROM core."campaignEnrollment" WHERE id=$1 RETURNING id`,
        [g.enrollmentId, randomUUID(), randomUUID(), randomUUID()],
      ),
    ).resolves.toHaveLength(1);
    await expectFailure(runner, 'UQ_CO_ENROLLMENT_AUTHORED_INDEX', () =>
      runner.query(
        `INSERT INTO core."campaignOccurrence" SELECT $2,"workspaceId","campaignId","enrollmentId","workflowVersionId",$3,"authoredMessageIndex",'PENDING',now(),NULL,NULL,NULL,now(),now() FROM core."campaignOccurrence" WHERE id=$1`,
        [g.occurrenceId, randomUUID(), randomUUID()],
      ),
    );

    await expect(
      runner.query(
        `INSERT INTO core."campaignOccurrence" SELECT $2,"workspaceId","campaignId","enrollmentId",
          "workflowVersionId",$3,1,'PENDING',now(),NULL,NULL,NULL,now(),now()
          FROM core."campaignOccurrence" WHERE id=$1 RETURNING id`,
        [g.occurrenceId, randomUUID(), randomUUID()],
      ),
    ).resolves.toHaveLength(1);
    await expectFailure(runner, 'UQ_CO_ENROLLMENT_VERSION_MESSAGE', () =>
      runner.query(
        `INSERT INTO core."campaignOccurrence" SELECT $2,"workspaceId","campaignId","enrollmentId",
          "workflowVersionId","messageId",2,'PENDING',now(),NULL,NULL,NULL,now(),now()
          FROM core."campaignOccurrence" WHERE id=$1`,
        [g.occurrenceId, randomUUID()],
      ),
    );

    const acceptedAttemptId = randomUUID();
    await insertSequenceAttempt(runner, g, { attemptId: acceptedAttemptId });
    await runner.query('SAVEPOINT source_shape');
    await expect(
      runner.query(
        `UPDATE core."outboundEmailAttempt" SET "authorizationId"=NULL WHERE "attemptId"=$1`,
        [acceptedAttemptId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'CHK_OUTBOUND_EMAIL_ATTEMPT_SOURCE_SHAPE',
    });
    await runner.query('ROLLBACK TO SAVEPOINT source_shape');
    await runner.query('RELEASE SAVEPOINT source_shape');
    await runner.query(
      `UPDATE core."outboundEmailAttempt" SET "attemptState"='ACCEPTED',"capacityState"='CONSUMED',
        "providerMessageId"='provider-accepted',"projectedMessageId"=$2 WHERE "attemptId"=$1`,
      [acceptedAttemptId, randomUUID()],
    );
    await expectFailure(
      runner,
      'UQ_OUTBOUND_EMAIL_ATTEMPT_OCCURRENCE_NUMBER',
      () => insertSequenceAttempt(runner, g),
    );
    const unresolvedAttemptId = randomUUID();
    await insertSequenceAttempt(runner, g, {
      attemptId: unresolvedAttemptId,
      attemptNumber: 2,
    });
    await expectFailure(
      runner,
      'UQ_OUTBOUND_EMAIL_ATTEMPT_ACCEPTED_OCCURRENCE',
      () =>
        runner.query(
          `UPDATE core."outboundEmailAttempt" SET "attemptState"='ACCEPTED',"capacityState"='CONSUMED'
          WHERE "attemptId"=$1`,
          [unresolvedAttemptId],
        ),
    );
    await expectFailure(
      runner,
      'UQ_OUTBOUND_EMAIL_ATTEMPT_UNRESOLVED_OCCURRENCE',
      () => insertSequenceAttempt(runner, g, { attemptNumber: 3 }),
    );
    for (const [attemptState, capacityState] of [
      ['PROCESSING', 'RESERVED'],
      ['UNKNOWN', 'PROVISIONAL_UNKNOWN'],
    ] as const) {
      await runner.query(
        `UPDATE core."outboundEmailAttempt" SET "attemptState"=$2,"capacityState"=$3 WHERE "attemptId"=$1`,
        [unresolvedAttemptId, attemptState, capacityState],
      );
      await expectFailure(
        runner,
        'UQ_OUTBOUND_EMAIL_ATTEMPT_UNRESOLVED_OCCURRENCE',
        () => insertSequenceAttempt(runner, g, { attemptNumber: 3 }),
      );
    }
    await runner.query(
      `UPDATE core."outboundEmailAttempt" SET "attemptState"='DEFINITELY_UNACCEPTED',"capacityState"='RELEASED'
        WHERE "attemptId"=$1`,
      [unresolvedAttemptId],
    );
    await expect(
      insertSequenceAttempt(runner, g, { attemptNumber: 3 }),
    ).resolves.toHaveLength(1);

    const acceptedControlGraph = await insertGraph(runner);
    const acceptedControlId = randomUUID();
    await insertSequenceAttempt(runner, acceptedControlGraph, {
      attemptId: acceptedControlId,
    });
    expect(
      await runner.query(
        `UPDATE core."outboundEmailAttempt" SET "attemptState"='ACCEPTED',"capacityState"='CONSUMED'
          WHERE "attemptId"=$1 RETURNING "attemptId"`,
        [acceptedControlId],
      ),
    ).toEqual([[{ attemptId: acceptedControlId }], 1]);

    const directAccountId = randomUUID();
    const directInsert = (
      attemptId: string,
      accountId = directAccountId,
      provider = 'google',
      workspaceId = g.workspaceId,
    ) =>
      runner.query(
        `INSERT INTO core."outboundEmailAttempt"
          ("attemptId","workspaceId",source,"attemptState","capacityState","connectedAccountId","messageChannelId",
           provider,"normalizedSenderHandle","normalizedRecipient","selectionConstraintKind","localDate","claimedAt",
           "slotAt","unknownAfter","directReservationCapabilityId")
         VALUES ($1,$2,'INBOX','RESERVED','RESERVED',$3,$4,$5,'sender@example.com','recipient@example.com',
           'EXPLICIT','2040-01-02','2040-01-02T10:00Z','2040-01-02T10:00Z','2040-01-02T10:01Z',$6)`,
        [
          attemptId,
          workspaceId,
          accountId,
          randomUUID(),
          provider,
          randomUUID(),
        ],
      );
    const firstDirectId = randomUUID();
    const secondDirectId = randomUUID();
    const projectedMessageId = randomUUID();
    await directInsert(firstDirectId);
    await directInsert(secondDirectId);
    await runner.query(
      `UPDATE core."outboundEmailAttempt" SET "attemptState"='ACCEPTED',"capacityState"='CONSUMED',
       "providerMessageId"='provider-direct',"projectedMessageId"=$2 WHERE "attemptId"=$1`,
      [firstDirectId, projectedMessageId],
    );
    await expectFailure(
      runner,
      'UQ_OUTBOUND_EMAIL_ATTEMPT_PROVIDER_MESSAGE',
      () =>
        runner.query(
          `UPDATE core."outboundEmailAttempt" SET "attemptState"='ACCEPTED',"capacityState"='CONSUMED',
         "providerMessageId"='provider-direct' WHERE "attemptId"=$1`,
          [secondDirectId],
        ),
    );
    await expectFailure(
      runner,
      'UQ_OUTBOUND_EMAIL_ATTEMPT_PROJECTED_MESSAGE',
      () =>
        runner.query(
          `UPDATE core."outboundEmailAttempt" SET "attemptState"='ACCEPTED',"capacityState"='CONSUMED',
         "projectedMessageId"=$2 WHERE "attemptId"=$1`,
          [secondDirectId, projectedMessageId],
        ),
    );
    for (const [account, provider, workspace, projected] of [
      [randomUUID(), 'google', g.workspaceId, null],
      [directAccountId, 'microsoft', g.workspaceId, null],
      [directAccountId, 'google', randomUUID(), projectedMessageId],
    ] as const) {
      const controlId = randomUUID();
      await directInsert(controlId, account, provider, workspace);
      expect(
        await runner.query(
          `UPDATE core."outboundEmailAttempt" SET "attemptState"='ACCEPTED',"capacityState"='CONSUMED',
           "providerMessageId"='provider-direct',"projectedMessageId"=$2 WHERE "attemptId"=$1 RETURNING "attemptId"`,
          [controlId, projected],
        ),
      ).toEqual([[{ attemptId: controlId }], 1]);
    }

    const p = proofIds(g.workspaceId);
    await insertProof(runner, p);
    await insertTestAttempt(runner, p);
    await runner.query('SAVEPOINT test_source_shape');
    await expect(
      runner.query(
        `UPDATE core."outboundEmailAttempt" SET "testPreparationProofId"=NULL WHERE "attemptId"=$1`,
        [p.attemptId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'CHK_OUTBOUND_EMAIL_ATTEMPT_SOURCE_SHAPE',
    });
    await runner.query('ROLLBACK TO SAVEPOINT test_source_shape');
    await runner.query('RELEASE SAVEPOINT test_source_shape');
    await expectFailure(runner, 'UQ_CTP_ATTEMPT', () =>
      runner.query(
        `INSERT INTO core."campaignTestPreparationProof" SELECT (jsonb_populate_record(NULL::core."campaignTestPreparationProof",to_jsonb(p)||jsonb_build_object('testPreparationProofId',$2::text,'confirmationId',$3::text))).* FROM core."campaignTestPreparationProof" p WHERE "testPreparationProofId"=$1`,
        [p.proofId, randomUUID(), randomUUID()],
      ),
    );
    await expectFailure(runner, 'UQ_CTP_CONFIRMATION', () =>
      runner.query(
        `INSERT INTO core."campaignTestPreparationProof" SELECT (jsonb_populate_record(NULL::core."campaignTestPreparationProof",to_jsonb(p)||jsonb_build_object('testPreparationProofId',$2::text,'attemptId',$3::text))).* FROM core."campaignTestPreparationProof" p WHERE "testPreparationProofId"=$1`,
        [p.proofId, randomUUID(), randomUUID()],
      ),
    );
    const capabilityId = randomUUID();
    await runner.query(
      `UPDATE core."campaignTestPreparationProof" SET "testSubmissionCapabilityId"=$2,"finalEvidenceDigest"=$3
        WHERE "testPreparationProofId"=$1`,
      [p.proofId, capabilityId, digest('9')],
    );
    for (const [constraint, object] of [
      [
        'UQ_CTP_SUBMISSION_CAPABILITY',
        { testSubmissionCapabilityId: capabilityId },
      ],
    ] as const) {
      await expectFailure(runner, constraint, () =>
        runner.query(
          `INSERT INTO core."campaignTestPreparationProof" SELECT
             (jsonb_populate_record(NULL::core."campaignTestPreparationProof",to_jsonb(p)||$2::jsonb)).*
             FROM core."campaignTestPreparationProof" p WHERE "testPreparationProofId"=$1`,
          [
            p.proofId,
            JSON.stringify({
              testPreparationProofId: randomUUID(),
              attemptId: randomUUID(),
              confirmationId: randomUUID(),
              finalEvidenceDigest: digest('8'),
              ...object,
            }),
          ],
        ),
      );
    }
    await runner.query(
      `INSERT INTO core."mailboxCapacityDay" ("workspaceId","connectedAccountId","localDate") VALUES ($1,$2,'2040-01-02')`,
      [g.workspaceId, g.creatorId],
    );
    await expectFailure(
      runner,
      'UQ_MAILBOX_CAPACITY_DAY_WORKSPACE_ACCOUNT_LOCAL_DATE',
      () =>
        runner.query(
          `INSERT INTO core."mailboxCapacityDay" ("workspaceId","connectedAccountId","localDate") VALUES ($1,$2,'2040-01-02')`,
          [g.workspaceId, g.creatorId],
        ),
    );
  });
});
