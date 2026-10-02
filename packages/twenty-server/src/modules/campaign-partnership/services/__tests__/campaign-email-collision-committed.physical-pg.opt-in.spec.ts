import { DataSource, type QueryRunner } from 'typeorm';

import { rawDataSource } from 'src/database/typeorm/raw/raw.datasource';
import { connectionSource } from 'src/database/typeorm/core/core.datasource';
import { CampaignEmailInboundHeldWorkService } from 'src/modules/campaign-partnership/services/campaign-email-inbound-held-work.service';

// Independent one-shot second-stage test, after canonical import committed.
// Never use integration global setup, migrations or unmarked local resources.
const enabled = process.env.MYAH334_COLLISION_COMMITTED_OPT_IN === '1';

(enabled ? it : it.skip)(
  'retains a committed immutable 0007 same-canonical conflicting source and idempotent replay',
  async () => {
    jest.useRealTimers();
    const root =
      '/home/superdao/myah-v4/.worktrees/daryll/myah-392-manage-creator-partnerships-from-reply-through-fulfillment';
    const envFile =
      '/home/superdao/.local/share/myah-scratch/myah334-frontier-20260928/collision-clean.env';
    const raw =
      'url' in rawDataSource.options ? rawDataSource.options.url : undefined;
    const core =
      'url' in connectionSource.options
        ? connectionSource.options.url
        : undefined;
    if (
      !raw ||
      raw !== core ||
      raw !== process.env.PG_DATABASE_URL ||
      process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE !== envFile ||
      process.env.NODE_ENV !== 'test' ||
      !process.argv.some((arg) => arg.includes('jest')) ||
      ![root, `${root}/packages/twenty-server`].includes(process.cwd())
    )
      throw new Error(
        'Refusing collision fixture: effective raw/core/selector/Jest mismatch',
      );
    const pg = new URL(raw);
    const redis = new URL(process.env.REDIS_URL ?? '');
    if (
      pg.protocol !== 'postgres:' ||
      pg.hostname !== '127.0.0.1' ||
      pg.port !== '32788' ||
      pg.pathname !== '/myah334_collision_clean_20260928' ||
      pg.search ||
      pg.hash ||
      redis.protocol !== 'redis:' ||
      redis.hostname !== '127.0.0.1' ||
      redis.port !== '32789' ||
      redis.pathname !== '/5' ||
      redis.search ||
      redis.hash ||
      (process.env.REDIS_QUEUE_URL &&
        process.env.REDIS_QUEUE_URL !== process.env.REDIS_URL)
    )
      throw new Error(
        'Refusing collision fixture: exact task-owned resource mismatch',
      );
    const db = new DataSource({ type: 'postgres', url: raw });
    let runner: QueryRunner | undefined;
    try {
      await db.initialize();
      runner = db.createQueryRunner();
      await runner.connect();
      const [identity]: Array<{ db: string; marker: string; version: string }> =
        await runner.query(`SELECT current_database() db, shobj_description(oid,'pg_database') marker,
          current_setting('server_version_num') version FROM pg_database WHERE datname=current_database()`);
      if (
        identity?.db !== 'myah334_collision_clean_20260928' ||
        identity.marker !== 'MYAH334_COLLISION_CLEAN_20260928_TASK_OWNED' ||
        !identity.version.startsWith('16')
      )
        throw new Error(
          'Refusing collision fixture: server marker/version mismatch',
        );
      const [before]: Array<{
        receipts: string;
        work: string;
        collisions: string;
      }> =
        await runner.query(`SELECT (SELECT count(*)::text FROM core."upgradeMigration") receipts,
          (SELECT count(*)::text FROM core."campaignPartnershipWorkItem") work,
          (SELECT count(*)::text FROM core."campaignEmailWorkCollision") collisions`);
      if (
        before.receipts !== '143' ||
        before.work !== '1' ||
        before.collisions !== '0'
      )
        throw new Error(
          'Refusing collision fixture: first-stage committed prerequisite changed',
        );
      const [original]: Array<{
        id: string;
        workspaceId: string;
        canonicalMessageId: string;
        messageThreadId: string;
        messageChannelId: string;
        connectedAccountId: string;
        accountIncarnationId: string;
        providerMessageId: string;
        providerThreadId: string;
        creatorSender: string;
        accountRecipient: string;
        baselineGenerationId: string;
        providerOccurredAt: Date;
      }> =
        await runner.query(`SELECT "id","workspaceId","canonicalMessageId","messageThreadId",
        "messageChannelId","connectedAccountId","accountIncarnationId","providerMessageId",
        "providerThreadId","creatorSender","accountRecipient","baselineGenerationId","providerOccurredAt"
        FROM core."campaignPartnershipWorkItem" WHERE "providerMessageId" LIKE 'myah334-canonical-%'`);
      if (!original) throw new Error('Synthetic original work missing');
      await runner.startTransaction();
      const held = new CampaignEmailInboundHeldWorkService();
      const conflicting = {
        workspaceId: original.workspaceId,
        messageId: original.canonicalMessageId,
        threadId: original.messageThreadId,
        channelId: original.messageChannelId,
        connectedAccountId: original.connectedAccountId,
        generationId: original.baselineGenerationId,
        providerMessageId: original.providerMessageId,
        providerThreadId: original.providerThreadId,
        from: original.creatorSender,
        to: original.accountRecipient,
        providerOccurredAt: new Date(
          original.providerOccurredAt.getTime() - 1000,
        ),
      };
      expect(
        await held.recordInTransaction(conflicting, runner.manager as never),
      ).toBe('HELD');
      expect(
        await held.recordInTransaction(conflicting, runner.manager as never),
      ).toBe('HELD');
      const [inside]: Array<{
        state: string;
        reason: string;
        contextGeneration: number;
        count: string;
      }> = await runner.query(
        `SELECT w."state",w."reason",w."contextGeneration",
          (SELECT count(*)::text FROM core."campaignEmailWorkCollision") count
          FROM core."campaignPartnershipWorkItem" w WHERE w."id"=$1`,
        [original.id],
      );
      expect(inside).toMatchObject({
        state: 'HELD',
        reason: 'PROVIDER_ID_COLLISION',
        contextGeneration: 1,
        count: '1',
      });
      await runner.commitTransaction();
      const [after]: Array<{
        receipts: string;
        collisions: string;
        state: string;
      }> = await runner.query(
        `SELECT (SELECT count(*)::text FROM core."upgradeMigration") receipts,
          (SELECT count(*)::text FROM core."campaignEmailWorkCollision") collisions,
          "state" FROM core."campaignPartnershipWorkItem" WHERE "id"=$1`,
        [original.id],
      );
      expect(after).toMatchObject({
        receipts: '143',
        collisions: '1',
        state: 'HELD',
      });
    } finally {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      if (runner && !runner.isReleased) await runner.release();
      if (db.isInitialized) await db.destroy();
    }
  },
  30000,
);
