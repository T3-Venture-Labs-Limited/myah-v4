import { ReconcileManagedEmailSubscriptionsJob } from '../reconcile-managed-email-subscriptions.job';

describe('ReconcileManagedEmailSubscriptionsJob', () => {
  it('delegates the opaque acquisition identity exactly once', async () => {
    const reconcileSubscriptions = jest.fn().mockResolvedValue(undefined);
    const job = new ReconcileManagedEmailSubscriptionsJob({
      reconcileSubscriptions,
    } as never);
    const data = {
      operationId: '123e4567-e89b-42d3-a456-426614174000',
      workspaceId: '123e4567-e89b-42d3-a456-426614174001',
    };

    await expect(job.handle(data)).resolves.toBeUndefined();

    expect(reconcileSubscriptions).toHaveBeenCalledTimes(1);
    expect(reconcileSubscriptions).toHaveBeenCalledWith(data);
  });
});
