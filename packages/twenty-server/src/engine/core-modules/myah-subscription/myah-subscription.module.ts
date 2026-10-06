import { Module } from '@nestjs/common';
import { MyahSubscriptionApiAccessService } from 'src/engine/core-modules/myah-subscription/myah-subscription-api-access.service';
import {
  MyahAiUsageService,
  MyahAiUsageRecoveryJob,
} from 'src/engine/core-modules/myah-subscription/myah-ai-usage.service';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { WorkspaceDomainsModule } from 'src/engine/core-modules/domain/workspace-domains/workspace-domains.module';
import { MyahCheckoutService } from 'src/engine/core-modules/myah-subscription/myah-checkout.service';
import { MyahSubscriptionResolver } from 'src/engine/core-modules/myah-subscription/myah-subscription.resolver';
import { MessageQueueModule } from 'src/engine/core-modules/message-queue/message-queue.module';
import { MyahStripeWebhookController } from 'src/engine/core-modules/myah-subscription/myah-stripe-webhook.controller';
import {
  MyahSubscriptionReconciliationCommand,
  MyahSubscriptionReconciliationJob,
} from 'src/engine/core-modules/myah-subscription/myah-subscription-reconciliation.cron';
import { TypeOrmModule } from '@nestjs/typeorm';

import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

import { MyahWorkspaceSubscriptionEntity } from 'src/engine/core-modules/myah-subscription/entities/myah-workspace-subscription.entity';
import { MyahSubscriptionSyncService } from 'src/engine/core-modules/myah-subscription/myah-subscription-sync.service';
import { MyahUsageService } from 'src/engine/core-modules/myah-subscription/myah-usage.service';
import { MyahWorkspaceAccessService } from 'src/engine/core-modules/myah-subscription/myah-workspace-access.service';
import { TwentyConfigModule } from 'src/engine/core-modules/twenty-config/twenty-config.module';
import { ThrottlerModule } from 'src/engine/core-modules/throttler/throttler.module';

@Module({
  imports: [
    TwentyConfigModule,
    PermissionsModule,
    ManagedProviderBillingModule,
    WorkspaceDomainsModule,
    MessageQueueModule,
    ThrottlerModule,
    TypeOrmModule.forFeature([MyahWorkspaceSubscriptionEntity]),
  ],
  providers: [
    MyahSubscriptionApiAccessService,
    MyahAiUsageService,
    MyahAiUsageRecoveryJob,
    provideWorkspaceScopedRepository(MyahWorkspaceSubscriptionEntity),
    MyahCheckoutService,
    MyahSubscriptionResolver,
    MyahWorkspaceAccessService,
    MyahUsageService,
    MyahSubscriptionSyncService,
    MyahSubscriptionReconciliationCommand,
    MyahSubscriptionReconciliationJob,
  ],
  controllers: [MyahStripeWebhookController],
  exports: [
    MyahSubscriptionApiAccessService,
    MyahAiUsageService,
    MyahWorkspaceAccessService,
    MyahUsageService,
    MyahSubscriptionSyncService,
    MyahSubscriptionReconciliationCommand,
  ],
})
export class MyahSubscriptionModule {}
