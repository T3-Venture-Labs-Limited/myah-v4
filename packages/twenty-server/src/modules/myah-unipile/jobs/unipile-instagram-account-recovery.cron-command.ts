import { Command, CommandRunner } from 'nest-commander';

import { UNIPILE_INSTAGRAM_ACCOUNT_RECOVERY_CRON_PATTERN } from 'src/modules/myah-unipile/constants/unipile-instagram-account-recovery-cron-pattern.constant';
import { UnipileInstagramAccountRecoveryJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-account-recovery.job';
import { UnipileInstagramWebhookReconciliationJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-webhook-reconciliation.job';
import { UnipileInstagramAvailabilityService } from 'src/modules/myah-unipile/services/unipile-instagram-availability.service';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

@Command({
  name: 'cron:unipile-instagram-account-recovery',
  description: 'Recovers stalled Unipile Instagram account operations',
})
export class UnipileInstagramAccountRecoveryCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly availabilityService: UnipileInstagramAvailabilityService,
  ) {
    super();
  }

  async run(): Promise<void> {
    this.availabilityService.assertEnabled();

    await this.messageQueueService.addCron<undefined>({
      jobName: UnipileInstagramAccountRecoveryJob.name,
      data: undefined,
      options: {
        repeat: { pattern: UNIPILE_INSTAGRAM_ACCOUNT_RECOVERY_CRON_PATTERN },
      },
    });
    await this.messageQueueService.addCron<undefined>({
      jobName: UnipileInstagramWebhookReconciliationJob.name,
      data: undefined,
      options: {
        repeat: { pattern: UNIPILE_INSTAGRAM_ACCOUNT_RECOVERY_CRON_PATTERN },
      },
    });
  }
}
