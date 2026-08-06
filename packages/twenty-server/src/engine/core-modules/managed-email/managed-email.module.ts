import { randomBytes, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventLogEmitterModule } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.module';
import { ImapSmtpCaldavModule } from 'src/engine/core-modules/imap-smtp-caldav-connection/imap-smtp-caldav-connection.module';
import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

import { ManagedEmailReconciliationCronCommand } from './crons/commands/managed-email-reconciliation.cron.command';
import {
  MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_CLOCK,
  ManagedEmailPeriodBoundaryCronJob,
} from './crons/managed-email-period-boundary.cron.job';
import {
  MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_CLOCK,
  ManagedEmailSubscriptionReconciliationCronJob,
} from './crons/managed-email-subscription-reconciliation.cron.job';
import {
  MANAGED_EMAIL_READINESS_CRON_CLOCK,
  ManagedEmailReadinessCronJob,
} from './crons/managed-email-readiness.cron.job';
import { ManagedEmailMailboxActivationCronJob } from './crons/managed-email-mailbox-activation.cron.job';
import { ManagedEmailReconciliationCronJob } from './crons/managed-email-reconciliation.cron.job';
import {
  MANAGED_EMAIL_READINESS_POLICY_RESOLVER,
  createManagedEmailReadinessPolicyResolver,
  managedEmailReadinessPolicies,
  managedEmailSandboxReadinessPolicies,
} from './constants/managed-email-readiness-policy.constant';
import { ManagedEmailAcquisitionOperationEntity } from './entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from './entities/managed-email-domain.entity';
import { ManagedEmailOfferEntity } from './entities/managed-email-offer.entity';
import { ActivateManagedEmailMailboxJob } from './jobs/activate-managed-email-mailbox.job';
import { ApplyManagedEmailPeriodBoundaryJob } from './jobs/apply-managed-email-period-boundary.job';
import { EvaluateManagedEmailReadinessJob } from './jobs/evaluate-managed-email-readiness.job';
import { ManagedEmailMailboxEntity } from './entities/managed-email-mailbox.entity';
import { ReconcileManagedEmailAcquisitionJob } from './jobs/reconcile-managed-email-acquisition.job';
import { ReconcileManagedEmailSubscriptionsJob } from './jobs/reconcile-managed-email-subscriptions.job';
import { IcemailClient } from './providers/icemail/icemail.client';
import { WarmupInboxClient } from './providers/warmup-inbox/warmup-inbox.client';
import {
  MANAGED_EMAIL_ACQUISITION_CLOCK,
  MANAGED_EMAIL_SETUP_PASSWORD_FACTORY,
  ManagedEmailAcquisitionService,
} from './services/managed-email-acquisition.service';
import {
  MANAGED_EMAIL_DNS_CLIENT,
  ManagedEmailDnsResolverService,
  createManagedEmailDnsClient,
} from './services/managed-email-dns-resolver.service';
import {
  MANAGED_EMAIL_PROPOSAL_CLOCK,
  MANAGED_EMAIL_PROPOSAL_ID_FACTORY,
  MANAGED_EMAIL_PROPOSAL_POLICY,
  ManagedEmailProposalService,
} from './services/managed-email-proposal.service';
import {
  MANAGED_EMAIL_QUOTE_ID_FACTORY,
  ManagedEmailQuoteService,
} from './services/managed-email-quote.service';
import {
  MANAGED_EMAIL_LIFECYCLE_CLOCK,
  ManagedEmailLifecycleService,
} from './services/managed-email-lifecycle.service';
import { ManagedEmailReconciliationService } from './services/managed-email-reconciliation.service';
import {
  MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK,
  ManagedEmailMailboxActivationService,
} from './services/managed-email-mailbox-activation.service';
import { ManagedEmailReadinessService } from './services/managed-email-readiness.service';
import {
  MANAGED_EMAIL_CAMPAIGN_ELIGIBILITY_CLOCK,
  ManagedEmailCampaignEligibilityService,
} from './services/managed-email-campaign-eligibility.service';
import { ManagedEmailSubscriptionService } from './services/managed-email-subscription.service';
import {
  MANAGED_EMAIL_WARMUP_CLOCK,
  ManagedEmailWarmupService,
} from './services/managed-email-warmup.service';
import { ManagedEmailResolver } from './managed-email.resolver';
import {
  MANAGED_EMAIL_OFFER_CLOCK,
  ManagedEmailOfferService,
} from './services/managed-email-offer.service';
import {
  MANAGED_EMAIL_CATALOG_CLOCK,
  ManagedEmailCatalogService,
} from './services/managed-email-catalog.service';
import { ManagedEmailCustomerService } from './services/managed-email-customer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ManagedEmailDomainEntity,
      ManagedEmailMailboxEntity,
      ManagedEmailAcquisitionOperationEntity,
      ManagedEmailOfferEntity,
    ]),
    SecureHttpClientModule,
    ImapSmtpCaldavModule,
    ManagedProviderBillingModule,
    EventLogEmitterModule,
    PermissionsModule,
  ],
  providers: [
    provideWorkspaceScopedRepository(ManagedEmailDomainEntity),
    provideWorkspaceScopedRepository(ManagedEmailMailboxEntity),
    provideWorkspaceScopedRepository(ManagedEmailAcquisitionOperationEntity),
    provideWorkspaceScopedRepository(ManagedEmailOfferEntity),
    IcemailClient,
    WarmupInboxClient,
    {
      provide: MANAGED_EMAIL_DNS_CLIENT,
      useFactory: createManagedEmailDnsClient,
    },
    {
      provide: MANAGED_EMAIL_PROPOSAL_POLICY,
      inject: [TwentyConfigService],
      useFactory: (config: TwentyConfigService) =>
        config.get('MANAGED_EMAIL_EXECUTION_MODE') === 'SANDBOX'
          ? {
              candidateDomains: (slug: string, count: number) =>
                Array.from(
                  { length: count },
                  (_, index) => `${slug}-${index + 1}.test`,
                ),
              maxMailboxesPerDomain: 1,
              proposalTtlMs: 15 * 60 * 1000,
              version: 'sandbox-v1',
            }
          : {
              candidateDomains: () => {
                throw new Error('Managed email proposal policy is unavailable');
              },
              maxMailboxesPerDomain: 1,
              proposalTtlMs: 1,
              version: 'unconfigured',
            },
    },
    {
      provide: MANAGED_EMAIL_CATALOG_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_OFFER_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_PROPOSAL_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_PROPOSAL_ID_FACTORY,
      useValue: randomUUID,
    },
    {
      provide: MANAGED_EMAIL_QUOTE_ID_FACTORY,
      useValue: randomUUID,
    },
    {
      provide: MANAGED_EMAIL_ACQUISITION_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_SETUP_PASSWORD_FACTORY,
      useValue: () => randomBytes(24).toString('base64url'),
    },
    {
      provide: MANAGED_EMAIL_CAMPAIGN_ELIGIBILITY_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_READINESS_POLICY_RESOLVER,
      inject: [TwentyConfigService],
      useFactory: (config: TwentyConfigService) =>
        createManagedEmailReadinessPolicyResolver(
          config.get('MANAGED_EMAIL_EXECUTION_MODE') === 'SANDBOX'
            ? managedEmailSandboxReadinessPolicies
            : managedEmailReadinessPolicies,
        ),
    },
    {
      provide: MANAGED_EMAIL_WARMUP_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_READINESS_CRON_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_LIFECYCLE_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_CLOCK,
      useValue: () => new Date(),
    },
    ManagedEmailProposalService,
    ManagedEmailQuoteService,
    ManagedEmailOfferService,
    ManagedEmailCustomerService,
    ManagedEmailResolver,
    ManagedEmailMailboxActivationService,
    ActivateManagedEmailMailboxJob,
    ManagedEmailMailboxActivationCronJob,
    ManagedEmailCatalogService,
    ManagedEmailDnsResolverService,
    ManagedEmailReadinessService,
    ManagedEmailCampaignEligibilityService,
    ManagedEmailWarmupService,
    EvaluateManagedEmailReadinessJob,
    ManagedEmailReadinessCronJob,
    ManagedEmailSubscriptionService,
    ManagedEmailAcquisitionService,
    ManagedEmailReconciliationService,
    ReconcileManagedEmailAcquisitionJob,
    ManagedEmailReconciliationCronJob,
    ManagedEmailReconciliationCronCommand,
    ManagedEmailLifecycleService,
    ReconcileManagedEmailSubscriptionsJob,
    ApplyManagedEmailPeriodBoundaryJob,
    ManagedEmailSubscriptionReconciliationCronJob,
    ManagedEmailPeriodBoundaryCronJob,
  ],
  exports: [
    getWorkspaceScopedRepositoryToken(ManagedEmailDomainEntity),
    getWorkspaceScopedRepositoryToken(ManagedEmailMailboxEntity),
    getWorkspaceScopedRepositoryToken(ManagedEmailAcquisitionOperationEntity),
    getWorkspaceScopedRepositoryToken(ManagedEmailOfferEntity),
    IcemailClient,
    WarmupInboxClient,
    ManagedEmailProposalService,
    ManagedEmailQuoteService,
    ManagedEmailAcquisitionService,
    ManagedEmailReconciliationCronCommand,
    ManagedEmailReconciliationService,
    ManagedEmailSubscriptionService,
    ManagedEmailCampaignEligibilityService,
  ],
})
export class ManagedEmailModule {}
