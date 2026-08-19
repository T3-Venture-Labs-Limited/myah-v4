import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, type Repository } from 'typeorm';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { ManagedEmailMailboxEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-mailbox.entity';
import { ManagedEmailInfrastructureState } from 'src/engine/core-modules/managed-email/enums/managed-email-infrastructure-state.enum';
import { ActivateManagedEmailMailboxJob } from 'src/engine/core-modules/managed-email/jobs/activate-managed-email-mailbox.job';
import { MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK } from 'src/engine/core-modules/managed-email/services/managed-email-mailbox-activation.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

export const MANAGED_EMAIL_MAILBOX_ACTIVATION_CRON_PATTERN = '* * * * *';
const ACTIVATION_BATCH_SIZE = 100;
const ACTIVATION_RETRY_DELAY_MS = 60_000;

@Injectable()
@Processor(MessageQueue.cronQueue)
export class ManagedEmailMailboxActivationCronJob {
  constructor(
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedEmailMailboxEntity)
    private readonly mailboxRepository: Repository<ManagedEmailMailboxEntity>,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    @Inject(MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  @Process(ManagedEmailMailboxActivationCronJob.name)
  @SentryCronMonitor(
    ManagedEmailMailboxActivationCronJob.name,
    MANAGED_EMAIL_MAILBOX_ACTIVATION_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    const now = this.now();
    const mailboxes = await this.mailboxRepository.find({
      order: { id: 'ASC', nextReconciliationAt: 'ASC' },
      take: ACTIVATION_BATCH_SIZE,
      where: {
        infrastructureState: In([
          ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
          ManagedEmailInfrastructureState.CONNECTING_TWENTY,
        ]),
        nextReconciliationAt: LessThanOrEqual(now),
      },
    });
    const retryAt = new Date(now.getTime() + ACTIVATION_RETRY_DELAY_MS);

    for (const mailbox of mailboxes) {
      const priorDueAt = mailbox.nextReconciliationAt;
      const claim = await this.mailboxRepository.update(
        {
          id: mailbox.id,
          nextReconciliationAt: priorDueAt ?? IsNull(),
          infrastructureState: mailbox.infrastructureState,
          workspaceId: mailbox.workspaceId,
        },
        { nextReconciliationAt: retryAt },
      );
      if (claim.affected !== 1) continue;
      try {
        await this.messageQueueService.add(
          ActivateManagedEmailMailboxJob.name,
          { mailboxId: mailbox.id, workspaceId: mailbox.workspaceId },
          {
            id: `managed-email-mailbox-activation:${mailbox.id}`,
            retryLimit: 3,
          },
        );
      } catch (error) {
        await this.mailboxRepository.update(
          {
            id: mailbox.id,
            nextReconciliationAt: retryAt,
            infrastructureState: mailbox.infrastructureState,
            workspaceId: mailbox.workspaceId,
          },
          { nextReconciliationAt: priorDueAt },
        );
        throw error;
      }
    }
  }
}
