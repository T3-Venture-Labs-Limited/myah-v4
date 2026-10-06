import { Injectable } from '@nestjs/common';
import { Command, CommandRunner } from 'nest-commander';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { MyahSubscriptionSyncService } from 'src/engine/core-modules/myah-subscription/myah-subscription-sync.service';

const PATTERN = '0 3 * * *';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class MyahSubscriptionReconciliationJob {
  constructor(private readonly sync: MyahSubscriptionSyncService) {}

  @Process(MyahSubscriptionReconciliationJob.name)
  @SentryCronMonitor(MyahSubscriptionReconciliationJob.name, PATTERN)
  async handle() {
    await this.sync.reconcile();
  }
}

@Command({
  name: 'cron:myah-subscription-reconciliation',
  description: 'Register daily Myah Stripe reconciliation',
})
export class MyahSubscriptionReconciliationCommand extends CommandRunner {
  constructor(
    @InjectMessageQueue(MessageQueue.cronQueue)
    private readonly queue: MessageQueueService,
  ) {
    super();
  }

  async run() {
    await this.queue.addCron<undefined>({
      jobName: MyahSubscriptionReconciliationJob.name,
      data: undefined,
      options: { repeat: { pattern: PATTERN } },
    });
  }
}
