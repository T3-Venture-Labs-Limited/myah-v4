import { ManagedEmailCampaignEligibility } from 'src/engine/core-modules/managed-email/enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from 'src/engine/core-modules/managed-email/enums/managed-email-infrastructure-state.enum';
import { ManagedEmailWarmupState } from 'src/engine/core-modules/managed-email/enums/managed-email-warmup-state.enum';
import {
  ManagedEmailCampaignEligibilityService,
  type ManagedEmailCampaignMailbox,
} from 'src/engine/core-modules/managed-email/services/managed-email-campaign-eligibility.service';

const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
const MAILBOX_ID = '00000000-0000-4000-8000-000000000002';
const CONNECTED_ACCOUNT_ID = '00000000-0000-4000-8000-000000000003';
const MESSAGE_CHANNEL_ID = '00000000-0000-4000-8000-000000000004';
const NOW = new Date('2026-08-06T12:00:00.000Z');
const NOT_ELIGIBLE = 'Managed mailbox is not eligible for campaign sending';

const eligibleMailbox = {
  id: MAILBOX_ID,
  workspaceId: WORKSPACE_ID,
  connectedAccountId: CONNECTED_ACCOUNT_ID,
  messageChannelId: MESSAGE_CHANNEL_ID,
  campaignEligibility: ManagedEmailCampaignEligibility.ELIGIBLE,
  infrastructureState: ManagedEmailInfrastructureState.ACTIVE,
  infrastructurePaidThrough: new Date('2026-09-06T12:00:00.000Z'),
  warmupState: ManagedEmailWarmupState.MAINTENANCE,
  warmupPaidThrough: new Date('2026-09-06T12:00:00.000Z'),
  policySafeDailyCapacity: 20,
  adminDailyCap: 12,
  safeFailureCode: null,
};

describe('ManagedEmailCampaignEligibilityService', () => {
  const mailboxRepository = { findOneBy: jest.fn() };
  const service = new ManagedEmailCampaignEligibilityService(
    mailboxRepository as never,
    () => NOW,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    mailboxRepository.findOneBy.mockResolvedValue({ ...eligibleMailbox });
  });

  const assertEligible = (
    overrides: {
      connectedAccountId?: string;
      messageChannelId?: string;
      isFollowUp?: boolean;
    } = {},
  ) =>
    service.assertEligible({
      workspaceId: WORKSPACE_ID,
      managedMailboxId: MAILBOX_ID,
      connectedAccountId: overrides.connectedAccountId ?? CONNECTED_ACCOUNT_ID,
      messageChannelId: overrides.messageChannelId ?? MESSAGE_CHANNEL_ID,
      isFollowUp: overrides.isFollowUp ?? false,
    });

  it('returns only the pinned sender identity and effective campaign cap', async () => {
    await expect(
      assertEligible(),
    ).resolves.toEqual<ManagedEmailCampaignMailbox>({
      id: MAILBOX_ID,
      connectedAccountId: CONNECTED_ACCOUNT_ID,
      messageChannelId: MESSAGE_CHANNEL_ID,
      effectiveDailyCap: 12,
    });
    expect(mailboxRepository.findOneBy).toHaveBeenCalledWith(WORKSPACE_ID, {
      id: MAILBOX_ID,
    });
  });

  it('never lets an admin cap raise the readiness-policy capacity', async () => {
    mailboxRepository.findOneBy.mockResolvedValue({
      ...eligibleMailbox,
      policySafeDailyCapacity: 20,
      adminDailyCap: 50,
    });

    await expect(assertEligible()).resolves.toMatchObject({
      effectiveDailyCap: 20,
    });
  });

  it.each(['HEALTH_EVIDENCE_UNAVAILABLE', 'HEALTH_REGRESSION'])(
    'allows a pinned follow-up during %s but blocks new threads',
    async (safeFailureCode) => {
      mailboxRepository.findOneBy.mockResolvedValue({
        ...eligibleMailbox,
        campaignEligibility:
          ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED,
        safeFailureCode,
      });

      await expect(assertEligible()).rejects.toThrow(NOT_ELIGIBLE);
      await expect(assertEligible({ isFollowUp: true })).resolves.toMatchObject(
        {
          id: MAILBOX_ID,
          connectedAccountId: CONNECTED_ACCOUNT_ID,
          messageChannelId: MESSAGE_CHANNEL_ID,
        },
      );
    },
  );

  it('keeps cancel-at-period-end warmup eligible through its paid period', async () => {
    mailboxRepository.findOneBy.mockResolvedValue({
      ...eligibleMailbox,
      warmupState: ManagedEmailWarmupState.CANCEL_AT_PERIOD_END,
    });

    await expect(assertEligible()).resolves.toMatchObject({
      id: MAILBOX_ID,
    });
  });

  it('blocks cancel-at-period-end warmup at the paid-through boundary', async () => {
    mailboxRepository.findOneBy.mockResolvedValue({
      ...eligibleMailbox,
      warmupPaidThrough: NOW,
      warmupState: ManagedEmailWarmupState.CANCEL_AT_PERIOD_END,
    });

    await expect(assertEligible()).rejects.toThrow(NOT_ELIGIBLE);
  });

  it.each([
    ['missing mailbox', null],
    [
      'blocked readiness',
      {
        ...eligibleMailbox,
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
      },
    ],
    [
      'inactive infrastructure',
      {
        ...eligibleMailbox,
        infrastructureState: ManagedEmailInfrastructureState.INACTIVE,
      },
    ],
    [
      'expired infrastructure period',
      { ...eligibleMailbox, infrastructurePaidThrough: NOW },
    ],
    [
      'paused warmup with renewal cancellation scheduled',
      {
        ...eligibleMailbox,
        warmupCancelAtPeriodEnd: true,
        warmupState: ManagedEmailWarmupState.PAUSED,
      },
    ],
    ['expired warmup period', { ...eligibleMailbox, warmupPaidThrough: NOW }],
    [
      'zero policy capacity',
      { ...eligibleMailbox, policySafeDailyCapacity: 0 },
    ],
    ['zero admin cap', { ...eligibleMailbox, adminDailyCap: 0 }],
    [
      'safe failure',
      { ...eligibleMailbox, safeFailureCode: 'ACTION_REQUIRED' },
    ],
    [
      'missing connected account',
      { ...eligibleMailbox, connectedAccountId: null },
    ],
    ['missing message channel', { ...eligibleMailbox, messageChannelId: null }],
  ])('fails closed for %s', async (_label, mailbox) => {
    mailboxRepository.findOneBy.mockResolvedValue(mailbox);

    await expect(assertEligible()).rejects.toThrow(NOT_ELIGIBLE);
  });

  it('accepts a provider-prewarmed mailbox without a separate warmup paid-through date', async () => {
    mailboxRepository.findOneBy.mockResolvedValue({
      ...eligibleMailbox,
      warmupState: ManagedEmailWarmupState.NOT_APPLICABLE,
      warmupPaidThrough: null,
      adminDailyCap: null,
    });

    await expect(assertEligible()).resolves.toMatchObject({
      effectiveDailyCap: eligibleMailbox.policySafeDailyCapacity,
    });
  });

  it.each([
    [
      'connected account',
      { connectedAccountId: '00000000-0000-4000-8000-000000000099' },
    ],
    [
      'message channel',
      { messageChannelId: '00000000-0000-4000-8000-000000000099' },
    ],
  ])('rejects a draft pinned to a different %s', async (_label, overrides) => {
    await expect(assertEligible(overrides)).rejects.toThrow(NOT_ELIGIBLE);
  });
});
