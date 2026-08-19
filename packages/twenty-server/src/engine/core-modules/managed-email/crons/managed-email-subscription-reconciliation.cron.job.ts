import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, type Repository } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { ManagedEmailAcquisitionOperationEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-acquisition-operation.entity';
import { ReconcileManagedEmailSubscriptionsJob } from 'src/engine/core-modules/managed-email/jobs/reconcile-managed-email-subscriptions.job';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

export const MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_PATTERN =
  '* * * * *';
export const MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_CLOCK = Symbol(
  'MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_CLOCK',
);
const BATCH_SIZE = 100;
const CLAIM_DELAY_MS = 60_000;

@Injectable()
@Processor(MessageQueue.cronQueue)
export class ManagedEmailSubscriptionReconciliationCronJob {
  constructor(
    // This control-plane scan crosses workspaces only to enqueue opaque IDs.
    // Each worker re-enters through a workspace-scoped repository.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedEmailAcquisitionOperationEntity)
    private readonly operationRepository: Repository<ManagedEmailAcquisitionOperationEntity>,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    @Inject(MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  @Process(ManagedEmailSubscriptionReconciliationCronJob.name)
  @SentryCronMonitor(
    ManagedEmailSubscriptionReconciliationCronJob.name,
    MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const now = this.now();
    const operations = await this.operationRepository.find({
      order: { id: 'ASC', nextSubscriptionReconciliationAt: 'ASC' },
      take: BATCH_SIZE,
      where: { nextSubscriptionReconciliationAt: LessThanOrEqual(now) },
    });
    const claimedUntil = new Date(now.getTime() + CLAIM_DELAY_MS);

    for (const operation of operations) {
      const priorDueAt = operation.nextSubscriptionReconciliationAt;
      if (priorDueAt === null) continue;

      const claim = await this.operationRepository.update(
        {
          id: operation.id,
          workspaceId: operation.workspaceId,
          nextSubscriptionReconciliationAt: priorDueAt,
        },
        { nextSubscriptionReconciliationAt: claimedUntil },
      );
      if (claim.affected !== 1) continue;

      try {
        await this.messageQueueService.add(
          ReconcileManagedEmailSubscriptionsJob.name,
          { operationId: operation.id, workspaceId: operation.workspaceId },
          { id: `managed-email-subscriptions:${operation.id}`, retryLimit: 3 },
        );
      } catch (error) {
        await this.operationRepository.update(
          {
            id: operation.id,
            workspaceId: operation.workspaceId,
            nextSubscriptionReconciliationAt: claimedUntil,
          },
          { nextSubscriptionReconciliationAt: priorDueAt },
        );
        throw error;
      }
    }
  }
}
