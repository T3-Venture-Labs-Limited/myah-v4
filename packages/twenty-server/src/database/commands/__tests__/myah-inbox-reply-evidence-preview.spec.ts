import { type Client } from 'pg';

import { previewReplyEvidence } from '../myah-inbox-reply-evidence-preview';

const workspaceId = '00000000-0000-4000-8000-000000000001';

describe('standalone Campaign reply evidence preview', () => {
  it('reads candidates inside a read-only transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: workspaceId }] })
      .mockResolvedValueOnce({
        rows: [{ messageId: '00000000-0000-4000-8000-000000000002' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await previewReplyEvidence(
      ['--workspace-id', workspaceId, '--limit', '500'],
      { query } as unknown as Client,
    );

    expect(query.mock.calls[0][0]).toBe('BEGIN READ ONLY');
    expect(query.mock.calls[1][0]).toContain('core.workspace');
    expect(query.mock.calls[1][0]).toContain('"deletedAt" IS NULL');
    expect(query.mock.calls[2][0]).toContain('core."outboundEmailAttempt"');
    expect(query.mock.calls[2][1]).toEqual([workspaceId, null, 500]);
    expect(query.mock.calls[3][0]).toBe('ROLLBACK');
    expect(result).toEqual({
      workspaceId,
      mode: 'DRY_RUN',
      scanned: 1,
      nextAfterMessageId: '00000000-0000-4000-8000-000000000002',
    });
  });

  it('rejects apply and invalid arguments before querying', async () => {
    const query = jest.fn();

    await expect(
      previewReplyEvidence(['--workspace-id', workspaceId, '--apply'], {
        query,
      } as unknown as Client),
    ).rejects.toThrow();
    await expect(
      previewReplyEvidence(['--workspace-id', 'bad'], {
        query,
      } as unknown as Client),
    ).rejects.toThrow();
    await expect(
      previewReplyEvidence(['--workspace-id', workspaceId, '--limit', '501'], {
        query,
      } as unknown as Client),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('passes the cursor through to the shared query', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: workspaceId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const cursor = '00000000-0000-4000-8000-000000000002';

    const result = await previewReplyEvidence(
      ['--workspace-id', workspaceId, '--after-message-id', cursor],
      { query } as unknown as Client,
    );

    expect(query.mock.calls[2][1]).toEqual([workspaceId, cursor, 100]);
    expect(result.nextAfterMessageId).toBe(cursor);
  });

  it('rejects a missing or deleted workspace and rolls back', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      previewReplyEvidence(['--workspace-id', workspaceId], {
        query,
      } as unknown as Client),
    ).rejects.toThrow('Workspace does not exist');
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN READ ONLY',
      expect.stringContaining('"deletedAt" IS NULL'),
      'ROLLBACK',
    ]);
  });

  it('surfaces a rollback failure after a successful preview', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: workspaceId }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('rollback failed'));

    await expect(
      previewReplyEvidence(['--workspace-id', workspaceId], {
        query,
      } as unknown as Client),
    ).rejects.toThrow('rollback failed');
    expect(query.mock.calls).toHaveLength(4);
  });

  it('preserves the query error if the connection also fails on rollback', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: workspaceId }] })
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockRejectedValueOnce(new Error('rollback failed'));

    await expect(
      previewReplyEvidence(['--workspace-id', workspaceId], {
        query,
      } as unknown as Client),
    ).rejects.toThrow('database unavailable');
    expect(query.mock.calls[query.mock.calls.length - 1][0]).toBe('ROLLBACK');
  });
});
