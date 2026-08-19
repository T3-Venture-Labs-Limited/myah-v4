import { ApplyManagedEmailPeriodBoundaryJob } from '../apply-managed-email-period-boundary.job';

describe('ApplyManagedEmailPeriodBoundaryJob', () => {
  it('delegates the opaque resource identity exactly once', async () => {
    const applyPeriodBoundary = jest.fn().mockResolvedValue(undefined);
    const job = new ApplyManagedEmailPeriodBoundaryJob({
      applyPeriodBoundary,
    } as never);
    const data = {
      resourceId: '123e4567-e89b-42d3-a456-426614174000',
      resourceType: 'mailbox' as const,
      workspaceId: '123e4567-e89b-42d3-a456-426614174001',
    };

    await expect(job.handle(data)).resolves.toBeUndefined();
    await expect(job.handle(data)).resolves.toBeUndefined();

    expect(applyPeriodBoundary).toHaveBeenCalledTimes(2);
    expect(applyPeriodBoundary).toHaveBeenNthCalledWith(1, data);
    expect(applyPeriodBoundary).toHaveBeenNthCalledWith(2, data);
  });
});
