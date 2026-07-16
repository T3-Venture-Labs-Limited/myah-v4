import { Injectable, Logger } from '@nestjs/common';

import { SentryCronMonitor } from 'src/engine/core-modules/cron/sentry-cron-monitor.decorator';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

import { MANAGED_PROVIDER_BILLING_RECOVERY_CRON_PATTERN } from '../constants/managed-provider-billing-recovery-cron-pattern.constant';
import { ManagedProviderBillingRecoveryService } from '../services/managed-provider-billing-recovery.service';

@Injectable()
@Processor(MessageQueue.cronQueue)
export class ManagedProviderBillingRecoveryCronJob {
  private readonly logger = new Logger(
    ManagedProviderBillingRecoveryCronJob.name,
  );

  constructor(
    private readonly managedProviderBillingRecoveryService: ManagedProviderBillingRecoveryService,
  ) {}

  @Process(ManagedProviderBillingRecoveryCronJob.name)
  @SentryCronMonitor(
    ManagedProviderBillingRecoveryCronJob.name,
    MANAGED_PROVIDER_BILLING_RECOVERY_CRON_PATTERN,
  )
  async handle(): Promise<void> {
    this.logger.log('Starting managed-provider billing recovery');

    await this.managedProviderBillingRecoveryService.recover();
  }
}
