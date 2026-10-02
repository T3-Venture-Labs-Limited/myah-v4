import { MyahInboxBackfillCampaignReplyEvidenceCommand } from 'src/database/commands/myah-inbox-backfill-campaign-reply-evidence.command';

import {
  applyReplyEvidence,
  parseApplyOptions,
  withStandaloneReplyTransaction,
} from '../myah-inbox-reply-evidence-apply';

const workspaceId = '00000000-0000-4000-8000-000000000001';

it('validates explicit apply before the CLI can connect', () => {
  expect(() => parseApplyOptions(['--workspace-id', workspaceId])).toThrow(
    '--apply',
  );
  expect(
    parseApplyOptions([
      '--workspace-id',
      workspaceId,
      '--limit',
      '1',
      '--apply',
    ]),
  ).toEqual({ workspaceId, afterMessageId: undefined, limit: 1, apply: true });
});

it('requires explicit apply and bounded arguments before touching the database', async () => {
  const client = { query: jest.fn() };

  await expect(
    applyReplyEvidence(['--workspace-id', workspaceId], client),
  ).rejects.toThrow('--apply');
  await expect(
    applyReplyEvidence(
      ['--workspace-id', workspaceId, '--limit', '501', '--apply'],
      client,
    ),
  ).rejects.toThrow();
  await expect(
    applyReplyEvidence(
      ['--workspace-id', 'bad', '--limit', '1', '--apply'],
      client,
    ),
  ).rejects.toThrow();
  expect(client.query).not.toHaveBeenCalled();
});

it('routes an approved one-message apply through the existing historical reconciler', async () => {
  const run = jest
    .spyOn(MyahInboxBackfillCampaignReplyEvidenceCommand.prototype, 'run')
    .mockResolvedValue();
  const client = { query: jest.fn() };

  try {
    await applyReplyEvidence(
      ['--workspace-id', workspaceId, '--limit', '1', '--apply'],
      client,
    );
    expect(run).toHaveBeenCalledWith([], {
      workspaceId,
      limit: 1,
      apply: true,
    });
    expect(client.query).not.toHaveBeenCalled();
  } finally {
    run.mockRestore();
  }
});

it('returns pg rows to the existing reconciler and commits only the successful candidate', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [{ id: 'row' }] });
  const result = await withStandaloneReplyTransaction(
    { query },
    async (manager) => {
      expect(manager.queryRunner?.isTransactionActive).toBe(true);
      expect(manager.queryRunner?.manager).toBe(manager);
      return manager.queryRunner?.query('SELECT 1');
    },
  );

  expect(result).toEqual([{ id: 'row' }]);
  expect(query.mock.calls.map(([sql]) => sql)).toEqual([
    'BEGIN',
    'SET LOCAL lock_timeout = 3000',
    'SELECT 1',
    'COMMIT',
  ]);
});

it('preserves TypeORM mutation result shape for reused service queries', async () => {
  const query = jest.fn().mockResolvedValue({
    command: 'UPDATE',
    rows: [{ id: 'changed' }],
    rowCount: 1,
  });
  const result = await withStandaloneReplyTransaction({ query }, (manager) =>
    manager.queryRunner!.query('UPDATE something RETURNING id'),
  );

  expect(result).toEqual([[{ id: 'changed' }], 1]);
});

it('rolls back a failed candidate rather than committing a partial result', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  await expect(
    withStandaloneReplyTransaction({ query }, async () => {
      throw new Error('candidate failed');
    }),
  ).rejects.toThrow('candidate failed');
  expect(query.mock.calls.map(([sql]) => sql)).toEqual([
    'BEGIN',
    'SET LOCAL lock_timeout = 3000',
    'ROLLBACK',
  ]);
});
