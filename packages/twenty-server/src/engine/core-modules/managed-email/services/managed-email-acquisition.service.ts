import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

import { ActivateManagedEmailMailboxJob } from '../jobs/activate-managed-email-mailbox.job';
import { ManagedEmailAcquisitionOperationEntity } from '../entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from '../entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailAcquisitionMode } from '../enums/managed-email-acquisition-mode.enum';
import { ManagedEmailCampaignEligibility } from '../enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from '../enums/managed-email-infrastructure-state.enum';
import { ManagedEmailWarmupMode } from '../enums/managed-email-warmup-mode.enum';
import { ManagedEmailWarmupState } from '../enums/managed-email-warmup-state.enum';
import { IcemailClient } from '../providers/icemail/icemail.client';
import {
  IcemailException,
  IcemailExceptionCode,
} from '../providers/icemail/icemail.exception';
import {
  type IcemailOrderReceipt,
  type IcemailPrewarmPurchaseReceipt,
  type IcemailPrewarmedBundle,
} from '../providers/icemail/icemail.types';
import { type ManagedEmailQuote } from '../types/managed-email-quote.type';
import {
  type ManagedEmailProviderReceipt,
  type ManagedEmailResourceSnapshot,
  type ManagedEmailSafeFacts,
} from '../types/managed-email-persistence.type';
import {
  assertManagedEmailProviderReceiptPartition,
  hasExactManagedEmailExpectedLineSet,
} from '../utils/validate-managed-email-persistence-json.util';

import { ManagedEmailSubscriptionService } from './managed-email-subscription.service';

export const MANAGED_EMAIL_ACQUISITION_CLOCK = Symbol(
  'MANAGED_EMAIL_ACQUISITION_CLOCK',
);
export const MANAGED_EMAIL_SETUP_PASSWORD_FACTORY = Symbol(
  'MANAGED_EMAIL_SETUP_PASSWORD_FACTORY',
);

const ICEMAIL_PROVIDER_TYPE = 'ICEMAIL';
const RECONCILIATION_DELAY_MS = 60_000;
const SUBSCRIPTION_RECONCILIATION_LEAD_MS = 2 * 60 * 60 * 1000;
const TERMINAL_STATES = new Set([
  'PROVIDER_FAILED',
  'PROVIDER_PARTIAL',
  'PROVIDER_SUCCEEDED',
]);

export type AdmitManagedEmailAcquisitionInput = Readonly<{
  acquisitionMode: ManagedEmailAcquisitionMode;
  actorWorkspaceMemberId: string;
  idempotencyKey: string;
  operationId: string;
  providerConfigurationKey: string;
  quote: ManagedEmailQuote;
  readinessPolicyVersion: string;
  workspaceId: string;
}>;

const emptyFacts = (): ManagedEmailSafeFacts => ({
  facts: [],
  schemaVersion: 1,
});

const hash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const normalize = (value: string): string => value.trim().toLowerCase();

const quoteFingerprint = ({
  amountMinorUnits,
  currency,
  domain,
  termCount,
  termUnit,
}: {
  amountMinorUnits: number;
  currency: 'USD';
  domain: string;
  termCount: number;
  termUnit: 'YEAR';
}): string => hash({ amountMinorUnits, currency, domain, termCount, termUnit });

@Injectable()
export class ManagedEmailAcquisitionService {
  constructor(
    @InjectWorkspaceScopedRepository(ManagedEmailAcquisitionOperationEntity)
    private readonly operationRepository: WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
    @InjectWorkspaceScopedRepository(ManagedEmailDomainEntity)
    private readonly domainRepository: WorkspaceScopedRepository<ManagedEmailDomainEntity>,
    @InjectWorkspaceScopedRepository(ManagedEmailMailboxEntity)
    private readonly mailboxRepository: WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    private readonly subscriptionService: ManagedEmailSubscriptionService,
    private readonly icemailClient: IcemailClient,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly twentyConfigService: TwentyConfigService,
    @Inject(MANAGED_EMAIL_ACQUISITION_CLOCK)
    private readonly now: () => Date = () => new Date(),
    @Inject(MANAGED_EMAIL_SETUP_PASSWORD_FACTORY)
    private readonly setupPasswordFactory: () => string = () =>
      randomBytes(24).toString('base64url'),
  ) {}

  async admit(
    input: AdmitManagedEmailAcquisitionInput,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    this.assertNewAdmissionAllowed(input);
    const operation = await this.subscriptionService.createPurchaseOperation({
      acquisitionMode: input.acquisitionMode,
      actorWorkspaceMemberId: input.actorWorkspaceMemberId,
      idempotencyKey: input.idempotencyKey,
      operationId: input.operationId,
      providerConfigurationKey: input.providerConfigurationKey,
      quote: input.quote,
      readinessPolicyVersion: input.readinessPolicyVersion,
      workspaceId: input.workspaceId,
    });

    await this.ensureResourceRows(operation, {
      providerConfigurationKey: input.providerConfigurationKey,
      readinessPolicyVersion: input.readinessPolicyVersion,
    });
    const continued =
      await this.subscriptionService.continueSubscriptionCreation({
        operationId: operation.id,
        workspaceId: input.workspaceId,
      });

    await this.projectSubscriptionIds(continued);

    return continued;
  }

  async continue({
    operationId,
    workspaceId,
  }: {
    operationId: string;
    workspaceId: string;
  }): Promise<ManagedEmailAcquisitionOperationEntity> {
    let operation = await this.getOperation(operationId, workspaceId);

    if (operation.state === 'CREATING_SUBSCRIPTIONS') {
      await this.ensureResourceRows(operation, {
        providerConfigurationKey: operation.providerConfigurationKey,
        readinessPolicyVersion: operation.readinessPolicyVersion,
      });
      operation = await this.subscriptionService.continueSubscriptionCreation({
        operationId,
        workspaceId,
      });
      await this.projectSubscriptionIds(operation);
    }
    if (operation.state === 'PAYMENT_PENDING') {
      operation = await this.subscriptionService.reconcilePayment({
        operationId,
        workspaceId,
      });
    }
    if (
      operation.state === 'RECONCILIATION_REQUIRED' &&
      operation.providerOutcome === 'FAILED' &&
      operation.safeFailureCode !== null
    ) {
      return this.persistFailure(operation, operation.safeFailureCode);
    }
    if (
      operation.state === 'PAYMENT_PENDING' ||
      operation.state === 'CREATING_SUBSCRIPTIONS' ||
      operation.state === 'RECONCILIATION_REQUIRED' ||
      TERMINAL_STATES.has(operation.state)
    ) {
      return operation;
    }
    if (operation.state === 'PROVIDER_INTENT_RECORDED') {
      return this.scheduleReconciliation(operation, 'PROVIDER_ACK_UNKNOWN');
    }
    if (operation.state !== 'PAYMENT_PAID') {
      throw new Error('Managed email acquisition state is invalid');
    }

    this.assertExactPaidEntitlement(operation);
    await this.projectPaidEntitlements(operation);
    const providerIntentHash = this.createProviderIntentHash(operation);
    const claim = await this.operationRepository.update(
      workspaceId,
      { id: operation.id, state: 'PAYMENT_PAID' },
      {
        providerIntentHash,
        providerOutcome: 'CALL_NOT_ACKNOWLEDGED',
        state: 'PROVIDER_INTENT_RECORDED',
      },
    );

    if (claim.affected !== 1) {
      return this.continue({ operationId, workspaceId });
    }
    operation.providerIntentHash = providerIntentHash;
    operation.providerOutcome = 'CALL_NOT_ACKNOWLEDGED';
    operation.state = 'PROVIDER_INTENT_RECORDED';
    await this.markResourcesOrdering(operation);

    return this.executeClaimedProviderIntent(operation);
  }

  private async ensureResourceRows(
    operation: ManagedEmailAcquisitionOperationEntity,
    configuration: {
      providerConfigurationKey: string;
      readinessPolicyVersion: string;
    },
  ): Promise<void> {
    const { workspaceId } = operation;
    const personaByAddress = new Map(
      operation.resourceSnapshot.personas.map((persona) => [
        normalize(persona.address),
        persona,
      ]),
    );

    for (const snapshotDomain of operation.resourceSnapshot.domains) {
      const normalizedDomain = normalize(snapshotDomain.domain);
      let domain = await this.domainRepository.findOneBy(workspaceId, {
        normalizedDomain,
      });

      if (domain === null) {
        domain = await this.domainRepository.save(workspaceId, {
          acquisitionOperationId: operation.id,
          acquisitionMode: operation.acquisitionMode,
          cancelAtPeriodEnd: false,
          dnsReadinessFacts: emptyFacts(),
          domain: normalizedDomain,
          expiresAt: null,
          infrastructureState: ManagedEmailInfrastructureState.AWAITING_PAYMENT,
          lastReconciledAt: null,
          metronomeSubscriptionId: null,
          nextReconciliationAt: null,
          normalizedDomain,
          paidThrough: null,
          providerConfigurationKey: configuration.providerConfigurationKey,
          providerDomainId: null,
          providerOrderId: null,
          providerType: ICEMAIL_PROVIDER_TYPE,
          renewalEnabled:
            operation.acquisitionMode !==
            ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT,
          safeFailureCode: null,
        });
      } else if (
        domain.acquisitionOperationId !== operation.id ||
        domain.acquisitionMode !== operation.acquisitionMode ||
        domain.domain !== normalizedDomain ||
        domain.providerConfigurationKey !==
          configuration.providerConfigurationKey ||
        domain.providerType !== ICEMAIL_PROVIDER_TYPE
      ) {
        throw new Error('Managed email resource idempotency conflict');
      }

      for (const addressValue of snapshotDomain.mailboxes) {
        const normalizedAddress = normalize(addressValue);
        const persona = personaByAddress.get(normalizedAddress);

        if (persona === undefined) {
          throw new Error('Managed email resource snapshot is invalid');
        }
        const prior = await this.mailboxRepository.findOneBy(workspaceId, {
          normalizedAddress,
        });

        if (prior !== null) {
          if (
            prior.acquisitionOperationId !== operation.id ||
            prior.managedEmailDomainId !== domain.id ||
            prior.providerConfigurationKey !==
              configuration.providerConfigurationKey ||
            prior.readinessPolicyVersion !==
              configuration.readinessPolicyVersion
          ) {
            throw new Error('Managed email resource idempotency conflict');
          }
          continue;
        }

        await this.mailboxRepository.save(workspaceId, {
          acquisitionOperationId: operation.id,
          address: normalizedAddress,
          adminDailyCap: null,
          campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
          connectedAccountId: null,
          healthFacts: emptyFacts(),
          infrastructurePaidThrough: null,
          infrastructureState: ManagedEmailInfrastructureState.AWAITING_PAYMENT,
          lastHealthEvaluatedAt: null,
          managedEmailDomainId: domain.id,
          messageChannelId: null,
          metronomeMailboxSubscriptionId: null,
          metronomeWarmupSubscriptionId: null,
          nextReconciliationAt: null,
          normalizedAddress,
          personaAuditEventId: null,
          personaCreatedByWorkspaceMemberId: persona.createdByWorkspaceMemberId,
          personaDisplayName: `${persona.firstName} ${persona.lastName}`,
          personaFirstName: persona.firstName,
          personaLastName: persona.lastName,
          personaRole: persona.roleTitle,
          personaSignature: persona.signature,
          personaUpdatedByWorkspaceMemberId: null,
          personaVersion: persona.version,
          policySafeDailyCapacity: 0,
          providerConfigurationKey: configuration.providerConfigurationKey,
          providerMailboxId: null,
          providerOrderId: null,
          providerType: ICEMAIL_PROVIDER_TYPE,
          readinessPolicyVersion: configuration.readinessPolicyVersion,
          safeFailureCode: null,
          warmupCancelAtPeriodEnd: false,
          warmupEnrollmentId: null,
          warmupMode:
            operation.acquisitionMode ===
            ManagedEmailAcquisitionMode.PREWARMED_INVENTORY
              ? ManagedEmailWarmupMode.PROVIDER_PREWARMED
              : ManagedEmailWarmupMode.MYAH_MANAGED,
          warmupPaidThrough: null,
          warmupProviderConfigurationKey: null,
          warmupProviderKey: null,
          warmupState: ManagedEmailWarmupState.NOT_APPLICABLE,
        });
      }
    }
  }

  private async projectSubscriptionIds(
    operation: ManagedEmailAcquisitionOperationEntity,
  ): Promise<void> {
    const subscriptionIds = operation.metronomeSubscriptionIds;

    if (
      subscriptionIds === null ||
      subscriptionIds.length !== operation.expectedLineItems.length
    ) {
      return;
    }
    if (
      !hasExactManagedEmailExpectedLineSet(
        operation.acquisitionMode,
        operation.expectedLineItems,
      )
    ) {
      throw new Error('Managed email subscription correlation is incomplete');
    }
    const subscriptionByProduct = new Map(
      operation.expectedLineItems.map((line, index) => [
        line.productKey,
        subscriptionIds[index],
      ]),
    );
    const domainSubscriptionId = subscriptionByProduct.get(
      'managed_sending_domain_year',
    );
    const mailboxSubscriptionId = subscriptionByProduct.get(
      'managed_mailbox_month',
    );
    const warmupSubscriptionId = subscriptionByProduct.get(
      'managed_warmup_month',
    );

    if (
      mailboxSubscriptionId === undefined ||
      warmupSubscriptionId === undefined ||
      (operation.acquisitionMode !==
        ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT &&
        domainSubscriptionId === undefined)
    ) {
      throw new Error('Managed email subscription correlation is incomplete');
    }

    for (const domain of operation.resourceSnapshot.domains) {
      if (domainSubscriptionId !== undefined) {
        await this.domainRepository.update(
          operation.workspaceId,
          {
            metronomeSubscriptionId: IsNull(),
            normalizedDomain: normalize(domain.domain),
          },
          { metronomeSubscriptionId: domainSubscriptionId },
        );
      }
      for (const address of domain.mailboxes) {
        await this.mailboxRepository.update(
          operation.workspaceId,
          {
            metronomeMailboxSubscriptionId: IsNull(),
            normalizedAddress: normalize(address),
          },
          {
            metronomeMailboxSubscriptionId: mailboxSubscriptionId,
            metronomeWarmupSubscriptionId: warmupSubscriptionId,
          },
        );
      }
    }
  }

  private async markResourcesOrdering(
    operation: ManagedEmailAcquisitionOperationEntity,
  ): Promise<void> {
    for (const domain of operation.resourceSnapshot.domains) {
      const domainUpdate = await this.domainRepository.update(
        operation.workspaceId,
        { normalizedDomain: normalize(domain.domain) },
        { infrastructureState: ManagedEmailInfrastructureState.ORDERING },
      );
      if (domainUpdate.affected !== 1) {
        throw new Error('Managed email resource projection is incomplete');
      }
      for (const address of domain.mailboxes) {
        const mailboxUpdate = await this.mailboxRepository.update(
          operation.workspaceId,
          { normalizedAddress: normalize(address) },
          { infrastructureState: ManagedEmailInfrastructureState.ORDERING },
        );
        if (mailboxUpdate.affected !== 1) {
          throw new Error('Managed email resource projection is incomplete');
        }
      }
    }
  }

  private async executeClaimedProviderIntent(
    operation: ManagedEmailAcquisitionOperationEntity,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    try {
      if (
        operation.acquisitionMode ===
        ManagedEmailAcquisitionMode.PREWARMED_INVENTORY
      ) {
        const bundles = await this.revalidatePrewarmedStock(operation);
        const receipt = await this.icemailClient.buyPrewarmedBundles({
          inventoryIds: bundles.map(({ inventoryId }) => inventoryId),
        });

        return await this.persistPrewarmedReceipt(operation, receipt);
      }

      if (
        operation.acquisitionMode ===
        ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT
      ) {
        const [domain] = operation.resourceSnapshot.domains;

        if (
          domain === undefined ||
          operation.resourceSnapshot.domains.length !== 1
        ) {
          throw new Error('Managed email resource snapshot is invalid');
        }
        const receipt =
          await this.icemailClient.createCustomerOwnedDomainImportOrder({
            customerOwnedDomain: domain.domain,
            mailboxes: domain.mailboxes.map((address) => {
              const persona = operation.resourceSnapshot.personas.find(
                (candidate) => candidate.address === address,
              );

              if (persona === undefined) {
                throw new Error('Managed email resource snapshot is invalid');
              }

              return {
                address,
                firstName: persona.firstName,
                lastName: persona.lastName,
                password: this.setupPasswordFactory(),
              };
            }),
          });

        return await this.persistOrdinaryReceipt(operation, receipt);
      }

      await this.revalidateOrdinaryResources(operation.resourceSnapshot);
      const receipt = await this.icemailClient.createOrdinaryOrder({
        domains: operation.resourceSnapshot.domains.map((domain) => ({
          domain: domain.domain,
          mailboxes: domain.mailboxes.map((address) => {
            const persona = operation.resourceSnapshot.personas.find(
              (candidate) => candidate.address === address,
            );

            if (persona === undefined) {
              throw new Error('Managed email resource snapshot is invalid');
            }

            return {
              address,
              firstName: persona.firstName,
              lastName: persona.lastName,
              password: this.setupPasswordFactory(),
            };
          }),
        })),
      });

      return await this.persistOrdinaryReceipt(operation, receipt);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'Managed email provider stock changed'
      ) {
        return this.persistFailure(operation, 'ICEMAIL_STOCK_CHANGED');
      }
      if (
        error instanceof IcemailException &&
        error.code !== IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN
      ) {
        return this.persistFailure(operation, error.code);
      }

      return this.scheduleReconciliation(
        operation,
        operation.providerReceipt !== null
          ? 'ICEMAIL_RECEIPT_PROJECTION_PENDING'
          : error instanceof IcemailException
            ? error.code
            : 'ICEMAIL_WRITE_OUTCOME_UNCERTAIN',
      );
    }
  }

  private async revalidateOrdinaryResources(
    snapshot: ManagedEmailResourceSnapshot,
  ): Promise<void> {
    for (const domain of snapshot.domains) {
      const providerQuote = domain.providerQuote;

      if (providerQuote === undefined) {
        throw new Error('Managed email provider stock changed');
      }
      const availability = await this.icemailClient.checkDomainAvailability(
        domain.domain,
      );
      const fingerprint = quoteFingerprint({
        amountMinorUnits: availability.price.amountCents,
        currency: availability.price.currency,
        domain: availability.domain,
        termCount: availability.price.duration,
        termUnit: availability.price.durationUnit,
      });

      if (
        !availability.available ||
        availability.domain !== domain.domain ||
        availability.price.amountCents !== providerQuote.amountMinorUnits ||
        availability.price.currency !== providerQuote.currency ||
        availability.price.duration !== providerQuote.termCount ||
        availability.price.durationUnit !== providerQuote.termUnit ||
        fingerprint !== providerQuote.fingerprint
      ) {
        throw new Error('Managed email provider stock changed');
      }
    }
  }
  private async revalidatePrewarmedStock(
    operation: ManagedEmailAcquisitionOperationEntity,
  ): Promise<IcemailPrewarmedBundle[]> {
    const page = await this.icemailClient.listPrewarmedBundles();
    const bundles: IcemailPrewarmedBundle[] = [];

    for (const domain of operation.resourceSnapshot.domains) {
      if (domain.providerInventoryId === undefined) {
        throw new Error('Managed email provider stock changed');
      }
      const expectedCosts = domain.prewarmedProviderCosts;
      if (expectedCosts === undefined) {
        throw new Error('Managed email provider stock changed');
      }
      const bundle = page.items.find(
        ({ inventoryId }) => inventoryId === domain.providerInventoryId,
      );
      const expectedAddresses = [...domain.mailboxes].sort();
      const actualAddresses =
        bundle?.mailboxes.map(({ address }) => address).sort() ?? [];

      if (
        bundle === undefined ||
        bundle.domainPriceCents !== expectedCosts.domainPriceCents ||
        bundle.mailboxPriceCents !== expectedCosts.mailboxPriceCents ||
        bundle.domain !== domain.domain ||
        bundle.mailboxCount !== domain.mailboxes.length ||
        JSON.stringify(actualAddresses) !== JSON.stringify(expectedAddresses)
      ) {
        throw new Error('Managed email provider stock changed');
      }
      bundles.push(bundle);
    }

    return bundles;
  }

  private async persistOrdinaryReceipt(
    operation: ManagedEmailAcquisitionOperationEntity,
    receipt: IcemailOrderReceipt,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    const providerReceipt: ManagedEmailProviderReceipt = {
      domains: receipt.domains.map((domain) => ({
        mailboxes: domain.mailboxes.map((mailbox) => ({
          normalizedAddress: normalize(mailbox.address),
          providerMailboxId: mailbox.id,
        })),
        normalizedDomain: normalize(domain.domain),
        providerDomainId: domain.domainId,
        providerOrderId: domain.orderId,
      })),
      failedInventoryIds: [],
      orderIds: [...new Set(receipt.domains.map(({ orderId }) => orderId))],
      schemaVersion: 1,
      totalCostCents: null,
    };
    assertManagedEmailProviderReceiptPartition(
      providerReceipt,
      operation.resourceSnapshot,
    );
    await this.persistProviderReceipt(operation, providerReceipt);
    await this.projectProviderReceipt(operation, providerReceipt);
    await this.enqueueMailboxActivations(
      operation.workspaceId,
      providerReceipt,
    );
    return this.completeProviderReceipt(operation, false);
  }
  private async persistPrewarmedReceipt(
    operation: ManagedEmailAcquisitionOperationEntity,
    receipt: IcemailPrewarmPurchaseReceipt,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    const partial = receipt.failedInventoryIds.length > 0;
    const providerReceipt: ManagedEmailProviderReceipt = {
      domains: receipt.successful.map((domain) => ({
        mailboxes: domain.mailboxes.map((mailbox) => ({
          normalizedAddress: normalize(mailbox.address),
          providerMailboxId: mailbox.id,
        })),
        normalizedDomain: normalize(domain.domain),
        providerDomainId: domain.domainId,
        providerOrderId: receipt.orderId,
      })),
      failedInventoryIds: receipt.failedInventoryIds,
      orderIds: [receipt.orderId],
      schemaVersion: 1,
      totalCostCents: receipt.totalCostCents,
    };
    assertManagedEmailProviderReceiptPartition(
      providerReceipt,
      operation.resourceSnapshot,
    );
    await this.persistProviderReceipt(operation, providerReceipt, partial);
    await this.projectProviderReceipt(operation, providerReceipt);
    await this.enqueueMailboxActivations(
      operation.workspaceId,
      providerReceipt,
    );
    return this.completeProviderReceipt(operation, partial);
  }
  private async enqueueMailboxActivations(
    workspaceId: string,
    providerReceipt: ManagedEmailProviderReceipt,
  ): Promise<void> {
    for (const domain of providerReceipt.domains) {
      for (const mailbox of domain.mailboxes) {
        const entity = await this.mailboxRepository.findOneBy(workspaceId, {
          providerMailboxId: mailbox.providerMailboxId,
          normalizedAddress: mailbox.normalizedAddress,
        });
        if (!entity) {
          throw new Error('Managed mailbox projection is unavailable');
        }
        await this.messageQueueService.add(
          ActivateManagedEmailMailboxJob.name,
          { mailboxId: entity.id, workspaceId },
          {
            id: `managed-email-mailbox-activation:${entity.id}`,
            retryLimit: 3,
          },
        );
      }
    }
  }
  private async projectProviderReceipt(
    operation: ManagedEmailAcquisitionOperationEntity,
    providerReceipt: ManagedEmailProviderReceipt,
  ): Promise<void> {
    for (const domain of providerReceipt.domains) {
      const domainUpdate = await this.domainRepository.update(
        operation.workspaceId,
        { normalizedDomain: domain.normalizedDomain },
        {
          infrastructureState:
            ManagedEmailInfrastructureState.PROVISIONING_DOMAIN,
          providerDomainId: domain.providerDomainId,
          providerOrderId: domain.providerOrderId,
        },
      );
      if (domainUpdate.affected !== 1) {
        throw new Error(
          'Managed email provider receipt projection is incomplete',
        );
      }
      for (const mailbox of domain.mailboxes) {
        const mailboxUpdate = await this.mailboxRepository.update(
          operation.workspaceId,
          { normalizedAddress: mailbox.normalizedAddress },
          {
            infrastructureState:
              ManagedEmailInfrastructureState.WAITING_FOR_CREDENTIALS,
            nextReconciliationAt: this.now(),
            providerMailboxId: mailbox.providerMailboxId,
            providerOrderId: domain.providerOrderId,
          },
        );
        if (mailboxUpdate.affected !== 1) {
          throw new Error(
            'Managed email provider receipt projection is incomplete',
          );
        }
      }
    }
    for (const expectedDomain of operation.resourceSnapshot.domains) {
      if (
        expectedDomain.providerInventoryId === undefined ||
        !providerReceipt.failedInventoryIds.includes(
          expectedDomain.providerInventoryId,
        )
      ) {
        continue;
      }
      const domainUpdate = await this.domainRepository.update(
        operation.workspaceId,
        { normalizedDomain: expectedDomain.domain },
        {
          infrastructureState:
            ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
          safeFailureCode: 'ICEMAIL_PARTIAL_PURCHASE',
        },
      );
      if (domainUpdate.affected !== 1) {
        throw new Error(
          'Managed email provider receipt projection is incomplete',
        );
      }
      for (const address of expectedDomain.mailboxes) {
        const mailboxUpdate = await this.mailboxRepository.update(
          operation.workspaceId,
          { normalizedAddress: address },
          {
            campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
            infrastructureState:
              ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
            safeFailureCode: 'ICEMAIL_PARTIAL_PURCHASE',
          },
        );
        if (mailboxUpdate.affected !== 1) {
          throw new Error(
            'Managed email provider receipt projection is incomplete',
          );
        }
      }
    }
  }
  private async persistProviderReceipt(
    operation: ManagedEmailAcquisitionOperationEntity,
    providerReceipt: ManagedEmailProviderReceipt,
    partial = false,
  ): Promise<void> {
    const patch = {
      nextReconciliationAt: new Date(
        this.now().getTime() + RECONCILIATION_DELAY_MS,
      ),
      providerOutcome: partial ? 'PARTIAL' : 'SUCCEEDED',
      providerReceipt,
      safeFailureCode: partial ? 'ICEMAIL_PARTIAL_PURCHASE' : null,
      state: 'RECONCILIATION_REQUIRED',
    };
    const update = await this.operationRepository.update(
      operation.workspaceId,
      {
        id: operation.id,
        state: In(['PROVIDER_INTENT_RECORDED', 'RECONCILIATION_REQUIRED']),
      },
      patch,
    );
    if (update.affected !== 1) {
      throw new Error('Managed email provider receipt could not be persisted');
    }
    Object.assign(operation, patch);
  }
  private async completeProviderReceipt(
    operation: ManagedEmailAcquisitionOperationEntity,
    partial: boolean,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    const patch = {
      nextReconciliationAt: null,
      providerOutcome: partial ? 'PARTIAL' : 'SUCCEEDED',
      safeFailureCode: partial ? 'ICEMAIL_PARTIAL_PURCHASE' : null,
      state: partial ? 'PROVIDER_PARTIAL' : 'PROVIDER_SUCCEEDED',
    };
    const update = await this.operationRepository.update(
      operation.workspaceId,
      { id: operation.id, state: 'RECONCILIATION_REQUIRED' },
      patch,
    );
    if (update.affected !== 1) {
      return this.getOperation(operation.id, operation.workspaceId);
    }
    Object.assign(operation, patch);
    return operation;
  }

  private async projectKnownProviderFailure(
    operation: ManagedEmailAcquisitionOperationEntity,
    safeFailureCode: string,
  ): Promise<void> {
    const patch = {
      infrastructureState: ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
      nextReconciliationAt: null,
      safeFailureCode,
    };

    for (const domain of operation.resourceSnapshot.domains) {
      const domainUpdate = await this.domainRepository.update(
        operation.workspaceId,
        {
          acquisitionOperationId: operation.id,
          infrastructureState: In([
            ManagedEmailInfrastructureState.ORDERING,
            ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
          ]),
          normalizedDomain: normalize(domain.domain),
        },
        patch,
      );
      if (domainUpdate.affected !== 1) {
        throw new Error('Managed email failure projection is incomplete');
      }
      for (const address of domain.mailboxes) {
        const mailboxUpdate = await this.mailboxRepository.update(
          operation.workspaceId,
          {
            acquisitionOperationId: operation.id,
            infrastructureState: In([
              ManagedEmailInfrastructureState.ORDERING,
              ManagedEmailInfrastructureState.REPLACEMENT_REQUIRED,
            ]),
            normalizedAddress: normalize(address),
          },
          patch,
        );
        if (mailboxUpdate.affected !== 1) {
          throw new Error('Managed email failure projection is incomplete');
        }
      }
    }
  }

  private async persistFailure(
    operation: ManagedEmailAcquisitionOperationEntity,
    safeFailureCode: string,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    if (
      operation.state !== 'RECONCILIATION_REQUIRED' ||
      operation.providerOutcome !== 'FAILED' ||
      operation.safeFailureCode !== safeFailureCode
    ) {
      const journalPatch = {
        nextReconciliationAt: new Date(
          this.now().getTime() + RECONCILIATION_DELAY_MS,
        ),
        providerOutcome: 'FAILED',
        safeFailureCode,
        state: 'RECONCILIATION_REQUIRED',
      };
      const journal = await this.operationRepository.update(
        operation.workspaceId,
        {
          id: operation.id,
          state: In(['PROVIDER_INTENT_RECORDED', 'RECONCILIATION_REQUIRED']),
        },
        journalPatch,
      );
      if (journal.affected !== 1) {
        return this.getOperation(operation.id, operation.workspaceId);
      }
      Object.assign(operation, journalPatch);
    }

    await this.projectKnownProviderFailure(operation, safeFailureCode);
    const patch = {
      nextReconciliationAt: null,
      providerOutcome: 'FAILED',
      safeFailureCode,
      state: 'PROVIDER_FAILED',
    };

    const update = await this.operationRepository.update(
      operation.workspaceId,
      {
        id: operation.id,
        state: 'RECONCILIATION_REQUIRED',
        providerOutcome: 'FAILED',
        safeFailureCode,
      },
      patch,
    );
    if (update.affected !== 1) {
      return this.getOperation(operation.id, operation.workspaceId);
    }
    Object.assign(operation, patch);

    return operation;
  }

  private async scheduleReconciliation(
    operation: ManagedEmailAcquisitionOperationEntity,
    safeFailureCode: string,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    const patch = {
      nextReconciliationAt: new Date(
        this.now().getTime() + RECONCILIATION_DELAY_MS,
      ),
      providerOutcome:
        operation.providerReceipt === null
          ? 'UNKNOWN'
          : operation.providerOutcome,
      safeFailureCode,
      state: 'RECONCILIATION_REQUIRED',
    };

    const update = await this.operationRepository.update(
      operation.workspaceId,
      {
        id: operation.id,
        state: In(['PROVIDER_INTENT_RECORDED', 'RECONCILIATION_REQUIRED']),
      },
      patch,
    );
    if (update.affected !== 1) {
      return this.getOperation(operation.id, operation.workspaceId);
    }
    Object.assign(operation, patch);

    return operation;
  }

  private async getOperation(
    operationId: string,
    workspaceId: string,
  ): Promise<ManagedEmailAcquisitionOperationEntity> {
    const operation = await this.operationRepository.findOneBy(workspaceId, {
      id: operationId,
    });

    if (operation === null) {
      throw new Error('Managed email acquisition operation was not found');
    }

    return operation;
  }

  private async projectPaidEntitlements(
    operation: ManagedEmailAcquisitionOperationEntity,
  ): Promise<void> {
    const correlatedLines = operation.correlatedSubscriptionLines;

    if (correlatedLines === null) {
      throw new Error('Managed email payment correlation is incomplete');
    }

    const paidThroughFor = (
      productKey:
        | 'managed_sending_domain_year'
        | 'managed_mailbox_month'
        | 'managed_warmup_month',
    ): Date => {
      const expected = operation.expectedLineItems.find(
        (line) => line.productKey === productKey,
      );
      const correlated =
        expected === undefined
          ? undefined
          : correlatedLines.find(
              (line) => line.productId === expected.metronomeProductId,
            );
      const paidThrough =
        correlated === undefined
          ? Number.NaN
          : Date.parse(correlated.endingBefore);

      if (!Number.isFinite(paidThrough)) {
        throw new Error('Managed email payment correlation is incomplete');
      }

      return new Date(paidThrough);
    };

    if (
      !hasExactManagedEmailExpectedLineSet(
        operation.acquisitionMode,
        operation.expectedLineItems,
      )
    ) {
      throw new Error('Managed email payment correlation is incomplete');
    }
    const isCustomerOwnedDomainImport =
      operation.acquisitionMode ===
      ManagedEmailAcquisitionMode.CUSTOMER_OWNED_DOMAIN_IMPORT;
    const domainPaidThrough = isCustomerOwnedDomainImport
      ? null
      : paidThroughFor('managed_sending_domain_year');
    const mailboxPaidThrough = paidThroughFor('managed_mailbox_month');
    const warmupPaidThrough = paidThroughFor('managed_warmup_month');
    const domains = await this.domainRepository.find(operation.workspaceId, {
      where: { acquisitionOperationId: operation.id },
    });
    const mailboxes = await this.mailboxRepository.find(operation.workspaceId, {
      where: { acquisitionOperationId: operation.id },
    });

    if (domains.length === 0 || mailboxes.length === 0) {
      throw new Error('Managed email paid resources are missing');
    }

    if (domainPaidThrough !== null) {
      for (const domain of domains) {
        await this.domainRepository.update(
          operation.workspaceId,
          { id: domain.id },
          { paidThrough: domainPaidThrough },
        );
      }
    }
    for (const mailbox of mailboxes) {
      await this.mailboxRepository.update(
        operation.workspaceId,
        { id: mailbox.id },
        {
          infrastructurePaidThrough: mailboxPaidThrough,
          warmupPaidThrough,
        },
      );
    }

    const earliestPaidThrough = Math.min(
      ...(domainPaidThrough === null
        ? [mailboxPaidThrough.getTime(), warmupPaidThrough.getTime()]
        : [
            domainPaidThrough.getTime(),
            mailboxPaidThrough.getTime(),
            warmupPaidThrough.getTime(),
          ]),
    );
    const nextSubscriptionReconciliationAt = new Date(
      earliestPaidThrough - SUBSCRIPTION_RECONCILIATION_LEAD_MS,
    );
    const updated = await this.operationRepository.update(
      operation.workspaceId,
      { id: operation.id },
      { nextSubscriptionReconciliationAt },
    );

    if (updated.affected !== 1) {
      throw new Error('Managed email acquisition operation was not found');
    }
    operation.nextSubscriptionReconciliationAt =
      nextSubscriptionReconciliationAt;
  }

  private assertExactPaidEntitlement(
    operation: ManagedEmailAcquisitionOperationEntity,
  ): void {
    if (
      operation.paymentStatus !== 'PAID' ||
      operation.paymentReceipts === null ||
      operation.paymentReceipts.length === 0 ||
      operation.metronomeCustomerId === null ||
      operation.metronomeContractId === null ||
      operation.metronomeSubscriptionIds === null ||
      operation.correlatedSubscriptionLines === null ||
      !hasExactManagedEmailExpectedLineSet(
        operation.acquisitionMode,
        operation.expectedLineItems,
      ) ||
      operation.metronomeSubscriptionIds.length !==
        operation.expectedLineItems.length ||
      operation.correlatedSubscriptionLines.length !==
        operation.expectedLineItems.length ||
      new Set(
        operation.expectedLineItems.map((line) => line.metronomeProductId),
      ).size !== operation.expectedLineItems.length ||
      operation.expectedLineItems.some(
        (expectedLine) =>
          operation.correlatedSubscriptionLines?.filter(
            ({ productId }) => productId === expectedLine.metronomeProductId,
          ).length !== 1,
      )
    ) {
      throw new Error('Managed email payment correlation is incomplete');
    }
  }

  private createProviderIntentHash(
    operation: ManagedEmailAcquisitionOperationEntity,
  ): string {
    return hash({
      acquisitionMode: operation.acquisitionMode,
      metronomeContractId: operation.metronomeContractId,
      metronomeCustomerId: operation.metronomeCustomerId,
      paymentReceipts: operation.paymentReceipts,
      metronomeSubscriptionIds: operation.metronomeSubscriptionIds,
      quoteHash: operation.quoteHash,
      resourceSnapshot: operation.resourceSnapshot,
      workspaceId: operation.workspaceId,
    });
  }

  private assertNewAdmissionAllowed(
    input: AdmitManagedEmailAcquisitionInput,
  ): void {
    const allowedWorkspaceIds = this.twentyConfigService.get(
      'MANAGED_EMAIL_ALLOWED_WORKSPACE_IDS',
    );
    const hasAnyInventoryIdentity = input.quote.resourceSnapshot.domains.some(
      ({ providerInventoryId }) => providerInventoryId !== undefined,
    );
    const hasAllInventoryIdentities =
      input.quote.resourceSnapshot.domains.every(
        ({ providerInventoryId }) =>
          providerInventoryId !== undefined &&
          providerInventoryId.trim().length > 0,
      );
    const hasValidModeIdentities =
      input.acquisitionMode === ManagedEmailAcquisitionMode.PREWARMED_INVENTORY
        ? hasAllInventoryIdentities
        : !hasAnyInventoryIdentity;

    if (
      this.twentyConfigService.get('MANAGED_EMAIL_ENABLED') !== true ||
      !allowedWorkspaceIds.includes(input.workspaceId) ||
      !input.providerConfigurationKey.trim() ||
      !input.readinessPolicyVersion.trim() ||
      input.quote.workspaceId !== input.workspaceId ||
      !hasValidModeIdentities
    ) {
      throw new Error('Managed email acquisition is unavailable');
    }
  }
}
