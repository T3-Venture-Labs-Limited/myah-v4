import { type FindManyOptions, type Repository } from 'typeorm';

import { ManagedEmailPeriodBoundaryCronJob } from '../managed-email-period-boundary.cron.job';
import { ManagedEmailDomainEntity } from '../../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../../entities/managed-email-mailbox.entity';
import { ApplyManagedEmailPeriodBoundaryJob } from '../../jobs/apply-managed-email-period-boundary.job';
import { type MessageQueueService } from '../../../message-queue/services/message-queue.service';

const now = new Date('2026-08-06T12:00:00.000Z');
const dueAt = new Date('2026-08-06T11:59:00.000Z');
const domain = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  nextPeriodBoundaryAt: dueAt,
  workspaceId: '123e4567-e89b-42d3-a456-426614174001',
} as unknown as ManagedEmailDomainEntity;
const mailbox = {
  id: '123e4567-e89b-42d3-a456-426614174002',
  nextPeriodBoundaryAt: dueAt,
  workspaceId: '123e4567-e89b-42d3-a456-426614174001',
} as unknown as ManagedEmailMailboxEntity;

describe('ManagedEmailPeriodBoundaryCronJob', () => {
  it('independently claims due domains and mailboxes and enqueues stable resource jobs', async () => {
    const domainRepository = {
      find: jest.fn().mockResolvedValue([domain]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<
      Pick<Repository<ManagedEmailDomainEntity>, 'find' | 'update'>
    >;
    const mailboxRepository = {
      find: jest.fn().mockResolvedValue([mailbox]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as jest.Mocked<
      Pick<Repository<ManagedEmailMailboxEntity>, 'find' | 'update'>
    >;
    const queue = {
      add: jest.fn().mockResolvedValue(undefined),
    } as unknown as MessageQueueService;

    await new ManagedEmailPeriodBoundaryCronJob(
      domainRepository as never,
      mailboxRepository as never,
      queue,
      () => now,
    ).handle();

    expect(
      domainRepository.find.mock
        .calls[0][0] as FindManyOptions<ManagedEmailDomainEntity>,
    ).toMatchObject({
      order: { id: 'ASC', nextPeriodBoundaryAt: 'ASC' },
      take: 100,
    });
    expect(
      mailboxRepository.find.mock
        .calls[0][0] as FindManyOptions<ManagedEmailMailboxEntity>,
    ).toMatchObject({
      order: { id: 'ASC', nextPeriodBoundaryAt: 'ASC' },
      take: 100,
    });
    expect(queue.add).toHaveBeenCalledWith(
      ApplyManagedEmailPeriodBoundaryJob.name,
      {
        resourceId: domain.id,
        resourceType: 'domain',
        workspaceId: domain.workspaceId,
      },
      expect.objectContaining({
        id: `managed-email-period-boundary:domain:${domain.id}`,
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      ApplyManagedEmailPeriodBoundaryJob.name,
      {
        resourceId: mailbox.id,
        resourceType: 'mailbox',
        workspaceId: mailbox.workspaceId,
      },
      expect.objectContaining({
        id: `managed-email-period-boundary:mailbox:${mailbox.id}`,
      }),
    );
  });

  it('does not enqueue a resource whose atomic claim loses a race', async () => {
    const domainRepository = {
      find: jest.fn().mockResolvedValue([domain]),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const mailboxRepository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    };
    const queue = { add: jest.fn() };

    await new ManagedEmailPeriodBoundaryCronJob(
      domainRepository as never,
      mailboxRepository as never,
      queue as never,
      () => now,
    ).handle();

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('restores a failed domain enqueue to its prior due timestamp', async () => {
    const enqueueError = new Error('queue unavailable');
    const domainRepository = {
      find: jest.fn().mockResolvedValue([domain]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const mailboxRepository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    };
    const queue = { add: jest.fn().mockRejectedValue(enqueueError) };

    await expect(
      new ManagedEmailPeriodBoundaryCronJob(
        domainRepository as never,
        mailboxRepository as never,
        queue as never,
        () => now,
      ).handle(),
    ).rejects.toBe(enqueueError);
    expect(domainRepository.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: domain.id }),
      { nextPeriodBoundaryAt: dueAt },
    );
  });

  it('re-enqueues due resources after a restart or expired claim', async () => {
    const domainRepository = {
      find: jest.fn().mockResolvedValue([domain]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const mailboxRepository = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    };
    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const cron = new ManagedEmailPeriodBoundaryCronJob(
      domainRepository as never,
      mailboxRepository as never,
      queue as never,
      () => now,
    );

    await cron.handle();
    await cron.handle();

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add.mock.calls[0][2]).toMatchObject({
      id: `managed-email-period-boundary:domain:${domain.id}`,
    });
    expect(queue.add.mock.calls[1][2]).toMatchObject({
      id: `managed-email-period-boundary:domain:${domain.id}`,
    });
  });
});
