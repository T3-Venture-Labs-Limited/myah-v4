import { CampaignEmailReplyPendingRecoveryService } from 'src/modules/campaign-partnership/services/campaign-email-reply-pending-recovery.service';

const W = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const make = () => {
  const rows = [{ id: ID, workspaceId: W, contextGeneration: 1 }];
  const query = jest.fn(async (sql: string) =>
    sql.includes('to_regclass')
      ? [{ exists: 'core.campaignPartnershipWorkItem' }]
      : rows,
  );
  const queue = { add: jest.fn(async () => undefined) };
  const service = new CampaignEmailReplyPendingRecoveryService(
    { query } as never,
    queue as never,
  );
  return { rows, query, queue, service };
};

describe('after-commit recoverable Campaign Email pending receipts (no generator)', () => {
  it('publishes from committed PENDING rows only, with stable generation-scoped job ID', async () => {
    const f = make();
    await f.service.publishPending();
    expect(f.queue.add).toHaveBeenCalledWith(
      'CampaignEmailReplyPendingJob',
      { workspaceId: W, workItemId: ID, expectedContextGeneration: 1 },
      { id: `campaign-email-review-${ID}-1` },
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('"state" = \'PENDING\''),
    );
  });
  it('queue outage does not rewrite work and next recovery discovers the same receipt', async () => {
    const f = make();
    f.queue.add.mockRejectedValueOnce(new Error('queue unavailable'));
    await expect(f.service.publishPending()).rejects.toThrow(
      'queue unavailable',
    );
    expect(f.rows).toEqual([{ id: ID, workspaceId: W, contextGeneration: 1 }]);
    await f.service.publishPending();
    expect(f.queue.add).toHaveBeenCalledTimes(2);
  });
});
