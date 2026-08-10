import { FindOperator, type FindManyOptions, type Repository } from 'typeorm';

import { ManagedEmailMailboxActivationCronJob } from 'src/engine/core-modules/managed-email/crons/managed-email-mailbox-activation.cron.job';
import { ManagedEmailMailboxEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-mailbox.entity';
import { ManagedEmailInfrastructureState } from 'src/engine/core-modules/managed-email/enums/managed-email-infrastructure-state.enum';
import { ActivateManagedEmailMailboxJob } from 'src/engine/core-modules/managed-email/jobs/activate-managed-email-mailbox.job';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

const now = new Date('2026-08-06T12:00:00.000Z');
const dueMailboxes = [
  {
    id: '123e4567-e89b-42d3-a456-426614174001',
    workspaceId: '123e4567-e89b-42d3-a456-426614174010',
    providerMailboxId: 'icemail-mailbox-1',
    providerOrderId: 'icemail-order-1',
    infrastructureState:
      ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
    nextReconciliationAt: new Date('2026-08-06T11:59:00.000Z'),
  },
  {
    id: '123e4567-e89b-42d3-a456-426614174002',
    workspaceId: '123e4567-e89b-42d3-a456-426614174011',
    infrastructureState:
      ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
    nextReconciliationAt: new Date('2026-08-06T11:59:30.000Z'),
  },
] as ManagedEmailMailboxEntity[];

describe('ManagedEmailMailboxActivationCronJob', () => {
  it('enqueues a bounded due set with opaque mailbox identity only', async () => {
    const mailboxRepository = {
      find: jest.fn().mockResolvedValue(dueMailboxes),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<
      Pick<Repository<ManagedEmailMailboxEntity>, 'find' | 'update'>
    >;
    const messageQueueService = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Pick<MessageQueueService, 'add'>>;
    const job = new ManagedEmailMailboxActivationCronJob(
      mailboxRepository as unknown as Repository<ManagedEmailMailboxEntity>,
      messageQueueService as unknown as MessageQueueService,
      () => now,
    );

    await job.handle();

    const options = mailboxRepository.find.mock
      .calls[0][0] as FindManyOptions<ManagedEmailMailboxEntity>;
    expect(options).toMatchObject({
      order: { id: 'ASC', nextReconciliationAt: 'ASC' },
      take: 100,
    });
    expect(messageQueueService.add).toHaveBeenCalledTimes(dueMailboxes.length);
    const selectedStates = (
      options.where as {
        infrastructureState: FindOperator<ManagedEmailInfrastructureState>;
      }
    ).infrastructureState.value;
    expect(selectedStates).toEqual([
      ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
      ManagedEmailInfrastructureState.CONNECTING_TWENTY,
    ]);
    expect(messageQueueService.add).toHaveBeenNthCalledWith(
      1,
      ActivateManagedEmailMailboxJob.name,
      {
        mailboxId: dueMailboxes[0].id,
        workspaceId: dueMailboxes[0].workspaceId,
      },
      expect.objectContaining({
        id: `managed-email-mailbox-activation:${dueMailboxes[0].id}`,
      }),
    );
    expect(JSON.stringify(messageQueueService.add.mock.calls)).not.toContain(
      'password',
    );
    expect(JSON.stringify(messageQueueService.add.mock.calls)).not.toContain(
      'credential',
    );
  });
});
