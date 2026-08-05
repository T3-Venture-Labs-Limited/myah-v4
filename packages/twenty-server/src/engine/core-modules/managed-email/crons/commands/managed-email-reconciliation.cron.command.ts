import { Command, CommandRunner } from 'nest-commander';

import { MANAGED_EMAIL_RECONCILIATION_CRON_PATTERN } from 'src/engine/core-modules/managed-email/constants/managed-email-reconciliation-cron-pattern.constant';
import {
  MANAGED_EMAIL_MAILBOX_ACTIVATION_CRON_PATTERN,
  ManagedEmailMailboxActivationCronJob,
} from 'src/engine/core-modules/managed-email/crons/managed-email-mailbox-activation.cron.job';
import {
  MANAGED_EMAIL_READINESS_CRON_PATTERN,
  ManagedEmailReadinessCronJob,
} from 'src/engine/core-modules/managed-email/crons/managed-email-readiness.cron.job';
import { ManagedEmailReconciliationCronJob } from 'src/engine/core-modules/managed-email/crons/managed-email-reconciliation.cron.job';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

const MANAGED_EMAIL_RECOVERY_CRONS = [
  {
    jobName: ManagedEmailReconciliationCronJob.name,
    pattern: MANAGED_EMAIL_RECONCILIATION_CRON_PATTERN,
  },
  {
    jobName: ManagedEmailMailboxActivationCronJob.name,
    pattern: MANAGED_EMAIL_MAILBOX_ACTIVATION_CRON_PATTERN,
  },
  {
    jobName: ManagedEmailReadinessCronJob.name,
    pattern: MANAGED_EMAIL_READINESS_CRON_PATTERN,
  },
] as const;

@Command({
  description: 'Starts recurring managed-email recovery loops',
  name: 'cron:managed-email-reconciliation',
})
export class ManagedEmailReconciliationCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    for (const cron of MANAGED_EMAIL_RECOVERY_CRONS) {
      await this.messageQueueService.add(cron.jobName, {});
      await this.messageQueueService.addCron<undefined>({
        data: undefined,
        jobName: cron.jobName,
        options: {
          repeat: { pattern: cron.pattern },
        },
      });
    }
  }
}
