import { Inject, Injectable } from '@nestjs/common';

import { ManagedEmailMailboxEntity } from 'src/engine/core-modules/managed-email/entities/managed-email-mailbox.entity';
import { ManagedEmailCampaignEligibility } from 'src/engine/core-modules/managed-email/enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from 'src/engine/core-modules/managed-email/enums/managed-email-infrastructure-state.enum';
import { ManagedEmailWarmupState } from 'src/engine/core-modules/managed-email/enums/managed-email-warmup-state.enum';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

export const MANAGED_EMAIL_CAMPAIGN_ELIGIBILITY_CLOCK = Symbol(
  'MANAGED_EMAIL_CAMPAIGN_ELIGIBILITY_CLOCK',
);

const NOT_ELIGIBLE = 'Managed mailbox is not eligible for campaign sending';

export type ManagedEmailCampaignMailbox = Readonly<{
  id: string;
  connectedAccountId: string;
  messageChannelId: string;
  effectiveDailyCap: number;
}>;

export type ManagedEmailConnectedIdentity = Readonly<{
  id: string;
  connectedAccountId: string;
  messageChannelId: string;
}>;

type AssertEligibleInput = Readonly<{
  workspaceId: string;
  managedMailboxId: string;
  connectedAccountId: string;
  messageChannelId: string;
  isFollowUp: boolean;
}>;

@Injectable()
export class ManagedEmailCampaignEligibilityService {
  constructor(
    @InjectWorkspaceScopedRepository(ManagedEmailMailboxEntity)
    private readonly mailboxRepository: WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    @Inject(MANAGED_EMAIL_CAMPAIGN_ELIGIBILITY_CLOCK)
    private readonly clock: () => Date,
  ) {}

  async assertEligible(
    input: AssertEligibleInput,
  ): Promise<ManagedEmailCampaignMailbox> {
    const mailbox = await this.mailboxRepository.findOneBy(input.workspaceId, {
      id: input.managedMailboxId,
    });
    const now = this.clock();
    const effectiveDailyCap =
      mailbox === null
        ? 0
        : Math.min(
            mailbox.policySafeDailyCapacity,
            mailbox.adminDailyCap ?? mailbox.policySafeDailyCapacity,
          );
    const warmupActive =
      mailbox?.warmupState === ManagedEmailWarmupState.NOT_APPLICABLE ||
      ((mailbox?.warmupState === ManagedEmailWarmupState.MAINTENANCE ||
        mailbox?.warmupState ===
          ManagedEmailWarmupState.CANCEL_AT_PERIOD_END) &&
        this.isAfter(mailbox.warmupPaidThrough, now));
    const campaignEligible =
      mailbox?.campaignEligibility ===
        ManagedEmailCampaignEligibility.ELIGIBLE ||
      (input.isFollowUp &&
        mailbox?.campaignEligibility ===
          ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED);
    const softFailureAllowsFollowUp =
      input.isFollowUp &&
      mailbox?.campaignEligibility ===
        ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED &&
      (mailbox.safeFailureCode === 'HEALTH_EVIDENCE_UNAVAILABLE' ||
        mailbox.safeFailureCode === 'HEALTH_REGRESSION');

    if (
      mailbox === null ||
      campaignEligible === false ||
      mailbox.infrastructureState !== ManagedEmailInfrastructureState.ACTIVE ||
      this.isAfter(mailbox.infrastructurePaidThrough, now) === false ||
      warmupActive === false ||
      (mailbox.safeFailureCode !== null && !softFailureAllowsFollowUp) ||
      mailbox.policySafeDailyCapacity <= 0 ||
      effectiveDailyCap <= 0 ||
      mailbox.connectedAccountId === null ||
      mailbox.messageChannelId === null ||
      mailbox.connectedAccountId !== input.connectedAccountId ||
      mailbox.messageChannelId !== input.messageChannelId
    ) {
      throw new Error(NOT_ELIGIBLE);
    }

    return {
      id: mailbox.id,
      connectedAccountId: mailbox.connectedAccountId,
      messageChannelId: mailbox.messageChannelId,
      effectiveDailyCap,
    };
  }

  async assertConnectedIdentityEligibleForFollowUp(input: {
    workspaceId: string;
    connectedAccountId: string;
    messageChannelId: string;
  }): Promise<ManagedEmailCampaignMailbox | null> {
    const mailbox = await this.findConnectedIdentity(input);

    if (mailbox === null) {
      return null;
    }

    return this.assertEligible({
      workspaceId: input.workspaceId,
      managedMailboxId: mailbox.id,
      connectedAccountId: input.connectedAccountId,
      messageChannelId: input.messageChannelId,
      isFollowUp: true,
    });
  }

  async findConnectedIdentity(input: {
    workspaceId: string;
    connectedAccountId: string;
    messageChannelId: string;
  }): Promise<ManagedEmailConnectedIdentity | null> {
    const mailboxes = await this.mailboxRepository.find(input.workspaceId, {
      where: [
        { connectedAccountId: input.connectedAccountId },
        { messageChannelId: input.messageChannelId },
      ],
    });

    if (mailboxes.length === 0) {
      return null;
    }

    if (
      mailboxes.length !== 1 ||
      mailboxes[0].connectedAccountId !== input.connectedAccountId ||
      mailboxes[0].messageChannelId !== input.messageChannelId
    ) {
      throw new Error(NOT_ELIGIBLE);
    }

    return {
      id: mailboxes[0].id,
      connectedAccountId: mailboxes[0].connectedAccountId,
      messageChannelId: mailboxes[0].messageChannelId,
    };
  }

  private isAfter(value: Date | null | undefined, boundary: Date): boolean {
    return value instanceof Date && value.getTime() > boundary.getTime();
  }
}
