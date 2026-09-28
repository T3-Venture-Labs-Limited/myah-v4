import { Client } from 'pg';
import { isValidUuid } from 'twenty-shared/utils';

import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';

import { myahInboxReplyEvidenceCandidatesQuery } from './myah-inbox-reply-evidence-candidates.query';

const parseOptions = (args: string[]) => {
  const options = new Map<string, string>();

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];

    if (
      !['--workspace-id', '--after-message-id', '--limit'].includes(flag) ||
      !value ||
      value.startsWith('--') ||
      options.has(flag)
    ) {
      throw new Error(
        'Expected --workspace-id <uuid> [--after-message-id <uuid>] [--limit 1–500]; --apply is not supported',
      );
    }
    options.set(flag, value);
  }

  const workspaceId = options.get('--workspace-id');
  const afterMessageId = options.get('--after-message-id') ?? null;
  const limit = options.has('--limit') ? Number(options.get('--limit')) : 100;

  if (
    !workspaceId ||
    !isValidUuid(workspaceId) ||
    (afterMessageId !== null && !isValidUuid(afterMessageId)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 500
  ) {
    throw new Error('Invalid workspace ID, cursor, or limit');
  }

  return { workspaceId, afterMessageId, limit };
};

export const previewReplyEvidence = async (
  args: string[],
  client: Pick<Client, 'query'>,
): Promise<{
  workspaceId: string;
  mode: 'DRY_RUN';
  scanned: number;
  nextAfterMessageId: string | null;
}> => {
  const { workspaceId, afterMessageId, limit } = parseOptions(args);

  await client.query('BEGIN READ ONLY');
  let failed = false;

  try {
    const workspace = await client.query<{ id: string }>(
      'SELECT id FROM core.workspace WHERE id=$1 AND "deletedAt" IS NULL',
      [workspaceId],
    );

    if (workspace.rows.length !== 1)
      throw new Error('Workspace does not exist');

    // The shared query is also used by the Nest apply command. UUID validation
    // precedes schema interpolation, and the transaction rejects any write.
    // pi-lens-ignore: sql-injection, no-sql-in-code
    const candidates = await client.query<{ messageId: string }>(
      myahInboxReplyEvidenceCandidatesQuery(
        getWorkspaceSchemaName(workspaceId),
      ),
      [workspaceId, afterMessageId, limit],
    );

    return {
      workspaceId,
      mode: 'DRY_RUN',
      scanned: candidates.rows.length,
      nextAfterMessageId:
        candidates.rows[candidates.rows.length - 1]?.messageId ??
        afterMessageId,
    };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch (error) {
      if (!failed) throw error;
    }
  }
};

if (require.main === module) {
  const run = async () => {
    parseOptions(process.argv.slice(2));

    const connectionString = process.env.PG_DATABASE_URL;

    if (!connectionString) throw new Error('PG_DATABASE_URL is required');

    const client = new Client({
      connectionString,
      ssl:
        process.env.PG_SSL_ALLOW_SELF_SIGNED === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
    });

    let failed = false;

    try {
      await client.connect();
      const result = await previewReplyEvidence(process.argv.slice(2), client);

      process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      try {
        await client.end();
      } catch (error) {
        if (!failed) throw error;
      }
    }
  };

  void run().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Preview failed'}\n`,
    );
    process.exitCode = 1;
  });
}
