import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

import { ManagedProviderBillingRecoveryCronCommand } from './crons/commands/managed-provider-billing-recovery.cron.command';
import { ManagedProviderBillingRecoveryCronJob } from './crons/managed-provider-billing-recovery.cron.job';
import { DeliverManagedProviderUsageJob } from './jobs/deliver-managed-provider-usage.job';
import { ManagedProviderOperationEntity } from './entities/managed-provider-operation.entity';
import { ManagedProviderFundingActionEntity } from './entities/managed-provider-funding-action.entity';
import { ManagedProviderPoolEntity } from './entities/managed-provider-pool.entity';
import { MetronomeClientService } from './services/metronome-client.service';
import { OpenRouterGenerationLookupService } from './services/openrouter-generation-lookup.service';
import { ManagedProviderOperationService } from './services/managed-provider-operation.service';
import { ManagedProviderUsageDeliveryService } from './services/managed-provider-usage-delivery.service';
import { ManagedProviderBillingRecoveryService } from './services/managed-provider-billing-recovery.service';
import { ManagedProviderBillingStatusService } from './services/managed-provider-billing-status.service';
import { ManagedProviderFundingJournalService } from './services/managed-provider-funding-journal.service';
import { ManagedProviderPoolService } from './services/managed-provider-pool.service';
import { ManagedProviderCustomerFundingService } from './services/managed-provider-customer-funding.service';

import { MetronomeWorkspaceCustomerService } from './services/metronome-workspace-customer.service';
import { ManagedProviderStripeService } from './stripe/managed-provider-stripe.service';

@Module({
  imports: [
    TwentyConfigModule,
    MessageQueueModule,
    TypeOrmModule.forFeature([
      ManagedProviderOperationEntity,
      ManagedProviderFundingActionEntity,
      ManagedProviderPoolEntity,
      MyahWorkspaceInstallationEntity,
      WorkspaceEntity,
    ]),
  ],
  providers: [
    ManagedProviderOperationService,
    ManagedProviderPoolService,
    DeliverManagedProviderUsageJob,
    OpenRouterGenerationLookupService,
    ManagedProviderUsageDeliveryService,
    ManagedProviderBillingRecoveryService,
    ManagedProviderBillingStatusService,
    ManagedProviderBillingRecoveryCronJob,
    ManagedProviderBillingRecoveryCronCommand,
    {
      provide: MetronomeClientService,
      inject: [TwentyConfigService],
      useFactory: (twentyConfigService: TwentyConfigService) =>
        new MetronomeClientService(
          twentyConfigService,
          twentyConfigService.get('METRONOME_BASE_URL'),
        ),
    },
    provideWorkspaceScopedRepository(MyahWorkspaceInstallationEntity),
    provideWorkspaceScopedRepository(ManagedProviderOperationEntity),
    provideWorkspaceScopedRepository(ManagedProviderFundingActionEntity),
    { provide: 'MANAGED_PROVIDER_STRIPE_CLIENT', useValue: undefined },
    ManagedProviderStripeService,
    ManagedProviderFundingJournalService,
    ManagedProviderCustomerFundingService,
    MetronomeWorkspaceCustomerService,
  ],
  exports: [
    ManagedProviderOperationService,
    ManagedProviderPoolService,
    ManagedProviderUsageDeliveryService,
    ManagedProviderBillingStatusService,
    MetronomeClientService,
    MetronomeWorkspaceCustomerService,
    ManagedProviderStripeService,
    ManagedProviderFundingJournalService,
    ManagedProviderCustomerFundingService,
    ManagedProviderBillingRecoveryCronCommand,
  ],
})
export class ManagedProviderBillingModule {}
