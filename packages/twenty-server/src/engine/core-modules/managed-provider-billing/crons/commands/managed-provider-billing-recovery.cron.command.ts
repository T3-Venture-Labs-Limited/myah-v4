import { Command, CommandRunner } from 'nest-commander';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

import { MANAGED_PROVIDER_BILLING_RECOVERY_CRON_PATTERN } from '../../constants/managed-provider-billing-recovery-cron-pattern.constant';
import { ManagedProviderBillingRecoveryCronJob } from '../managed-provider-billing-recovery.cron.job';

@Command({
  description: 'Starts recurring managed-provider billing recovery',
  name: 'cron:managed-provider-billing-recovery',
})
export class ManagedProviderBillingRecoveryCronCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {
    super();
  }

  async run(): Promise<void> {
    await this.messageQueueService.add(
      ManagedProviderBillingRecoveryCronJob.name,
      {},
    );
    await this.messageQueueService.addCron<undefined>({
      data: undefined,
      jobName: ManagedProviderBillingRecoveryCronJob.name,
      options: {
        repeat: { pattern: MANAGED_PROVIDER_BILLING_RECOVERY_CRON_PATTERN },
      },
    });
  }
}
