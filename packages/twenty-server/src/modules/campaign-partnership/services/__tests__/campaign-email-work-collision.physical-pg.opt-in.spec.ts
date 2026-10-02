import { createHash } from 'node:crypto';

import { DataSource, type QueryRunner } from 'typeorm';

import { CreateCampaignEmailWorkCollisionFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790000000007-create-campaign-email-work-collision';
import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';
import { connectionSource } from 'src/database/typeorm/core/core.datasource';
import { CampaignEmailInboundHeldWorkService } from 'src/modules/campaign-partnership/services/campaign-email-inbound-held-work.service';
import { MessagingEmailBaselineService } from 'src/modules/messaging/message-import-manager/services/messaging-email-baseline.service';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

// Never use the integration Jest target: its global setup/teardown may mutate
// unmarked .env.test. This opt-in unit target connects only after *same-process*
// dotenv/raw/core/Redis/PG marker/entrypoint attestation, and rolls back DDL.
const enabled = process.env.MYAH334_JOURNEY_COLLISION_PHYSICAL_PG === '1';
const envPath =
  '/home/superdao/.local/share/myah-scratch/myah334-frontier-20260928/journey.env';
const expectedName = 'myah334_journey_20260928';
const expectedMarker = 'MYAH334_JOURNEY_20260928_TASK_OWNED';

it(
  enabled
    ? 'rolls back 0007 physical collision evidence DDL'
    : 'physical collision DDL (opt-in)',
  async () => {
    jest.useRealTimers();
    if (!enabled) return;
    const rawUrl =
      'url' in rawDataSource.options ? rawDataSource.options.url : undefined;
    const coreUrl =
      'url' in connectionSource.options
        ? connectionSource.options.url
        : undefined;
    const worktree =
      '/home/superdao/myah-v4/.worktrees/daryll/myah-392-manage-creator-partnerships-from-reply-through-fulfillment';
    const guard = {
      rawCoreMatch: Boolean(rawUrl && rawUrl === coreUrl),
      effectiveMatch: Boolean(rawUrl && rawUrl === process.env.PG_DATABASE_URL),
      selected: process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE === envPath,
      testEnv: process.env.NODE_ENV === 'test',
      jestEntrypoint: process.argv.some((arg) => arg.includes('jest')),
      assignedCwd:
        process.cwd() === worktree ||
        process.cwd() === `${worktree}/packages/twenty-server`,
    };
    if (!rawUrl || Object.values(guard).some((ok) => !ok))
      throw new Error(
        `Refusing physical test: effective target/entrypoint guard ${JSON.stringify(guard)}`,
      );
    const pg = new URL(rawUrl);
    const redis = new URL(process.env.REDIS_URL ?? '');
    if (
      pg.protocol !== 'postgres:' ||
      pg.hostname !== '127.0.0.1' ||
      pg.port !== '32788' ||
      pg.pathname !== `/${expectedName}` ||
      pg.search ||
      pg.hash ||
      redis.protocol !== 'redis:' ||
      redis.hostname !== '127.0.0.1' ||
      redis.port !== '32789' ||
      redis.pathname !== '/4' ||
      redis.search ||
      redis.hash ||
      (process.env.REDIS_QUEUE_URL &&
        process.env.REDIS_QUEUE_URL !== process.env.REDIS_URL)
    )
      throw new Error(
        'Refusing physical test: exact task-owned PG/Redis identity mismatch',
      );
    const source = new DataSource({ type: 'postgres', url: rawUrl });
    let runner: QueryRunner | undefined;
    try {
      await source.initialize();
      runner = source.createQueryRunner();
      await runner.connect();
      const [identity]: Array<{
        database: string;
        marker: string;
        version: string;
      }> = await runner.query(
        `SELECT current_database() AS database, pg_catalog.shobj_description(oid,'pg_database') AS marker,
        current_setting('server_version_num') AS version FROM pg_database WHERE datname=current_database()`,
      );
      if (
        identity?.database !== expectedName ||
        identity.marker !== expectedMarker ||
        !identity.version.startsWith('16')
      )
        throw new Error(
          'Refusing physical test: PG server-side marker mismatch',
        );
      const [before]: Array<{ collision: string | null; receipts: string }> =
        await runner.query(
          `SELECT to_regclass('core."campaignEmailWorkCollision"')::text AS collision,
        (SELECT count(*)::text FROM core."upgradeMigration") AS receipts`,
        );
      if (before.collision !== null)
        throw new Error('0007 already applied to retained journey fixture');
      await runner.startTransaction();
      await new CreateCampaignEmailWorkCollisionFastInstanceCommand().up(
        runner,
      );
      await expect(
        new CreateCampaignEmailWorkCollisionFastInstanceCommand().assertPhysicalContract(
          runner,
        ),
      ).resolves.toBeUndefined();
      const [inside]: Array<{ exists: string | null }> = await runner.query(
        `SELECT to_regclass('core."campaignEmailWorkCollision"')::text AS "exists"`,
      );
      expect(inside.exists).not.toBeNull();
      // All fixture rows and 0007 DDL share the same transaction. This exercises
      // real canonical workspace associations/participants, READY/source locks,
      // provider dedup, quarantine, immutable collision evidence, and rollback.
      const [selected]: Array<{
        workspaceId: string;
        channelId: string;
        accountId: string;
        incarnationId: string;
        recipient: string;
      }> = await runner.query(
        `SELECT a."workspaceId", ch."id" AS "channelId", a."id" AS "accountId",
       a."campaignEmailIncarnationId" AS "incarnationId", lower(a."handle") AS recipient
       FROM core."connectedAccount" a JOIN core."messageChannel" ch
         ON ch."connectedAccountId"=a."id" AND ch."workspaceId"=a."workspaceId"
       WHERE a."provider"='google' AND a."campaignEmailIncarnationId" IS NOT NULL
         AND ch."messageFolderImportPolicy"='ALL_FOLDERS' AND ch."type"='EMAIL'
       ORDER BY ch."id" LIMIT 1`,
      );
      if (
        !selected?.workspaceId ||
        !selected.incarnationId ||
        !selected.recipient
      )
        throw new Error(
          'Marked workspace lacks a synthetic qualified Gmail channel',
        );
      const scopeFingerprint = createHash('sha256')
        .update(JSON.stringify({ policy: 'ALL_FOLDERS', folders: [] }))
        .digest('hex');
      const [generation]: Array<{ id: string }> = await runner.query(
        `INSERT INTO core."campaignEmailBaselineGeneration"
       ("workspaceId","messageChannelId","connectedAccountId","accountIncarnationId",
        "provider","scopeFingerprint","status","isCurrent","startedAt","enumeratedAt",
        "completedAt","finalCursors")
       VALUES ($1,$2,$3,$4,'google',$5,'READY',true,
         now()-interval '3 hours',now()-interval '2 hours',now()-interval '1 hour',
         '{"synthetic-final":"cursor"}'::jsonb) RETURNING "id"`,
        [
          selected.workspaceId,
          selected.channelId,
          selected.accountId,
          selected.incarnationId,
          scopeFingerprint,
        ],
      );
      await runner.query("SELECT set_config('search_path',$1,true)", [
        getWorkspaceSchemaName(selected.workspaceId),
      ]);
      const [creator]: Array<{ id: string }> = await runner.query(
        `INSERT INTO "creator" ("name") VALUES ('MYAH334 transaction-only creator') RETURNING "id"`,
      );
      const [thread]: Array<{ id: string }> = await runner.query(
        `INSERT INTO "messageThread" ("creatorId") VALUES ($1) RETURNING "id"`,
        [creator.id],
      );
      const sender = 'myah334-transaction@example.test';
      const providerId = 'myah334-transaction-provider-id';
      const providerThread = 'myah334-transaction-thread';
      const occurred = new Date(Date.now() - 30000);
      const baseline = new MessagingEmailBaselineService({} as never);
      const channel = {
        id: selected.channelId,
        connectedAccountId: selected.accountId,
        connectedAccount: { provider: 'google' },
        messageFolderImportPolicy: 'ALL_FOLDERS',
      } as never;
      expect(
        await baseline.verifyLiveInTransaction(
          runner.manager,
          selected.workspaceId,
          channel,
          generation.id,
          [providerId],
        ),
      ).toEqual(new Set([providerId]));
      const service = new CampaignEmailInboundHeldWorkService();
      const makeInbound = async (): Promise<string> => {
        const [message]: Array<{ id: string }> = await runner!.query(
          `INSERT INTO "message" ("messageThreadId","receivedAt") VALUES ($1,now()) RETURNING "id"`,
          [thread.id],
        );
        await runner!.query(
          `INSERT INTO "messageChannelMessageAssociation"
         ("messageId","messageThreadId","messageChannelId","messageExternalId",
          "messageThreadExternalId","direction") VALUES ($1,$2,$3,$4,$5,'INCOMING')`,
          [
            message.id,
            thread.id,
            selected.channelId,
            providerId,
            providerThread,
          ],
        );
        for (const [role, handle] of [
          ['FROM', sender],
          ['TO', selected.recipient],
        ])
          await runner!.query(
            `INSERT INTO "messageParticipant" ("messageId","role","handle")
          VALUES ($1,$2,$3)`,
            [message.id, role, handle],
          );
        return message.id;
      };
      const inbound = {
        workspaceId: selected.workspaceId,
        messageId: await makeInbound(),
        threadId: thread.id,
        channelId: selected.channelId,
        connectedAccountId: selected.accountId,
        generationId: generation.id,
        providerMessageId: providerId,
        providerThreadId: providerThread,
        from: sender,
        to: selected.recipient,
        providerOccurredAt: occurred,
      };
      expect(
        await service.recordInTransaction(inbound, runner.manager as never),
      ).toBe('HELD');
      expect(
        await service.recordInTransaction(inbound, runner.manager as never),
      ).toBe('HELD');
      const [first]: Array<{ id: string; state: string }> = await runner.query(
        `SELECT "id","state" FROM core."campaignPartnershipWorkItem" WHERE "workspaceId"=$1
       AND "providerMessageId"=$2`,
        [selected.workspaceId, providerId],
      );
      expect(first.state).toBe('HELD');
      const sameCanonicalConflict = {
        ...inbound,
        providerOccurredAt: new Date(occurred.getTime() - 1000),
      };
      expect(
        await service.recordInTransaction(
          sameCanonicalConflict,
          runner.manager as never,
        ),
      ).toBe('HELD');
      const [firstHold]: Array<{
        state: string;
        reason: string;
        contextGeneration: number;
      }> = await runner.query(
        `SELECT "state","reason","contextGeneration" FROM core."campaignPartnershipWorkItem" WHERE "id"=$1`,
        [first.id],
      );
      expect(firstHold).toMatchObject({
        state: 'HELD',
        reason: 'PROVIDER_ID_COLLISION',
        contextGeneration: 1,
      });
      expect(
        await service.recordInTransaction(
          sameCanonicalConflict,
          runner.manager as never,
        ),
      ).toBe('HELD');
      const [replay]: Array<{ count: string; generation: number }> =
        await runner.query(
          `SELECT (SELECT count(*)::text FROM core."campaignEmailWorkCollision") AS count,
          "contextGeneration" AS generation FROM core."campaignPartnershipWorkItem" WHERE "id"=$1`,
          [first.id],
        );
      expect(replay).toEqual({ count: '1', generation: 1 });
      const second = { ...inbound, messageId: await makeInbound() };
      expect(
        await service.recordInTransaction(second, runner.manager as never),
      ).toBe('HELD');
      expect(
        await service.recordInTransaction(second, runner.manager as never),
      ).toBe('HELD');
      const [quarantined]: Array<{ state: string; reason: string }> =
        await runner.query(
          `SELECT "state","reason" FROM core."campaignPartnershipWorkItem" WHERE "id"=$1`,
          [first.id],
        );
      expect(quarantined).toMatchObject({
        state: 'HELD',
        reason: 'PROVIDER_ID_COLLISION',
      });
      const collisions: Array<{
        canonicalMessageId: string;
        originalWorkId: string;
        sourceFingerprint: string;
      }> = await runner.query(
        `SELECT "canonicalMessageId","originalWorkId","sourceFingerprint" FROM core."campaignEmailWorkCollision"
       WHERE "workspaceId"=$1`,
        [selected.workspaceId],
      );
      expect(collisions).toHaveLength(2);
      expect(collisions.map((row) => row.canonicalMessageId).sort()).toEqual(
        [inbound.messageId, second.messageId].sort(),
      );
      expect(new Set(collisions.map((row) => row.sourceFingerprint)).size).toBe(
        2,
      );
      expect(collisions.every((row) => row.originalWorkId === first.id)).toBe(
        true,
      );
      await runner.query('SAVEPOINT evidence_guard');
      await expect(
        runner.query(
          `UPDATE core."campaignEmailWorkCollision" SET "originalWorkId"="originalWorkId"
        WHERE "workspaceId"=$1`,
          [selected.workspaceId],
        ),
      ).rejects.toThrow('Campaign Email collision evidence is immutable');
      await runner.query('ROLLBACK TO SAVEPOINT evidence_guard');
      await runner.query('SAVEPOINT route_guard');
      await expect(
        runner.query(
          `INSERT INTO core."campaignEmailWorkCollision" ("workspaceId","originalWorkId",
        "canonicalMessageId","messageThreadId","messageChannelId","connectedAccountId",
        "accountIncarnationId","providerMessageId","providerThreadId","creatorSender",
        "accountRecipient","baselineGenerationId","providerOccurredAt","sourceFingerprint")
       VALUES ($1,$2,uuid_generate_v4(),$3,$4,uuid_generate_v4(),$5,$6,$7,$8,$9,$10,$11,repeat('a',64))`,
          [
            selected.workspaceId,
            first.id,
            thread.id,
            selected.channelId,
            selected.incarnationId,
            providerId,
            providerThread,
            sender,
            selected.recipient,
            generation.id,
            occurred,
          ],
        ),
      ).rejects.toThrow(); // composite original-work route FK, not just same-workspace ID
      await runner.query('ROLLBACK TO SAVEPOINT route_guard');
      await runner.rollbackTransaction();
      const [after]: Array<{ collision: string | null; receipts: string }> =
        await runner.query(
          `SELECT to_regclass('core."campaignEmailWorkCollision"')::text AS collision,
        (SELECT count(*)::text FROM core."upgradeMigration") AS receipts`,
        );
      expect(after).toEqual(before);
    } finally {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      if (runner && !runner.isReleased) await runner.release();
      if (source.isInitialized) await source.destroy();
    }
  },
  30000,
);
