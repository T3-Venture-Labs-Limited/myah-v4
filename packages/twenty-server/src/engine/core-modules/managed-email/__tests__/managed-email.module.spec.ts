import {
  MODULE_METADATA,
  SELF_DECLARED_DEPS_METADATA,
} from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';

import { EventLogEmitterModule } from 'src/engine/core-modules/event-logs/emit/event-log-emitter.module';
import { ImapSmtpCaldavModule } from 'src/engine/core-modules/imap-smtp-caldav-connection/imap-smtp-caldav-connection.module';
import { ManagedProviderBillingModule } from 'src/engine/core-modules/managed-provider-billing/managed-provider-billing.module';
import { MyahModule } from 'src/engine/core-modules/myah/myah.module';
import { SecureHttpClientModule } from 'src/engine/core-modules/secure-http-client/secure-http-client.module';
import { PermissionsModule } from 'src/engine/metadata-modules/permissions/permissions.module';
import { getWorkspaceScopedRepositoryToken } from 'src/engine/twenty-orm/workspace-scoped-repository/get-workspace-scoped-repository-token.util';

import { ManagedEmailReconciliationCronCommand } from '../crons/commands/managed-email-reconciliation.cron.command';
import {
  MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_CLOCK,
  MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_PATTERN,
  ManagedEmailPeriodBoundaryCronJob,
} from '../crons/managed-email-period-boundary.cron.job';
import {
  MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_CLOCK,
  MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_PATTERN,
  ManagedEmailSubscriptionReconciliationCronJob,
} from '../crons/managed-email-subscription-reconciliation.cron.job';
import { MANAGED_EMAIL_READINESS_POLICY_RESOLVER } from '../constants/managed-email-readiness-policy.constant';
import { ManagedEmailMailboxActivationCronJob } from '../crons/managed-email-mailbox-activation.cron.job';
import {
  MANAGED_EMAIL_READINESS_CRON_CLOCK,
  ManagedEmailReadinessCronJob,
} from '../crons/managed-email-readiness.cron.job';
import { ManagedEmailReconciliationCronJob } from '../crons/managed-email-reconciliation.cron.job';
import { ManagedEmailAcquisitionOperationEntity } from '../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ActivateManagedEmailMailboxJob } from '../jobs/activate-managed-email-mailbox.job';
import { ApplyManagedEmailPeriodBoundaryJob } from '../jobs/apply-managed-email-period-boundary.job';
import { EvaluateManagedEmailReadinessJob } from '../jobs/evaluate-managed-email-readiness.job';
import { ReconcileManagedEmailAcquisitionJob } from '../jobs/reconcile-managed-email-acquisition.job';
import { ReconcileManagedEmailSubscriptionsJob } from '../jobs/reconcile-managed-email-subscriptions.job';
import { ManagedEmailModule } from '../managed-email.module';
import { ManagedEmailResolver } from '../managed-email.resolver';
import { IcemailClient } from '../providers/icemail/icemail.client';
import { WarmupInboxClient } from '../providers/warmup-inbox/warmup-inbox.client';
import {
  MANAGED_EMAIL_ACQUISITION_CLOCK,
  MANAGED_EMAIL_SETUP_PASSWORD_FACTORY,
  ManagedEmailAcquisitionService,
} from '../services/managed-email-acquisition.service';
import {
  MANAGED_EMAIL_DNS_CLIENT,
  ManagedEmailDnsResolverService,
} from '../services/managed-email-dns-resolver.service';
import {
  MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK,
  ManagedEmailMailboxActivationService,
} from '../services/managed-email-mailbox-activation.service';
import {
  MANAGED_EMAIL_PROPOSAL_CLOCK,
  MANAGED_EMAIL_PROPOSAL_ID_FACTORY,
  MANAGED_EMAIL_PROPOSAL_POLICY,
  ManagedEmailProposalService,
} from '../services/managed-email-proposal.service';
import {
  MANAGED_EMAIL_QUOTE_ID_FACTORY,
  ManagedEmailQuoteService,
} from '../services/managed-email-quote.service';
import {
  MANAGED_EMAIL_LIFECYCLE_CLOCK,
  ManagedEmailLifecycleService,
} from '../services/managed-email-lifecycle.service';
import { ManagedEmailCustomerService } from '../services/managed-email-customer.service';
import { ManagedEmailReconciliationService } from '../services/managed-email-reconciliation.service';
import { ManagedEmailReadinessService } from '../services/managed-email-readiness.service';
import {
  MANAGED_EMAIL_WARMUP_CLOCK,
  ManagedEmailWarmupService,
} from '../services/managed-email-warmup.service';
import { ManagedEmailSubscriptionService } from '../services/managed-email-subscription.service';

const ENTITIES = [
  ManagedEmailDomainEntity,
  ManagedEmailMailboxEntity,
  ManagedEmailAcquisitionOperationEntity,
];

describe('ManagedEmailModule', () => {
  it('registers TypeORM and workspace-scoped repositories for all three records', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedEmailModule,
    ) as Array<{ module?: unknown; providers?: Array<{ provide?: unknown }> }>;
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ManagedEmailModule,
    ) as Array<{ provide?: unknown }>;
    const typeOrmFeature = imports.find(
      (importedModule) => importedModule.module === TypeOrmModule,
    );

    expect(typeOrmFeature).toBeDefined();
    for (const entity of ENTITIES) {
      expect(typeOrmFeature?.providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provide: getRepositoryToken(entity) }),
        ]),
      );
      expect(providers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            provide: getWorkspaceScopedRepositoryToken(entity),
          }),
        ]),
      );
    }
  });

  it('uses the registered activation clock token in the cron processor', () => {
    const dependencies = Reflect.getMetadata(
      SELF_DECLARED_DEPS_METADATA,
      ManagedEmailMailboxActivationCronJob,
    ) as Array<{ index: number; param: unknown }>;

    expect(dependencies.find(({ index }) => index === 2)?.param).toBe(
      MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK,
    );
  });

  it('registers subscription and period-boundary recovery schedules', async () => {
    const messageQueueService = {
      add: jest.fn().mockResolvedValue(undefined),
      addCron: jest.fn().mockResolvedValue(undefined),
    };
    const command = new ManagedEmailReconciliationCronCommand(
      messageQueueService as never,
    );

    await command.run();

    expect(messageQueueService.add).toHaveBeenCalledWith(
      ManagedEmailSubscriptionReconciliationCronJob.name,
      {},
    );
    expect(messageQueueService.add).toHaveBeenCalledWith(
      ManagedEmailPeriodBoundaryCronJob.name,
      {},
    );
    expect(messageQueueService.addCron).toHaveBeenCalledWith({
      data: undefined,
      jobName: ManagedEmailSubscriptionReconciliationCronJob.name,
      options: {
        repeat: {
          pattern: MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_PATTERN,
        },
      },
    });
    expect(messageQueueService.addCron).toHaveBeenCalledWith({
      data: undefined,
      jobName: ManagedEmailPeriodBoundaryCronJob.name,
      options: {
        repeat: { pattern: MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_PATTERN },
      },
    });
  });

  it('registers repositories, providers, and orchestration exactly once', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ManagedEmailModule,
    ) as Array<{ module?: unknown }>;
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      ManagedEmailModule,
    ) as unknown[];
    const controllers =
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ManagedEmailModule) ??
      [];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      ManagedEmailModule,
    ) as unknown[];
    const repositoryTokens = ENTITIES.map((entity) =>
      getWorkspaceScopedRepositoryToken(entity),
    );

    expect(imports).toHaveLength(6);
    expect(imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ module: TypeOrmModule }),
        EventLogEmitterModule,
        ImapSmtpCaldavModule,
        ManagedProviderBillingModule,
        SecureHttpClientModule,
        PermissionsModule,
      ]),
    );
    expect(controllers).toEqual([]);
    expect(providers.filter((item) => item === IcemailClient)).toHaveLength(1);
    expect(providers.filter((item) => item === WarmupInboxClient)).toHaveLength(
      1,
    );
    for (const service of [
      ManagedEmailProposalService,
      ManagedEmailQuoteService,
      ManagedEmailCustomerService,
      ManagedEmailResolver,
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
      ManagedEmailLifecycleService,
      ReconcileManagedEmailSubscriptionsJob,
      ApplyManagedEmailPeriodBoundaryJob,
      ManagedEmailSubscriptionReconciliationCronJob,
      ManagedEmailPeriodBoundaryCronJob,
    ]) {
      expect(providers.filter((item) => item === service)).toHaveLength(1);
    }
    for (const token of [
      MANAGED_EMAIL_PROPOSAL_CLOCK,
      MANAGED_EMAIL_PROPOSAL_ID_FACTORY,
      MANAGED_EMAIL_PROPOSAL_POLICY,
      MANAGED_EMAIL_QUOTE_ID_FACTORY,
      MANAGED_EMAIL_ACQUISITION_CLOCK,
      MANAGED_EMAIL_MAILBOX_ACTIVATION_CLOCK,
      MANAGED_EMAIL_READINESS_POLICY_RESOLVER,
      MANAGED_EMAIL_DNS_CLIENT,
      MANAGED_EMAIL_WARMUP_CLOCK,
      MANAGED_EMAIL_READINESS_CRON_CLOCK,
      MANAGED_EMAIL_SETUP_PASSWORD_FACTORY,
      MANAGED_EMAIL_LIFECYCLE_CLOCK,
      MANAGED_EMAIL_SUBSCRIPTION_RECONCILIATION_CRON_CLOCK,
      MANAGED_EMAIL_PERIOD_BOUNDARY_CRON_CLOCK,
    ]) {
      expect(providers).toEqual(
        expect.arrayContaining([expect.objectContaining({ provide: token })]),
      );
    }
    expect(providers).toHaveLength(repositoryTokens.length + 39);
    expect(exports).toEqual([
      ...repositoryTokens,
      IcemailClient,
      WarmupInboxClient,
      ManagedEmailProposalService,
      ManagedEmailQuoteService,
      ManagedEmailAcquisitionService,
      ManagedEmailReconciliationCronCommand,
      ManagedEmailReconciliationService,
      ManagedEmailSubscriptionService,
    ]);
  });

  it('is registered and exported exactly once through MyahModule', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      MyahModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      MyahModule,
    ) as unknown[];

    expect(imports.filter((item) => item === ManagedEmailModule)).toHaveLength(
      1,
    );
    expect(exports.filter((item) => item === ManagedEmailModule)).toHaveLength(
      1,
    );
  });
});
