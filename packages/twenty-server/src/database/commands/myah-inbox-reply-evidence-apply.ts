import { type Client } from 'pg';
import { isValidUuid } from 'twenty-shared/utils';
import { type Repository } from 'typeorm';

import { MyahInboxBackfillCampaignReplyEvidenceCommand } from 'src/database/commands/myah-inbox-backfill-campaign-reply-evidence.command';
import { MyahInboxContactTriageLifecycleService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage-lifecycle.service';
import { MyahInboxContactTriageService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-contact-triage.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { CampaignReplyService } from 'src/modules/campaign-execution/services/campaign-reply.service';
import { type CampaignProgressionService } from 'src/modules/campaign-execution/services/campaign-progression.service';

type QueryClient = Pick<Client, 'query'>;

// The historical command and its services use only queryRunner.query in this
// transaction. Keep their lock, evidence, link and triage behavior together.
export const withStandaloneReplyTransaction = async <T>(
  client: QueryClient,
  mutate: (manager: WorkspaceEntityManager) => Promise<T>,
): Promise<T> => {
  await client.query('BEGIN');
  const runner = {
    isTransactionActive: true,
    query: async (sql: string, values?: unknown[]) => {
      const result = await client.query(sql, values);

      return result.command === 'UPDATE' || result.command === 'DELETE'
        ? [result.rows, result.rowCount]
        : result.rows;
    },
  };
  // SAFETY: this operator path calls only queryRunner.query; the runner owns
  // the same pg transaction and is set to point back at this manager below.
  const manager = { queryRunner: runner } as unknown as WorkspaceEntityManager;

  Object.assign(runner, { manager });
  try {
    await client.query('SET LOCAL lock_timeout = 3000');
    const result = await mutate(manager);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure; the connection is closed by the caller.
    }
    throw error;
  }
};

export const parseApplyOptions = (args: string[]) => {
  const values = new Map<string, string>();
  let apply = false;

  for (let index = 0; index < args.length; index++) {
    const flag = args[index];

    if (flag === '--apply' && !apply) {
      apply = true;
      continue;
    }
    const value = args[++index];

    if (
      !['--workspace-id', '--after-message-id', '--limit'].includes(flag) ||
      !value ||
      value.startsWith('--') ||
      values.has(flag)
    )
      throw new Error('Invalid backfill arguments');
    values.set(flag, value);
  }
  const workspaceId = values.get('--workspace-id');
  const afterMessageId = values.get('--after-message-id');
  const limit = Number(values.get('--limit'));

  if (!apply)
    throw new Error(
      'Explicit --apply is required; use standalone preview for read-only inspection',
    );
  if (
    !workspaceId ||
    !isValidUuid(workspaceId) ||
    (afterMessageId !== undefined && !isValidUuid(afterMessageId)) ||
    !values.has('--limit') ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 500
  )
    throw new Error(
      'Expected --workspace-id <uuid> --limit 1–500 [--after-message-id <uuid>] --apply',
    );
  return { workspaceId, afterMessageId, limit, apply: true };
};

export const applyReplyEvidence = async (
  args: string[],
  client: QueryClient,
): Promise<void> => {
  const { workspaceId, afterMessageId, limit } = parseApplyOptions(args);
  const lifecycle = new MyahInboxContactTriageLifecycleService(
    new MyahInboxContactTriageService(),
  );
  // SAFETY: the reused command always sets skipProgression; the guard fails
  // closed if a future change tries to advance Campaign state here.
  const progression = {
    terminalizeReplyInTransaction: () => {
      throw new Error('Historical backfill must not progress Campaign');
    },
  } as unknown as CampaignProgressionService;
  const replies = new CampaignReplyService(progression, undefined, lifecycle);
  const workspaces = {
    existsBy: async ({ id }: { id: string }) =>
      (
        await client.query(
          'SELECT id FROM core.workspace WHERE id=$1 AND "deletedAt" IS NULL',
          [id],
        )
      ).rows.length === 1,
  } as Repository<WorkspaceEntity>;
  // SAFETY: the existing command only calls these two methods. Its SQL is
  // explicitly workspace-qualified; reconciliation sets the local search_path.
  const orm = {
    executeInWorkspaceContext: (run: () => Promise<void>) => run(),
    getGlobalWorkspaceDataSource: async () => ({
      query: async (sql: string, params: unknown[]) =>
        (await client.query(sql, params)).rows,
      transaction: (
        mutate: (manager: WorkspaceEntityManager) => Promise<void>,
      ) => withStandaloneReplyTransaction(client, mutate),
    }),
  } as unknown as GlobalWorkspaceOrmManager;

  await new MyahInboxBackfillCampaignReplyEvidenceCommand(
    workspaces,
    orm,
    replies,
    lifecycle,
  ).run([], { workspaceId, afterMessageId, limit, apply: true });
};

if (require.main === module) {
  const run = async () => {
    parseApplyOptions(process.argv.slice(2));
    const connectionString = process.env.PG_DATABASE_URL;

    if (!connectionString) throw new Error('PG_DATABASE_URL is required');
    const client = new (await import('pg')).Client({
      connectionString,
      ssl:
        process.env.PG_SSL_ALLOW_SELF_SIGNED === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
    });

    try {
      await client.connect();
      await applyReplyEvidence(process.argv.slice(2), client);
    } finally {
      await client.end();
    }
  };

  void run().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Backfill failed'}\n`,
    );
    process.exitCode = 1;
  });
}
