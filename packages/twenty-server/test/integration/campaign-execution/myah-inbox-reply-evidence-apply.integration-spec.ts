import { randomUUID } from 'node:crypto';

import { Client } from 'pg';

import { applyReplyEvidence } from 'src/database/commands/myah-inbox-reply-evidence-apply';
import { myahInboxReplyEvidenceCandidatesQuery } from 'src/database/commands/myah-inbox-reply-evidence-candidates.query';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import {
  cleanupCampaignFixture,
  createCampaignFixtureIds,
  getOrm,
  seedCampaignFixture,
} from 'test/integration/campaign-execution/utils/campaign-reply-evidence-fixture.util';
import { ensureMyahInboxContactTriageTables } from 'test/integration/myah-inbox/utils/ensure-myah-inbox-contact-triage-tables.util';

it.each([false, true])(
  'handles historical reply through pg (thread locked: %s)',
  async (lockThread) => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const schema = getWorkspaceSchemaName(workspaceId);
    const ids = createCampaignFixtureIds();
    const orm = getOrm();

    await ensureMyahInboxContactTriageTables(workspaceId);
    await orm.executeInWorkspaceContext(
      async () => {
        const dataSource = await orm.getGlobalWorkspaceDataSource();
        const setup = dataSource.createQueryRunner();
        const client = new Client({
          connectionString: process.env.PG_DATABASE_URL,
        });
        let seeded = false;

        await setup.connect();
        await setup.startTransaction();
        try {
          const [routing] = await setup.query(
            `SELECT mc.id AS "channelId", ca.id AS "accountId", lower(ca.handle) AS sender,
             (SELECT id FROM core."userWorkspace" WHERE "workspaceId"=$1 LIMIT 1) AS "userWorkspaceId"
           FROM core."messageChannel" mc JOIN core."connectedAccount" ca ON ca.id=mc."connectedAccountId"
           WHERE mc."workspaceId"=$1 AND mc.type='EMAIL' LIMIT 1`,
            [workspaceId],
          );
          expect(routing).toBeDefined();
          await seedCampaignFixture(setup, {
            ids,
            workspaceId,
            schemaName: schema,
            routing,
            secondEnrollmentId: ids.enrollmentA,
          });
          await setup.query(
            `UPDATE core."outboundEmailAttempt" SET "attemptState"='DEFINITELY_UNACCEPTED', "capacityState"='RELEASED'
           WHERE "attemptId"=$1`,
            [ids.attemptB],
          );
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await setup.query(
            `INSERT INTO "${schema}"."messageChannelMessageAssociation"
             (id,"messageId","messageChannelId","messageThreadExternalId",direction)
           VALUES ($1,$2,$3,'shared-thread','INCOMING')`,
            [randomUUID(), ids.inbound, routing.channelId],
          );
          // pi-lens-ignore: sql-injection, no-sql-in-code
          await setup.query(
            `INSERT INTO "${schema}"."messageParticipant" (id,"messageId",role,handle)
           VALUES ($1,$2,'FROM','creator@example.com')`,
            [randomUUID(), ids.inbound],
          );
          await setup.commitTransaction();
          seeded = true;

          await client.connect();
          // Refuse to mutate unrelated data if this shared dev seed has leftovers.
          const candidates = await client.query(
            myahInboxReplyEvidenceCandidatesQuery(schema),
            [workspaceId, null, 500],
          );
          expect(candidates.rows.map((row) => row.messageId)).toEqual([
            ids.inbound,
          ]);
          if (lockThread) {
            await setup.startTransaction();
            // Hold the thread lock after candidate discovery so the reply write
            // fails mid-transaction, then verify its evidence insert rolled back.
            // pi-lens-ignore: sql-injection, no-sql-in-code
            await setup.query(
              `SELECT id FROM "${schema}"."messageThread" WHERE id=$1 FOR UPDATE`,
              [ids.inboundThread],
            );
            await expect(
              applyReplyEvidence(
                ['--workspace-id', workspaceId, '--limit', '1', '--apply'],
                client,
              ),
            ).rejects.toThrow(
              `Backfill candidate ${ids.inbound} failed: canceling statement due to lock timeout`,
            );
            await setup.rollbackTransaction();
            // Schema is derived only from the seeded workspace UUID; values are bound.
            // pi-lens-ignore: sql-injection, no-sql-in-code
            const [unchanged] = await setup.query(
              `SELECT (SELECT count(*)::int FROM core."myahCampaignReplyEvidence"
               WHERE "workspaceId"=$1 AND "inboundMessageId"=$2) AS evidence,
               (SELECT "creatorId" FROM "${schema}"."messageThread"
                WHERE id=$3) AS creator,
               (SELECT count(*)::int FROM "${schema}"."myahInboxContactTriage"
                WHERE "contactIdentityKey"=$4) AS triage`,
              [
                workspaceId,
                ids.inbound,
                ids.inboundThread,
                `creator:${ids.creatorA}`,
              ],
            );
            expect(unchanged).toEqual({
              evidence: 0,
              creator: null,
              triage: 0,
            });
            expect(
              (
                await client.query(
                  myahInboxReplyEvidenceCandidatesQuery(schema),
                  [workspaceId, null, 500],
                )
              ).rows.map((row) => row.messageId),
            ).toEqual([ids.inbound]);
            return;
          }
          await applyReplyEvidence(
            ['--workspace-id', workspaceId, '--limit', '1', '--apply'],
            client,
          );
          // Schema is derived only from the seeded workspace UUID; values are bound.
          // pi-lens-ignore: sql-injection, no-sql-in-code
          const [result] = await setup.query(
            `SELECT ev.classification, ev."creatorId" AS "evidenceCreatorId",
             t."creatorId" AS "threadCreatorId", t."myahCampaignId" AS "threadCampaignId",
             enrollment.state, cc.stage,
             (SELECT count(*)::int FROM "${schema}"."myahInboxContactTriage"
               WHERE "contactIdentityKey"=$3) AS "creatorTriageRows"
           FROM core."myahCampaignReplyEvidence" ev
           JOIN "${schema}"."messageThread" t ON t.id=$2
           JOIN core."campaignEnrollment" enrollment ON enrollment.id=ev."enrollmentId"
           JOIN "${schema}"."campaignCreator" cc ON cc.id=enrollment."campaignCreatorId"
           WHERE ev."workspaceId"=$1 AND ev."inboundMessageId"=$4`,
            [
              workspaceId,
              ids.inboundThread,
              `creator:${ids.creatorA}`,
              ids.inbound,
            ],
          );
          expect(result).toEqual({
            classification: 'THREAD',
            evidenceCreatorId: ids.creatorA,
            threadCreatorId: ids.creatorA,
            threadCampaignId: ids.campaign,
            state: 'ACTIVE',
            stage: 'CONTACTED',
            creatorTriageRows: 1,
          });
          await applyReplyEvidence(
            ['--workspace-id', workspaceId, '--limit', '1', '--apply'],
            client,
          );
          const [count] = await setup.query(
            `SELECT count(*)::int AS n FROM core."myahCampaignReplyEvidence"
           WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
            [workspaceId, ids.inbound],
          );
          expect(count.n).toBe(1);
          expect(
            (
              await client.query(
                myahInboxReplyEvidenceCandidatesQuery(schema),
                [workspaceId, null, 500],
              )
            ).rows,
          ).toEqual([]);
        } finally {
          if (setup.isTransactionActive) await setup.rollbackTransaction();
          try {
            if (seeded) {
              await cleanupCampaignFixture(setup, {
                ids,
                workspaceId,
                schemaName: schema,
              });
              const keys = [
                `email-thread:${ids.inboundThread}`,
                `creator:${ids.creatorA}`,
              ];
              // Only the identities created by this isolated fixture are removed.
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await setup.query(
                `DELETE FROM "${schema}"."myahInboxContactTriage" WHERE "contactIdentityKey"=ANY($1::text[])`,
                [keys],
              );
              // pi-lens-ignore: sql-injection, no-sql-in-code
              await setup.query(
                `DELETE FROM "${schema}"."myahInboxContactIdentity" WHERE "contactIdentityKey"=ANY($1::text[])`,
                [keys],
              );
            }
          } finally {
            await client.end();
            await setup.release();
          }
        }
      },
      buildSystemAuthContext(workspaceId),
      { lite: true },
    );
  },
);
