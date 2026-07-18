import { ActionApprovalReconciliationCronJob } from 'src/engine/core-modules/action-approval/crons/action-approval-reconciliation.cron.job';

describe('ActionApprovalReconciliationCronJob', () => {
  it('reconciles stale receipts without a provider dependency', async () => {
    const actionApprovalService = {
      reconcile: jest.fn().mockResolvedValue({ unknown: 1, projected: 1 }),
    };
    const queryRunner = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const job = new ActionApprovalReconciliationCronJob(
      actionApprovalService as never,
      dataSource as never,
    );

    const before = Date.now();
    await job.handle();

    expect(actionApprovalService.reconcile).toHaveBeenCalledWith({
      processingBefore: expect.any(Date),
    });
    expect(
      actionApprovalService.reconcile.mock.calls[0][0].processingBefore.getTime(),
    ).toBeLessThanOrEqual(before - 60_000);
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      ['action-approval-reconciliation'],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_unlock(hashtext($1))',
      ['action-approval-reconciliation'],
    );
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });
});
