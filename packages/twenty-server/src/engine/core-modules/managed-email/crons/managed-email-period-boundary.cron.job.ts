import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, type Repository } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { ManagedEmailDomainEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-mailbox.entity';
import { ApplyManagedEmailPeriodBoundaryJob } from 'src/engine/core-modules/managed-email/jobs/apply-managed-email-period-boundary.job';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

export const MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_PATTERN = '* * * * *';
export const MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_CLOCK = Symbol(
  'MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_CLOCK',
);
const BATCH_SIZE = 100;
const CLAIM_DELAY_MS = 60_000;

type PeriodResource = ManagedEmailDomainEntity | ManagedEmailMailboxEntity;

@Injectable()
@Processor(MessageQueue.cronQueue)
export class ManagedEmailPeriodBoundaryCronJob {
  constructor(
    // This control-plane scan crosses workspaces only to enqueue opaque IDs.
    // Each worker re-enters through a workspace-scoped repository.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedEmailDomainEntity)
    private readonly domainRepository: Repository<ManagedEmailDomainEntity>,
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedEmailMailboxEntity)
    private readonly mailboxRepository: Repository<ManagedEmailMailboxEntity>,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    @Inject(MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  @Process(ManagedEmailPeriodBoundaryCronJob.name)
  @SentryCronMonitor(
    ManagedEmailPeriodBoundaryCronJob.name,
    MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const now = this.now();
    const claimedUntil = new Date(now.getTime() + CLAIM_DELAY_MS);
    const domains = await this.domainRepository.find({
      order: { id: 'ASC', nextPeriodBoundaryAt: 'ASC' },
      take: BATCH_SIZE,
      where: { nextPeriodBoundaryAt: LessThanOrEqual(now) },
    });
    await this.enqueueResources(
      domains,
      'domain',
      this.domainRepository,
      claimedUntil,
    );

    const mailboxes = await this.mailboxRepository.find({
      order: { id: 'ASC', nextPeriodBoundaryAt: 'ASC' },
      take: BATCH_SIZE,
      where: { nextPeriodBoundaryAt: LessThanOrEqual(now) },
    });
    await this.enqueueResources(
      mailboxes,
      'mailbox',
      this.mailboxRepository,
      claimedUntil,
    );
  }

  private async enqueueResources<T extends PeriodResource>(
    resources: T[],
    resourceType: 'domain' | 'mailbox',
    repository: Repository<T>,
    claimedUntil: Date,
  ): Promise<void> {
    for (const resource of resources) {
      const priorDueAt = resource.nextPeriodBoundaryAt;
      if (priorDueAt === null) continue;

      const claim = await repository.update(
        {
          id: resource.id,
          workspaceId: resource.workspaceId,
          nextPeriodBoundaryAt: priorDueAt,
        } as never,
        { nextPeriodBoundaryAt: claimedUntil } as never,
      );
      if (claim.affected !== 1) continue;

      try {
        await this.messageQueueService.add(
          ApplyManagedEmailPeriodBoundaryJob.name,
          {
            resourceId: resource.id,
            resourceType,
            workspaceId: resource.workspaceId,
          },
          {
            id: `managed-email-period-boundary:${resourceType}:${resource.id}`,
            retryLimit: 3,
          },
        );
      } catch (error) {
        await repository.update(
          {
            id: resource.id,
            workspaceId: resource.workspaceId,
            nextPeriodBoundaryAt: claimedUntil,
          } as never,
          { nextPeriodBoundaryAt: priorDueAt } as never,
        );
        throw error;
      }
    }
  }
}
