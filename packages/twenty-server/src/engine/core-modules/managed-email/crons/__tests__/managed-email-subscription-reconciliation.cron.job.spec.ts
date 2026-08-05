import { type FindManyOptions, type Repository } from 'typeorm';

import { ManagedEmailSubscriptionReconciliationCronJob } from '../managed-email-subscription-reconciliation.cron.job';
import { ManagedEmailAcquisitionOperationEntity } from '../../entities/managed-email-acquisition-operation.entity';
import { ReconcileManagedEmailSubscriptionsJob } from '../../jobs/reconcile-managed-email-subscriptions.job';
import { type MessageQueueService } from '../../../message-queue/services/message-queue.service';

const now = new Date('2026-08-06T12:00:00.000Z');
const dueAt = new Date('2026-08-06T11:59:00.000Z');
const operation = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  nextSubscriptionReconciliationAt: dueAt,
  workspaceId: '123e4567-e89b-42d3-a456-426614174001',
} as ManagedEmailAcquisitionOperationEntity;

describe('ManagedEmailSubscriptionReconciliationCronJob', () => {
  it('claims due acquisition operations before enqueueing a stable opaque job', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([operation]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<
      Pick<
        Repository<ManagedEmailAcquisitionOperationEntity>,
        'find' | 'update'
      >
    >;
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as MessageQueueService;

    await new ManagedEmailSubscriptionReconciliationCronJob(
      repository as never,
      queue,
      () => now,
    ).handle();

    const options = repository.find.mock
      .calls[0][0] as FindManyOptions<ManagedEmailAcquisitionOperationEntity>;
    expect(options).toMatchObject({
      order: { id: 'ASC', nextSubscriptionReconciliationAt: 'ASC' },
      take: 100,
    });
    expect(repository.update.mock.invocationCallOrder[0]).toBeLessThan(
      (queue.add as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(queue.add).toHaveBeenCalledWith(
      ReconcileManagedEmailSubscriptionsJob.name,
      { operationId: operation.id, workspaceId: operation.workspaceId },
      expect.objectContaining({
        id: `managed-email-subscriptions:${operation.id}`,
      }),
    );
  });

  it('does not enqueue when the atomic claim loses a concurrency race', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([operation]),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const queue = { add: jest.fn() };

    await new ManagedEmailSubscriptionReconciliationCronJob(
      repository as never,
      queue as never,
      () => now,
    ).handle();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('restores the prior due timestamp when enqueue fails', async () => {
    const enqueueError = new Error('queue unavailable');
    const repository = {
      find: jest.fn().mockResolvedValue([operation]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const queue = { add: jest.fn().mockRejectedValue(enqueueError) };

    await expect(
      new ManagedEmailSubscriptionReconciliationCronJob(
        repository as never,
        queue as never,
        () => now,
      ).handle(),
    ).rejects.toBe(enqueueError);
    expect(repository.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: operation.id }),
      { nextSubscriptionReconciliationAt: dueAt },
    );
  });

  it('re-enqueues a due row after a restart or expired prior claim', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([operation]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const cron = new ManagedEmailSubscriptionReconciliationCronJob(
      repository as never,
      queue as never,
      () => now,
    );

    await cron.handle();
    await cron.handle();

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls[0][2]).toMatchObject({
      id: `managed-email-subscriptions:${operation.id}`,
    });
    expect(queue.add.mock.calls[1][2]).toMatchObject({
      id: `managed-email-subscriptions:${operation.id}`,
    });
  });
});
