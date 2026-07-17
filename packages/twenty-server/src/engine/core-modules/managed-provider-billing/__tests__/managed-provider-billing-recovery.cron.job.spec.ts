import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

import { ManagedProviderBillingRecoveryCronCommand } from '../crons/commands/managed-provider-billing-recovery.cron.command';
import { ManagedProviderBillingRecoveryCronJob } from '../crons/managed-provider-billing-recovery.cron.job';
import { MANAGED_PROVIDER_BILLING_RECOVERY_CRON_PATTERN } from '../constants/managed-provider-billing-recovery-cron-pattern.constant';
import { ManagedProviderBillingRecoveryService } from '../services/managed-provider-billing-recovery.service';

describe('ManagedProviderBillingRecoveryCronJob', () => {
  it('delegates one cron invocation to recovery', async () => {
    const recoveryService = {
      recover: jest.fn().mockResolvedValue(undefined),
    } as Pick<ManagedProviderBillingRecoveryService, 'recover'>;
    const job = new ManagedProviderBillingRecoveryCronJob(
      recoveryService as ManagedProviderBillingRecoveryService,
    );

    await job.handle();

    expect(recoveryService.recover).toHaveBeenCalledTimes(1);
  });
});

describe('ManagedProviderBillingRecoveryCronCommand', () => {
  it('queues an immediate recovery and registers one recurring job', async () => {
    const messageQueueService = {
      add: jest.fn().mockResolvedValue(undefined),
      addCron: jest.fn().mockResolvedValue(undefined),
    } as Pick<MessageQueueService, 'add' | 'addCron'>;
    const command = new ManagedProviderBillingRecoveryCronCommand(
      messageQueueService as MessageQueueService,
    );

    await command.run();

    expect(messageQueueService.add).toHaveBeenCalledWith(
      ManagedProviderBillingRecoveryCronJob.name,
      {},
    );
    expect(messageQueueService.addCron).toHaveBeenCalledWith({
      data: undefined,
      jobName: ManagedProviderBillingRecoveryCronJob.name,
      options: {
        repeat: { pattern: MANAGED_PROVIDER_BILLING_RECOVERY_CRON_PATTERN },
      },
    });
  });
});
