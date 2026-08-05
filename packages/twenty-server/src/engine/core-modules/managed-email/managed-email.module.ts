import { randomBytes, randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventLogEmitterModule } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.module';
import { ImapSmtpCaldavModule } from 'src/engine/core-modules/imap-smtp-caldav-connection/imap-smtp-caldav-connection.module';
import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';

import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';
import { provideWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/provide-workspace-scoped-repository';

import { ManagedEmailReconciliationCronCommand } from './crons/commands/managed-email-reconciliation.cron.command';
import {
  MANAGED_EMAIL_READINESS_CRON_CLOCK,
  ManagedEmailReadinessCronJob,
} from './crons/managed-email-readiness.cron.job';
import { ManagedEmailMailboxActivationCronJob } from './crons/managed-email-mailbox-activation.cron.job';
import { ManagedEmailReconciliationCronJob } from './crons/managed-email-reconciliation.cron.job';
import {
  MANAGED_EMAIL_READINESS_POLICY_RESOLVER,
  resolveManagedEmailReadinessPolicy,
} from './constants/managed-email-readiness-policy.constant';
import { ManagedEmailAcquisitionOperationEntity } from './entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from './entities/managed-email-domain.entity';
import { ActivateManagedEmailMailboxJob } from './jobs/activate-managed-email-mailbox.job';
import { EvaluateManagedEmailReadinessJob } from './jobs/evaluate-managed-email-readiness.job';
import { ManagedEmailMailboxEntity } from './entities/managed-email-mailbox.entity';
import { ReconcileManagedEmailAcquisitionJob } from './jobs/reconcile-managed-email-acquisition.job';
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
import { ManagedEmailReconciliationService } from './services/managed-email-reconciliation.service';
import {
  MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK,
  ManagedEmailMailboxActivationService,
} from './services/managed-email-mailbox-activation.service';
import { ManagedEmailReadinessService } from './services/managed-email-readiness.service';
import { ManagedEmailSubscriptionService } from './services/managed-email-subscription.service';
import {
  MANAGED_EMAIL_WARMUP_CLOCK,
  ManagedEmailWarmupService,
} from './services/managed-email-warmup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ManagedEmailDomainEntity,
      ManagedEmailMailboxEntity,
      ManagedEmailAcquisitionOperationEntity,
    ]),
    SecureHttpClientModule,
    ImapSmtpCaldavModule,
    ManagedProviderBillingModule,
    EventLogEmitterModule,
  ],
  providers: [
    provideWorkspaceScopedRepository(ManagedEmailDomainEntity),
    provideWorkspaceScopedRepository(ManagedEmailMailboxEntity),
    provideWorkspaceScopedRepository(ManagedEmailAcquisitionOperationEntity),
    IcemailClient,
    WarmupInboxClient,
    {
      provide: MANAGED_EMAIL_PROPOSAL_POLICY,
      useValue: Object.freeze({
        candidateDomains: () => {
          throw new Error('Managed email proposal policy is unavailable');
        },
        maxMailboxesPerDomain: 1,
        proposalTtlMs: 1,
        version: 'unconfigured',
      }),
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
      provide: MANAGED_EMAIL_READINESS_POLICY_RESOLVER,
      useValue: resolveManagedEmailReadinessPolicy,
    },
    {
      provide: MANAGED_EMAIL_DNS_CLIENT,
      useFactory: createManagedEmailDnsClient,
    },
    {
      provide: MANAGED_EMAIL_WARMUP_CLOCK,
      useValue: () => new Date(),
    },
    {
      provide: MANAGED_EMAIL_READINESS_CRON_CLOCK,
      useValue: () => new Date(),
    },
    ManagedEmailProposalService,
    ManagedEmailQuoteService,
    ManagedEmailMailboxActivationService,
    ActivateManagedEmailMailboxJob,
    ManagedEmailMailboxActivationCronJob,
    ManagedEmailDnsResolverService,
    ManagedEmailReadinessService,
    ManagedEmailWarmupService,
    EvaluateManagedEmailReadinessJob,
    ManagedEmailReadinessCronJob,
    ManagedEmailSubscriptionService,
    ManagedEmailAcquisitionService,
    ManagedEmailReconciliationService,
    ReconcileManagedEmailAcquisitionJob,
    ManagedEmailReconciliationCronJob,
    ManagedEmailReconciliationCronCommand,
  ],
  exports: [
    getWorkspaceScopedRepositoryToken(ManagedEmailDomainEntity),
    getWorkspaceScopedRepositoryToken(ManagedEmailMailboxEntity),
    getWorkspaceScopedRepositoryToken(ManagedEmailAcquisitionOperationEntity),
    IcemailClient,
    WarmupInboxClient,
    ManagedEmailProposalService,
    ManagedEmailQuoteService,
    ManagedEmailAcquisitionService,
    ManagedEmailReconciliationCronCommand,
    ManagedEmailReconciliationService,
    ManagedEmailSubscriptionService,
  ],
})
export class ManagedEmailModule {}
