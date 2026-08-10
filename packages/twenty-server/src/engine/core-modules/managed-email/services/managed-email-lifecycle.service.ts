import { PermissionFlagType } from 'twenty-shared/constants';
import { Inject, Injectable } from '@nestjs/common';
import { addMonths, addYears } from 'date-fns';
import { DataSource, type EntityManager } from 'typeorm';

import { ManagedEmailAcquisitionOperationEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-mailbox.entity';
import { ManagedEmailCampaignEligibility } from 'src/engine/core-modules/managed-email/enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from 'src/engine/core-modules/managed-email/enums/managed-email-infrastructure-state.enum';
import { ManagedEmailLifecycleAction } from 'src/engine/core-modules/managed-email/enums/managed-email-lifecycle-action.enum';
import { ManagedEmailWarmupState } from 'src/engine/core-modules/managed-email/enums/managed-email-warmup-state.enum';
import {
  IcemailException,
  IcemailExceptionCode,
} from 'src/engine/core-modules/managed-email/providers/icemail/icemail.exception';
import { IcemailClient } from 'src/engine/core-modules/managed-email/providers/icemail/icemail.client';
import { type IcemailDomainDetail } from 'src/engine/core-modules/managed-email/providers/icemail/icemail.types';
import {
  WarmupInboxException,
  WarmupInboxExceptionCode,
} from 'src/engine/core-modules/managed-email/providers/warmup-inbox/warmup-inbox.exception';
import { WarmupInboxClient } from 'src/engine/core-modules/managed-email/providers/warmup-inbox/warmup-inbox.client';
import {
  type ManagedEmailExpectedLineItem,
  type ManagedEmailRenewalProjection,
} from 'src/engine/core-modules/managed-email/types/managed-email-persistence.type';
import { MetronomeClientService } from 'src/engine/core-modules/managed-provider-billing/services/metronome-client.service';
import {
  type ExpectedMetronomeSubscriptionLine,
  type ExpectedPaidMetronomeInvoice,
} from 'src/engine/core-modules/managed-provider-billing/types/metronome-subscription.type';
import {
  matchExactMetronomeInvoice,
  matchExactPaidMetronomeInvoice,
} from 'src/engine/core-modules/managed-provider-billing/utils/match-exact-paid-metronome-invoice.util';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

export const MANAGED_EMAIL_LIFECYCLE_CLOCK = Symbol(
  'MANAGED_EMAIL_LIFECYCLE_CLOCK',
);

const INVOICE_LEAD_MS = 2 * 60 * 60 * 1_000;
const RECONCILIATION_RETRY_MS = 5 * 60 * 1_000;

export type ManagedEmailPeriodBoundaryInput = Readonly<{
  resourceId: string;
  resourceType: 'domain' | 'mailbox';
  workspaceId: string;
}>;

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
type MailboxLifecyclePatch = Partial<
  Pick<
    ManagedEmailMailboxEntity,
    | 'campaignEligibility'
    | 'infrastructureCancelAtPeriodEnd'
    | 'nextPeriodBoundaryAt'
    | 'pendingLifecycleAction'
    | 'pendingLifecycleKey'
    | 'warmupCancelAtPeriodEnd'
    | 'warmupState'
  >
>;

type RenewalResource =
  | {
      kind: 'domain';
      paidThrough: Date;
      resource: ManagedEmailDomainEntity;
      subscriptionId: string;
      template: ManagedEmailExpectedLineItem;
    }
  | {
      kind: 'mailbox';
      paidThrough: Date;
      resource: ManagedEmailMailboxEntity;
      subscriptionId: string;
      template: ManagedEmailExpectedLineItem;
    }
  | {
      kind: 'warmup';
      paidThrough: Date;
      resource: ManagedEmailMailboxEntity;
      subscriptionId: string;
      template: ManagedEmailExpectedLineItem;
    };

type RenewalGroup = {
  endingBefore: Date;
  line: ExpectedMetronomeSubscriptionLine;
  resources: RenewalResource[];
  startingAt: Date;
};

@Injectable()
export class ManagedEmailLifecycleService {
  constructor(
    @InjectWorkspaceScopedRepository(ManagedEmailMailboxEntity)
    private readonly mailboxRepository: WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    @InjectWorkspaceScopedRepository(ManagedEmailDomainEntity)
    private readonly domainRepository: WorkspaceScopedRepository<ManagedEmailDomainEntity>,
    @InjectWorkspaceScopedRepository(ManagedEmailAcquisitionOperationEntity)
    private readonly acquisitionOperationRepository: WorkspaceScopedRepository<ManagedEmailAcquisitionOperationEntity>,
    private readonly dataSource: DataSource,
    private readonly metronomeClientService: MetronomeClientService,
    private readonly warmupInboxClient: WarmupInboxClient,
    private readonly icemailClient: IcemailClient,
    private readonly permissionsService: PermissionsService,
    @Inject(MANAGED_EMAIL_LIFECYCLE_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reconcileSubscriptions({
    operationId,
    workspaceId,
  }: {
    operationId: string;
    workspaceId: string;
  }): Promise<void> {
    this.validateId(workspaceId, 'workspace');
    this.validateId(operationId, 'operation');

    const operation = await this.acquisitionOperationRepository.findOneBy(
      workspaceId,
      { id: operationId },
    );
    if (operation === null) {
      throw new Error('Managed email acquisition operation was not found');
    }

    await this.withSubscriptionLocks(
      workspaceId,
      operation.metronomeSubscriptionIds ?? [],
      async () => {
        const lockedOperation =
          await this.acquisitionOperationRepository.findOneBy(workspaceId, {
            id: operationId,
          });
        if (lockedOperation === null) {
          throw new Error('Managed email acquisition operation was not found');
        }
        await this.reconcileSubscriptionsUnderLock(lockedOperation);
      },
    );
  }

  private async reconcileSubscriptionsUnderLock(
    operation: ManagedEmailAcquisitionOperationEntity,
  ): Promise<void> {
    const { workspaceId } = operation;
    if (operation.pendingRenewalProjection !== null) {
      await this.completePendingRenewalProjection(
        operation,
        operation.pendingRenewalProjection,
      );
    }

    const [domains, mailboxes] = await Promise.all([
      this.domainRepository.find(workspaceId, {
        where: { acquisitionOperationId: operation.id },
      }),
      this.mailboxRepository.find(workspaceId, {
        where: { acquisitionOperationId: operation.id },
      }),
    ]);
    const now = this.now();
    const resources = this.collectRenewalResources(
      operation,
      domains,
      mailboxes,
      now,
    );

    if (resources.length === 0) {
      await this.scheduleNextSubscriptionReconciliation(
        operation,
        domains,
        mailboxes,
        now,
      );
      return;
    }
    if (
      operation.metronomeCustomerId === null ||
      operation.metronomeContractId === null ||
      operation.metronomeRateCardId.trim() === ''
    ) {
      throw new Error('Managed email billing identity is incomplete');
    }

    const groups = this.groupRenewalResources(resources);
    const startingAt = new Date(
      Math.min(...groups.map((group) => group.startingAt.getTime())),
    );
    const endingBefore = new Date(
      Math.max(...groups.map((group) => group.endingBefore.getTime())),
    );
    const rateCard = await this.metronomeClientService.getRateCard(
      operation.metronomeRateCardId,
    );
    if (
      rateCard.id !== operation.metronomeRateCardId ||
      rateCard.fiatCreditType === null ||
      rateCard.fiatCreditType.name !== 'USD' ||
      rateCard.fiatCreditType.id.trim() === ''
    ) {
      throw new Error('Managed email renewal rate card is not USD');
    }

    const expected: ExpectedPaidMetronomeInvoice = {
      contractId: operation.metronomeContractId,
      customerId: operation.metronomeCustomerId,
      endingBefore: endingBefore.toISOString(),
      lines: groups.map(({ line }) => line),
      startingAt: startingAt.toISOString(),
      total: groups.reduce((sum, { line }) => sum + line.total, 0),
      usdRateCardProof: {
        contractId: operation.metronomeContractId,
        fiatCreditTypeId: rateCard.fiatCreditType.id,
        fiatCreditTypeName: rateCard.fiatCreditType.name,
        rateCardId: rateCard.id,
      },
    };
    const page = await this.metronomeClientService.listInvoicesFirstPage({
      contractId: operation.metronomeContractId,
      customerId: operation.metronomeCustomerId,
      endingBefore: endingBefore.toISOString(),
      startingOn: startingAt.toISOString(),
    });
    const paidReceipt = matchExactPaidMetronomeInvoice(page, expected);

    if (paidReceipt !== null) {
      const projection = this.createRenewalProjection(paidReceipt, groups);

      await this.acquisitionOperationRepository.update(
        workspaceId,
        { id: operation.id },
        {
          externalInvoiceId: paidReceipt.externalInvoiceId,
          externalPaymentId: paidReceipt.externalPaymentId,
          metronomeInvoiceId: paidReceipt.invoiceId,
          paymentStatus: 'PAID',
          pendingRenewalProjection: projection,
        },
      );
      operation.pendingRenewalProjection = projection;
      await this.completePendingRenewalProjection(operation, projection);
    } else if (
      matchExactMetronomeInvoice(page, expected, 'PAYMENT_FAILED') !== null
    ) {
      await this.applyPaymentFailure(workspaceId, groups);
      await this.acquisitionOperationRepository.update(
        workspaceId,
        { id: operation.id },
        { paymentStatus: 'PAYMENT_FAILED' },
      );
    }

    await this.scheduleNextSubscriptionReconciliation(
      operation,
      domains,
      mailboxes,
      now,
    );
  }

  async cancelWarmupAtPeriodEnd(input: MailboxActionInput): Promise<void> {
    await this.validateActionInput(input);
    const mailbox = await this.requireMailbox(
      input.workspaceId,
      input.mailboxId,
    );
    this.requireFuturePaidThrough(mailbox.warmupPaidThrough, 'warmup');
    this.requireSubscriptionId(mailbox.metronomeWarmupSubscriptionId, 'warmup');

    await this.cancelMailboxSubscriptionAtPeriodEnd(
      mailbox,
      input.idempotencyKey,
      'warmup',
    );
  }

  async pauseWarmupNow(input: MailboxActionInput): Promise<void> {
    await this.validateActionInput(input);
    const mailbox = await this.requireMailbox(
      input.workspaceId,
      input.mailboxId,
    );
    this.requireProviderId(mailbox.warmupEnrollmentId, 'warmup enrollment');

    await this.persistMailboxIntent(mailbox, {
      nextPeriodBoundaryAt: this.now(),
      pendingLifecycleAction: ManagedEmailLifecycleAction.PAUSE_WARMUP_NOW,
      pendingLifecycleKey: input.idempotencyKey,
    });
    await this.pauseWarmupAtBoundary(mailbox);
  }

  async resumeWarmup(input: MailboxActionInput): Promise<void> {
    await this.validateActionInput(input);
    const mailbox = await this.requireMailbox(
      input.workspaceId,
      input.mailboxId,
    );
    this.requireFuturePaidThrough(mailbox.warmupPaidThrough, 'warmup');
    if (mailbox.warmupCancelAtPeriodEnd) {
      throw new Error('Managed email warmup renewal is cancelled');
    }
    this.requireProviderId(mailbox.warmupEnrollmentId, 'warmup enrollment');

    await this.persistMailboxIntent(mailbox, {
      nextPeriodBoundaryAt: this.now(),
      pendingLifecycleAction: ManagedEmailLifecycleAction.RESUME_WARMUP,
      pendingLifecycleKey: input.idempotencyKey,
    });
    await this.resumeWarmupAtBoundary(mailbox);
  }

  async stopMailboxAtPeriodEnd(input: MailboxActionInput): Promise<void> {
    await this.validateActionInput(input);
    const mailbox = await this.requireMailbox(
      input.workspaceId,
      input.mailboxId,
    );
    this.requireFuturePaidThrough(mailbox.infrastructurePaidThrough, 'mailbox');
    this.requireSubscriptionId(
      mailbox.metronomeMailboxSubscriptionId,
      'mailbox',
    );

    const warmupCancellationKey = `stop-mailbox-warmup:${input.idempotencyKey}`;
    if (
      mailbox.pendingLifecycleAction ===
        ManagedEmailLifecycleAction.CANCEL_WARMUP_SUBSCRIPTION_PENDING &&
      mailbox.pendingLifecycleKey === warmupCancellationKey
    ) {
      await this.recoverWarmupSubscriptionCancellation(mailbox);
    }
    if (
      mailbox.warmupState !== ManagedEmailWarmupState.NOT_APPLICABLE &&
      !mailbox.warmupCancelAtPeriodEnd
    ) {
      await this.cancelMailboxSubscriptionAtPeriodEnd(
        mailbox,
        warmupCancellationKey,
        'warmup',
      );
    }

    await this.cancelMailboxSubscriptionAtPeriodEnd(
      mailbox,
      input.idempotencyKey,
      'mailbox',
      {
        pendingLifecycleAction:
          ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END,
        pendingLifecycleKey: warmupCancellationKey,
      },
    );
  }

  private async cancelMailboxSubscriptionAtPeriodEnd(
    mailbox: ManagedEmailMailboxEntity,
    idempotencyKey: string,
    resourceType: 'mailbox' | 'warmup',
    allowedPendingIntent?: Pick<
      ManagedEmailMailboxEntity,
      'pendingLifecycleAction' | 'pendingLifecycleKey'
    >,
  ): Promise<void> {
    const operation = await this.acquisitionOperationRepository.findOneBy(
      mailbox.workspaceId,
      { id: mailbox.acquisitionOperationId },
    );
    if (operation === null) {
      throw new Error('Managed email acquisition operation was not found');
    }
    const subscriptionId = this.requireSubscriptionId(
      resourceType === 'mailbox'
        ? mailbox.metronomeMailboxSubscriptionId
        : mailbox.metronomeWarmupSubscriptionId,
      resourceType,
    );

    const pendingMailbox = await this.withSubscriptionLocks(
      mailbox.workspaceId,
      [...(operation.metronomeSubscriptionIds ?? []), subscriptionId],
      async (manager) => {
        const operationRepository =
          this.acquisitionOperationRepository.withManager(manager);
        const lockedOperation = await operationRepository.findOneBy(
          mailbox.workspaceId,
          { id: mailbox.acquisitionOperationId },
        );
        if (lockedOperation === null) {
          throw new Error('Managed email acquisition operation was not found');
        }
        await this.reconcileSubscriptionsUnderLock(lockedOperation);

        const mailboxRepository = this.mailboxRepository.withManager(manager);
        const currentMailbox = await mailboxRepository.findOneBy(
          mailbox.workspaceId,
          { id: mailbox.id },
        );
        if (currentMailbox === null) {
          throw new Error('Managed email mailbox was not found');
        }
        const currentSubscriptionId = this.requireSubscriptionId(
          resourceType === 'mailbox'
            ? currentMailbox.metronomeMailboxSubscriptionId
            : currentMailbox.metronomeWarmupSubscriptionId,
          resourceType,
        );
        if (currentSubscriptionId !== subscriptionId) {
          throw new Error('Managed email billing identity changed');
        }
        this.requireFuturePaidThrough(
          resourceType === 'mailbox'
            ? currentMailbox.infrastructurePaidThrough
            : currentMailbox.warmupPaidThrough,
          resourceType,
        );

        const patch: MailboxLifecyclePatch =
          resourceType === 'mailbox'
            ? {
                infrastructureCancelAtPeriodEnd: true,
                nextPeriodBoundaryAt: this.now(),
                pendingLifecycleAction:
                  ManagedEmailLifecycleAction.STOP_MAILBOX_SUBSCRIPTION_PENDING,
                pendingLifecycleKey: idempotencyKey,
              }
            : {
                nextPeriodBoundaryAt: this.now(),
                pendingLifecycleAction:
                  ManagedEmailLifecycleAction.CANCEL_WARMUP_SUBSCRIPTION_PENDING,
                pendingLifecycleKey: idempotencyKey,
                warmupCancelAtPeriodEnd: true,
              };

        return this.persistMailboxIntentWithManager(
          currentMailbox,
          patch,
          manager,
          allowedPendingIntent,
        );
      },
    );
    Object.assign(mailbox, pendingMailbox);

    if (resourceType === 'mailbox') {
      await this.recoverMailboxSubscriptionCancellation(mailbox);
    } else {
      await this.recoverWarmupSubscriptionCancellation(mailbox);
    }
  }

  async disableDomainRenewal(input: DomainActionInput): Promise<void> {
    await this.validateActionInput(input);
    const domain = await this.requireDomain(input.workspaceId, input.domainId);
    this.requireFuturePaidThrough(domain.paidThrough, 'domain');
    const subscriptionId = this.requireSubscriptionId(
      domain.metronomeSubscriptionId,
      'domain',
    );
    const operation = await this.acquisitionOperationRepository.findOneBy(
      domain.workspaceId,
      { id: domain.acquisitionOperationId },
    );
    if (operation === null) {
      throw new Error('Managed email acquisition operation was not found');
    }

    const pendingDomain = await this.withSubscriptionLocks(
      domain.workspaceId,
      [...(operation.metronomeSubscriptionIds ?? []), subscriptionId],
      async (manager) => {
        const operationRepository =
          this.acquisitionOperationRepository.withManager(manager);
        const lockedOperation = await operationRepository.findOneBy(
          domain.workspaceId,
          { id: domain.acquisitionOperationId },
        );
        if (lockedOperation === null) {
          throw new Error('Managed email acquisition operation was not found');
        }
        await this.reconcileSubscriptionsUnderLock(lockedOperation);

        const domainRepository = this.domainRepository.withManager(manager);
        const mailboxRepository = this.mailboxRepository.withManager(manager);
        const currentDomain = await domainRepository.findOne(
          domain.workspaceId,
          {
            lock: { mode: 'pessimistic_write' },
            where: { id: domain.id },
          },
        );
        if (currentDomain === null) {
          throw new Error('Managed email domain was not found');
        }
        const dependents = await mailboxRepository.find(domain.workspaceId, {
          where: { managedEmailDomainId: domain.id },
        });
        if (
          dependents.some((mailbox) => !mailbox.infrastructureCancelAtPeriodEnd)
        ) {
          throw new Error(
            'Managed email domain has active dependent mailboxes',
          );
        }
        this.requireFuturePaidThrough(currentDomain.paidThrough, 'domain');
        if (currentDomain.metronomeSubscriptionId !== subscriptionId) {
          throw new Error('Managed email billing identity changed');
        }
        const pendingSlotIsEmpty =
          currentDomain.pendingLifecycleAction === null &&
          currentDomain.pendingLifecycleKey === null;
        const isIdempotentReplay =
          currentDomain.pendingLifecycleAction ===
            ManagedEmailLifecycleAction.DISABLE_DOMAIN_SUBSCRIPTION_PENDING &&
          currentDomain.pendingLifecycleKey === input.idempotencyKey;
        if (!pendingSlotIsEmpty && !isIdempotentReplay) {
          throw new Error('Managed email domain has another pending action');
        }

        const patch = {
          cancelAtPeriodEnd: true,
          nextPeriodBoundaryAt: this.now(),
          pendingLifecycleAction:
            ManagedEmailLifecycleAction.DISABLE_DOMAIN_SUBSCRIPTION_PENDING,
          pendingLifecycleKey: input.idempotencyKey,
          renewalEnabled: false,
        };
        const result = await domainRepository.update(
          domain.workspaceId,
          { id: domain.id },
          patch,
        );
        if (result.affected !== 1) {
          throw new Error('Managed email domain intent was not persisted');
        }
        Object.assign(currentDomain, patch);
        return currentDomain;
      },
    );
    Object.assign(domain, pendingDomain);

    await this.recoverDomainSubscriptionCancellation(domain);
  }

  async applyPeriodBoundary(
    input: ManagedEmailPeriodBoundaryInput,
  ): Promise<void> {
    this.validateId(input.workspaceId, 'workspace');
    this.validateId(input.resourceId, input.resourceType);

    if (input.resourceType === 'domain') {
      await this.applyDomainBoundary(input.workspaceId, input.resourceId);
      return;
    }
    await this.applyMailboxBoundary(input.workspaceId, input.resourceId);
  }

  private collectRenewalResources(
    operation: ManagedEmailAcquisitionOperationEntity,
    domains: ManagedEmailDomainEntity[],
    mailboxes: ManagedEmailMailboxEntity[],
    now: Date,
  ): RenewalResource[] {
    const templates = new Map(
      operation.expectedLineItems.map((line) => [line.productKey, line]),
    );
    const resources: RenewalResource[] = [];

    for (const domain of domains) {
      if (
        domain.renewalEnabled &&
        !domain.cancelAtPeriodEnd &&
        this.isDue(domain.paidThrough, now) &&
        domain.metronomeSubscriptionId !== null
      ) {
        resources.push({
          kind: 'domain',
          paidThrough: domain.paidThrough!,
          resource: domain,
          subscriptionId: domain.metronomeSubscriptionId,
          template: this.requireTemplate(
            templates,
            'managed_sending_domain_year',
          ),
        });
      }
    }
    for (const mailbox of mailboxes) {
      if (
        !mailbox.infrastructureCancelAtPeriodEnd &&
        this.isDue(mailbox.infrastructurePaidThrough, now) &&
        mailbox.metronomeMailboxSubscriptionId !== null
      ) {
        resources.push({
          kind: 'mailbox',
          paidThrough: mailbox.infrastructurePaidThrough!,
          resource: mailbox,
          subscriptionId: mailbox.metronomeMailboxSubscriptionId,
          template: this.requireTemplate(templates, 'managed_mailbox_month'),
        });
      }
      if (
        !mailbox.warmupCancelAtPeriodEnd &&
        this.isDue(mailbox.warmupPaidThrough, now) &&
        mailbox.metronomeWarmupSubscriptionId !== null
      ) {
        resources.push({
          kind: 'warmup',
          paidThrough: mailbox.warmupPaidThrough!,
          resource: mailbox,
          subscriptionId: mailbox.metronomeWarmupSubscriptionId,
          template: this.requireTemplate(templates, 'managed_warmup_month'),
        });
      }
    }

    return resources;
  }

  private groupRenewalResources(resources: RenewalResource[]): RenewalGroup[] {
    const grouped = new Map<string, RenewalResource[]>();
    for (const resource of resources) {
      const key = `${resource.kind}:${resource.subscriptionId}:${resource.paidThrough.toISOString()}`;
      grouped.set(key, [...(grouped.get(key) ?? []), resource]);
    }

    return [...grouped.values()].map((groupResources) => {
      const first = groupResources[0];
      const endingBefore = this.nextPeriod(
        first.paidThrough,
        first.kind === 'domain' ? 'ANNUAL' : 'MONTHLY',
      );
      const quantity = groupResources.length;

      return {
        endingBefore,
        line: {
          endingBefore: endingBefore.toISOString(),
          isProrated: false,
          productId: first.template.metronomeProductId,
          quantity,
          startingAt: first.paidThrough.toISOString(),
          subscriptionId: first.subscriptionId,
          total: first.template.unitPriceCents * quantity,
          unitPrice: first.template.unitPriceCents,
        },
        resources: groupResources,
        startingAt: first.paidThrough,
      };
    });
  }

  private createRenewalProjection(
    receipt: NonNullable<ReturnType<typeof matchExactPaidMetronomeInvoice>>,
    groups: RenewalGroup[],
  ): ManagedEmailRenewalProjection {
    return {
      receipt: {
        externalInvoiceId: receipt.externalInvoiceId,
        externalPaymentId: receipt.externalPaymentId,
        metronomeInvoiceId: receipt.invoiceId,
      },
      resources: groups.flatMap((group) =>
        group.resources.map((renewal) => ({
          kind: renewal.kind,
          paidThrough: group.endingBefore.toISOString(),
          resourceId: renewal.resource.id,
        })),
      ),
    };
  }

  private async completePendingRenewalProjection(
    operation: ManagedEmailAcquisitionOperationEntity,
    projection: ManagedEmailRenewalProjection,
  ): Promise<void> {
    for (const target of projection.resources) {
      const paidThrough = new Date(target.paidThrough);

      if (target.kind === 'domain') {
        const domain = await this.requireDomain(
          operation.workspaceId,
          target.resourceId,
        );
        const clearsPaymentFailure =
          !domain.cancelAtPeriodEnd &&
          domain.pendingLifecycleAction ===
            ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL;
        const patch = {
          infrastructureState: ManagedEmailInfrastructureState.ACTIVE,
          paidThrough: this.maxDate(domain.paidThrough, paidThrough),
          safeFailureCode: null,
          ...(clearsPaymentFailure
            ? {
                nextPeriodBoundaryAt: null,
                pendingLifecycleAction: null,
                pendingLifecycleKey: null,
              }
            : {}),
        };

        await this.domainRepository.update(
          operation.workspaceId,
          { id: domain.id },
          patch,
        );
        Object.assign(domain, patch);
        continue;
      }

      const mailbox = await this.requireMailbox(
        operation.workspaceId,
        target.resourceId,
      );
      if (target.kind === 'mailbox') {
        const clearsPaymentFailure =
          !mailbox.infrastructureCancelAtPeriodEnd &&
          mailbox.pendingLifecycleAction ===
            ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END;
        const patch = {
          infrastructurePaidThrough: this.maxDate(
            mailbox.infrastructurePaidThrough,
            paidThrough,
          ),
          infrastructureState: ManagedEmailInfrastructureState.ACTIVE,
          safeFailureCode: null,
          ...(clearsPaymentFailure
            ? {
                nextPeriodBoundaryAt: null,
                pendingLifecycleAction: null,
                pendingLifecycleKey: null,
              }
            : {}),
        };

        await this.mailboxRepository.update(
          operation.workspaceId,
          { id: mailbox.id },
          patch,
        );
        Object.assign(mailbox, patch);
        continue;
      }

      const warmupState =
        mailbox.warmupState === ManagedEmailWarmupState.PAUSED
          ? ManagedEmailWarmupState.PAUSED
          : ManagedEmailWarmupState.MAINTENANCE;
      const clearsPaymentFailure =
        !mailbox.warmupCancelAtPeriodEnd &&
        mailbox.pendingLifecycleAction ===
          ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END;
      const patch = {
        safeFailureCode: null,
        warmupPaidThrough: this.maxDate(mailbox.warmupPaidThrough, paidThrough),
        warmupState,
        ...(clearsPaymentFailure
          ? {
              nextPeriodBoundaryAt: null,
              pendingLifecycleAction: null,
              pendingLifecycleKey: null,
            }
          : {}),
      };

      await this.mailboxRepository.update(
        operation.workspaceId,
        { id: mailbox.id },
        patch,
      );
      Object.assign(mailbox, patch);
    }

    await this.acquisitionOperationRepository.update(
      operation.workspaceId,
      { id: operation.id },
      { pendingRenewalProjection: null },
    );
    operation.pendingRenewalProjection = null;
  }

  private async applyPaymentFailure(
    workspaceId: string,
    groups: RenewalGroup[],
  ): Promise<void> {
    const failedMailboxes = new Map<
      string,
      {
        mailbox: ManagedEmailMailboxEntity;
        mailboxFailed: boolean;
        warmupFailed: boolean;
      }
    >();

    for (const renewal of groups.flatMap((group) => group.resources)) {
      if (renewal.kind === 'domain') {
        const patch = {
          infrastructureState: ManagedEmailInfrastructureState.PAYMENT_REQUIRED,
          nextPeriodBoundaryAt: renewal.paidThrough,
          pendingLifecycleAction:
            ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL,
          pendingLifecycleKey: `payment-failed:${renewal.subscriptionId}:${renewal.paidThrough.toISOString()}`,
          safeFailureCode: 'PAYMENT_FAILED',
        };

        await this.domainRepository.update(
          workspaceId,
          { id: renewal.resource.id },
          patch,
        );
        Object.assign(renewal.resource, patch);
        continue;
      }

      const current = failedMailboxes.get(renewal.resource.id) ?? {
        mailbox: renewal.resource,
        mailboxFailed: false,
        warmupFailed: false,
      };
      current.mailboxFailed ||= renewal.kind === 'mailbox';
      current.warmupFailed ||= renewal.kind === 'warmup';
      failedMailboxes.set(renewal.resource.id, current);
    }

    for (const {
      mailbox,
      mailboxFailed,
      warmupFailed,
    } of failedMailboxes.values()) {
      const paidThrough = mailboxFailed
        ? mailbox.infrastructurePaidThrough
        : mailbox.warmupPaidThrough;
      if (paidThrough === null) {
        throw new Error('Managed email paid-through boundary is missing');
      }
      const pendingLifecycleAction = mailboxFailed
        ? ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END
        : ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END;
      const patch = {
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
        nextPeriodBoundaryAt: paidThrough,
        pendingLifecycleAction,
        pendingLifecycleKey: `payment-failed:${mailbox.id}:${paidThrough.toISOString()}`,
        safeFailureCode: 'PAYMENT_FAILED',
        ...(mailboxFailed
          ? {
              infrastructureState:
                ManagedEmailInfrastructureState.PAYMENT_REQUIRED,
            }
          : {}),
        ...(warmupFailed
          ? { warmupState: ManagedEmailWarmupState.ACTION_REQUIRED }
          : {}),
      };

      await this.mailboxRepository.update(
        workspaceId,
        { id: mailbox.id },
        patch,
      );
      Object.assign(mailbox, patch);
    }
  }

  private async scheduleNextSubscriptionReconciliation(
    operation: ManagedEmailAcquisitionOperationEntity,
    domains: ManagedEmailDomainEntity[],
    mailboxes: ManagedEmailMailboxEntity[],
    now: Date,
  ): Promise<void> {
    const boundaries = [
      ...domains
        .filter((domain) => domain.renewalEnabled && !domain.cancelAtPeriodEnd)
        .map((domain) => domain.paidThrough),
      ...mailboxes
        .filter((mailbox) => !mailbox.infrastructureCancelAtPeriodEnd)
        .map((mailbox) => mailbox.infrastructurePaidThrough),
      ...mailboxes
        .filter((mailbox) => !mailbox.warmupCancelAtPeriodEnd)
        .map((mailbox) => mailbox.warmupPaidThrough),
    ].filter((value): value is Date => value !== null);
    const earliest =
      boundaries.length === 0
        ? null
        : new Date(Math.min(...boundaries.map((value) => value.getTime())));
    const earliestPoll =
      earliest === null
        ? null
        : new Date(
            Math.max(
              earliest.getTime() - INVOICE_LEAD_MS,
              now.getTime() + RECONCILIATION_RETRY_MS,
            ),
          );

    await this.acquisitionOperationRepository.update(
      operation.workspaceId,
      { id: operation.id },
      { nextSubscriptionReconciliationAt: earliestPoll },
    );
  }

  private async withSubscriptionLocks<T>(
    workspaceId: string,
    subscriptionIds: readonly string[],
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const orderedSubscriptionIds = [...new Set(subscriptionIds)].sort();

    return this.dataSource.transaction(async (manager) => {
      for (const subscriptionId of orderedSubscriptionIds) {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`managed-email:${workspaceId}:${subscriptionId}`],
        );
      }

      return work(manager);
    });
  }

  private async scheduleRemainingQuantity(input: {
    idempotencyKey: string;
    operationId: string;
    resourceId: string;
    resourceType: 'domain' | 'mailbox' | 'warmup';
    subscriptionId: string;
    workspaceId: string;
  }): Promise<Date> {
    return this.withSubscriptionLocks(
      input.workspaceId,
      [input.subscriptionId],
      (manager) => this.scheduleRemainingQuantityUnderLock(input, manager),
    );
  }

  private async scheduleRemainingQuantityUnderLock(
    {
      idempotencyKey,
      operationId,
      resourceId,
      resourceType,
      subscriptionId,
      workspaceId,
    }: {
      idempotencyKey: string;
      operationId: string;
      resourceId: string;
      resourceType: 'domain' | 'mailbox' | 'warmup';
      subscriptionId: string;
      workspaceId: string;
    },
    manager: EntityManager,
  ): Promise<Date> {
    const operationRepository =
      this.acquisitionOperationRepository.withManager(manager);
    const domainRepository = this.domainRepository.withManager(manager);
    const mailboxRepository = this.mailboxRepository.withManager(manager);
    const operation = await operationRepository.findOneBy(workspaceId, {
      id: operationId,
    });
    if (
      operation === null ||
      operation.metronomeCustomerId === null ||
      operation.metronomeContractId === null
    ) {
      throw new Error('Managed email billing identity is incomplete');
    }

    let effectiveAt: Date | null;
    let pendingLifecycleAction: ManagedEmailLifecycleAction | null;
    let pendingLifecycleKey: string | null;
    let persistedSubscriptionId: string | null;
    if (resourceType === 'domain') {
      const domain = await domainRepository.findOneBy(workspaceId, {
        id: resourceId,
      });
      if (domain === null) {
        throw new Error('Managed email domain was not found');
      }
      effectiveAt = domain.paidThrough;
      pendingLifecycleAction = domain.pendingLifecycleAction;
      pendingLifecycleKey = domain.pendingLifecycleKey;
      persistedSubscriptionId = domain.metronomeSubscriptionId;
    } else {
      const mailbox = await mailboxRepository.findOneBy(workspaceId, {
        id: resourceId,
      });
      if (mailbox === null) {
        throw new Error('Managed email mailbox was not found');
      }
      effectiveAt =
        resourceType === 'mailbox'
          ? mailbox.infrastructurePaidThrough
          : mailbox.warmupPaidThrough;
      pendingLifecycleAction = mailbox.pendingLifecycleAction;
      pendingLifecycleKey = mailbox.pendingLifecycleKey;
      persistedSubscriptionId =
        resourceType === 'mailbox'
          ? mailbox.metronomeMailboxSubscriptionId
          : mailbox.metronomeWarmupSubscriptionId;
    }
    const expectedPendingAction =
      resourceType === 'domain'
        ? ManagedEmailLifecycleAction.DISABLE_DOMAIN_SUBSCRIPTION_PENDING
        : resourceType === 'mailbox'
          ? ManagedEmailLifecycleAction.STOP_MAILBOX_SUBSCRIPTION_PENDING
          : ManagedEmailLifecycleAction.CANCEL_WARMUP_SUBSCRIPTION_PENDING;
    if (
      pendingLifecycleAction !== expectedPendingAction ||
      pendingLifecycleKey !== idempotencyKey
    ) {
      throw new Error('Managed email lifecycle intent changed');
    }
    if (persistedSubscriptionId !== subscriptionId || effectiveAt === null) {
      throw new Error('Managed email billing identity is incomplete');
    }

    const quantity = await this.countRemainingSubscriptionResources(
      {
        operationId,
        resourceType,
        subscriptionId,
        workspaceId,
      },
      domainRepository,
      mailboxRepository,
    );

    await this.metronomeClientService.scheduleSubscriptionQuantity({
      contractId: operation.metronomeContractId,
      customerId: operation.metronomeCustomerId,
      effectiveAt: effectiveAt.toISOString(),
      quantity,
      subscriptionId,
      uniquenessKey: `managed-email-lifecycle:${resourceId}:${idempotencyKey}`,
    });

    const nextLifecycleAction =
      resourceType === 'domain'
        ? ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL
        : resourceType === 'mailbox'
          ? ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END
          : ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END;
    const result =
      resourceType === 'domain'
        ? await domainRepository.update(
            workspaceId,
            { id: resourceId },
            {
              nextPeriodBoundaryAt: effectiveAt,
              pendingLifecycleAction: nextLifecycleAction,
            },
          )
        : await mailboxRepository.update(
            workspaceId,
            { id: resourceId },
            {
              nextPeriodBoundaryAt: effectiveAt,
              pendingLifecycleAction: nextLifecycleAction,
            },
          );
    if (result.affected !== 1) {
      throw new Error('Managed email lifecycle boundary was not persisted');
    }

    return effectiveAt;
  }

  private async countRemainingSubscriptionResources(
    {
      operationId,
      resourceType,
      subscriptionId,
      workspaceId,
    }: {
      operationId: string;
      resourceType: 'domain' | 'mailbox' | 'warmup';
      subscriptionId: string;
      workspaceId: string;
    },
    domainRepository: WorkspaceScopedRepository<ManagedEmailDomainEntity>,
    mailboxRepository: WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
  ): Promise<number> {
    if (resourceType === 'domain') {
      const domains = await domainRepository.find(workspaceId, {
        where: { acquisitionOperationId: operationId },
      });

      return domains.filter(
        (domain) =>
          domain.metronomeSubscriptionId === subscriptionId &&
          domain.renewalEnabled &&
          !domain.cancelAtPeriodEnd,
      ).length;
    }

    const mailboxes = await mailboxRepository.find(workspaceId, {
      where: { acquisitionOperationId: operationId },
    });

    return mailboxes.filter((mailbox) =>
      resourceType === 'mailbox'
        ? mailbox.metronomeMailboxSubscriptionId === subscriptionId &&
          !mailbox.infrastructureCancelAtPeriodEnd
        : mailbox.metronomeWarmupSubscriptionId === subscriptionId &&
          !mailbox.warmupCancelAtPeriodEnd,
    ).length;
  }

  private async recoverWarmupSubscriptionCancellation(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<void> {
    if (
      mailbox.pendingLifecycleAction !==
      ManagedEmailLifecycleAction.CANCEL_WARMUP_SUBSCRIPTION_PENDING
    ) {
      return;
    }
    const idempotencyKey = this.requireLifecycleKey(
      mailbox.pendingLifecycleKey,
    );
    const effectiveAt = await this.scheduleRemainingQuantity({
      idempotencyKey,
      operationId: mailbox.acquisitionOperationId,
      resourceId: mailbox.id,
      resourceType: 'warmup',
      subscriptionId: this.requireSubscriptionId(
        mailbox.metronomeWarmupSubscriptionId,
        'warmup',
      ),
      workspaceId: mailbox.workspaceId,
    });

    Object.assign(mailbox, {
      nextPeriodBoundaryAt: effectiveAt,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END,
    });
  }

  private async recoverMailboxSubscriptionCancellation(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<void> {
    if (
      mailbox.pendingLifecycleAction !==
      ManagedEmailLifecycleAction.STOP_MAILBOX_SUBSCRIPTION_PENDING
    ) {
      return;
    }
    const idempotencyKey = this.requireLifecycleKey(
      mailbox.pendingLifecycleKey,
    );
    const effectiveAt = await this.scheduleRemainingQuantity({
      idempotencyKey,
      operationId: mailbox.acquisitionOperationId,
      resourceId: mailbox.id,
      resourceType: 'mailbox',
      subscriptionId: this.requireSubscriptionId(
        mailbox.metronomeMailboxSubscriptionId,
        'mailbox',
      ),
      workspaceId: mailbox.workspaceId,
    });

    Object.assign(mailbox, {
      nextPeriodBoundaryAt: effectiveAt,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END,
    });
  }

  private async recoverDomainSubscriptionCancellation(
    domain: ManagedEmailDomainEntity,
  ): Promise<void> {
    if (
      domain.pendingLifecycleAction !==
      ManagedEmailLifecycleAction.DISABLE_DOMAIN_SUBSCRIPTION_PENDING
    ) {
      return;
    }
    const idempotencyKey = this.requireLifecycleKey(domain.pendingLifecycleKey);
    const effectiveAt = await this.scheduleRemainingQuantity({
      idempotencyKey,
      operationId: domain.acquisitionOperationId,
      resourceId: domain.id,
      resourceType: 'domain',
      subscriptionId: this.requireSubscriptionId(
        domain.metronomeSubscriptionId,
        'domain',
      ),
      workspaceId: domain.workspaceId,
    });

    Object.assign(domain, {
      nextPeriodBoundaryAt: effectiveAt,
      pendingLifecycleAction:
        ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL,
    });
  }

  private async applyDomainBoundary(
    workspaceId: string,
    domainId: string,
  ): Promise<void> {
    const domain = await this.requireDomain(workspaceId, domainId);
    if (
      domain.pendingLifecycleAction ===
      ManagedEmailLifecycleAction.DISABLE_DOMAIN_SUBSCRIPTION_PENDING
    ) {
      if (domain.paidThrough === null) {
        throw new Error(
          'Managed email domain paid-through boundary is missing',
        );
      }
      await this.recoverDomainSubscriptionCancellation(domain);
      return;
    }
    if (
      domain.pendingLifecycleAction !==
      ManagedEmailLifecycleAction.DISABLE_DOMAIN_RENEWAL
    ) {
      return;
    }

    const providerDomainId = this.requireProviderId(
      domain.providerDomainId,
      'provider domain',
    );
    let providerDomain: IcemailDomainDetail | null;
    try {
      providerDomain = await this.icemailClient.getDomain(providerDomainId);
    } catch (error) {
      await this.markDomainReconciliationRequired(
        domain,
        'ICEMAIL_DOMAIN_READ_FAILED',
      );
      throw error;
    }
    if (providerDomain !== null) {
      await this.markDomainReconciliationRequired(
        domain,
        'ICEMAIL_DOMAIN_TERMINATION_UNVERIFIED',
      );
      return;
    }

    const patch = {
      infrastructureState: ManagedEmailInfrastructureState.INACTIVE,
      nextPeriodBoundaryAt: null,
      pendingLifecycleAction: null,
      pendingLifecycleKey: null,
      safeFailureCode: null,
    };
    await this.domainRepository.update(workspaceId, { id: domain.id }, patch);
    Object.assign(domain, patch);
  }

  private async markDomainReconciliationRequired(
    domain: ManagedEmailDomainEntity,
    safeFailureCode: string,
  ): Promise<void> {
    const patch = {
      infrastructureState:
        ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED,
      nextPeriodBoundaryAt: new Date(
        this.now().getTime() + RECONCILIATION_RETRY_MS,
      ),
      safeFailureCode,
    };
    await this.domainRepository.update(
      domain.workspaceId,
      { id: domain.id },
      patch,
    );
    Object.assign(domain, patch);
  }

  private async applyMailboxBoundary(
    workspaceId: string,
    mailboxId: string,
  ): Promise<void> {
    const mailbox = await this.requireMailbox(workspaceId, mailboxId);
    if (mailbox.pendingLifecycleAction === null) return;

    if (
      mailbox.pendingLifecycleAction ===
      ManagedEmailLifecycleAction.CANCEL_WARMUP_SUBSCRIPTION_PENDING
    ) {
      if (mailbox.warmupPaidThrough === null) {
        throw new Error(
          'Managed email warmup paid-through boundary is missing',
        );
      }
      await this.recoverWarmupSubscriptionCancellation(mailbox);
      return;
    }
    if (
      mailbox.pendingLifecycleAction ===
      ManagedEmailLifecycleAction.STOP_MAILBOX_SUBSCRIPTION_PENDING
    ) {
      if (mailbox.infrastructurePaidThrough === null) {
        throw new Error(
          'Managed email mailbox paid-through boundary is missing',
        );
      }
      await this.recoverMailboxSubscriptionCancellation(mailbox);
      return;
    }

    if (
      mailbox.pendingLifecycleAction ===
        ManagedEmailLifecycleAction.CANCEL_WARMUP_AT_PERIOD_END ||
      mailbox.pendingLifecycleAction ===
        ManagedEmailLifecycleAction.PAUSE_WARMUP_NOW
    ) {
      await this.pauseWarmupAtBoundary(mailbox);
      return;
    }
    if (
      mailbox.pendingLifecycleAction ===
      ManagedEmailLifecycleAction.RESUME_WARMUP
    ) {
      await this.resumeWarmupAtBoundary(mailbox);
      return;
    }
    if (
      mailbox.pendingLifecycleAction ===
      ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END
    ) {
      await this.stopMailboxAtBoundary(mailbox);
    }
  }

  private async pauseWarmupAtBoundary(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<void> {
    const enrollmentId = this.requireProviderId(
      mailbox.warmupEnrollmentId,
      'warmup enrollment',
    );
    try {
      await this.warmupInboxClient.pause(enrollmentId);
      await this.completeWarmupAction(mailbox, ManagedEmailWarmupState.PAUSED);
    } catch (error) {
      if (!this.isUncertainWarmupWrite(error)) throw error;
      const providerInbox = await this.warmupInboxClient.getInbox(enrollmentId);
      if (providerInbox?.status === 'paused') {
        await this.completeWarmupAction(
          mailbox,
          ManagedEmailWarmupState.PAUSED,
        );
        return;
      }
      await this.markWarmupReconciliationRequired(mailbox);
      throw error;
    }
  }

  private async resumeWarmupAtBoundary(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<void> {
    this.requireFuturePaidThrough(mailbox.warmupPaidThrough, 'warmup');
    if (mailbox.warmupCancelAtPeriodEnd) {
      throw new Error('Managed email warmup renewal is cancelled');
    }
    const enrollmentId = this.requireProviderId(
      mailbox.warmupEnrollmentId,
      'warmup enrollment',
    );
    try {
      await this.warmupInboxClient.start(enrollmentId);
      await this.completeWarmupAction(mailbox, ManagedEmailWarmupState.WARMING);
    } catch (error) {
      if (!this.isUncertainWarmupWrite(error)) throw error;
      const providerInbox = await this.warmupInboxClient.getInbox(enrollmentId);
      if (providerInbox?.status === 'running') {
        await this.completeWarmupAction(
          mailbox,
          ManagedEmailWarmupState.WARMING,
        );
        return;
      }
      await this.markWarmupReconciliationRequired(mailbox);
      throw error;
    }
  }

  private async stopMailboxAtBoundary(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [
          `managed-email-domain-lifecycle:${mailbox.workspaceId}:${mailbox.managedEmailDomainId}`,
        ],
      );
      const currentMailbox = await this.requireMailbox(
        mailbox.workspaceId,
        mailbox.id,
      );
      if (
        currentMailbox.pendingLifecycleAction !==
        ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END
      ) {
        return;
      }
      await this.stopMailboxAtBoundaryUnderLock(currentMailbox);
    });
  }

  private async stopMailboxAtBoundaryUnderLock(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<void> {
    const siblings = await this.mailboxRepository.find(mailbox.workspaceId, {
      where: { managedEmailDomainId: mailbox.managedEmailDomainId },
    });
    const now = this.now();
    let waitUntil: Date | null = null;
    for (const sibling of siblings) {
      const isStopping =
        sibling.pendingLifecycleAction ===
          ManagedEmailLifecycleAction.STOP_MAILBOX_AT_PERIOD_END &&
        sibling.infrastructurePaidThrough !== null;
      const warmupRequiresDeletion =
        sibling.warmupState !== ManagedEmailWarmupState.NOT_APPLICABLE &&
        sibling.warmupState !== ManagedEmailWarmupState.DELETED;
      if (
        !isStopping ||
        (warmupRequiresDeletion && sibling.warmupPaidThrough === null)
      ) {
        await this.markMailboxReconciliationRequired(
          mailbox,
          'DEPENDENT_MAILBOX_OR_WARMUP_ACTIVE',
        );
        return;
      }
      if (
        sibling.infrastructurePaidThrough! > now &&
        (waitUntil === null || sibling.infrastructurePaidThrough! > waitUntil)
      ) {
        waitUntil = sibling.infrastructurePaidThrough;
      }
      if (
        warmupRequiresDeletion &&
        sibling.warmupPaidThrough! > now &&
        (waitUntil === null || sibling.warmupPaidThrough! > waitUntil)
      ) {
        waitUntil = sibling.warmupPaidThrough;
      }
    }
    if (waitUntil !== null) {
      const patch = {
        nextPeriodBoundaryAt: waitUntil,
        safeFailureCode: null,
        ...(mailbox.infrastructureState ===
          ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED &&
        mailbox.safeFailureCode === 'DEPENDENT_MAILBOX_OR_WARMUP_ACTIVE'
          ? { infrastructureState: ManagedEmailInfrastructureState.ACTIVE }
          : {}),
      };
      await this.mailboxRepository.update(
        mailbox.workspaceId,
        { id: mailbox.id },
        patch,
      );
      Object.assign(mailbox, patch);
      return;
    }

    for (const sibling of siblings) {
      if (
        sibling.warmupState === ManagedEmailWarmupState.NOT_APPLICABLE ||
        sibling.warmupState === ManagedEmailWarmupState.DELETED
      ) {
        continue;
      }
      const isDeletionRecovery =
        sibling.warmupState === ManagedEmailWarmupState.DELETING ||
        (sibling.warmupState ===
          ManagedEmailWarmupState.RECONCILIATION_REQUIRED &&
          sibling.safeFailureCode === 'WARMUP_DELETE_UNCONFIRMED');
      if (
        sibling.warmupState !== ManagedEmailWarmupState.PAUSED &&
        !isDeletionRecovery
      ) {
        await this.pauseWarmupForMailboxStop(sibling);
      }
      await this.deleteWarmupForMailboxStop(sibling);
    }
    const providerDomain = await this.requireDomain(
      mailbox.workspaceId,
      mailbox.managedEmailDomainId,
    );
    const providerDomainId = this.requireProviderId(
      providerDomain.providerDomainId,
      'provider domain',
    );

    const isIcemailDeletionRecovery = siblings.some(
      (sibling) =>
        sibling.infrastructureState ===
          ManagedEmailInfrastructureState.DEACTIVATING ||
        (sibling.infrastructureState ===
          ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED &&
          (sibling.safeFailureCode === 'ICEMAIL_DELETE_UNCONFIRMED' ||
            sibling.safeFailureCode === 'ICEMAIL_DELETE_PARTIAL')),
    );
    if (isIcemailDeletionRecovery) {
      if (!(await this.areProviderMailboxesAbsent(siblings))) {
        await this.markStoppedSiblingsReconciliationRequired(
          siblings,
          'ICEMAIL_DELETE_UNCONFIRMED',
        );
        return;
      }
      await this.completeStoppedSiblings(siblings);
      return;
    }

    const deactivatingPatch = {
      campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
      infrastructureState: ManagedEmailInfrastructureState.DEACTIVATING,
      safeFailureCode: null,
    };
    for (const sibling of siblings) {
      await this.mailboxRepository.update(
        sibling.workspaceId,
        { id: sibling.id },
        deactivatingPatch,
      );
      Object.assign(sibling, deactivatingPatch);
    }

    try {
      const deletionReceipt = await this.icemailClient.deleteDomainMailboxes({
        domainIds: [providerDomainId],
        mode: 'immediate',
      });
      const domainResult = deletionReceipt.results.find(
        (result) => result.domainId === providerDomainId,
      );
      if (
        domainResult === undefined ||
        domainResult.failed ||
        domainResult.skipped
      ) {
        await this.markStoppedSiblingsReconciliationRequired(
          siblings,
          'ICEMAIL_DELETE_PARTIAL',
        );
        return;
      }
      if (!(await this.areProviderMailboxesAbsent(siblings))) {
        await this.markStoppedSiblingsReconciliationRequired(
          siblings,
          'ICEMAIL_DELETE_UNCONFIRMED',
        );
        return;
      }
      await this.completeStoppedSiblings(siblings);
    } catch (error) {
      if (
        !this.isUncertainIcemailWrite(error) &&
        error instanceof IcemailException
      ) {
        await this.markStoppedSiblingsReconciliationRequired(
          siblings,
          error.code,
        );
        throw error;
      }
      if (await this.areProviderMailboxesAbsent(siblings)) {
        await this.completeStoppedSiblings(siblings);
        return;
      }
      await this.markStoppedSiblingsReconciliationRequired(
        siblings,
        'ICEMAIL_DELETE_UNCONFIRMED',
      );
      throw error;
    }
  }

  private async areProviderMailboxesAbsent(
    siblings: ManagedEmailMailboxEntity[],
  ): Promise<boolean> {
    for (const sibling of siblings) {
      const providerMailboxId = this.requireProviderId(
        sibling.providerMailboxId,
        'provider mailbox',
      );
      if ((await this.icemailClient.getMailbox(providerMailboxId)) !== null) {
        return false;
      }
    }

    return true;
  }

  private async pauseWarmupForMailboxStop(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<void> {
    const enrollmentId = this.requireProviderId(
      mailbox.warmupEnrollmentId,
      'warmup enrollment',
    );
    try {
      await this.warmupInboxClient.pause(enrollmentId);
    } catch (error) {
      if (!this.isUncertainWarmupWrite(error)) throw error;
      const providerInbox = await this.warmupInboxClient.getInbox(enrollmentId);
      if (providerInbox?.status !== 'paused') {
        await this.markWarmupReconciliationRequired(mailbox);
        throw error;
      }
    }

    const patch = {
      safeFailureCode: null,
      warmupState: ManagedEmailWarmupState.PAUSED,
    };
    await this.mailboxRepository.update(
      mailbox.workspaceId,
      { id: mailbox.id },
      patch,
    );
    Object.assign(mailbox, patch);
  }

  private async deleteWarmupForMailboxStop(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<void> {
    const enrollmentId = this.requireProviderId(
      mailbox.warmupEnrollmentId,
      'warmup enrollment',
    );
    const isDeletionRecovery =
      mailbox.warmupState === ManagedEmailWarmupState.DELETING ||
      (mailbox.warmupState ===
        ManagedEmailWarmupState.RECONCILIATION_REQUIRED &&
        mailbox.safeFailureCode === 'WARMUP_DELETE_UNCONFIRMED');

    if (isDeletionRecovery) {
      const providerInbox = await this.warmupInboxClient.getInbox(enrollmentId);
      if (providerInbox === null) {
        await this.completeWarmupDeletion(mailbox);
        return;
      }
      if (providerInbox.status !== 'paused') {
        await this.pauseWarmupForMailboxStop(mailbox);
      }
    }

    if (mailbox.warmupState !== ManagedEmailWarmupState.DELETING) {
      const patch = {
        safeFailureCode: null,
        warmupState: ManagedEmailWarmupState.DELETING,
      };
      await this.mailboxRepository.update(
        mailbox.workspaceId,
        { id: mailbox.id },
        patch,
      );
      Object.assign(mailbox, patch);
    }

    try {
      await this.warmupInboxClient.delete(enrollmentId);
    } catch (error) {
      if (!this.isUncertainWarmupWrite(error)) throw error;
      const providerInbox = await this.warmupInboxClient.getInbox(enrollmentId);
      if (providerInbox !== null) {
        await this.markWarmupReconciliationRequired(
          mailbox,
          'WARMUP_DELETE_UNCONFIRMED',
        );
        throw error;
      }
    }

    await this.completeWarmupDeletion(mailbox);
  }

  private async completeWarmupDeletion(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<void> {
    const patch = {
      safeFailureCode: null,
      warmupState: ManagedEmailWarmupState.DELETED,
    };
    await this.mailboxRepository.update(
      mailbox.workspaceId,
      { id: mailbox.id },
      patch,
    );
    Object.assign(mailbox, patch);
  }

  private async completeStoppedSiblings(
    siblings: ManagedEmailMailboxEntity[],
  ): Promise<void> {
    for (const sibling of siblings) {
      await this.mailboxRepository.update(
        sibling.workspaceId,
        { id: sibling.id },
        {
          campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
          infrastructureState: ManagedEmailInfrastructureState.INACTIVE,
          nextPeriodBoundaryAt: null,
          pendingLifecycleAction: null,
          pendingLifecycleKey: null,
          safeFailureCode: null,
        },
      );
    }
  }

  private async completeWarmupAction(
    mailbox: ManagedEmailMailboxEntity,
    warmupState: ManagedEmailWarmupState,
  ): Promise<void> {
    await this.mailboxRepository.update(
      mailbox.workspaceId,
      { id: mailbox.id },
      {
        nextPeriodBoundaryAt: null,
        pendingLifecycleAction: null,
        pendingLifecycleKey: null,
        safeFailureCode: null,
        warmupState,
      },
    );
  }

  private async markWarmupReconciliationRequired(
    mailbox: ManagedEmailMailboxEntity,
    safeFailureCode = 'WARMUP_WRITE_UNCONFIRMED',
  ): Promise<void> {
    await this.mailboxRepository.update(
      mailbox.workspaceId,
      { id: mailbox.id },
      {
        nextPeriodBoundaryAt: new Date(
          this.now().getTime() + RECONCILIATION_RETRY_MS,
        ),
        safeFailureCode,
        warmupState: ManagedEmailWarmupState.RECONCILIATION_REQUIRED,
      },
    );
  }

  private async markMailboxReconciliationRequired(
    mailbox: ManagedEmailMailboxEntity,
    safeFailureCode: string,
  ): Promise<void> {
    await this.mailboxRepository.update(
      mailbox.workspaceId,
      { id: mailbox.id },
      {
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
        infrastructureState:
          ManagedEmailInfrastructureState.RECONCILIATION_REQUIRED,
        nextPeriodBoundaryAt: new Date(
          this.now().getTime() + RECONCILIATION_RETRY_MS,
        ),
        safeFailureCode,
      },
    );
  }

  private async markStoppedSiblingsReconciliationRequired(
    siblings: ManagedEmailMailboxEntity[],
    safeFailureCode: string,
  ): Promise<void> {
    for (const sibling of siblings) {
      await this.markMailboxReconciliationRequired(sibling, safeFailureCode);
    }
  }

  private async persistMailboxIntent(
    mailbox: ManagedEmailMailboxEntity,
    patch: MailboxLifecyclePatch,
  ): Promise<void> {
    await this.dataSource.transaction((manager) =>
      this.persistMailboxIntentWithManager(mailbox, patch, manager),
    );
    Object.assign(mailbox, patch);
  }

  private async persistMailboxIntentWithManager(
    mailbox: Pick<ManagedEmailMailboxEntity, 'id' | 'workspaceId'>,
    patch: MailboxLifecyclePatch,
    manager: EntityManager,
    allowedPendingIntent?: Pick<
      ManagedEmailMailboxEntity,
      'pendingLifecycleAction' | 'pendingLifecycleKey'
    >,
  ): Promise<ManagedEmailMailboxEntity> {
    const repository = this.mailboxRepository.withManager(manager);
    const persistedMailbox = await repository.findOne(mailbox.workspaceId, {
      lock: { mode: 'pessimistic_write' },
      where: { id: mailbox.id },
    });
    if (persistedMailbox === null) {
      throw new Error('Managed email mailbox was not found');
    }
    const pendingSlotIsEmpty =
      persistedMailbox.pendingLifecycleAction === null &&
      persistedMailbox.pendingLifecycleKey === null;
    const isIdempotentReplay =
      persistedMailbox.pendingLifecycleAction ===
        patch.pendingLifecycleAction &&
      persistedMailbox.pendingLifecycleKey === patch.pendingLifecycleKey;
    const isAllowedTransition =
      allowedPendingIntent !== undefined &&
      persistedMailbox.pendingLifecycleAction ===
        allowedPendingIntent.pendingLifecycleAction &&
      persistedMailbox.pendingLifecycleKey ===
        allowedPendingIntent.pendingLifecycleKey;
    if (!pendingSlotIsEmpty && !isIdempotentReplay && !isAllowedTransition) {
      throw new Error('Managed email mailbox has another pending action');
    }
    const result = await repository.update(
      mailbox.workspaceId,
      { id: mailbox.id },
      patch,
    );
    if (result.affected !== 1) {
      throw new Error('Managed email mailbox intent was not persisted');
    }

    Object.assign(persistedMailbox, patch);
    return persistedMailbox;
  }

  private async requireMailbox(
    workspaceId: string,
    mailboxId: string,
  ): Promise<ManagedEmailMailboxEntity> {
    const mailbox = await this.mailboxRepository.findOneBy(workspaceId, {
      id: mailboxId,
    });
    if (mailbox === null)
      throw new Error('Managed email mailbox was not found');
    return mailbox;
  }

  private async requireDomain(
    workspaceId: string,
    domainId: string,
  ): Promise<ManagedEmailDomainEntity> {
    const domain = await this.domainRepository.findOneBy(workspaceId, {
      id: domainId,
    });
    if (domain === null) throw new Error('Managed email domain was not found');
    return domain;
  }

  private requireTemplate(
    templates: Map<string, ManagedEmailExpectedLineItem>,
    productKey:
      | 'managed_sending_domain_year'
      | 'managed_mailbox_month'
      | 'managed_warmup_month',
  ): ManagedEmailExpectedLineItem {
    const template = templates.get(productKey);
    if (template === undefined) {
      throw new Error(`Managed email billing line is missing: ${productKey}`);
    }
    return template;
  }

  private nextPeriod(value: Date, cadence: 'ANNUAL' | 'MONTHLY'): Date {
    return cadence === 'ANNUAL' ? addYears(value, 1) : addMonths(value, 1);
  }

  private maxDate(current: Date | null, candidate: Date): Date {
    return current === null || candidate > current ? candidate : current;
  }

  private isDue(value: Date | null, now: Date): value is Date {
    return value !== null && value.getTime() - INVOICE_LEAD_MS <= now.getTime();
  }

  private requireFuturePaidThrough(
    paidThrough: Date | null,
    resource: string,
  ): Date {
    if (paidThrough === null || paidThrough <= this.now()) {
      throw new Error(`Managed email ${resource} entitlement is inactive`);
    }
    return paidThrough;
  }

  private requireSubscriptionId(
    subscriptionId: string | null,
    resource: string,
  ): string {
    if (subscriptionId === null || subscriptionId.trim() === '') {
      throw new Error(`Managed email ${resource} subscription is missing`);
    }
    return subscriptionId;
  }

  private requireProviderId(value: string | null, resource: string): string {
    if (value === null || value.trim() === '') {
      throw new Error(`Managed email ${resource} identity is missing`);
    }
    return value;
  }

  private requireLifecycleKey(value: string | null): string {
    if (value === null || value.trim() === '') {
      throw new Error('Managed email lifecycle idempotency key is missing');
    }
    return value;
  }

  private async validateActionInput({
    actorId,
    idempotencyKey,
    workspaceId,
  }: Pick<
    MailboxActionInput,
    'actorId' | 'idempotencyKey' | 'workspaceId'
  >): Promise<void> {
    this.validateId(workspaceId, 'workspace');
    this.validateId(actorId, 'actor');
    if (idempotencyKey.trim() === '') {
      throw new Error('Managed email lifecycle idempotency key is required');
    }
    const permitted =
      await this.permissionsService.userHasWorkspaceSettingPermission({
        setting: PermissionFlagType.BILLING,
        userWorkspaceId: actorId,
        workspaceId,
      });
    if (!permitted) {
      throw new Error('Managed email lifecycle action is not authorized');
    }
  }

  private validateId(value: string, resource: string): void {
    if (value.trim() === '') {
      throw new Error(`Managed email ${resource} identity is required`);
    }
  }

  private isUncertainWarmupWrite(error: unknown): boolean {
    return (
      error instanceof WarmupInboxException &&
      error.code === WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN
    );
  }

  private isUncertainIcemailWrite(error: unknown): boolean {
    return (
      error instanceof IcemailException &&
      error.code === IcemailExceptionCode.WRITE_OUTCOME_UNCERTAIN
    );
  }
}
