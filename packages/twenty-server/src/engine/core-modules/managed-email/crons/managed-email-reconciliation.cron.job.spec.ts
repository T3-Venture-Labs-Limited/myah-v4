import {
  type FindManyOptions,
  type FindOperator,
  type Repository,
} from 'typeorm';

import { ManagedEmailReconciliationCronJob } from 'src/engine/core-modules/managed-email/crons/managed-email-reconciliation.cron.job';
import { ManagedEmailAcquisitionOperationEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-acquisition-operation.entity';
import { ReconcileManagedEmailAcquisitionJob } from 'src/engine/core-modules/managed-email/jobs/reconcile-managed-email-acquisition.job';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

const now = new Date('2026-08-05T12:00:00.000Z');
const recoverableStates = [
  'CREATING_SUBSCRIPTIONS',
  'PAYMENT_PENDING',
  'PAYMENT_PAID',
  'PROVIDER_INTENT_RECORDED',
  'RECONCILIATION_REQUIRED',
];

describe('ManagedEmailReconciliationCronJob', () => {
  it('rotates a bounded due batch after enqueueing every recoverable state', async () => {
    const operations = recoverableStates.map((state, index) => ({
      id: `123e4567-e89b-42d3-a456-42661417400${index}`,
      state,
      workspaceId: `123e4567-e89b-42d3-a456-42661417401${index}`,
    })) as ManagedEmailAcquisitionOperationEntity[];
    const operationRepository = {
      find: jest.fn().mockResolvedValue(operations),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<
      Pick<
        Repository<ManagedEmailAcquisitionOperationEntity>,
        'find' | 'update'
      >
    >;
    const messageQueueService = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Pick<MessageQueueService, 'add'>>;
    const job = new ManagedEmailReconciliationCronJob(
      operationRepository as unknown as Repository<ManagedEmailAcquisitionOperationEntity>,
      messageQueueService as unknown as MessageQueueService,
      () => now,
    );

    await job.handle();

    const options = operationRepository.find.mock
      .calls[0][0] as FindManyOptions<ManagedEmailAcquisitionOperationEntity>;
    const where = options.where as Array<
      Record<string, FindOperator<string | Date> | string>
    >;

    expect(options).toMatchObject({
      order: { id: 'ASC', nextReconciliationAt: 'ASC' },
      take: 100,
    });
    expect(where).toHaveLength(2);
    expect((where[0].state as unknown as { _value: string[] })._value).toEqual(
      recoverableStates,
    );
    expect((where[1].state as unknown as { _value: string[] })._value).toEqual(
      recoverableStates,
    );
    expect(messageQueueService.add).toHaveBeenCalledTimes(operations.length);
    expect(messageQueueService.add).toHaveBeenCalledWith(
      ReconcileManagedEmailAcquisitionJob.name,
      {
        operationId: operations[0].id,
        workspaceId: operations[0].workspaceId,
      },
      {
        id: `managed-email-reconciliation:${operations[0].id}`,
        retryLimit: 3,
      },
    );
    const lastOperation = operations[operations.length - 1];

    expect(operationRepository.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: lastOperation.id,
        state: lastOperation.state,
        workspaceId: lastOperation.workspaceId,
      }),
      { nextReconciliationAt: new Date('2026-08-05T12:01:00.000Z') },
    );
  });

  it('restores the prior due time when enqueueing fails', async () => {
    const dueAt = new Date('2026-08-05T11:59:00.000Z');
    const operation = {
      id: '123e4567-e89b-42d3-a456-426614174000',
      nextReconciliationAt: dueAt,
      state: 'PAYMENT_PENDING',
      workspaceId: '123e4567-e89b-42d3-a456-426614174010',
    } as ManagedEmailAcquisitionOperationEntity;
    const operationRepository = {
      find: jest.fn().mockResolvedValue([operation]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<
      Pick<
        Repository<ManagedEmailAcquisitionOperationEntity>,
        'find' | 'update'
      >
    >;
    const enqueueError = new Error('queue unavailable');
    const messageQueueService = {
      add: jest.fn().mockRejectedValue(enqueueError),
    } as unknown as jest.Mocked<Pick<MessageQueueService, 'add'>>;
    const job = new ManagedEmailReconciliationCronJob(
      operationRepository as unknown as Repository<ManagedEmailAcquisitionOperationEntity>,
      messageQueueService as unknown as MessageQueueService,
      () => now,
    );

    await expect(job.handle()).rejects.toBe(enqueueError);
    expect(operationRepository.update).toHaveBeenCalledTimes(2);
    expect(operationRepository.update).toHaveBeenLastCalledWith(
      {
        id: operation.id,
        nextReconciliationAt: new Date('2026-08-05T12:01:00.000Z'),
        state: operation.state,
        workspaceId: operation.workspaceId,
      },
      { nextReconciliationAt: dueAt },
    );
  });
});
