import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, type Repository } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailWarmupState } from '../enums/managed-email-warmup-state.enum';
import { EvaluateManagedEmailReadinessJob } from '../jobs/evaluate-managed-email-readiness.job';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

export const MANAGED_EMAIL_READINESS_CRON_PATTERN = '*/5 * * * *';
export const MANAGED_EMAIL_READINESS_CRON_CLOCK = Symbol(
  'MANAGED_EMAIL_READINESS_CRON_CLOCK',
);
const BATCH_SIZE = 100;
const CLAIM_DURATION_MS = 5 * 60 * 1000;

@Injectable()
@Processor(MessageQueue.cronQueue)
export class ManagedEmailReadinessCronJob {
  constructor(
    // This control-plane scan crosses workspaces only to enqueue opaque IDs.
    // Each worker re-enters through a workspace-scoped repository.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedEmailMailboxEntity)
    private readonly mailboxRepository: Repository<ManagedEmailMailboxEntity>,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    @Inject(MANAGED_EMAIL_READINESS_CRON_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  @Process(ManagedEmailReadinessCronJob.name)
  @SentryCronMonitor(
    ManagedEmailReadinessCronJob.name,
    MANAGED_EMAIL_READINESS_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const now = this.now();
    const dueMailboxes = await this.mailboxRepository.find({
      order: { id: 'ASC', nextReconciliationAt: 'ASC' },
      take: BATCH_SIZE,
      where: {
        nextReconciliationAt: LessThanOrEqual(now),
        warmupState: In([
          ManagedEmailWarmupState.WARMING,
          ManagedEmailWarmupState.MAINTENANCE,
          ManagedEmailWarmupState.ACTION_REQUIRED,
          ManagedEmailWarmupState.RECONCILIATION_REQUIRED,
        ]),
      },
    });

    for (const mailbox of dueMailboxes) {
      const priorDueAt = mailbox.nextReconciliationAt;

      if (priorDueAt === null) continue;

      const claimedUntil = new Date(now.getTime() + CLAIM_DURATION_MS);
      const claim = await this.mailboxRepository.update(
        {
          id: mailbox.id,
          nextReconciliationAt: priorDueAt,
          warmupState: mailbox.warmupState,
        },
        { nextReconciliationAt: claimedUntil },
      );

      if (claim.affected !== 1) continue;

      try {
        await this.messageQueueService.add(
          EvaluateManagedEmailReadinessJob.name,
          { mailboxId: mailbox.id, workspaceId: mailbox.workspaceId },
          {
            id: `managed-email-readiness:${mailbox.id}`,
            retryLimit: 3,
          },
        );
      } catch (error) {
        await this.mailboxRepository.update(
          { id: mailbox.id, nextReconciliationAt: claimedUntil },
          { nextReconciliationAt: priorDueAt },
        );
        throw error;
      }
    }
  }
}
