import { ActionApprovalReconciliationCronJob } from 'src/engine/core-modules/action-approval/crons/action-approval-reconciliation.cron.job';

describe('ActionApprovalReconciliationCronJob', () => {
  it('reconciles stale receipts without a provider dependency', async () => {
    const actionApprovalService = {
      reconcile: jest.fn().mockResolvedValue({ unknown: 1, projected: 1 }),
    };
    const job = new ActionApprovalReconciliationCronJob(
      actionApprovalService as never,
    );

    const before = Date.now();
    await job.handle();

    expect(actionApprovalService.reconcile).toHaveBeenCalledWith({
      processingBefore: expect.any(Date),
    });
    expect(
      actionApprovalService.reconcile.mock.calls[0][0].processingBefore.getTime(),
    ).toBeLessThanOrEqual(before - 60_000);
  });
});
