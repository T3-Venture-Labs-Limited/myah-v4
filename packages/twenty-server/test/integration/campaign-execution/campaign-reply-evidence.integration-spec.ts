import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { MyahInboxBackfillCampaignReplyEvidenceCommand } from 'src/database/commands/myah-inbox-backfill-campaign-reply-evidence.command';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';
import { CampaignEmailRuntimeService } from 'src/modules/campaign-execution/services/campaign-email-runtime.service';
import {
  cleanupCampaignFixture,
  createCampaignFixtureIds,
  getOrm,
  type Routing,
  seedCampaignFixture,
} from 'test/integration/campaign-execution/utils/campaign-reply-evidence-fixture.util';
import { ensureMyahInboxContactTriageTables } from 'test/integration/myah-inbox/utils/ensure-myah-inbox-contact-triage-tables.util';

describe('Campaign reply evidence in PostgreSQL', () => {
  beforeAll(async () => {
    await ensureMyahInboxContactTriageTables(SEED_APPLE_WORKSPACE_ID);
  });

  it.each([
    { outcome: 'DEFINITELY_UNACCEPTED', differentEnrollment: true },
    { outcome: 'ACCEPTED', differentEnrollment: false },
    { outcome: 'ACCEPTED', differentEnrollment: true },
    { outcome: 'ACCEPTED', differentEnrollment: false, committed: true },
    {
      outcome: 'DEFINITELY_UNACCEPTED',
      differentEnrollment: true,
      committed: true,
    },
    { outcome: 'ACCEPTED', differentEnrollment: false, richerReimport: true },
    { outcome: 'ACCEPTED', differentEnrollment: false, historicalDryRun: true },
    { outcome: 'ACCEPTED', differentEnrollment: false, boundCreatorB: true },
    { outcome: 'ACCEPTED', differentEnrollment: false, boundCreatorA: true },
    {
      outcome: 'DEFINITELY_UNACCEPTED',
      differentEnrollment: true,
      migratingMarker: true,
    },
    {
      outcome: 'ACCEPTED',
      differentEnrollment: false,
      committed: true,
      boundCreatorB: true,
      creatorContention: true,
    },
  ])(
    'defers evidence until $outcome (different enrollment: $differentEnrollment; committed: $committed; reimport: $richerReimport; creator lock: $creatorContention)',
    async ({
      outcome,
      differentEnrollment,
      committed,
      richerReimport,
      historicalDryRun,
      boundCreatorB,
      boundCreatorA,
      creatorContention,
      migratingMarker,
    }) => {
      const workspaceId = SEED_APPLE_WORKSPACE_ID;
      const schemaName = getWorkspaceSchemaName(workspaceId);
      const ids = createCampaignFixtureIds();
      const progression = {
        terminalizeReplyInTransaction: jest.fn(async () => ({
          status: 'EXACT_REPLAY',
        })),
      };
      const triage = new MyahInboxContactTriageService();
      const lifecycle = new MyahInboxContactTriageLifecycleService(triage);
      const service = new CampaignReplyService(
        progression as never,
        undefined,
        lifecycle,
      );
      const orm = getOrm();

      await orm.executeInWorkspaceContext(
        async () => {
          const dataSource = await orm.getGlobalWorkspaceDataSource();
          const runner = dataSource.createQueryRunner();
          await runner.connect();
          await runner.startTransaction();
          try {
            const [routing] = await runner.query(
              `SELECT mc.id AS "channelId", ca.id AS "accountId", lower(ca.handle) AS sender,
                    (SELECT id FROM core."userWorkspace" WHERE "workspaceId"=$1 LIMIT 1) AS "userWorkspaceId"
               FROM core."messageChannel" mc JOIN core."connectedAccount" ca ON ca.id=mc."connectedAccountId"
              WHERE mc."workspaceId"=$1 AND mc.type='EMAIL' LIMIT 1`,
              [workspaceId],
            );
            expect(routing).toBeDefined();
            const secondEnrollmentId = differentEnrollment
              ? ids.enrollmentB
              : ids.enrollmentA;
            await seedCampaignFixture(runner, {
              ids,
              workspaceId,
              schemaName,
              routing,
              secondEnrollmentId,
            });
            if (boundCreatorB || boundCreatorA) {
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await runner.query(
                `UPDATE "${schemaName}"."messageThread" SET "creatorId"=$1 WHERE id=$2`,
                [
                  boundCreatorB ? ids.creatorB : ids.creatorA,
                  ids.inboundThread,
                ],
              );
            }
            if (historicalDryRun) {
              // Historical imported Message/association/participant proof is
              // scanned without persisting anything, even with an UNKNOWN peer.
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await runner.query(
                `INSERT INTO "${schemaName}".message (id,"messageThreadId","receivedAt",subject,"isDraft")
                 VALUES ($1,$2,now(),'historical reply',false)`,
                [ids.inbound, ids.inboundThread],
              );
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await runner.query(
                `INSERT INTO "${schemaName}"."messageChannelMessageAssociation"
                   (id,"messageId","messageChannelId","messageThreadExternalId",direction)
                 VALUES ($1,$2,$3,'shared-thread','INCOMING')`,
                [randomUUID(), ids.inbound, routing.channelId],
              );
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await runner.query(
                `INSERT INTO "${schemaName}"."messageParticipant"
                   (id,"messageId",role,handle)
                 VALUES ($1,$2,'FROM','creator@example.com')`,
                [randomUUID(), ids.inbound],
              );
              const scan = jest.fn(async (sql: string, parameters: unknown[]) =>
                runner.query(sql, parameters),
              );
              const backfill =
                new MyahInboxBackfillCampaignReplyEvidenceCommand(
                  { existsBy: async () => true } as never,
                  {
                    executeInWorkspaceContext: async (
                      run: () => Promise<void>,
                    ) => run(),
                    getGlobalWorkspaceDataSource: async () => ({ query: scan }),
                  } as never,
                  {} as never,
                  {} as never,
                );
              await backfill.run([], { workspaceId, limit: 10 });
              expect(await scan.mock.results[0].value).toEqual([
                expect.objectContaining({ messageId: ids.inbound }),
              ]);
              const [unchanged] = await runner.query(
                `SELECT count(*)::int AS count FROM core."myahCampaignReplyEvidence"
                 WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
                [workspaceId, ids.inbound],
              );
              expect(unchanged.count).toBe(0);
            }

            expect(
              await service.prepareInboundCandidateCreatorsInTransaction(
                {
                  workspaceId,
                  messageChannelId: routing.channelId,
                  candidates: [
                    {
                      threadExternalId: 'shared-thread',
                      normalizedSender: 'creator@example.com',
                    },
                  ],
                },
                runner.manager,
              ),
            ).toEqual(
              [
                ...new Set([
                  ids.creatorA,
                  differentEnrollment ? ids.creatorB : ids.creatorA,
                ]),
              ].sort(),
            );

            const inbound = {
              workspaceId,
              messageChannelId: routing.channelId,
              threadExternalId: 'shared-thread',
              fromHandle: 'creator@example.com',
              inboundEvidenceId: ids.inbound,
              inboundMessageThreadId: ids.inboundThread,
              inReplyToTokens: richerReimport ? [] : ['<second@example.com>'],
            };
            await service.reconcileInboundMessageInTransaction(
              inbound,
              runner.manager,
            );
            const before = await runner.query(
              `SELECT (SELECT count(*)::int FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1 AND "inboundMessageId"=$2) AS evidence,
                    (SELECT count(*)::int FROM core."myahCampaignReplyPending" WHERE "workspaceId"=$1 AND "messageId"=$2) AS pending`,
              [workspaceId, ids.inbound],
            );
            expect(before[0]).toEqual({ evidence: 0, pending: 1 });
            if (richerReimport) {
              await service.reconcileInboundMessageInTransaction(
                { ...inbound, inReplyToTokens: ['<second@example.com>'] },
                runner.manager,
              );
              const [pendingProof] = await runner.query(
                `SELECT "inReplyToHeaderMessageIds" FROM core."myahCampaignReplyPending"
                 WHERE "workspaceId"=$1 AND "messageId"=$2`,
                [workspaceId, ids.inbound],
              );
              expect(pendingProof.inReplyToHeaderMessageIds).toEqual([
                '<second@example.com>',
              ]);
            }
            if (committed) {
              // Exercise the bounded worker's real ten-second pending cooldown.
              await runner.query(
                `UPDATE core."myahCampaignReplyPending" SET "updatedAt"=clock_timestamp()-interval '11 seconds'
                 WHERE "workspaceId"=$1 AND "messageId"=$2`,
                [workspaceId, ids.inbound],
              );
              await runner.commitTransaction();
              await runner.startTransaction();
            }

            if (outcome === 'ACCEPTED') {
              await runner.query(
                `UPDATE core."outboundEmailAttempt" SET
              "attemptState"='ACCEPTED', "capacityState"='CONSUMED', "finalEvidenceDigest"=repeat('d',64),
              "providerMessageId"='provider-b', "providerMessageExternalId"='external-b',
              "providerHeaderMessageId"='<second@example.com>', "providerAcceptedAt"=now(),
              retryable=false,"resolvedThreadExternalId"='shared-thread' WHERE "attemptId"=$1`,
                [ids.attemptB],
              );
            } else {
              await runner.query(
                `UPDATE core."outboundEmailAttempt"
              SET "attemptState"='DEFINITELY_UNACCEPTED', "capacityState"='RELEASED'
              WHERE "attemptId"=$1`,
                [ids.attemptB],
              );
            }
            if (committed) {
              if (outcome === 'ACCEPTED') {
                await runner.query(
                  `UPDATE core."outboundEmailAttempt"
                   SET "projectedMessageId"=$2,"projectedMessageThreadId"=$3
                   WHERE "attemptId"=$1`,
                  [ids.attemptB, ids.messageB, ids.inboundThread],
                );
                await runner.query(
                  `UPDATE core."campaignOccurrence"
                   SET state='SUCCEEDED',"terminalReason"='PROVIDER_ACCEPTED',"terminalAt"=now()
                   WHERE id=$1`,
                  [ids.occurrenceB],
                );
              } else {
                await runner.query(
                  `UPDATE core."campaignOccurrence"
                   SET state='HELD',"holdReason"='DEFINITELY_UNACCEPTED_REVIEW'
                   WHERE id=$1`,
                  [ids.occurrenceB],
                );
              }
              await runner.commitTransaction();
              await runner.startTransaction();
            }
            const pendingInput = {
              workspaceId,
              inboundEvidenceId: ids.inbound,
            };
            if (migratingMarker) {
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await runner.query(
                `UPDATE "${schemaName}"."myahInboxTriageMigration" SET status='MIGRATING' WHERE id=true`,
              );
              await service.reconcilePendingMessageInTransaction(
                pendingInput,
                runner.manager,
              );
              const [pendingWhileMigrating] = await runner.query(
                `SELECT count(*)::int AS count FROM core."myahCampaignReplyPending"
                 WHERE "workspaceId"=$1 AND "messageId"=$2`,
                [workspaceId, ids.inbound],
              );
              expect(pendingWhileMigrating.count).toBe(1);
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await runner.query(
                `UPDATE "${schemaName}"."myahInboxTriageMigration" SET status='READY' WHERE id=true`,
              );
            }
            if (committed && outcome === 'ACCEPTED' && !differentEnrollment) {
              const blocker = dataSource.createQueryRunner();
              const contender = dataSource.createQueryRunner();
              await blocker.connect();
              await contender.connect();
              await blocker.startTransaction();
              await contender.startTransaction();
              try {
                if (creatorContention) {
                  await blocker.query(
                    `SELECT pg_advisory_xact_lock(hashtextextended('myah-inbox-anchor:' || $1, 0))`,
                    [`creator:${ids.creatorB}`],
                  );
                } else {
                  await blocker.query(
                    `SELECT "attemptId" FROM core."outboundEmailAttempt"
                     WHERE "attemptId"=ANY($1::uuid[]) ORDER BY "attemptId" FOR UPDATE`,
                    [[ids.attemptA, ids.attemptB]],
                  );
                }
                await contender.query("SET LOCAL lock_timeout='3s'");
                const [{ pid }] = await contender.query(
                  'SELECT pg_backend_pid() AS pid',
                );
                const replay = service.reconcilePendingMessageInTransaction(
                  pendingInput,
                  contender.manager,
                );
                let waiting = false;
                for (let poll = 0; poll < 30; poll++) {
                  const [activity] = await runner.query(
                    'SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',
                    [pid],
                  );
                  if (activity?.wait_event_type === 'Lock') {
                    waiting = true;
                    break;
                  }
                  await delay(20);
                }
                expect(waiting).toBe(true);
                await runner.query('SAVEPOINT check_pending_lock');
                try {
                  const [freePending] = await runner.query(
                    `SELECT "messageId" FROM core."myahCampaignReplyPending"
                     WHERE "workspaceId"=$1 AND "messageId"=$2 FOR UPDATE NOWAIT`,
                    [workspaceId, ids.inbound],
                  );
                  expect(freePending.messageId).toBe(ids.inbound);
                } finally {
                  await runner.query(
                    'ROLLBACK TO SAVEPOINT check_pending_lock',
                  );
                }
                await blocker.commitTransaction();
                await replay;
              } finally {
                if (blocker.isTransactionActive)
                  await blocker.rollbackTransaction();
                if (contender.isTransactionActive)
                  await contender.rollbackTransaction();
                await blocker.release();
                await contender.release();
              }
            }
            if (committed) {
              const dispatch = { dispatch: jest.fn() };
              const retry = jest
                .fn()
                .mockRejectedValueOnce(new Error('Inbox lock unavailable'))
                .mockImplementation((input, manager) =>
                  service.reconcilePendingMessageInTransaction(input, manager),
                );
              const runtime = new CampaignEmailRuntimeService(
                {
                  getGlobalWorkspaceDataSource: async () => dataSource,
                  executeInWorkspaceContext: async (run: () => Promise<void>) =>
                    run(),
                } as never,
                {} as never,
                dispatch as never,
                {} as never,
                { reconcilePendingMessageInTransaction: retry } as never,
              );
              const runtimeQueries = runtime as unknown as {
                query: (
                  sql: string,
                  parameters?: unknown[],
                ) => Promise<Record<string, unknown>[]>;
              };
              const originalQuery = runtimeQueries.query.bind(runtime);
              let selectedPending = false;
              let projectedAttemptSelectedForDispatch = false;
              runtimeQueries.query = async (sql, parameters) => {
                if (sql.startsWith('WITH pending')) {
                  // Read the actual due-work SQL but never dispatch seeded work.
                  const dueWork: Record<string, unknown>[] =
                    await originalQuery(sql, parameters);
                  projectedAttemptSelectedForDispatch ||= dueWork.some(
                    (row) => row.attemptId === ids.attemptB,
                  );
                  return [];
                }
                const selected: Record<string, unknown>[] = await originalQuery(
                  sql,
                  parameters,
                );
                if (!sql.includes('FROM core."myahCampaignReplyPending"'))
                  return selected;
                const ours = selected.filter((row) => row.id === ids.inbound);
                selectedPending ||= ours.length > 0;
                return ours;
              };
              const logged = jest.spyOn(console, 'error').mockImplementation();
              try {
                await runtime.runDueOccurrences();
                const [failed] = await runner.query(
                  `SELECT p."messageId",a."attemptState" FROM core."myahCampaignReplyPending" p
                   JOIN core."outboundEmailAttempt" a ON a."attemptId"=$3
                   WHERE p."workspaceId"=$1 AND p."messageId"=$2`,
                  [workspaceId, ids.inbound, ids.attemptB],
                );
                expect(failed).toEqual({
                  messageId: ids.inbound,
                  attemptState: outcome,
                });
                await runtime.runDueOccurrences();
              } finally {
                logged.mockRestore();
              }
              expect(selectedPending).toBe(true);
              expect(projectedAttemptSelectedForDispatch).toBe(false);
              expect(retry).toHaveBeenCalledTimes(2);
              expect(dispatch.dispatch).not.toHaveBeenCalled();
            } else {
              await service.reconcilePendingMessageInTransaction(
                pendingInput,
                runner.manager,
              );
            }
            await service.reconcilePendingMessageInTransaction(
              pendingInput,
              runner.manager,
            );
            const after = await runner.query(
              `SELECT "classification","matchedAttemptId" FROM core."myahCampaignReplyEvidence"
              WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
              [workspaceId, ids.inbound],
            );
            expect(after).toEqual(
              outcome !== 'ACCEPTED'
                ? [{ classification: 'THREAD', matchedAttemptId: null }]
                : differentEnrollment
                  ? []
                  : [
                      {
                        classification: 'EXACT',
                        matchedAttemptId: ids.attemptB,
                      },
                    ],
            );
            const [pending] = await runner.query(
              `SELECT count(*)::int AS count FROM core."myahCampaignReplyPending"
              WHERE "workspaceId"=$1 AND "messageId"=$2`,
              [workspaceId, ids.inbound],
            );
            expect(pending.count).toBe(0);
            // pi-lens-ignore: sql-injection, no-sql-in-code
            const [bound] = await runner.query(
              `SELECT "creatorId","myahCampaignId" FROM "${schemaName}"."messageThread" WHERE id=$1`,
              [ids.inboundThread],
            );
            expect(bound).toEqual(
              boundCreatorB
                ? { creatorId: ids.creatorB, myahCampaignId: null }
                : outcome === 'ACCEPTED' && differentEnrollment
                  ? { creatorId: null, myahCampaignId: null }
                  : { creatorId: ids.creatorA, myahCampaignId: ids.campaign },
            );
            if (outcome !== 'ACCEPTED' || !differentEnrollment) {
              // pi-lens-ignore: sql-injection, no-sql-in-code
              const [identity] = await runner.query(
                `SELECT "contactIdentityKey" FROM "${schemaName}"."myahInboxContactIdentity"
                 WHERE "contactIdentityKey"=$1`,
                [`creator:${bound.creatorId}`],
              );
              expect(identity).toBeDefined();
            }
            expect(
              progression.terminalizeReplyInTransaction,
            ).toHaveBeenCalledTimes(
              (outcome === 'ACCEPTED' && differentEnrollment ? 1 : 2) +
                (richerReimport ? 1 : 0) +
                (committed && outcome === 'ACCEPTED' && !differentEnrollment
                  ? 1
                  : 0),
            );
            if (committed) await runner.commitTransaction();
          } finally {
            if (runner.isTransactionActive) await runner.rollbackTransaction();
            if (committed) {
              await runner.startTransaction();
              try {
                await cleanupCampaignFixture(runner, {
                  ids,
                  workspaceId,
                  schemaName,
                });
                await runner.commitTransaction();
              } catch (error) {
                await runner.rollbackTransaction();
                throw error;
              }
            }
            await runner.release();
          }
        },
        buildSystemAuthContext(workspaceId),
        { lite: true },
      );
    },
  );

  it.each(
    [false, true].flatMap((pendingFirst) =>
      [1, 2, 3].map((round) => ({ pendingFirst, round })),
    ),
  )(
    'converges concurrent import, backfill and replay on one inbound (pending first: $pendingFirst, round $round)',
    async ({ pendingFirst }) => {
      const workspaceId = SEED_APPLE_WORKSPACE_ID;
      const schemaName = getWorkspaceSchemaName(workspaceId);
      const ids = createCampaignFixtureIds();
      const threadExternalId = `race-${ids.inbound}`;
      const recipient = `race-${ids.inbound}@example.com`;
      const lifecycle = new MyahInboxContactTriageLifecycleService(
        new MyahInboxContactTriageService(),
      );
      const service = new CampaignReplyService(
        {
          terminalizeReplyInTransaction: jest.fn(async () => ({
            status: 'EXACT_REPLAY',
          })),
        } as never,
        undefined,
        lifecycle,
      );
      const orm = getOrm();

      await orm.executeInWorkspaceContext(
        async () => {
          const dataSource = await orm.getGlobalWorkspaceDataSource();
          const setup = dataSource.createQueryRunner();
          await setup.connect();
          let routing: Routing | undefined;
          // Mirrors the import/backfill ordering: attempt preflight, Creator
          // anchors, then the shared reconciler under covered source locks.
          const importInbound = async (
            manager: typeof setup.manager,
            inReplyToTokens: string[],
          ) => {
            const candidateCreatorIds =
              await service.prepareInboundCandidateCreatorsInTransaction(
                {
                  workspaceId,
                  messageChannelId: routing!.channelId,
                  candidates: [
                    { threadExternalId, normalizedSender: recipient },
                  ],
                },
                manager as never,
              );
            // pi-lens-ignore: sql-injection, no-sql-in-code
            const [thread] = await manager.queryRunner!.query(
              `SELECT "creatorId" FROM "${schemaName}"."messageThread" WHERE id=$1`,
              [ids.inboundThread],
            );
            const coveredCreatorIds = [
              ...new Set([
                ...candidateCreatorIds,
                ...(thread?.creatorId ? [thread.creatorId as string] : []),
              ]),
            ].sort();
            await lifecycle.withCreatorMutationLocksInTransaction({
              creatorIds: coveredCreatorIds,
              manager: manager as never,
              mutate: () =>
                service.reconcileInboundMessageInTransaction(
                  {
                    workspaceId,
                    messageChannelId: routing!.channelId,
                    threadExternalId,
                    fromHandle: recipient,
                    inboundEvidenceId: ids.inbound,
                    inboundMessageThreadId: ids.inboundThread,
                    inReplyToTokens,
                    coveredCreatorIds,
                  },
                  manager as never,
                ),
            });
          };
          const inTransaction = async (
            work: (manager: typeof setup.manager) => Promise<unknown>,
          ) => {
            const runner = dataSource.createQueryRunner();
            await runner.connect();
            await runner.startTransaction();
            try {
              // A lock-order inversion surfaces as a deadlock or timeout here.
              await runner.query("SET LOCAL lock_timeout='10s'");
              await work(runner.manager);
              await runner.commitTransaction();
            } catch (error) {
              await runner.rollbackTransaction();
              throw error;
            } finally {
              await runner.release();
            }
          };
          try {
            await setup.startTransaction();
            [routing] = await setup.query(
              `SELECT mc.id AS "channelId", ca.id AS "accountId", lower(ca.handle) AS sender,
                    (SELECT id FROM core."userWorkspace" WHERE "workspaceId"=$1 LIMIT 1) AS "userWorkspaceId"
               FROM core."messageChannel" mc JOIN core."connectedAccount" ca ON ca.id=mc."connectedAccountId"
              WHERE mc."workspaceId"=$1 AND mc.type='EMAIL' LIMIT 1`,
              [workspaceId],
            );
            await seedCampaignFixture(setup, {
              ids,
              workspaceId,
              schemaName,
              routing: routing!,
              secondEnrollmentId: ids.enrollmentA,
              threadExternalId,
              recipient,
            });
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `INSERT INTO "${schemaName}".message (id,"messageThreadId","receivedAt",subject,"isDraft")
               VALUES ($1,$2,now(),'race reply',false)`,
              [ids.inbound, ids.inboundThread],
            );
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `INSERT INTO "${schemaName}"."messageChannelMessageAssociation"
                 (id,"messageId","messageChannelId","messageThreadExternalId",direction)
               VALUES ($1,$2,$3,$4,'INCOMING')`,
              [randomUUID(), ids.inbound, routing!.channelId, threadExternalId],
            );
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `INSERT INTO "${schemaName}"."messageParticipant" (id,"messageId",role,handle)
               VALUES ($1,$2,'FROM',$3)`,
              [randomUUID(), ids.inbound, recipient],
            );
            if (pendingFirst)
              await importInbound(setup.manager, ['<second@example.com>']);
            await setup.query(
              `UPDATE core."outboundEmailAttempt" SET
                "attemptState"='ACCEPTED', "capacityState"='CONSUMED', "finalEvidenceDigest"=repeat('d',64),
                "providerMessageId"='provider-b', "providerMessageExternalId"='external-b',
                "providerHeaderMessageId"='<second@example.com>', "providerAcceptedAt"=now(),
                retryable=false,"resolvedThreadExternalId"=$2 WHERE "attemptId"=$1`,
              [ids.attemptB, threadExternalId],
            );
            await setup.commitTransaction();
            const [pendingBefore] = await setup.query(
              `SELECT count(*)::int AS count FROM core."myahCampaignReplyPending"
               WHERE "workspaceId"=$1 AND "messageId"=$2`,
              [workspaceId, ids.inbound],
            );
            expect(pendingBefore.count).toBe(pendingFirst ? 1 : 0);

            const backfill = new MyahInboxBackfillCampaignReplyEvidenceCommand(
              { existsBy: async () => true } as never,
              {
                executeInWorkspaceContext: async (run: () => Promise<void>) =>
                  run(),
                // Restrict the workspace-wide scan to this test's inbound.
                getGlobalWorkspaceDataSource: async () => ({
                  query: async (
                    sql: string,
                    parameters: unknown[],
                    queryRunner: undefined,
                    options: { shouldBypassPermissionChecks: boolean },
                  ) =>
                    (
                      (await dataSource.query(
                        sql,
                        parameters,
                        queryRunner,
                        options,
                      )) as Array<{
                        messageId: string;
                      }>
                    ).filter((row) => row.messageId === ids.inbound),
                  transaction: dataSource.transaction.bind(dataSource),
                }),
              } as never,
              service,
              lifecycle,
            );
            await Promise.all([
              inTransaction((manager) =>
                importInbound(manager, ['<second@example.com>']),
              ),
              inTransaction((manager) =>
                service.reconcilePendingMessageInTransaction(
                  { workspaceId, inboundEvidenceId: ids.inbound },
                  manager as never,
                ),
              ),
              backfill.run([], { workspaceId, limit: 500, apply: true }),
            ]);

            const readEvidence = () =>
              setup.query(
                `SELECT "classification","matchedAttemptId" FROM core."myahCampaignReplyEvidence"
                 WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
                [workspaceId, ids.inbound],
              );
            const evidence = await readEvidence();
            expect(evidence).toHaveLength(1);
            expect(
              pendingFirst
                ? [{ classification: 'EXACT', matchedAttemptId: ids.attemptB }]
                : [
                    [
                      {
                        classification: 'EXACT',
                        matchedAttemptId: ids.attemptB,
                      },
                    ],
                    [{ classification: 'THREAD', matchedAttemptId: null }],
                  ],
            ).toContainEqual(pendingFirst ? evidence[0] : evidence);
            // A later retry never rewrites, downgrades or re-pends the record.
            await inTransaction((manager) => importInbound(manager, []));
            expect(await readEvidence()).toEqual(evidence);
            const [state] = await setup.query(
              `SELECT
                 (SELECT count(*)::int FROM core."myahCampaignReplyPending" WHERE "workspaceId"=$1 AND "messageId"=$2) AS pending,
                 (SELECT array_agg("attemptState"::text ORDER BY "attemptState") FROM core."outboundEmailAttempt" WHERE "attemptId"=ANY($3::uuid[])) AS attempts`,
              [workspaceId, ids.inbound, [ids.attemptA, ids.attemptB]],
            );
            expect(state).toEqual({
              pending: 0,
              attempts: ['ACCEPTED', 'ACCEPTED'],
            });
            // pi-lens-ignore: sql-injection, no-sql-in-code
            const [bound] = await setup.query(
              `SELECT thread."creatorId", thread."myahCampaignId",
                 (SELECT count(*)::int FROM "${schemaName}"."myahInboxContactIdentity" identity
                   WHERE identity."contactIdentityKey"=$2) AS identities
               FROM "${schemaName}"."messageThread" thread WHERE thread.id=$1`,
              [ids.inboundThread, `creator:${ids.creatorA}`],
            );
            expect(bound).toEqual({
              creatorId: ids.creatorA,
              myahCampaignId: ids.campaign,
              identities: 1,
            });
          } finally {
            if (setup.isTransactionActive) await setup.rollbackTransaction();
            await setup.startTransaction();
            try {
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await setup.query(
                `DELETE FROM "${schemaName}"."messageParticipant" WHERE "messageId"=$1`,
                [ids.inbound],
              );
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await setup.query(
                `DELETE FROM "${schemaName}"."messageChannelMessageAssociation" WHERE "messageId"=$1`,
                [ids.inbound],
              );
              await cleanupCampaignFixture(setup, {
                ids,
                workspaceId,
                schemaName,
              });
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await setup.query(
                `DELETE FROM "${schemaName}".message WHERE id=$1`,
                [ids.inbound],
              );
              await setup.commitTransaction();
            } catch (error) {
              await setup.rollbackTransaction();
              throw error;
            } finally {
              await setup.release();
            }
          }
        },
        buildSystemAuthContext(workspaceId),
        { lite: true },
      );
    },
    60000,
  );

  it('applies THREAD-only historical evidence with a resumable cursor and an idempotent repeat', async () => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const schemaName = getWorkspaceSchemaName(workspaceId);
    const ids = createCampaignFixtureIds();
    const inboundIds: string[] = [randomUUID(), randomUUID()].sort();
    const threadExternalId = `backfill-${ids.inbound}`;
    const recipient = `backfill-${ids.inbound}@example.com`;
    const lifecycle = new MyahInboxContactTriageLifecycleService(
      new MyahInboxContactTriageService(),
    );
    const service = new CampaignReplyService(
      {
        terminalizeReplyInTransaction: jest.fn(async () => ({
          status: 'EXACT_REPLAY',
        })),
      } as never,
      undefined,
      lifecycle,
    );
    const orm = getOrm();

    await orm.executeInWorkspaceContext(
      async () => {
        const dataSource = await orm.getGlobalWorkspaceDataSource();
        const setup = dataSource.createQueryRunner();
        await setup.connect();
        const backfill = new MyahInboxBackfillCampaignReplyEvidenceCommand(
          { existsBy: async () => true } as never,
          {
            executeInWorkspaceContext: async (run: () => Promise<void>) =>
              run(),
            // Restrict the workspace-wide scan to this test's historical rows.
            getGlobalWorkspaceDataSource: async () => ({
              query: async (
                sql: string,
                parameters: unknown[],
                queryRunner: undefined,
                options: { shouldBypassPermissionChecks: boolean },
              ) =>
                (
                  (await dataSource.query(
                    sql,
                    parameters,
                    queryRunner,
                    options,
                  )) as Array<{ messageId: string }>
                ).filter((row) => inboundIds.includes(row.messageId)),
              transaction: dataSource.transaction.bind(dataSource),
            }),
          } as never,
          service,
          lifecycle,
        );
        const readEvidence = () =>
          setup.query(
            `SELECT "inboundMessageId","classification","matchedAttemptId","createdAt"
             FROM core."myahCampaignReplyEvidence"
             WHERE "workspaceId"=$1 AND "inboundMessageId"=ANY($2::uuid[])
             ORDER BY "inboundMessageId"`,
            [workspaceId, inboundIds],
          );
        try {
          await setup.startTransaction();
          const [routing] = await setup.query(
            `SELECT mc.id AS "channelId", ca.id AS "accountId", lower(ca.handle) AS sender,
                  (SELECT id FROM core."userWorkspace" WHERE "workspaceId"=$1 LIMIT 1) AS "userWorkspaceId"
             FROM core."messageChannel" mc JOIN core."connectedAccount" ca ON ca.id=mc."connectedAccountId"
            WHERE mc."workspaceId"=$1 AND mc.type='EMAIL' LIMIT 1`,
            [workspaceId],
          );
          await seedCampaignFixture(setup, {
            ids,
            workspaceId,
            schemaName,
            routing,
            secondEnrollmentId: ids.enrollmentA,
            threadExternalId,
            recipient,
          });
          await setup.query(
            `UPDATE core."outboundEmailAttempt"
             SET "attemptState"='DEFINITELY_UNACCEPTED', "capacityState"='RELEASED'
             WHERE "attemptId"=$1`,
            [ids.attemptB],
          );
          for (const messageId of inboundIds) {
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `INSERT INTO "${schemaName}".message (id,"messageThreadId","receivedAt",subject,"isDraft")
               VALUES ($1,$2,now(),'historical reply',false)`,
              [messageId, ids.inboundThread],
            );
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `INSERT INTO "${schemaName}"."messageChannelMessageAssociation"
                 (id,"messageId","messageChannelId","messageThreadExternalId",direction)
               VALUES ($1,$2,$3,$4,'INCOMING')`,
              [randomUUID(), messageId, routing.channelId, threadExternalId],
            );
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `INSERT INTO "${schemaName}"."messageParticipant" (id,"messageId",role,handle)
               VALUES ($1,$2,'FROM',$3)`,
              [randomUUID(), messageId, recipient],
            );
          }
          await setup.commitTransaction();

          await backfill.run([], { workspaceId, limit: 1 });
          expect(await readEvidence()).toEqual([]);

          await backfill.run([], { workspaceId, limit: 1, apply: true });
          const first = await readEvidence();
          expect(first).toEqual([
            expect.objectContaining({
              inboundMessageId: inboundIds[0],
              classification: 'THREAD',
              matchedAttemptId: null,
            }),
          ]);

          await backfill.run([], {
            workspaceId,
            limit: 1,
            apply: true,
            afterMessageId: inboundIds[0],
          });
          const resumed = await readEvidence();
          expect(
            resumed.map(
              (row: { inboundMessageId: string }) => row.inboundMessageId,
            ),
          ).toEqual(inboundIds);
          expect(
            resumed.every(
              (row: { classification: string; matchedAttemptId: null }) =>
                row.classification === 'THREAD' &&
                row.matchedAttemptId === null,
            ),
          ).toBe(true);

          await backfill.run([], { workspaceId, limit: 500, apply: true });
          expect(await readEvidence()).toEqual(resumed);
          const [pending] = await setup.query(
            `SELECT count(*)::int AS count FROM core."myahCampaignReplyPending"
             WHERE "workspaceId"=$1 AND "messageId"=ANY($2::uuid[])`,
            [workspaceId, inboundIds],
          );
          expect(pending.count).toBe(0);
          // pi-lens-ignore: sql-injection, no-sql-in-code
          const [bound] = await setup.query(
            `SELECT "creatorId","myahCampaignId" FROM "${schemaName}"."messageThread" WHERE id=$1`,
            [ids.inboundThread],
          );
          expect(bound).toEqual({
            creatorId: ids.creatorA,
            myahCampaignId: ids.campaign,
          });
        } finally {
          if (setup.isTransactionActive) await setup.rollbackTransaction();
          await setup.startTransaction();
          try {
            await setup.query(
              `DELETE FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1 AND "inboundMessageId"=ANY($2::uuid[])`,
              [workspaceId, inboundIds],
            );
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `DELETE FROM "${schemaName}"."messageParticipant" WHERE "messageId"=ANY($1::uuid[])`,
              [inboundIds],
            );
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `DELETE FROM "${schemaName}"."messageChannelMessageAssociation" WHERE "messageId"=ANY($1::uuid[])`,
              [inboundIds],
            );
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `DELETE FROM "${schemaName}".message WHERE id=ANY($1::uuid[])`,
              [inboundIds],
            );
            await cleanupCampaignFixture(setup, {
              ids,
              workspaceId,
              schemaName,
            });
            await setup.commitTransaction();
          } catch (error) {
            await setup.rollbackTransaction();
            throw error;
          } finally {
            await setup.release();
          }
        }
      },
      buildSystemAuthContext(workspaceId),
      { lite: true },
    );
  }, 60000);
});
