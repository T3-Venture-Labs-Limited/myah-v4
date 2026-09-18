import { randomUUID } from 'node:crypto';

import { DataSource, type EntityManager } from 'typeorm';

import { CampaignSequenceAuthorizationService } from 'src/engine/core-modules/campaign-sequence-authority/services/campaign-sequence-authorization.service';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignExecutionPersistenceAdapter } from 'src/modules/campaign-execution/adapters/campaign-execution-persistence.adapter';
import { CampaignProgressionHistoryReaderAdapter } from 'src/modules/campaign-execution/adapters/campaign-progression-history-reader.adapter';
import { CampaignExecutionService } from 'src/modules/campaign-execution/services/campaign-execution.service';
import { CampaignLifecycleTransactionService } from 'src/modules/campaign-execution/services/campaign-lifecycle-transaction.service';
import { type CampaignExecutionPersistencePort } from 'src/modules/campaign-execution/types/campaign-execution.type';
import { type LockedCampaignLifecycleContext } from 'src/modules/campaign-execution/types/campaign-lifecycle-transaction.type';

const digest = (character: string) => character.repeat(64);
const authorizedAt = '2026-09-20T09:00:00.000Z';
const revokedAt = '2026-09-20T09:01:00.000Z';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));

  return { promise, resolve };
};

const waitUntilBlockedOnLock = async (
  dataSource: DataSource,
  backendPid: number,
  blockerPid: number,
) => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const [activity] = await dataSource.query<
      Array<{ blockers: number[]; waitEventType: string | null }>
    >(
      `SELECT wait_event_type AS "waitEventType", pg_blocking_pids(pid) AS blockers
         FROM pg_stat_activity WHERE pid = $1`,
      [backendPid],
    );

    if (
      activity?.waitEventType === 'Lock' &&
      activity.blockers.includes(blockerPid)
    ) {
      return;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error('Campaign Stop did not wait on the Campaign advisory lock');
};

type Fixture = ReturnType<typeof fixtureIds>;

const fixtureIds = () => ({
  campaignId: randomUUID(),
  executionId: randomUUID(),
  authorizationId: randomUUID(),
  startIdempotencyKey: randomUUID(),
  workflowId: randomUUID(),
  workflowVersionId: randomUUID(),
  initiatingUserWorkspaceId: randomUUID(),
  initiatingUserId: randomUUID(),
  initiatingWorkspaceMemberId: randomUUID(),
  activationId: randomUUID(),
  pendingEnrollmentId: randomUUID(),
  heldEnrollmentId: randomUUID(),
  ambiguousEnrollmentId: randomUUID(),
  pendingCreatorId: randomUUID(),
  heldCreatorId: randomUUID(),
  ambiguousCreatorId: randomUUID(),
  pendingCampaignCreatorId: randomUUID(),
  heldCampaignCreatorId: randomUUID(),
  ambiguousCampaignCreatorId: randomUUID(),
  pendingOccurrenceId: randomUUID(),
  heldOccurrenceId: randomUUID(),
  ambiguousOccurrenceId: randomUUID(),
  messageId: randomUUID(),
  attemptId: randomUUID(),
  connectedAccountId: randomUUID(),
  messageChannelId: randomUUID(),
});

const requestFor = (workspaceId: string, fixture: Fixture) => ({
  preparedProof: {
    kind: 'PREPARED' as const,
    workspaceId,
    campaignId: fixture.campaignId,
    workflowId: fixture.workflowId,
    workflowVersionId: fixture.workflowVersionId,
    initiatingUserWorkspaceId: fixture.initiatingUserWorkspaceId,
    initiatingUserId: fixture.initiatingUserId,
    initiatingWorkspaceMemberId: fixture.initiatingWorkspaceMemberId,
    orderedMessageIds: [fixture.messageId],
    usedChannels: ['EMAIL'] as const,
    sequenceDigest: digest('1'),
    fixedMaterialDigest: digest('2'),
    senderAuthorityDigest: digest('3'),
    preparedFingerprint: digest('4'),
    signatureDigest: null,
    fixedMaterialProofs: [
      { messageId: fixture.messageId, orderedAttachmentProofs: [] },
    ],
    senderPoolFingerprint: digest('5'),
    senderPoolSerializationRevision: 'CAMPAIGN_SENDER_POOL_V2',
    senderPoolRotationPolicyId:
      'EARLIEST_ELIGIBLE_LOWEST_DAILY_USAGE_STABLE_ACCOUNT_V1',
  },
  reviewedWindow: {
    timeZone: 'UTC',
    startLocalTime: '09:00:00',
    endLocalTime: '17:00:00',
  },
  campaignCapacityTimeZone: 'UTC',
});

const projectionFor = (fixture: Fixture, state: 'ACTIVE' | 'REVOKED') => ({
  schemaVersion: 1,
  authorizationId: fixture.authorizationId,
  generation: 1,
  state,
  workflowVersionId: fixture.workflowVersionId,
  preparedFingerprint: digest('4'),
  authorizedAt,
  revokedAt: state === 'REVOKED' ? revokedAt : null,
  revocationReason: state === 'REVOKED' ? 'CAMPAIGN_PAUSED' : null,
});

describe('Campaign Stop history settlement (PostgreSQL)', () => {
  const workspaceId = '46aee013-d74b-4a9a-9ec1-12cf42820083';
  const schemaName = 'workspace_46n97k6b8zm2ilyy7iyfp2ver';
  const authContext = {
    type: 'system',
    workspace: { id: workspaceId },
  } as unknown as WorkspaceAuthContext;
  const fixtures: Fixture[] = [];
  let dataSource: DataSource;

  const insertAttempt = async (
    fixture: Fixture,
    options: Readonly<{
      attemptId?: string;
      enrollmentId?: string;
      occurrenceId?: string;
      authorizationId?: string;
      workflowVersionId?: string;
      messageId?: string;
      definitelyUnaccepted?: boolean;
      bypassForeignKeys?: boolean;
    }> = {},
  ) => {
    const query = `INSERT INTO core."outboundEmailAttempt"
       ("attemptId", "workspaceId", source, "attemptState", "capacityState",
        "connectedAccountId", "messageChannelId", provider, "normalizedSenderHandle",
        "normalizedRecipient", "selectionConstraintKind", "senderPoolFingerprint",
        "localDate", "claimedAt", "slotAt", "unknownAfter", "campaignId",
        "enrollmentId", "occurrenceId", "authorizationId", "workflowVersionId",
        "messageId", "attemptNumber", "renderDigest", "finalEvidenceDigest",
        "safeOutcomeReason", retryable)
     VALUES ($1,$2,'CAMPAIGN_SEQUENCE',$3,$4,$5,$6,'google',
             'sender@example.com','recipient@example.com','ROTATE',$7,'2026-09-20',
             $8,$8,$9,$10,$11,$12,$13,$14,$15,1,$16,$17,$18,$19)`;
    const definitelyUnaccepted = options.definitelyUnaccepted === true;
    const parameters = [
      options.attemptId ?? randomUUID(),
      workspaceId,
      definitelyUnaccepted ? 'DEFINITELY_UNACCEPTED' : 'RESERVED',
      definitelyUnaccepted ? 'RELEASED' : 'RESERVED',
      fixture.connectedAccountId,
      fixture.messageChannelId,
      digest('5'),
      authorizedAt,
      '2026-09-20T09:01:00.000Z',
      fixture.campaignId,
      options.enrollmentId ?? fixture.pendingEnrollmentId,
      options.occurrenceId ?? fixture.pendingOccurrenceId,
      options.authorizationId ?? fixture.authorizationId,
      options.workflowVersionId ?? fixture.workflowVersionId,
      options.messageId ?? fixture.messageId,
      digest('6'),
      definitelyUnaccepted ? digest('7') : null,
      definitelyUnaccepted ? 'DEFINITELY_UNACCEPTED_NON_RETRYABLE' : null,
      definitelyUnaccepted ? false : null,
    ];

    if (!options.bypassForeignKeys) {
      await dataSource.query(query, parameters);
      return;
    }

    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      await runner.query('SET session_replication_role = replica');
      await runner.query(query, parameters);
    } finally {
      await runner.query('SET session_replication_role = origin');
      await runner.release();
    }
  };

  const seedCampaign = async (
    fixture: Fixture,
    options: { ambiguousAttempt?: boolean } = {},
  ) => {
    fixtures.push(fixture);
    const request = requestFor(workspaceId, fixture);
    const binding = {
      schemaVersion: 1,
      authorizationId: fixture.authorizationId,
      generation: 1,
      startIdempotencyKey: fixture.startIdempotencyKey,
      workspaceId,
      campaignId: fixture.campaignId,
      campaignExecutionId: fixture.executionId,
      workflowVersionId: fixture.workflowVersionId,
      request,
      futureEligibleCampaignCreatorsAuthorized: true,
      authorizedAt,
    };

    await dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO "workspace_46n97k6b8zm2ilyy7iyfp2ver".campaign
           (id, "lifecycleStatus", "sequenceAuthorization")
         VALUES ($1, 'ACTIVE', $2::jsonb)`,
        [fixture.campaignId, JSON.stringify(projectionFor(fixture, 'ACTIVE'))],
      );
      await manager.query(
        `INSERT INTO core."campaignExecution"
           (id, "workspaceId", "campaignId", "timeZone", "startLocalTime", "endLocalTime", "campaignCapacityTimeZone")
         VALUES ($1, $2, $3, 'UTC', '09:00', '17:00', 'UTC')`,
        [fixture.executionId, workspaceId, fixture.campaignId],
      );
      await manager.query(
        `INSERT INTO core."campaignSequenceAuthorization"
           ("authorizationId", "workspaceId", "campaignId", "campaignExecutionId", generation,
            "startIdempotencyKey", "preparedFingerprint", "workflowId", "workflowVersionId",
            "initiatingUserWorkspaceId", state, "authorizedAt", binding)
         VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,$9,'ACTIVE',$10,$11::jsonb)`,
        [
          fixture.authorizationId,
          workspaceId,
          fixture.campaignId,
          fixture.executionId,
          fixture.startIdempotencyKey,
          digest('4'),
          fixture.workflowId,
          fixture.workflowVersionId,
          fixture.initiatingUserWorkspaceId,
          authorizedAt,
          JSON.stringify(binding),
        ],
      );
      await manager.query(
        `INSERT INTO core."campaignActivation"
           (id, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId",
            "authorizationGeneration", "workflowVersionId", "activatedAt", "createdEnrollmentCount", "createdOccurrenceCount")
         VALUES ($1,$2,$3,$4,$5,1,$6,$7,3,3)`,
        [
          fixture.activationId,
          workspaceId,
          fixture.campaignId,
          fixture.executionId,
          fixture.authorizationId,
          fixture.workflowVersionId,
          authorizedAt,
        ],
      );

      for (const [enrollmentId, campaignCreatorId, creatorId] of [
        [
          fixture.pendingEnrollmentId,
          fixture.pendingCampaignCreatorId,
          fixture.pendingCreatorId,
        ],
        [
          fixture.heldEnrollmentId,
          fixture.heldCampaignCreatorId,
          fixture.heldCreatorId,
        ],
        [
          fixture.ambiguousEnrollmentId,
          fixture.ambiguousCampaignCreatorId,
          fixture.ambiguousCreatorId,
        ],
      ]) {
        await manager.query(
          `INSERT INTO core."campaignEnrollment"
             (id, "workspaceId", "campaignId", "campaignExecutionId", "authorizationId",
              "authorizationGeneration", "campaignCreatorId", "creatorId", "authoredMessageCount",
              "nextAuthoredMessageIndex", state, "enrolledAt")
           VALUES ($1,$2,$3,$4,$5,1,$6,$7,1,0,'ACTIVE',$8)`,
          [
            enrollmentId,
            workspaceId,
            fixture.campaignId,
            fixture.executionId,
            fixture.authorizationId,
            campaignCreatorId,
            creatorId,
            authorizedAt,
          ],
        );
      }

      for (const [occurrenceId, enrollmentId, state, holdReason] of [
        [
          fixture.pendingOccurrenceId,
          fixture.pendingEnrollmentId,
          'PENDING',
          null,
        ],
        [
          fixture.heldOccurrenceId,
          fixture.heldEnrollmentId,
          'HELD',
          'CAPACITY_CONFIGURATION_INVALID',
        ],
        [
          fixture.ambiguousOccurrenceId,
          fixture.ambiguousEnrollmentId,
          'PENDING',
          null,
        ],
      ]) {
        await manager.query(
          `INSERT INTO core."campaignOccurrence"
             (id, "workspaceId", "campaignId", "enrollmentId", "workflowVersionId", "messageId",
              "authoredMessageIndex", state, "dueAt", "holdReason")
           VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9)`,
          [
            occurrenceId,
            workspaceId,
            fixture.campaignId,
            enrollmentId,
            fixture.workflowVersionId,
            fixture.messageId,
            state,
            authorizedAt,
            holdReason,
          ],
        );
      }

      if (options.ambiguousAttempt) {
        await manager.query(
          `INSERT INTO core."outboundEmailAttempt"
             ("attemptId", "workspaceId", source, "attemptState", "capacityState",
              "connectedAccountId", "messageChannelId", provider, "normalizedSenderHandle",
              "normalizedRecipient", "selectionConstraintKind", "senderPoolFingerprint",
              "localDate", "claimedAt", "slotAt", "unknownAfter", "campaignId",
              "enrollmentId", "occurrenceId", "authorizationId", "workflowVersionId",
              "messageId", "attemptNumber", "renderDigest")
           VALUES ($1,$2,'CAMPAIGN_SEQUENCE','RESERVED','RESERVED',$3,$4,'google',
                   'sender@example.com','recipient@example.com','ROTATE',$5,'2026-09-20',
                   $6,$6,$7,$8,$9,$10,$11,$12,$13,1,$14)`,
          [
            fixture.attemptId,
            workspaceId,
            fixture.connectedAccountId,
            fixture.messageChannelId,
            digest('5'),
            authorizedAt,
            '2026-09-20T09:01:00.000Z',
            fixture.campaignId,
            fixture.ambiguousEnrollmentId,
            fixture.ambiguousOccurrenceId,
            fixture.authorizationId,
            fixture.workflowVersionId,
            fixture.messageId,
            digest('6'),
          ],
        );
      }
    });
  };

  const makeService = (
    persistence: CampaignExecutionPersistencePort,
    transactionEntered?: {
      pid: number | null;
      ready: ReturnType<typeof deferred>;
    },
  ) => {
    const transactionalDataSource = {
      transaction: <Result>(
        operation: (manager: EntityManager) => Promise<Result>,
      ) =>
        dataSource.transaction(async (manager) => {
          if (transactionEntered) {
            const [{ pid }] = await manager.query<Array<{ pid: number }>>(
              'SELECT pg_backend_pid()::integer AS pid',
            );
            transactionEntered.pid = pid;
            transactionEntered.ready.resolve();
          }
          return operation(manager);
        }),
    };
    const repository = {
      findOne: async (
        options: { where: { id: string } },
        manager: EntityManager,
      ) => {
        const [campaign] = await manager.query(
          `SELECT id, "lifecycleStatus", "sequenceAuthorization"
             FROM "workspace_46n97k6b8zm2ilyy7iyfp2ver".campaign
            WHERE id = $1 FOR UPDATE`,
          [options.where.id],
        );
        return campaign ?? null;
      },
    };
    const orm = {
      executeInWorkspaceContext: async <Result>(
        operation: () => Promise<Result>,
      ) => operation(),
      getGlobalWorkspaceDataSource: async () => transactionalDataSource,
      getRepository: async () => repository,
    } as unknown as GlobalWorkspaceOrmManager;
    const transaction = new CampaignLifecycleTransactionService(
      orm,
      {
        resolveRolePermissionConfig: async () => ({
          shouldBypassPermissionChecks: true,
        }),
      },
      { assertCampaignWriteAllowedInTransaction: async () => undefined },
    );
    const authority = new CampaignSequenceAuthorizationService({
      generateAuthorizationId: randomUUID,
      now: () => new Date(revokedAt),
    });
    const history = new CampaignProgressionHistoryReaderAdapter();
    const review = {
      revalidateNewActivationInTransaction: jest.fn(async ({ context }) => {
        const fixture = fixtures.find(
          ({ campaignId }) => campaignId === context.campaignId,
        )!;
        return {
          status: 'READY' as const,
          eligibleCreators: [
            {
              campaignCreatorId: fixture.pendingCampaignCreatorId,
              creatorId: fixture.pendingCreatorId,
              usableMessageIds: [fixture.messageId],
            },
          ],
        };
      }),
    };
    const service = new CampaignExecutionService(
      transaction,
      authority,
      persistence,
      { readCampaignCapacityTimeZoneInTransaction: jest.fn() },
      {
        loadExecutionPlanInTransaction: jest.fn(async (input) => ({
          kind: 'READY' as const,
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          workflowId: fixtures.find(
            ({ campaignId }) => campaignId === input.campaignId,
          )!.workflowId,
          workflowVersionId: input.workflowVersionId,
          nodes: [
            {
              messageId: fixtures.find(
                ({ campaignId }) => campaignId === input.campaignId,
              )!.messageId,
              channel: 'EMAIL' as const,
              replyToThread: false,
            },
          ],
          delaysSeconds: [],
        })),
      },
      review,
      history,
      { adjustInitialDueAt: jest.fn(() => authorizedAt) },
      {
        generateActivationId: randomUUID,
        generateEnrollmentId: randomUUID,
        generateOccurrenceId: randomUUID,
      },
    );

    return { review, service };
  };

  beforeAll(async () => {
    dataSource = await new DataSource(
      global.testDataSource.options,
    ).initialize();
    await dataSource.query(
      `INSERT INTO core.workspace
         (id, "displayName", subdomain, "activationStatus", "databaseSchema",
          "workspaceCustomApplicationId", "defaultRoleId", "campaignCapacityTimeZone")
       SELECT $1, 'Campaign Stop settlement', $2, 'ACTIVE', $3,
              "workspaceCustomApplicationId", "defaultRoleId", 'UTC'
         FROM core.workspace ORDER BY "createdAt" LIMIT 1`,
      [workspaceId, `stop-${workspaceId.slice(0, 8)}`, schemaName],
    );
    await dataSource.query(
      'CREATE SCHEMA "workspace_46n97k6b8zm2ilyy7iyfp2ver"',
    );
    await dataSource.query(
      `CREATE TABLE "workspace_46n97k6b8zm2ilyy7iyfp2ver".campaign
         (id uuid PRIMARY KEY, "lifecycleStatus" text NOT NULL,
          "sequenceAuthorization" jsonb)`,
    );
  });

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM core."outboundEmailAttempt" WHERE "workspaceId" = $1`,
      [workspaceId],
    );
    await dataSource.query(
      `DELETE FROM core."campaignOccurrence" WHERE "workspaceId" = $1`,
      [workspaceId],
    );
    await dataSource.query(
      `DELETE FROM core."campaignEnrollment" WHERE "workspaceId" = $1`,
      [workspaceId],
    );
    await dataSource.query(
      `DELETE FROM core."campaignActivation" WHERE "workspaceId" = $1`,
      [workspaceId],
    );
    await dataSource.query(
      `DELETE FROM core."campaignSequenceAuthorization" WHERE "workspaceId" = $1`,
      [workspaceId],
    );
    await dataSource.query(
      `DELETE FROM core."campaignExecution" WHERE "workspaceId" = $1`,
      [workspaceId],
    );
    await dataSource.query(
      'DROP SCHEMA "workspace_46n97k6b8zm2ilyy7iyfp2ver" CASCADE',
    );
    await dataSource.query('DELETE FROM core.workspace WHERE id = $1', [
      workspaceId,
    ]);
    await dataSource.destroy();
  });

  it('atomically stops safe work, repairs idempotently, and blocks Start for an omitted creator with retained ambiguity', async () => {
    const fixture = fixtureIds();
    await seedCampaign(fixture, { ambiguousAttempt: true });
    const persistence = new CampaignExecutionPersistenceAdapter();
    const { review, service } = makeService(persistence);

    await expect(
      service.pauseCampaign({
        workspaceId,
        campaignId: fixture.campaignId,
        authContext,
      }),
    ).resolves.toEqual({
      status: 'PAUSED',
      changed: true,
      campaignExecutionId: fixture.executionId,
      lifecycleStatus: 'PAUSED',
      inFlightCount: 1,
    });

    const stoppedRows = await dataSource.query<
      Array<{
        holdReason: string | null;
        id: string;
        state: string;
        terminalAt: Date | null;
        terminalReason: string | null;
      }>
    >(
      `SELECT id, state, "holdReason", "terminalReason", "terminalAt"
         FROM core."campaignOccurrence"
        WHERE "workspaceId" = $1 AND "campaignId" = $2 ORDER BY id`,
      [workspaceId, fixture.campaignId],
    );
    const byId = new Map(stoppedRows.map((row) => [row.id, row]));
    expect(byId.get(fixture.pendingOccurrenceId)).toMatchObject({
      state: 'CANCELLED',
      holdReason: null,
      terminalReason: 'CAMPAIGN_PAUSED',
    });
    expect(byId.get(fixture.heldOccurrenceId)).toMatchObject({
      state: 'CANCELLED',
      holdReason: null,
      terminalReason: 'CAMPAIGN_PAUSED',
    });
    expect(byId.get(fixture.ambiguousOccurrenceId)).toMatchObject({
      state: 'PENDING',
      terminalReason: null,
    });
    const firstTerminalAt = byId.get(fixture.pendingOccurrenceId)?.terminalAt;

    await expect(
      service.pauseCampaign({
        workspaceId,
        campaignId: fixture.campaignId,
        authContext,
      }),
    ).resolves.toMatchObject({
      status: 'PAUSED',
      changed: false,
      inFlightCount: 1,
    });
    const [{ terminalAt: replayTerminalAt }] = await dataSource.query<
      Array<{ terminalAt: Date }>
    >(`SELECT "terminalAt" FROM core."campaignOccurrence" WHERE id = $1`, [
      fixture.pendingOccurrenceId,
    ]);
    expect(replayTerminalAt).toEqual(firstTerminalAt);

    const startIdempotencyKey = randomUUID();
    await expect(
      service.startCampaign({
        workspaceId,
        campaignId: fixture.campaignId,
        authContext,
        startIdempotencyKey,
        request: requestFor(workspaceId, fixture),
      }),
    ).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'PROGRESSION_HISTORY_UNAVAILABLE',
    });
    expect(review.revalidateNewActivationInTransaction).not.toHaveBeenCalled();

    const [attempt] = await dataSource.query<
      Array<{ attemptState: string; providerMessageId: string | null }>
    >(
      `SELECT "attemptState", "providerMessageId"
         FROM core."outboundEmailAttempt" WHERE "attemptId" = $1`,
      [fixture.attemptId],
    );
    expect(attempt).toEqual({
      attemptState: 'RESERVED',
      providerMessageId: null,
    });
    const [{ authorizationCount }] = await dataSource.query<
      Array<{ authorizationCount: number }>
    >(
      `SELECT COUNT(*)::integer AS "authorizationCount"
         FROM core."campaignSequenceAuthorization"
        WHERE "workspaceId" = $1 AND "campaignId" = $2`,
      [workspaceId, fixture.campaignId],
    );
    expect(authorizationCount).toBe(1);
  });

  it('allows same-version Start only when the complete version history is safely terminalized', async () => {
    const fixture = fixtureIds();
    await seedCampaign(fixture);
    const { review, service } = makeService(
      new CampaignExecutionPersistenceAdapter(),
    );

    await expect(
      service.pauseCampaign({
        workspaceId,
        campaignId: fixture.campaignId,
        authContext,
      }),
    ).resolves.toMatchObject({ status: 'PAUSED', changed: true });
    await expect(
      service.startCampaign({
        workspaceId,
        campaignId: fixture.campaignId,
        authContext,
        startIdempotencyKey: randomUUID(),
        request: requestFor(workspaceId, fixture),
      }),
    ).resolves.toMatchObject({ status: 'ACTIVATED', mayActivate: true });
    expect(review.revalidateNewActivationInTransaction).toHaveBeenCalledTimes(
      1,
    );

    const [{ attemptCount }] = await dataSource.query<
      Array<{ attemptCount: number }>
    >(
      `SELECT COUNT(*)::integer AS "attemptCount"
         FROM core."outboundEmailAttempt"
        WHERE "workspaceId" = $1 AND "campaignId" = $2`,
      [workspaceId, fixture.campaignId],
    );
    expect(attemptCount).toBe(0);
  });

  it('blocks Start before new authority when an attached attempt claims another workflow version', async () => {
    const fixture = fixtureIds();
    await seedCampaign(fixture);
    const { review, service } = makeService(
      new CampaignExecutionPersistenceAdapter(),
    );

    await service.pauseCampaign({
      workspaceId,
      campaignId: fixture.campaignId,
      authContext,
    });
    await insertAttempt(fixture, {
      attemptId: fixture.attemptId,
      workflowVersionId: randomUUID(),
      bypassForeignKeys: true,
    });

    await expect(
      service.startCampaign({
        workspaceId,
        campaignId: fixture.campaignId,
        authContext,
        startIdempotencyKey: randomUUID(),
        request: requestFor(workspaceId, fixture),
      }),
    ).resolves.toEqual({
      status: 'BLOCKED',
      reason: 'PROGRESSION_HISTORY_UNAVAILABLE',
    });
    expect(review.revalidateNewActivationInTransaction).not.toHaveBeenCalled();

    const [{ authorizationCount }] = await dataSource.query<
      Array<{ authorizationCount: number }>
    >(
      `SELECT COUNT(*)::integer AS "authorizationCount"
         FROM core."campaignSequenceAuthorization"
        WHERE "workspaceId" = $1 AND "campaignId" = $2`,
      [workspaceId, fixture.campaignId],
    );
    expect(authorizationCount).toBe(1);
    await expect(
      dataSource.query(
        `SELECT "attemptState", "providerMessageId"
           FROM core."outboundEmailAttempt" WHERE "attemptId" = $1`,
        [fixture.attemptId],
      ),
    ).resolves.toEqual([{ attemptState: 'RESERVED', providerMessageId: null }]);
  });

  it('ignores unrelated malformed evidence and does not duplicate a valid attached attempt', async () => {
    const fixture = fixtureIds();
    await seedCampaign(fixture);
    const { review, service } = makeService(
      new CampaignExecutionPersistenceAdapter(),
    );

    await service.pauseCampaign({
      workspaceId,
      campaignId: fixture.campaignId,
      authContext,
    });
    await insertAttempt(fixture, {
      attemptId: fixture.attemptId,
      definitelyUnaccepted: true,
    });
    await expect(
      dataSource.transaction((manager) =>
        new CampaignProgressionHistoryReaderAdapter().preflightSameWorkflowVersionHistoryInTransaction(
          {
            workspaceId,
            campaignId: fixture.campaignId,
            workflowVersionId: fixture.workflowVersionId,
          },
          manager,
        ),
      ),
    ).resolves.toEqual({ status: 'COMPLETE' });

    await insertAttempt(fixture, {
      enrollmentId: randomUUID(),
      occurrenceId: randomUUID(),
      authorizationId: randomUUID(),
      workflowVersionId: randomUUID(),
      messageId: randomUUID(),
      bypassForeignKeys: true,
    });

    await expect(
      dataSource.transaction((manager) =>
        new CampaignProgressionHistoryReaderAdapter().preflightSameWorkflowVersionHistoryInTransaction(
          {
            workspaceId,
            campaignId: fixture.campaignId,
            workflowVersionId: fixture.workflowVersionId,
          },
          manager,
        ),
      ),
    ).resolves.toEqual({ status: 'COMPLETE' });

    await expect(
      service.startCampaign({
        workspaceId,
        campaignId: fixture.campaignId,
        authContext,
        startIdempotencyKey: randomUUID(),
        request: requestFor(workspaceId, fixture),
      }),
    ).resolves.toMatchObject({ status: 'ACTIVATED', mayActivate: true });
    expect(review.revalidateNewActivationInTransaction).toHaveBeenCalledTimes(
      1,
    );

    const [{ authorizationCount }] = await dataSource.query<
      Array<{ authorizationCount: number }>
    >(
      `SELECT COUNT(*)::integer AS "authorizationCount"
         FROM core."campaignSequenceAuthorization"
        WHERE "workspaceId" = $1 AND "campaignId" = $2`,
      [workspaceId, fixture.campaignId],
    );
    expect(authorizationCount).toBe(2);
  });

  it('rolls back revocation and occurrence settlement when Stop fails', async () => {
    const fixture = fixtureIds();
    await seedCampaign(fixture);
    class FailingPersistence extends CampaignExecutionPersistenceAdapter {
      override async settlePausedOccurrencesInTransaction(
        context: LockedCampaignLifecycleContext,
        authorizationId: string,
      ): Promise<number> {
        await super.settlePausedOccurrencesInTransaction(
          context,
          authorizationId,
        );
        throw new Error('forced settlement failure');
      }
    }
    const { service } = makeService(new FailingPersistence());

    await expect(
      service.pauseCampaign({
        workspaceId,
        campaignId: fixture.campaignId,
        authContext,
      }),
    ).rejects.toThrow('forced settlement failure');

    const [campaign] = await dataSource.query<
      Array<{ lifecycleStatus: string }>
    >(
      `SELECT "lifecycleStatus"
         FROM "workspace_46n97k6b8zm2ilyy7iyfp2ver".campaign WHERE id = $1`,
      [fixture.campaignId],
    );
    const [authorization] = await dataSource.query<Array<{ state: string }>>(
      `SELECT state FROM core."campaignSequenceAuthorization" WHERE "authorizationId" = $1`,
      [fixture.authorizationId],
    );
    const occurrences = await dataSource.query<Array<{ state: string }>>(
      `SELECT state FROM core."campaignOccurrence" WHERE "campaignId" = $1`,
      [fixture.campaignId],
    );
    expect(campaign.lifecycleStatus).toBe('ACTIVE');
    expect(authorization.state).toBe('ACTIVE');
    expect(occurrences.map(({ state }) => state).sort()).toEqual([
      'HELD',
      'PENDING',
      'PENDING',
    ]);
  });

  it('serializes Stop behind the existing Campaign advisory lock', async () => {
    const fixture = fixtureIds();
    await seedCampaign(fixture);
    const entered = { pid: null as number | null, ready: deferred() };
    const { service } = makeService(
      new CampaignExecutionPersistenceAdapter(),
      entered,
    );
    const holder = dataSource.createQueryRunner();

    await holder.connect();
    await holder.startTransaction();
    try {
      const [{ pid: holderPid }] = (await holder.query(
        'SELECT pg_backend_pid()::integer AS pid',
      )) as Array<{ pid: number }>;
      await holder.query(
        'SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext(($2::uuid)::text))',
        [workspaceId, fixture.campaignId],
      );
      const stopping = service.pauseCampaign({
        workspaceId,
        campaignId: fixture.campaignId,
        authContext,
      });

      await entered.ready.promise;
      await waitUntilBlockedOnLock(
        dataSource,
        entered.pid as number,
        holderPid,
      );
      const [beforeRelease] = await dataSource.query<
        Array<{ lifecycleStatus: string }>
      >(
        `SELECT "lifecycleStatus" FROM "workspace_46n97k6b8zm2ilyy7iyfp2ver".campaign WHERE id = $1`,
        [fixture.campaignId],
      );
      expect(beforeRelease.lifecycleStatus).toBe('ACTIVE');

      await holder.commitTransaction();
      await expect(stopping).resolves.toMatchObject({
        status: 'PAUSED',
        changed: true,
      });
    } finally {
      if (holder.isTransactionActive) await holder.rollbackTransaction();
      await holder.release();
    }
  });
});
