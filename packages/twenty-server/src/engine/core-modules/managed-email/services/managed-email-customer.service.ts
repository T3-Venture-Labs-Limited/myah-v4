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
} from 'src/engine/core-modules/managed-email/managed-email.dto';
import { ManagedEmailProposalInput } from 'src/engine/core-modules/managed-email/managed-email.input';
import { ManagedEmailAcquisitionOperationEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-acquisition-operation.entity';
import { ManagedEmailDomainEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-domain.entity';
import { ManagedEmailMailboxEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-mailbox.entity';
import { ManagedEmailAcquisitionMode } from 'src/engine/core-modules/managed-email/enums/managed-email-acquisition-mode.enum';
import { ManagedEmailCampaignEligibility } from 'src/engine/core-modules/managed-email/enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailAcquisitionService } from 'src/engine/core-modules/managed-email/services/managed-email-acquisition.service';
import { ManagedEmailLifecycleService } from 'src/engine/core-modules/managed-email/services/managed-email-lifecycle.service';
import { ManagedEmailProposalService } from 'src/engine/core-modules/managed-email/services/managed-email-proposal.service';
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

type RetryPaymentInput = Readonly<{
  actorId: string;
  idempotencyKey: string;
  operationId: string;
  workspaceId: string;
}>;

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
    private readonly twentyConfigService: TwentyConfigService,
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
      cancelAtPeriodEnd: domain.cancelAtPeriodEnd,
      dependentMailboxCount: mailboxes.filter(
        ({ managedEmailDomainId }) => managedEmailDomainId === domain.id,
      ).length,
      domain: domain.domain,
      id: domain.id,
      infrastructureState: domain.infrastructureState,
      paidThrough: domain.paidThrough,
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

  async prewarmedBundles(
    workspaceId: string,
  ): Promise<ManagedEmailBundleDTO[]> {
    this.assertAcquisitionAvailable(workspaceId);
    throw new Error('Managed email customer catalog is unavailable');
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
    const proposal = await this.proposalService.createProposal(
      {
        ...input,
        personas: input.personas.map((persona) => ({
          ...persona,
          roleTitle: persona.roleTitle ?? null,
        })),
      },
      {
        actorWorkspaceMemberId: actorId,
        workspaceId,
        workspaceSlug,
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
    proposalId,
    workspaceId,
  }: {
    proposalId: string;
    workspaceId: string;
  }): Promise<ManagedEmailQuoteDTO> {
    this.assertAcquisitionAvailable(workspaceId);
    if (proposalId.trim() === '') {
      throw new Error('Managed email proposal reference is invalid');
    }
    throw new Error('Managed email quote storage is unavailable');
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
    throw new Error('Managed email quote storage is unavailable');
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

  async retryPayment(
    input: RetryPaymentInput,
  ): Promise<ManagedEmailActionResultDTO> {
    const operation = await this.operationRepository.findOneBy(
      input.workspaceId,
      {
        id: input.operationId,
        idempotencyKey: input.idempotencyKey,
      },
    );

    if (operation === null) {
      throw new Error('Managed email retry identity does not match');
    }
    await this.acquisitionService.continue({
      operationId: input.operationId,
      workspaceId: input.workspaceId,
    });
    return { accepted: true, operationId: input.operationId };
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
