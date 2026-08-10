import { FindOperator, type FindManyOptions, type Repository } from 'typeorm';

import { ManagedEmailReadinessCronJob } from './managed-email-readiness.cron.job';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailWarmupState } from '../enums/managed-email-warmup-state.enum';
import { EvaluateManagedEmailReadinessJob } from '../jobs/evaluate-managed-email-readiness.job';
import { type MessageQueueService } from '../../message-queue/services/message-queue.service';

const now = new Date('2026-08-06T12:00:00.000Z');
const due = {
  id: 'mailbox-warming',
  nextReconciliationAt: new Date('2026-08-06T11:00:00.000Z'),
  warmupState: ManagedEmailWarmupState.WARMING,
  workspaceId: 'workspace-1',
} as ManagedEmailMailboxEntity;

describe('ManagedEmailReadinessCronJob', () => {
  it('claims a bounded due row before enqueueing opaque identity with stable retry options', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([due]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<
      Pick<Repository<ManagedEmailMailboxEntity>, 'find' | 'update'>
    >;
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as MessageQueueService;
    const cron = new ManagedEmailReadinessCronJob(
      repository as unknown as Repository<ManagedEmailMailboxEntity>,
      queue,
      () => now,
    );

    await cron.handle();

    const options = repository.find.mock
      .calls[0][0] as FindManyOptions<ManagedEmailMailboxEntity>;
    expect(options).toMatchObject({
      order: { id: 'ASC', nextReconciliationAt: 'ASC' },
      take: 100,
    });
    const selectedStates = (
      options.where as {
        warmupState: FindOperator<ManagedEmailWarmupState>;
      }
    ).warmupState.value;
    expect(selectedStates).toContain(
      ManagedEmailWarmupState.RECONCILIATION_REQUIRED,
    );
    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      EvaluateManagedEmailReadinessJob.name,
      { mailboxId: due.id, workspaceId: due.workspaceId },
      expect.objectContaining({
        id: `managed-email-readiness:${due.id}`,
        retryLimit: 3,
      }),
    );
    expect(JSON.stringify((queue.add as jest.Mock).mock.calls)).not.toContain(
      'address',
    );
  });

  it('does not enqueue a row whose compare-and-set claim loses a race', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([due]),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const queue = { add: jest.fn() };

    await new ManagedEmailReadinessCronJob(
      repository as never,
      queue as never,
      () => now,
    ).handle();

    expect(queue.add).not.toHaveBeenCalled();
  });
});
