import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';

import {
  ManagedEmailActionResultDTO,
  ManagedEmailBundleDTO,
  ManagedEmailDomainDTO,
  ManagedEmailHealthDetailsDTO,
  ManagedEmailMailboxDTO,
  ManagedEmailOperationDTO,
  ManagedEmailOverviewDTO,
  ManagedEmailProposalDTO,
  ManagedEmailQuoteDTO,
  ManagedEmailSubscriptionDTO,
} from 'src/engine/core-modules/managed-email/managed-email.dto';
import { ManagedEmailProposalInput } from 'src/engine/core-modules/managed-email/managed-email.input';
import { MANAGED_EMAIL_PRODUCT_KEYS } from 'src/engine/core-modules/managed-email/constants/managed-email-catalog.constant';
import { MANAGED_EMAIL_CUSTOMER_OWNED_DOMAIN_NAMESERVERS } from 'src/engine/core-modules/managed-email/constants/managed-email-customer-owned-domain.constant';
import { ManagedEmailAcquisitionOperationEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-domain.entity';
import { ManagedEmailCatalogService } from 'src/engine/core-modules/managed-email/services/managed-email-catalog.service';
import { ManagedEmailOfferService } from 'src/engine/core-modules/managed-email/services/managed-email-offer.service';
import { ManagedEmailReadinessService } from 'src/engine/core-modules/managed-email/services/managed-email-readiness.service';
import { ManagedEmailMailboxEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-mailbox.entity';
import { ManagedEmailAcquisitionMode } from 'src/engine/core-modules/managed-email/enums/managed-email-acquisition-mode.enum';
import { ManagedEmailCampaignEligibility } from 'src/engine/core-modules/managed-email/enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from 'src/engine/core-modules/managed-email/enums/managed-email-infrastructure-state.enum';
import { ManagedEmailLifecycleAction } from 'src/engine/core-modules/managed-email/enums/managed-email-lifecycle-action.enum';
import { ManagedEmailWarmupState } from 'src/engine/core-modules/managed-email/enums/managed-email-warmup-state.enum';
import { ManagedEmailAcquisitionService } from 'src/engine/core-modules/managed-email/services/managed-email-acquisition.service';
import { ManagedEmailLifecycleService } from 'src/engine/core-modules/managed-email/services/managed-email-lifecycle.service';
import { ManagedEmailProposalService } from 'src/engine/core-modules/managed-email/services/managed-email-proposal.service';
import { type CreateManagedEmailProposalInput } from 'src/engine/core-modules/managed-email/types/managed-email-proposal.type';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

type MailboxActionInput = Readonly<{
  actorId: string;
  idempotencyKey: string;
  mailboxId: string;
  workspaceId: string;
}>;

type DomainActionInput = Readonly<{
  actorId: string;
  domainId: string;
  idempotencyKey: string;
  workspaceId: string;
}>;

type CampaignCapInput = MailboxActionInput &
  Readonly<{
    dailyCap: number | null;
  }>;

type ManagedEmailSubscriptionResource = {
  cancelAtPeriodEnd: boolean;
  id: string;
  label: string;
  lifecycleIsHealthy: boolean;
  paidThrough: Date | null;
  subscriptionId: string | null;
};

@Injectable()
export class ManagedEmailCustomerService {
  constructor(
    @InjectWorkspaceScopedRepository(ManagedEmailDomainEntity)
    private readonly domainRepository: WorkspaceScopedRepository<ManagedEmailDomainEntity>,
    @InjectWorkspaceScopedRepository(ManagedEmailMailboxEntity)
    private readonly mailboxRepository: WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    @InjectWorkspaceScopedRepository(ManagedEmailAcquisitionOperationEntity)
    private readonly operationRepository: WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
    private readonly lifecycleService: ManagedEmailLifecycleService,
    private readonly acquisitionService: ManagedEmailAcquisitionService,
    private readonly proposalService: ManagedEmailProposalService,
    private readonly catalogService: ManagedEmailCatalogService,
    private readonly offerService: ManagedEmailOfferService,
    private readonly twentyConfigService: TwentyConfigService,
    private readonly readinessService: ManagedEmailReadinessService,
  ) {}

  async overview(workspaceId: string): Promise<ManagedEmailOverviewDTO> {
    const [domains, mailboxes] = await Promise.all([
      this.domainRepository.find(workspaceId),
      this.mailboxRepository.find(workspaceId),
    ]);
    const readyCount = mailboxes.filter(
      ({ campaignEligibility }) =>
        campaignEligibility === ManagedEmailCampaignEligibility.ELIGIBLE,
    ).length;
    const warmingCount = mailboxes.filter(
      ({ warmupState }) => warmupState === 'WARMING',
    ).length;
    const actionRequiredCount = mailboxes.filter(
      ({ safeFailureCode }) => safeFailureCode !== null,
    ).length;
    const status =
      mailboxes.length === 0
        ? 'EMPTY'
        : actionRequiredCount > 0
          ? 'ACTION_REQUIRED'
          : readyCount === mailboxes.length
            ? 'READY'
            : 'WARMING';

    return {
      acquisitionAvailable: this.isAcquisitionAvailable(workspaceId),
      actionRequiredCount,
      domainCount: domains.length,
      mailboxCount: mailboxes.length,
      readyCount,
      status,
      warmingCount,
    };
  }

  async domains(workspaceId: string): Promise<ManagedEmailDomainDTO[]> {
    const [domains, mailboxes] = await Promise.all([
      this.domainRepository.find(workspaceId),
      this.mailboxRepository.find(workspaceId),
    ]);

    return domains.map((domain) => ({
      acquisitionMode: domain.acquisitionMode,
      cancelAtPeriodEnd: domain.cancelAtPeriodEnd,
      dependentMailboxCount: mailboxes.filter(
        ({ managedEmailDomainId }) => managedEmailDomainId === domain.id,
      ).length,
      domain: domain.domain,
      id: domain.id,
      infrastructureState: domain.infrastructureState,
      paidThrough: domain.paidThrough,
      requiredNameservers:
        domain.acquisitionMode ===
        ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT
          ? [...MANAGED_EMAIL_CUSTOMER_OWNED_DOMAIN_NAMESERVERS]
          : [],
      renewalEnabled: domain.renewalEnabled,
      safeFailureCode: domain.safeFailureCode,
    }));
  }

  async mailboxes(workspaceId: string): Promise<ManagedEmailMailboxDTO[]> {
    const [domains, mailboxes] = await Promise.all([
      this.domainRepository.find(workspaceId),
      this.mailboxRepository.find(workspaceId),
    ]);
    const domainById = new Map(domains.map((domain) => [domain.id, domain]));

    return mailboxes.map((mailbox) => {
      const domain = domainById.get(mailbox.managedEmailDomainId);

      if (domain === undefined) {
        throw new Error('Managed email mailbox domain was not found');
      }

      return {
        address: mailbox.address,
        adminDailyCap: mailbox.adminDailyCap,
        campaignEligibility: mailbox.campaignEligibility,
        domain: domain.domain,
        domainId: domain.id,
        id: mailbox.id,
        infrastructureCancelAtPeriodEnd:
          mailbox.infrastructureCancelAtPeriodEnd,
        infrastructureState: mailbox.infrastructureState,
        lastHealthEvaluatedAt: mailbox.lastHealthEvaluatedAt,
        personaDisplayName: mailbox.personaDisplayName,
        personaRole: mailbox.personaRole,
        policySafeDailyCapacity: mailbox.policySafeDailyCapacity,
        safeFailureCode: mailbox.safeFailureCode,
        servicePaidThrough: mailbox.infrastructurePaidThrough,
        warmupCancelAtPeriodEnd: mailbox.warmupCancelAtPeriodEnd,
        warmupPaidThrough: mailbox.warmupPaidThrough,
        warmupState: mailbox.warmupState,
      };
    });
  }
  async subscriptions({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<ManagedEmailSubscriptionDTO[]> {
    const [operations, domains, mailboxes] = await Promise.all([
      this.operationRepository.find(workspaceId),
      this.domainRepository.find(workspaceId),
      this.mailboxRepository.find(workspaceId),
    ]);
    const now = new Date();

    return operations
      .filter(
        (operation) =>
          operation.workspaceId === workspaceId &&
          operation.correlatedSubscriptionLines !== null,
      )
      .flatMap((operation) => {
        const correlatedLines = operation.correlatedSubscriptionLines ?? [];
        const operationIsHealthy =
          operation.paymentStatus === 'PAID' &&
          operation.state === 'PROVIDER_SUCCEEDED' &&
          operation.safeFailureCode === null &&
          operation.pendingRenewalProjection === null;
        const lineSetIsExact =
          correlatedLines.length === operation.expectedLineItems.length &&
          operation.expectedLineItems.every(
            (expectedLine) =>
              correlatedLines.filter(
                ({ productId }) =>
                  productId === expectedLine.metronomeProductId,
              ).length === 1,
          ) &&
          correlatedLines.every((correlatedLine) =>
            operation.expectedLineItems.some(
              ({ metronomeProductId }) =>
                metronomeProductId === correlatedLine.productId,
            ),
          );

        return operation.expectedLineItems.map((expectedLine) => {
          const matchingLines = correlatedLines.filter(
            ({ productId }) => productId === expectedLine.metronomeProductId,
          );
          const correlatedLine =
            matchingLines.length === 1 ? matchingLines[0] : null;
          let resources: ManagedEmailSubscriptionResource[];
          let action: 'CANCEL_RENEWAL' | 'STOP_SERVICE';
          let actionIsAvailable = true;
          let resourceType: 'DOMAIN' | 'MAILBOX';

          switch (expectedLine.productKey) {
            case MANAGED_EMAIL_PRODUCT_KEYS.SENDING_DOMAIN_YEAR: {
              const operationDomains = domains.filter(
                (domain) =>
                  domain.workspaceId === workspaceId &&
                  domain.acquisitionOperationId === operation.id,
              );

              resources = operationDomains.map((domain) => {
                const hasCancellationIntent =
                  domain.pendingLifecycleAction ===
                    ManagedEmailLifecycleAction.DISABLE_DOMAIN_SUBSCRIPTION_PENDING ||
                  domain.pendingLifecycleAction ===
                    ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL;

                return {
                  cancelAtPeriodEnd: domain.cancelAtPeriodEnd,
                  id: domain.id,
                  label: domain.normalizedDomain,
                  lifecycleIsHealthy:
                    domain.infrastructureState ===
                      ManagedEmailInfrastructureState.ACTIVE &&
                    domain.safeFailureCode === null &&
                    (domain.cancelAtPeriodEnd
                      ? hasCancellationIntent
                      : !hasCancellationIntent),
                  paidThrough: domain.paidThrough,
                  subscriptionId: domain.metronomeSubscriptionId,
                };
              });
              action = 'CANCEL_RENEWAL';
              actionIsAvailable = operationDomains.every((domain) =>
                mailboxes
                  .filter(
                    (mailbox) =>
                      mailbox.workspaceId === workspaceId &&
                      mailbox.managedEmailDomainId === domain.id,
                  )
                  .every((mailbox) => mailbox.infrastructureCancelAtPeriodEnd),
              );
              resourceType = 'DOMAIN';
              break;
            }
            case MANAGED_EMAIL_PRODUCT_KEYS.MAILBOX_MONTH:
              resources = mailboxes
                .filter(
                  (mailbox) =>
                    mailbox.workspaceId === workspaceId &&
                    mailbox.acquisitionOperationId === operation.id,
                )
                .map((mailbox) => {
                  const hasCancellationIntent =
                    mailbox.pendingLifecycleAction ===
                      ManagedEmailLifecycleAction.STOP_MAILBOX_SUBSCRIPTION_PENDING ||
                    mailbox.pendingLifecycleAction ===
                      ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END;

                  return {
                    cancelAtPeriodEnd: mailbox.infrastructureCancelAtPeriodEnd,
                    id: mailbox.id,
                    label: mailbox.normalizedAddress,
                    lifecycleIsHealthy:
                      mailbox.infrastructureState ===
                        ManagedEmailInfrastructureState.ACTIVE &&
                      (mailbox.infrastructureCancelAtPeriodEnd
                        ? hasCancellationIntent
                        : !hasCancellationIntent),
                    paidThrough: mailbox.infrastructurePaidThrough,
                    subscriptionId: mailbox.metronomeMailboxSubscriptionId,
                  };
                });
              action = 'STOP_SERVICE';
              resourceType = 'MAILBOX';
              break;
            case MANAGED_EMAIL_PRODUCT_KEYS.WARMUP_MONTH:
              resources = mailboxes
                .filter(
                  (mailbox) =>
                    mailbox.workspaceId === workspaceId &&
                    mailbox.acquisitionOperationId === operation.id,
                )
                .map((mailbox) => {
                  const hasCancellationIntent =
                    mailbox.pendingLifecycleAction ===
                      ManagedEmailLifecycleAction.CANCEL_WARMUP_SUBSCRIPTION_PENDING ||
                    mailbox.pendingLifecycleAction ===
                      ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END ||
                    mailbox.pendingLifecycleAction ===
                      ManagedEmailLifecycleAction.STOP_MAILBOX_SUBSCRIPTION_PENDING ||
                    mailbox.pendingLifecycleAction ===
                      ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END;
                  const warmupIsActive =
                    mailbox.warmupState === ManagedEmailWarmupState.WARMING ||
                    mailbox.warmupState ===
                      ManagedEmailWarmupState.MAINTENANCE ||
                    mailbox.warmupState === ManagedEmailWarmupState.PAUSED ||
                    (mailbox.warmupCancelAtPeriodEnd &&
                      mailbox.warmupState ===
                        ManagedEmailWarmupState.CANCEL_AT_PERIOD_END);

                  return {
                    cancelAtPeriodEnd: mailbox.warmupCancelAtPeriodEnd,
                    id: mailbox.id,
                    label: mailbox.normalizedAddress,
                    lifecycleIsHealthy:
                      warmupIsActive &&
                      (mailbox.warmupCancelAtPeriodEnd
                        ? hasCancellationIntent
                        : !hasCancellationIntent),
                    paidThrough: mailbox.warmupPaidThrough,
                    subscriptionId: mailbox.metronomeWarmupSubscriptionId,
                  };
                });
              action = 'CANCEL_RENEWAL';
              resourceType = 'MAILBOX';
              break;
          }

          resources.sort((left, right) => left.id.localeCompare(right.id));

          const correlationMatches =
            lineSetIsExact &&
            correlatedLine !== null &&
            !correlatedLine.isProrated &&
            correlatedLine.startingAt === expectedLine.periodStart &&
            correlatedLine.endingBefore === expectedLine.periodEnd &&
            correlatedLine.quantity === expectedLine.quantity &&
            correlatedLine.unitPrice === expectedLine.unitPriceCents &&
            correlatedLine.total === expectedLine.totalCents;
          const paidThrough = resources[0]?.paidThrough ?? null;
          const paidThroughTime = paidThrough?.getTime() ?? Number.NaN;
          const initialPaidThroughTime =
            correlatedLine === null
              ? Number.NaN
              : new Date(correlatedLine.endingBefore).getTime();
          const resourceCorrelationMatches =
            correlatedLine !== null &&
            resources.length === expectedLine.quantity &&
            Number.isFinite(paidThroughTime) &&
            paidThroughTime > now.getTime() &&
            paidThroughTime >= initialPaidThroughTime &&
            resources.every(
              (resource) =>
                resource.subscriptionId === correlatedLine.subscriptionId &&
                resource.paidThrough?.getTime() === paidThroughTime &&
                resource.lifecycleIsHealthy,
            );
          const cancellationCount = resources.filter(
            ({ cancelAtPeriodEnd }) => cancelAtPeriodEnd,
          ).length;
          const cancellationStateMatches =
            cancellationCount === 0 || cancellationCount === resources.length;
          const status =
            !operationIsHealthy ||
            !correlationMatches ||
            !resourceCorrelationMatches ||
            !cancellationStateMatches
              ? 'ACTION_REQUIRED'
              : cancellationCount === resources.length
                ? 'CANCELS_AT_PERIOD_END'
                : 'ACTIVE';

          return {
            action: status === 'ACTIVE' && actionIsAvailable ? action : null,
            billingInterval: expectedLine.billingFrequency,
            currency: expectedLine.currency,
            paidThrough: status === 'ACTION_REQUIRED' ? null : paidThrough,
            productKey: expectedLine.productKey,
            quantity: expectedLine.quantity,
            recurringAmountCents: expectedLine.totalCents,
            resourceIds: resources.map(({ id }) => id),
            resourceLabels: resources.map(({ label }) => label),
            resourceType,
            service: 'MANAGED_EMAIL',
            status,
            unitPriceCents: expectedLine.unitPriceCents,
          };
        });
      });
  }

  async prewarmedBundles({
    actorId,
    workspaceId,
  }: {
    actorId: string;
    workspaceId: string;
  }): Promise<ManagedEmailBundleDTO[]> {
    this.assertAcquisitionAvailable(workspaceId);
    const { bundles, observedAt } =
      await this.proposalService.listPrewarmedBundles();

    return Promise.all(
      bundles.map(async (bundle) => {
        const selection = await this.offerService.persistBundleSelection({
          actorWorkspaceMemberId: actorId,
          providerInventoryId: bundle.inventoryId,
          workspaceId,
        });

        return {
          bundleId: selection.id,
          domain: bundle.domain,
          mailboxCount: bundle.mailboxCount,
          exclusiveWorkspaceUse: true,
          providerType: bundle.mailboxes[0].provider,
          observedAt,
          mailboxes: bundle.mailboxes.map(
            ({ address, firstName, lastName }) => ({
              address,
              displayName: `${firstName} ${lastName}`,
            }),
          ),
        };
      }),
    );
  }
  async newProposal({
    actorId,
    input,
    workspaceId,
    workspaceSlug,
  }: {
    actorId: string;
    input: ManagedEmailProposalInput;
    workspaceId: string;
    workspaceSlug: string;
  }): Promise<ManagedEmailProposalDTO> {
    this.assertAcquisitionAvailable(workspaceId);

    const personas = input.personas.map((persona) => ({
      ...persona,
      roleTitle: persona.roleTitle ?? null,
    }));
    let proposalInput: CreateManagedEmailProposalInput;

    if (
      input.acquisitionMode ===
      ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT
    ) {
      if (typeof input.customerOwnedDomain !== 'string') {
        throw new Error('Managed email proposal input is invalid');
      }

      proposalInput = {
        acquisitionMode:
          ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT,
        customerOwnedDomain: input.customerOwnedDomain,
        mailboxCount: input.mailboxCount,
        personas,
      };
    } else {
      if (
        input.acquisitionMode ===
          ManagedEmailAcquisitionMode.PREWARMED_INVENTORY ||
        (input.customerOwnedDomain !== null &&
          input.customerOwnedDomain !== undefined)
      ) {
        throw new Error('Managed email proposal input is invalid');
      }

      proposalInput = {
        ...(input.acquisitionMode === undefined
          ? {}
          : { acquisitionMode: input.acquisitionMode }),
        mailboxCount: input.mailboxCount,
        personas,
      };
    }

    const proposal = await this.proposalService.createProposal(proposalInput, {
      actorWorkspaceMemberId: actorId,
      workspaceId,
      workspaceSlug,
    });
    return {
      disclosures: proposal.disclosures,
      domains: proposal.domains.map((domain) => ({
        domain: domain.domain,
        mailboxes: domain.mailboxes.map((mailbox) => ({
          address: mailbox.address,
          displayName: `${mailbox.firstName} ${mailbox.lastName}`,
          roleTitle: mailbox.roleTitle,
        })),
      })),
      expiresAt: proposal.expiresAt,
      id: proposal.id,
      mailboxCount: proposal.mailboxCount,
      policyVersion: proposal.policyVersion,
    };
  }

  async prewarmedProposal({
    actorId,
    bundleId,
    workspaceId,
  }: {
    actorId: string;
    bundleId: string;
    workspaceId: string;
  }): Promise<ManagedEmailProposalDTO> {
    this.assertAcquisitionAvailable(workspaceId);
    const providerInventoryId = await this.offerService.resolveBundleSelection({
      actorWorkspaceMemberId: actorId,
      bundleId,
      workspaceId,
    });
    const proposal = await this.proposalService.createPrewarmedProposal(
      { inventoryIds: [providerInventoryId] },
      {
        actorWorkspaceMemberId: actorId,
        workspaceId,
        workspaceSlug: workspaceId,
      },
    );
    return {
      disclosures: proposal.disclosures,
      domains: proposal.domains.map((domain) => ({
        domain: domain.domain,
        mailboxes: domain.mailboxes.map((mailbox) => ({
          address: mailbox.address,
          displayName: `${mailbox.firstName} ${mailbox.lastName}`,
          roleTitle: mailbox.roleTitle,
        })),
      })),
      expiresAt: proposal.expiresAt,
      id: proposal.id,
      mailboxCount: proposal.mailboxCount,
      policyVersion: proposal.policyVersion,
    };
  }

  async quote({
    actorId,
    proposalId,
    workspaceId,
  }: {
    actorId?: string;
    proposalId: string;
    workspaceId: string;
  }): Promise<ManagedEmailQuoteDTO> {
    this.assertAcquisitionAvailable(workspaceId);
    if (proposalId.trim() === '' || !actorId) {
      throw new Error('Managed email quote request is invalid');
    }
    const proposal = await this.offerService.loadProposalForQuote({
      actorWorkspaceMemberId: actorId,
      proposalId,
      workspaceId,
    });
    const quote = await this.catalogService.createQuote({ proposal });
    await this.offerService.persistQuote({
      actorWorkspaceMemberId: actorId,
      proposalId: proposal.id,
      quote,
      workspaceId,
    });
    return {
      ...quote,
      lines: quote.lines.map((line) => ({
        ...line,
        endingBefore: new Date(line.endingBefore),
        startingAt: new Date(line.startingAt),
      })),
      quoteFingerprint: quote.quoteHash,
      quoteVersion: quote.catalogVersion,
      isSandbox:
        this.twentyConfigService.get('MANAGED_EMAIL_EXECUTION_MODE') ===
        'SANDBOX',
    };
  }

  async operation(
    workspaceId: string,
    operationId: string,
  ): Promise<ManagedEmailOperationDTO | null> {
    const operation = await this.operationRepository.findOneBy(workspaceId, {
      id: operationId,
    });

    return operation === null ? null : this.toOperationDTO(operation);
  }

  async mailboxHealth(
    workspaceId: string,
    mailboxId: string,
  ): Promise<ManagedEmailHealthDetailsDTO | null> {
    const mailbox = await this.mailboxRepository.findOneBy(workspaceId, {
      id: mailboxId,
    });

    return mailbox === null
      ? null
      : {
          adminDailyCap: mailbox.adminDailyCap,
          campaignEligibility: mailbox.campaignEligibility,
          lastEvaluatedAt: mailbox.lastHealthEvaluatedAt,
          policySafeDailyCapacity: mailbox.policySafeDailyCapacity,
          safeFailureCode: mailbox.safeFailureCode,
        };
  }

  async domainHealth(
    workspaceId: string,
    domainId: string,
  ): Promise<ManagedEmailHealthDetailsDTO | null> {
    const domain = await this.domainRepository.findOneBy(workspaceId, {
      id: domainId,
    });

    return domain === null
      ? null
      : {
          adminDailyCap: null,
          campaignEligibility: 'NOT_APPLICABLE',
          lastEvaluatedAt: domain.lastReconciledAt,
          policySafeDailyCapacity: 0,
          safeFailureCode: domain.safeFailureCode,
        };
  }

  async purchase({
    acquisitionMode,
    actorId,
    input,
    workspaceId,
  }: {
    acquisitionMode: ManagedEmailAcquisitionMode;
    actorId: string;
    input: {
      idempotencyKey: string;
      quoteFingerprint: string;
      quoteId: string;
      quoteVersion: string;
    };
    workspaceId: string;
  }): Promise<ManagedEmailActionResultDTO> {
    this.assertAcquisitionAvailable(workspaceId);
    const providerConfigurationKey = this.twentyConfigService.get(
      'MANAGED_EMAIL_PROVIDER_CONFIGURATION_KEY',
    );
    const readinessPolicyVersion = this.twentyConfigService.get(
      'MANAGED_EMAIL_READINESS_POLICY_VERSION',
    );
    this.readinessService.assertApprovedPurchasePolicy({
      policyVersion: readinessPolicyVersion,
      providerConfigurationKey,
    });
    const reserved = await this.offerService.reserveQuoteForPurchase({
      actorWorkspaceMemberId: actorId,
      acquisitionMode,
      idempotencyKey: input.idempotencyKey,
      operationId: randomUUID(),
      quoteFingerprint: input.quoteFingerprint,
      quoteId: input.quoteId,
      quoteVersion: input.quoteVersion,
      workspaceId,
    });
    await this.acquisitionService.admit({
      acquisitionMode,
      actorWorkspaceMemberId: actorId,
      idempotencyKey: input.idempotencyKey,
      operationId: reserved.operationId,
      providerConfigurationKey,
      quote: reserved.quote,
      readinessPolicyVersion,
      workspaceId,
    });

    return { accepted: true, operationId: reserved.operationId };
  }
  async setCampaignCap(
    input: CampaignCapInput,
  ): Promise<ManagedEmailActionResultDTO> {
    const mailbox = await this.mailboxRepository.findOneBy(input.workspaceId, {
      id: input.mailboxId,
    });

    if (mailbox === null) {
      throw new Error('Managed email mailbox was not found');
    }
    if (
      input.dailyCap !== null &&
      input.dailyCap > mailbox.policySafeDailyCapacity
    ) {
      throw new Error('Managed email campaign cap cannot be raised');
    }
    const effectiveDailyCap = input.dailyCap ?? mailbox.policySafeDailyCapacity;
    const capPatch = {
      adminDailyCap: input.dailyCap,
      ...(effectiveDailyCap === 0
        ? {
            campaignEligibility:
              ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED,
          }
        : mailbox.campaignEligibility ===
              ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED &&
            (mailbox.safeFailureCode === null ||
              mailbox.safeFailureCode === 'CAPACITY_UNAVAILABLE')
          ? {
              campaignEligibility: ManagedEmailCampaignEligibility.ELIGIBLE,
              ...(mailbox.safeFailureCode === 'CAPACITY_UNAVAILABLE'
                ? { safeFailureCode: null }
                : {}),
            }
          : {}),
    };
    const update = await this.mailboxRepository.update(
      input.workspaceId,
      {
        adminDailyCap:
          mailbox.adminDailyCap === null ? IsNull() : mailbox.adminDailyCap,
        campaignEligibility: mailbox.campaignEligibility,
        id: mailbox.id,
        policySafeDailyCapacity: mailbox.policySafeDailyCapacity,
        safeFailureCode:
          mailbox.safeFailureCode === null ? IsNull() : mailbox.safeFailureCode,
      },
      capPatch,
    );

    if (update.affected !== 1) {
      throw new Error('Managed email campaign cap changed concurrently');
    }

    return { accepted: true, operationId: mailbox.id };
  }

  async cancelWarmup(
    input: MailboxActionInput,
  ): Promise<ManagedEmailActionResultDTO> {
    await this.lifecycleService.cancelWarmupAtPeriodEnd(input);
    return { accepted: true, operationId: input.mailboxId };
  }

  async pauseWarmup(
    input: MailboxActionInput,
  ): Promise<ManagedEmailActionResultDTO> {
    await this.lifecycleService.pauseWarmupNow(input);
    return { accepted: true, operationId: input.mailboxId };
  }

  async resumeWarmup(
    input: MailboxActionInput,
  ): Promise<ManagedEmailActionResultDTO> {
    await this.lifecycleService.resumeWarmup(input);
    return { accepted: true, operationId: input.mailboxId };
  }

  async stopMailbox(
    input: MailboxActionInput,
  ): Promise<ManagedEmailActionResultDTO> {
    await this.lifecycleService.stopMailboxAtPeriodEnd(input);
    return { accepted: true, operationId: input.mailboxId };
  }

  async cancelDomainRenewal(
    input: DomainActionInput,
  ): Promise<ManagedEmailActionResultDTO> {
    await this.lifecycleService.disableDomainRenewal(input);
    return { accepted: true, operationId: input.domainId };
  }

  private isAcquisitionAvailable(workspaceId: string): boolean {
    return (
      this.twentyConfigService.get('MANAGED_EMAIL_ENABLED') === true &&
      this.twentyConfigService
        .get('MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS')
        .includes(workspaceId)
    );
  }

  private assertAcquisitionAvailable(workspaceId: string): void {
    if (!this.isAcquisitionAvailable(workspaceId)) {
      throw new Error('Managed email acquisition is unavailable');
    }
  }

  private toOperationDTO(
    operation: ManagedEmailAcquisitionOperationEntity,
  ): ManagedEmailOperationDTO {
    return {
      acquisitionMode: operation.acquisitionMode,
      amountCents: operation.expectedAmountCents,
      createdAt: operation.createdAt,
      currency: operation.currency,
      id: operation.id,
      paymentStatus: operation.paymentStatus,
      safeFailureCode: operation.safeFailureCode,
      state: operation.state,
      updatedAt: operation.updatedAt,
    };
  }
}
