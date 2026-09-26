import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import {
  buildMyahInboxSourceKey,
  MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL,
} from 'src/engine/core-modules/myah-inbox/utils/myah-inbox-source-lock.util';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';
import {
  cleanupCampaignFixture,
  createCampaignFixtureIds,
  getOrm,
  type Routing,
  seedCampaignFixture,
} from 'test/integration/campaign-execution/utils/campaign-reply-evidence-fixture.util';
import { ensureMyahInboxContactTriageTables } from 'test/integration/myah-inbox/utils/ensure-myah-inbox-contact-triage-tables.util';

const workspaceId = SEED_APPLE_WORKSPACE_ID;
const schema = getWorkspaceSchemaName(workspaceId);

// Two independently committed transactions: a manual relink wins while an
// import has anticipated an older Creator. The import must never acquire C's
// anchor after it has taken the source lock.
describe('Campaign reply Creator lock coverage in PostgreSQL', () => {
  it.each(
    ([null, 'B'] as const).flatMap((initialCreator) =>
      Array.from({ length: 20 }, (_, round) => ({ initialCreator, round })),
    ),
  )(
    'does not acquire newly linked C under a $initialCreator source lock (run $round)',
    async ({ initialCreator }) => {
      const [creatorA, creatorB, creatorC, threadId] = Array.from(
        { length: 4 },
        () => randomUUID(),
      );
      const dataSource = global.testDataSource;
      const setup = dataSource.createQueryRunner();
      const manual = dataSource.createQueryRunner();
      const importer = dataSource.createQueryRunner();
      const observer = dataSource.createQueryRunner();
      const lifecycle = new MyahInboxContactTriageLifecycleService();
      await Promise.all([
        setup.connect(),
        manual.connect(),
        importer.connect(),
        observer.connect(),
      ]);
      try {
        await setup.startTransaction();
        // Workspace schema is UUID-derived; all row values are bound.
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await setup.query(
          `INSERT INTO "${schema}".creator (id,name) VALUES ($1,'A'),($2,'B'),($3,'C')`,
          [creatorA, creatorB, creatorC],
        );
        // pi-lens-ignore: sql-injection, no-sql-in-code
        await setup.query(
          `INSERT INTO "${schema}"."messageThread" (id,subject,"creatorId") VALUES ($1,'MYAH-415 lock test',$2)`,
          [threadId, initialCreator ? creatorB : null],
        );
        await setup.commitTransaction();
        await manual.startTransaction();
        await importer.startTransaction();
        await observer.startTransaction();

        // pi-lens-ignore: sql-injection, no-sql-in-code
        const [preview] = await importer.query(
          `SELECT "creatorId" FROM "${schema}"."messageThread" WHERE id=$1`,
          [threadId],
        );
        expect(preview.creatorId).toBe(initialCreator ? creatorB : null);
        await lifecycle.withCreatorMutationLocksInTransaction({
          creatorIds: initialCreator ? [creatorB, creatorC] : [creatorC],
          manager: manual.manager as never,
          mutate: async () => {
            await manual.query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
              buildMyahInboxSourceKey('EMAIL_THREAD', threadId),
            ]);
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await manual.query(
              `UPDATE "${schema}"."messageThread" SET "creatorId"=$1 WHERE id=$2`,
              [creatorC, threadId],
            );
          },
        });
        const [{ pid }] = await importer.query(
          'SELECT pg_backend_pid() AS pid',
        );
        const importResult = lifecycle
          .withCreatorMutationLocksInTransaction({
            creatorIds: initialCreator ? [creatorA, creatorB] : [creatorA],
            manager: importer.manager as never,
            mutate: async () => {
              await importer.query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
                buildMyahInboxSourceKey('EMAIL_THREAD', threadId),
              ]);
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await importer.query(
                `SELECT id FROM "${schema}"."messageThread" WHERE id=$1 FOR UPDATE`,
                [threadId],
              );
              await lifecycle.withPreparedSourceMutationInTransaction({
                workspaceId,
                sourceType: 'EMAIL_THREAD',
                sourceRecordIds: [threadId],
                nextCreatorIds: [creatorA],
                coveredCreatorIds: initialCreator
                  ? [creatorA, creatorB]
                  : [creatorA],
                manager: importer.manager as never,
                mutate: async () => {
                  throw new Error('Uncovered binding must never mutate');
                },
              });
            },
          })
          .then(
            () => null,
            (error: unknown) => error,
          );
        let waiting = false;
        for (let poll = 0; poll < 40; poll++) {
          const [activity] = await observer.query(
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
        await manual.commitTransaction();
        expect(((await importResult) as Error).message).toContain(
          'Inbox Creator lock coverage changed before source mutation',
        );
        const [freeC] = await observer.query(
          `SELECT pg_try_advisory_xact_lock(hashtextextended('myah-inbox-anchor:' || $1,0)) AS acquired`,
          [`creator:${creatorC}`],
        );
        expect(freeC.acquired).toBe(true);
      } finally {
        for (const runner of [manual, importer, observer, setup]) {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
        }
        await setup.startTransaction();
        try {
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await setup.query(
            `DELETE FROM "${schema}"."messageThread" WHERE id=$1`,
            [threadId],
          );
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await setup.query(
            `DELETE FROM "${schema}".creator WHERE id=ANY($1::uuid[])`,
            [[creatorA, creatorB, creatorC]],
          );
          await setup.commitTransaction();
        } catch (error) {
          await setup.rollbackTransaction();
          throw error;
        } finally {
          await Promise.all([
            manual.release(),
            importer.release(),
            observer.release(),
            setup.release(),
          ]);
        }
      }
    },
  );

  // Post-acceptance reconsideration takes the same attempt/pending → Creator →
  // source order. A manual relink to C committed mid-replay must not make the
  // replay take C's anchor under a source lock; the pending proof survives and
  // the next tick converges without overwriting C.
  it.each(
    ([null, 'B'] as const).flatMap((initialCreator) =>
      Array.from({ length: 20 }, (_, round) => ({ initialCreator, round })),
    ),
  )(
    'replays accepted proof without acquiring newly linked C under a $initialCreator source lock (run $round)',
    async ({ initialCreator }) => {
      const ids = createCampaignFixtureIds();
      const creatorC = randomUUID();
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
      await ensureMyahInboxContactTriageTables(workspaceId);

      await orm.executeInWorkspaceContext(
        async () => {
          const dataSource = await orm.getGlobalWorkspaceDataSource();
          const [setup, manual, replay, observer] = Array.from(
            { length: 4 },
            () => dataSource.createQueryRunner(),
          );
          await Promise.all(
            [setup, manual, replay, observer].map((runner) => runner.connect()),
          );
          const pendingInput = { workspaceId, inboundEvidenceId: ids.inbound };
          const readState = async () => {
            // pi-lens-ignore: sql-injection, no-sql-in-code
            const [state] = await observer.query(
              `SELECT
                 (SELECT count(*)::int FROM core."myahCampaignReplyPending" WHERE "workspaceId"=$1 AND "messageId"=$2) AS pending,
                 (SELECT count(*)::int FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1 AND "inboundMessageId"=$2) AS evidence,
                 (SELECT "creatorId" FROM "${schema}"."messageThread" WHERE id=$3) AS "creatorId"`,
              [workspaceId, ids.inbound, ids.inboundThread],
            );
            return state;
          };
          try {
            await setup.startTransaction();
            const [routing] = (await setup.query(
              `SELECT mc.id AS "channelId", ca.id AS "accountId", lower(ca.handle) AS sender,
                    (SELECT id FROM core."userWorkspace" WHERE "workspaceId"=$1 LIMIT 1) AS "userWorkspaceId"
               FROM core."messageChannel" mc JOIN core."connectedAccount" ca ON ca.id=mc."connectedAccountId"
              WHERE mc."workspaceId"=$1 AND mc.type='EMAIL' LIMIT 1`,
              [workspaceId],
            )) as Routing[];
            const threadExternalId = `lock-${ids.inbound}`;
            const recipient = `lock-${ids.inbound}@example.com`;
            await seedCampaignFixture(setup, {
              ids,
              workspaceId,
              schemaName: schema,
              routing,
              secondEnrollmentId: ids.enrollmentA,
              threadExternalId,
              recipient,
            });
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `INSERT INTO "${schema}".creator (id,name) VALUES ($1,'C')`,
              [creatorC],
            );
            if (initialCreator) {
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await setup.query(
                `UPDATE "${schema}"."messageThread" SET "creatorId"=$1 WHERE id=$2`,
                [ids.creatorB, ids.inboundThread],
              );
            }
            // Attempt B is still UNKNOWN: the inbound keeps pending proof only.
            await service.reconcileInboundMessageInTransaction(
              {
                workspaceId,
                messageChannelId: routing.channelId,
                threadExternalId,
                fromHandle: recipient,
                inboundEvidenceId: ids.inbound,
                inboundMessageThreadId: ids.inboundThread,
                inReplyToTokens: ['<second@example.com>'],
              },
              setup.manager as never,
            );
            await setup.query(
              `UPDATE core."outboundEmailAttempt" SET
                "attemptState"='ACCEPTED', "capacityState"='CONSUMED', "finalEvidenceDigest"=repeat('d',64),
                "providerMessageId"='provider-b', "providerMessageExternalId"='external-b',
                "providerHeaderMessageId"='<second@example.com>', "providerAcceptedAt"=now(),
                retryable=false,"resolvedThreadExternalId"=$2 WHERE "attemptId"=$1`,
              [ids.attemptB, threadExternalId],
            );
            await setup.commitTransaction();
            expect((await readState()).pending).toBe(1);

            await manual.startTransaction();
            await replay.startTransaction();
            await replay.query("SET LOCAL lock_timeout='10s'");
            await lifecycle.withCreatorMutationLocksInTransaction({
              creatorIds: initialCreator
                ? [ids.creatorB, creatorC]
                : [creatorC],
              manager: manual.manager as never,
              mutate: async () => {
                await manual.query(MYAH_INBOX_SOURCE_ADVISORY_LOCK_SQL, [
                  buildMyahInboxSourceKey('EMAIL_THREAD', ids.inboundThread),
                ]);
                // pi-lens-ignore: sql-injection, no-sql-in-code
                await manual.query(
                  `UPDATE "${schema}"."messageThread" SET "creatorId"=$1 WHERE id=$2`,
                  [creatorC, ids.inboundThread],
                );
              },
            });
            const replayResult = service
              .reconcilePendingMessageInTransaction(
                pendingInput,
                replay.manager as never,
              )
              .then(
                () => null,
                (error: unknown) => error as Error,
              );
            // Let the replay reach the manual relink's locks before committing it.
            await delay(100);
            await manual.commitTransaction();
            const replayError = await replayResult;
            // Either existing pre-acquisition guard may observe the relink first.
            if (replayError)
              expect([
                'Inbox Creator lock coverage changed before source mutation',
                'Inbox source changed before lock preparation',
              ]).toContain(replayError.message);
            const [freeC] = await observer.query(
              `SELECT pg_try_advisory_lock(hashtextextended('myah-inbox-anchor:' || $1,0)) AS acquired`,
              [`creator:${creatorC}`],
            );
            expect(freeC.acquired).toBe(true);
            await observer.query(
              `SELECT pg_advisory_unlock(hashtextextended('myah-inbox-anchor:' || $1,0))`,
              [`creator:${creatorC}`],
            );
            if (replayError) await replay.rollbackTransaction();
            else await replay.commitTransaction();

            // The next bounded tick previews C and converges.
            await replay.startTransaction();
            await service.reconcilePendingMessageInTransaction(
              pendingInput,
              replay.manager as never,
            );
            await replay.commitTransaction();
            expect(await readState()).toEqual({
              pending: 0,
              evidence: 1,
              creatorId: creatorC,
            });
          } finally {
            for (const runner of [manual, replay, setup])
              if (runner.isTransactionActive)
                await runner.rollbackTransaction();
            await setup.startTransaction();
            try {
              await cleanupCampaignFixture(setup, {
                ids,
                workspaceId,
                schemaName: schema,
              });
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await setup.query(`DELETE FROM "${schema}".creator WHERE id=$1`, [
                creatorC,
              ]);
              await setup.commitTransaction();
            } catch (error) {
              await setup.rollbackTransaction();
              throw error;
            } finally {
              await Promise.all(
                [setup, manual, replay, observer].map((runner) =>
                  runner.release(),
                ),
              );
            }
          }
        },
        buildSystemAuthContext(workspaceId),
        { lite: true },
      );
    },
    60000,
  );
});
