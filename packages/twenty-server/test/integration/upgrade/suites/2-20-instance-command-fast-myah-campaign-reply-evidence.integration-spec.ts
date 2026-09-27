import { randomUUID } from 'node:crypto';

import { MyahInboxBackfillCampaignReplyEvidenceCommand } from 'src/database/commands/myah-inbox-backfill-campaign-reply-evidence.command';
import { CreateMyahCampaignReplyEvidenceFastInstanceCommand } from 'src/database/commands/upgrade-version-command/2-20/2-20-instance-command-fast-1790141137300-create-myah-campaign-reply-evidence';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';

describe('2.20 Campaign reply evidence fast command (isolated PostgreSQL)', () => {
  const command = new CreateMyahCampaignReplyEvidenceFastInstanceCommand();

  it('previews historical inbound sources on the upgraded workspace without changing evidence', async () => {
    const workspaceId = SEED_APPLE_WORKSPACE_ID;
    const [before] = await global.testDataSource.query(
      'SELECT count(*)::int AS count FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    const backfill = new MyahInboxBackfillCampaignReplyEvidenceCommand(
      { existsBy: async () => true } as never,
      {
        executeInWorkspaceContext: async (run: () => Promise<void>) => run(),
        getGlobalWorkspaceDataSource: async () => global.testDataSource,
      } as never,
      {} as never,
      {} as never,
    );

    await backfill.run([], { workspaceId, limit: 2 });

    const [after] = await global.testDataSource.query(
      'SELECT count(*)::int AS count FROM core."myahCampaignReplyEvidence" WHERE "workspaceId"=$1',
      [workspaceId],
    );
    expect(after.count).toBe(before.count);
  });

  it('preserves existing-workspace evidence and pending rows on repeated upgrade', async () => {
    const runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const inboundMessageId = randomUUID();
      const attemptId = randomUUID();
      const campaignId = randomUUID();
      const enrollmentId = randomUUID();
      const channelId = randomUUID();
      const threadId = randomUUID();
      await runner.query(
        `INSERT INTO core."myahCampaignReplyEvidence"
         ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","classification")
         VALUES ($1,$2,$3,$4,$5,'THREAD')`,
        [
          SEED_APPLE_WORKSPACE_ID,
          inboundMessageId,
          channelId,
          campaignId,
          enrollmentId,
        ],
      );
      await runner.query(
        `INSERT INTO core."myahCampaignReplyPending"
         ("workspaceId","messageId","messageThreadId","messageChannelId","threadExternalId","normalizedSender","candidateAttemptIds")
         VALUES ($1,$2,$3,$4,'provider-thread','creator@example.com',$5)`,
        [
          SEED_APPLE_WORKSPACE_ID,
          inboundMessageId,
          threadId,
          channelId,
          [attemptId],
        ],
      );

      await command.up(runner);
      await command.up(runner);
      const evidence = await runner.query(
        `SELECT "classification","campaignId","enrollmentId" FROM core."myahCampaignReplyEvidence"
         WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
        [SEED_APPLE_WORKSPACE_ID, inboundMessageId],
      );
      const pending = await runner.query(
        `SELECT "candidateAttemptIds" FROM core."myahCampaignReplyPending"
         WHERE "workspaceId"=$1 AND "messageId"=$2`,
        [SEED_APPLE_WORKSPACE_ID, inboundMessageId],
      );
      expect(evidence).toEqual([
        { classification: 'THREAD', campaignId, enrollmentId },
      ]);
      expect(pending).toEqual([{ candidateAttemptIds: [attemptId] }]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('recreates a fresh schema after an interrupted transactional upgrade', async () => {
    const runner = global.testDataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // The schema rename and all DDL are inside one rolled-back fixture transaction.
      await runner.query(
        'ALTER SCHEMA core RENAME TO core_myah415_upgrade_original',
      );
      await runner.query('CREATE SCHEMA core');
      await runner.query('CREATE TABLE core.workspace (id uuid PRIMARY KEY)');
      await runner.query(
        'CREATE TABLE core."outboundEmailAttempt" ("attemptId" uuid PRIMARY KEY)',
      );
      await runner.query('SAVEPOINT interrupted_upgrade');
      await command.up(runner);
      await runner.query('ROLLBACK TO SAVEPOINT interrupted_upgrade');
      const [rolledBack] = await runner.query(
        `SELECT to_regclass('core."myahCampaignReplyEvidence"') AS evidence,
                to_regclass('core."myahCampaignReplyPending"') AS pending`,
      );
      expect(rolledBack).toEqual({ evidence: null, pending: null });
      await command.up(runner);
      await command.up(runner);
      const workspaceId = randomUUID();
      const inboundMessageId = randomUUID();
      await runner.query('INSERT INTO core.workspace (id) VALUES ($1)', [
        workspaceId,
      ]);
      await runner.query(
        `INSERT INTO core."myahCampaignReplyEvidence"
         ("workspaceId","inboundMessageId","messageChannelId","campaignId","enrollmentId","classification")
         VALUES ($1,$2,$3,$4,$5,'THREAD')`,
        [
          workspaceId,
          inboundMessageId,
          randomUUID(),
          randomUUID(),
          randomUUID(),
        ],
      );
      await runner.query('SAVEPOINT identity_guard');
      try {
        await expect(
          runner.query(
            `UPDATE core."myahCampaignReplyEvidence" SET "campaignId"=$3
           WHERE "workspaceId"=$1 AND "inboundMessageId"=$2`,
            [workspaceId, inboundMessageId, randomUUID()],
          ),
        ).rejects.toThrow('Campaign reply evidence identity is immutable');
      } finally {
        await runner.query('ROLLBACK TO SAVEPOINT identity_guard');
      }
      const [trigger] = await runner.query(
        `SELECT count(*)::int AS count FROM pg_trigger
         WHERE tgrelid='core."myahCampaignReplyEvidence"'::regclass AND NOT tgisinternal`,
      );
      expect(trigger.count).toBe(1);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
