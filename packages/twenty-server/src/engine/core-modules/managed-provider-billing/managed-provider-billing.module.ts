import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

import { ManagedProviderBillingRecoveryCronCommand } from './crons/commands/managed-provider-billing-recovery.cron.command';
import { ManagedProviderBillingRecoveryCronJob } from './crons/managed-provider-billing-recovery.cron.job';
import { DeliverManagedProviderUsageJob } from './jobs/deliver-managed-provider-usage.job';
import { ManagedProviderOperationEntity } from './entities/managed-provider-operation.entity';
import { ManagedProviderFundingActionEntity } from './entities/managed-provider-funding-action.entity';
import { MetronomeClientService } from './services/metronome-client.service';
import { OpenRouterGenerationLookupService } from './services/openrouter-generation-lookup.service';
import { ManagedProviderOperationService } from './services/managed-provider-operation.service';
import { ManagedProviderUsageDeliveryService } from './services/managed-provider-usage-delivery.service';
import { ManagedProviderBillingRecoveryService } from './services/managed-provider-billing-recovery.service';
import { ManagedProviderBillingStatusService } from './services/managed-provider-billing-status.service';
import { ManagedProviderFundingJournalService } from './services/managed-provider-funding-journal.service';

import { MetronomeWorkspaceCustomerService } from './services/metronome-workspace-customer.service';

@Module({
  imports: [
    TwentyConfigModule,
    MessageQueueModule,
    TypeOrmModule.forFeature([
      ManagedProviderOperationEntity,
      ManagedProviderFundingActionEntity,
      MyahWorkspaceInstallationEntity,
      WorkspaceEntity,
    ]),
  ],
  providers: [
    ManagedProviderOperationService,
    DeliverManagedProviderUsageJob,
    OpenRouterGenerationLookupService,
    ManagedProviderUsageDeliveryService,
    ManagedProviderBillingRecoveryService,
    ManagedProviderBillingStatusService,
    ManagedProviderBillingRecoveryCronJob,
    ManagedProviderBillingRecoveryCronCommand,
    MetronomeClientService,
    provideWorkspaceScopedRepository(MyahWorkspaceInstallationEntity),
    provideWorkspaceScopedRepository(ManagedProviderOperationEntity),
    provideWorkspaceScopedRepository(ManagedProviderFundingActionEntity),
    ManagedProviderFundingJournalService,
    MetronomeWorkspaceCustomerService,
  ],
  exports: [
    ManagedProviderOperationService,
    ManagedProviderUsageDeliveryService,
    ManagedProviderBillingStatusService,
    MetronomeClientService,
    MetronomeWorkspaceCustomerService,
    ManagedProviderFundingJournalService,
    ManagedProviderBillingRecoveryCronCommand,
  ],
})
export class ManagedProviderBillingModule {}
