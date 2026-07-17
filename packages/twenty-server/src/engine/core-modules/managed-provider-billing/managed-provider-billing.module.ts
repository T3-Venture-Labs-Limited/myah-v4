import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';

import { ManagedProviderBillingRecoveryCronCommand } from './crons/commands/managed-provider-billing-recovery.cron.command';
import { ManagedProviderBillingRecoveryCronJob } from './crons/managed-provider-billing-recovery.cron.job';
import { DeliverManagedProviderUsageJob } from './jobs/deliver-managed-provider-usage.job';
import { ManagedProviderOperationEntity } from './entities/managed-provider-operation.entity';
import { MetronomeClientService } from './services/metronome-client.service';
import { ManagedProviderOperationService } from './services/managed-provider-operation.service';
import { ManagedProviderUsageDeliveryService } from './services/managed-provider-usage-delivery.service';
import { ManagedProviderBillingRecoveryService } from './services/managed-provider-billing-recovery.service';

import { MetronomeWorkspaceCustomerService } from './services/metronome-workspace-customer.service';

@Module({
  imports: [
    TwentyConfigModule,
    MessageQueueModule,
    TypeOrmModule.forFeature([
      ManagedProviderOperationEntity,
      MyahWorkspaceInstallationEntity,
      WorkspaceEntity,
    ]),
  ],
  providers: [
    ManagedProviderOperationService,
    DeliverManagedProviderUsageJob,
    ManagedProviderUsageDeliveryService,
    ManagedProviderBillingRecoveryService,
    ManagedProviderBillingRecoveryCronJob,
    ManagedProviderBillingRecoveryCronCommand,
    MetronomeClientService,
    MetronomeWorkspaceCustomerService,
  ],
  exports: [
    ManagedProviderOperationService,
    ManagedProviderUsageDeliveryService,
    MetronomeClientService,
    MetronomeWorkspaceCustomerService,
    ManagedProviderBillingRecoveryCronCommand,
  ],
})
export class ManagedProviderBillingModule {}
