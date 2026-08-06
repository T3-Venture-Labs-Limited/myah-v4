import {
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
} from 'twenty-shared/types';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';

import { IsNull, type UpdateResult } from 'typeorm';

import { ManagedEmailCampaignEligibility } from '../../enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from '../../enums/managed-email-infrastructure-state.enum';
import { ManagedEmailWarmupState } from '../../enums/managed-email-warmup-state.enum';
import {
  WarmupInboxException,
  WarmupInboxExceptionCode,
} from '../../providers/warmup-inbox/warmup-inbox.exception';
import { type ManagedEmailReadinessPolicy } from '../../types/managed-email-readiness.type';
import { ManagedEmailWarmupService } from '../managed-email-warmup.service';

const now = new Date('2026-08-06T12:00:00.000Z');
const workspaceId = '123e4567-e89b-42d3-a456-426614174000';
const mailboxId = '123e4567-e89b-42d3-a456-426614174001';
const address = 'ada@example.com';
const credential = {
  appPassword: 'transient-secret',
  imap: {
    host: 'imap.gmail.com' as const,
    port: 993 as const,
    secure: true as const,
  },
  smtp: {
    host: 'smtp.gmail.com' as const,
    port: 465 as const,
    secure: true as const,
  },
  username: address,
};
const policy: ManagedEmailReadinessPolicy = {
  approvalState: 'APPROVED',
  capacityCurve: [{ capacity: 10, days: 7 }],
  dns: { dkimSelector: 'google', expectedMxSuffixes: ['.google.com'] },
  evaluationIntervalMs: 60 * 60 * 1000,
  maximumSpamPlacementBasisPoints: 100,
  metricsLookbackMs: 7 * 24 * 60 * 60 * 1000,
  minimumInboxPlacementBasisPoints: 9500,
  minimumWarmupDays: 7,
  providerConfigurationKey: 'warmup-test',
  version: 'approved-test-v1',
  warmupConfiguration: {
    increasePerDay: 1,
    maxSendsPerDay: 10,
    replyRatePercent: 30,
    startingBaseline: 1,
    strategy: 'progressive',
    version: 'approved-test-v1',
  },
};
const mailbox = (overrides: Record<string, unknown> = {}) => ({
  address,
  adminDailyCap: null,
  campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
  connectedAccountId: 'connected-account-1',
  id: mailboxId,
  infrastructurePaidThrough: new Date('2026-09-06T00:00:00.000Z'),
  infrastructureState: ManagedEmailInfrastructureState.ACTIVE,
  messageChannelId: 'message-channel-1',
  lastHealthEvaluatedAt: null,
  normalizedAddress: address,
  personaFirstName: 'Ada',
  personaLastName: 'Lovelace',
  policySafeDailyCapacity: 0,
  providerMailboxId: 'icemail-mailbox-1',
  readinessPolicyVersion: policy.version,
  warmupEnrollmentId: null,
  warmupPaidThrough: new Date('2026-09-06T00:00:00.000Z'),
  warmupState: ManagedEmailWarmupState.NOT_APPLICABLE,
  workspaceId,
  ...overrides,
});

const setup = () => {
  const mailboxRepository = {
    findOneBy: jest.fn().mockResolvedValue(mailbox()),
    update: jest.fn().mockResolvedValue({ affected: 1 } as UpdateResult),
  };
  const warmupInboxClient = {
    createAdvanced: jest
      .fn()
      .mockResolvedValue({ id: 'warmup-1', replayed: false }),
    findByExactAddress: jest.fn().mockResolvedValue([]),
    getInbox: jest.fn().mockResolvedValue({
      address,
      connectionType: 'SMTP_IMAP',
      createdAt: new Date('2026-07-30T00:00:00.000Z'),
      health: {
        blacklistScore: 100,
        detectedBlacklists: 0,
        dmarcScore: 100,
        mxScore: 100,
        spfScore: 100,
        warmupDays: 7,
        warmupDaysScore: 100,
      },
      id: 'warmup-1',
      policy: {
        increasePerDay: 1,
        maxSendsPerDay: 10,
        replyRatePercent: 30,
        startingBaseline: 1,
        strategy: 'progressive',
      },
      score: 100,
      senderFirstName: 'Ada',
      senderLastName: 'Lovelace',
      status: 'running',
    }),
    getMetrics: jest.fn().mockResolvedValue({
      from: new Date(now.getTime() - policy.metricsLookbackMs),
      inboxId: 'warmup-1',
      to: now,
      totals: {
        landedCategory: 0,
        landedInbox: 98,
        landedSpam: 1,
        messages: 100,
        repliesReceived: 5,
        sent: 100,
      },
      trend: [],
    }),
    start: jest.fn().mockResolvedValue(undefined),
    updatePolicy: jest.fn().mockResolvedValue(undefined),
  };
  const icemailClient = {
    getMailboxCredential: jest.fn().mockResolvedValue(credential),
  };
  const imapSmtpCaldavService = {
    validateAndTestWorkspaceMailboxConnection: jest
      .fn()
      .mockResolvedValue(undefined),
  };
  const workspaceMailboxConnectionService = {
    getManagedWorkspaceMailboxStatus: jest.fn().mockResolvedValue({
      connectedAccountId: 'connected-account-1',
      messageChannelId: 'message-channel-1',
      state: 'CONNECTED',
      syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_PENDING,
      syncStatus: MessageChannelSyncStatus.ACTIVE,
    }),
  };
  const dnsResolver = {
    resolve: jest
      .fn()
      .mockResolvedValue({ dkim: true, dmarc: true, mx: true, spf: true }),
  };
  const readinessService = {
    evaluate: jest.fn().mockReturnValue({
      campaignEligibility: ManagedEmailCampaignEligibility.ELIGIBLE,
      policySafeDailyCapacity: 10,
      ready: true,
      safeReasonCode: null,
    }),
  };
  const service = new ManagedEmailWarmupService(
    mailboxRepository as never,
    warmupInboxClient as never,
    icemailClient as never,
    imapSmtpCaldavService as never,
    workspaceMailboxConnectionService as never,
    dnsResolver as never,
    readinessService as never,
    () => policy,
    () => now,
  );

  return {
    dnsResolver,
    icemailClient,
    imapSmtpCaldavService,
    mailboxRepository,
    readinessService,
    service,
    warmupInboxClient,
    workspaceMailboxConnectionService,
  };
};

describe('ManagedEmailWarmupService', () => {
  it('fails closed without an approved policy or paid entitlement and performs no provider work', async () => {
    const first = setup();
    first.mailboxRepository.findOneBy.mockResolvedValue(
      mailbox({ adminDailyCap: 3, policySafeDailyCapacity: 10 }),
    );
    const unconfigured = new ManagedEmailWarmupService(
      first.mailboxRepository as never,
      first.warmupInboxClient as never,
      first.icemailClient as never,
      first.imapSmtpCaldavService as never,
      first.workspaceMailboxConnectionService as never,
      first.dnsResolver as never,
      first.readinessService as never,
      () => null,
      () => now,
    );
    await unconfigured.evaluateMailbox({ mailboxId, workspaceId });

    const second = setup();
    second.mailboxRepository.findOneBy.mockResolvedValue(
      mailbox({ warmupPaidThrough: null }),
    );
    await second.service.evaluateMailbox({ mailboxId, workspaceId });

    expect(first.mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: mailboxId, lastHealthEvaluatedAt: IsNull() },
      expect.objectContaining({
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
        policySafeDailyCapacity: 10,
      }),
    );
    expect(first.warmupInboxClient.findByExactAddress).not.toHaveBeenCalled();
    expect(second.warmupInboxClient.findByExactAddress).not.toHaveBeenCalled();
    expect(second.mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: mailboxId, lastHealthEvaluatedAt: IsNull() },
      expect.objectContaining({
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
        policySafeDailyCapacity: 0,
      }),
    );
  });

  it('persists one actionable failure when transient Icemail credentials are unavailable', async () => {
    const test = setup();
    test.icemailClient.getMailboxCredential.mockResolvedValue(null);

    await test.service.evaluateMailbox({ mailboxId, workspaceId });

    expect(test.warmupInboxClient.createAdvanced).not.toHaveBeenCalled();
    expect(test.mailboxRepository.update).toHaveBeenCalledTimes(1);
    expect(test.mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: mailboxId, lastHealthEvaluatedAt: IsNull() },
      expect.objectContaining({
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
        safeFailureCode: 'CREDENTIALS_UNAVAILABLE',
        warmupState: ManagedEmailWarmupState.ACTION_REQUIRED,
      }),
    );
  });

  it('preflights exact address, creates once with transient credentials, and stores only warmup enrollment identity', async () => {
    const test = setup();

    await test.service.evaluateMailbox({ mailboxId, workspaceId });

    expect(test.warmupInboxClient.findByExactAddress).toHaveBeenCalledWith(
      address,
    );
    expect(test.warmupInboxClient.createAdvanced).toHaveBeenCalledTimes(1);
    expect(test.warmupInboxClient.createAdvanced).toHaveBeenCalledWith({
      address,
      credential,
      policy: policy.warmupConfiguration,
      senderFirstName: 'Ada',
      senderLastName: 'Lovelace',
    });
    const updateCalls = test.mailboxRepository.update.mock.calls;
    const persisted = updateCalls[updateCalls.length - 1]?.[2];
    expect(persisted).toMatchObject({ warmupEnrollmentId: 'warmup-1' });
    expect(persisted).not.toHaveProperty('providerMailboxId');
    expect(JSON.stringify(persisted)).not.toContain('transient-secret');
  });

  it('persists reconciliation-required after an uncertain create and never performs a second create', async () => {
    const test = setup();
    test.warmupInboxClient.createAdvanced.mockRejectedValue(
      new WarmupInboxException(
        WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
      ),
    );

    await test.service.evaluateMailbox({ mailboxId, workspaceId });

    expect(test.warmupInboxClient.createAdvanced).toHaveBeenCalledTimes(1);
    expect(test.mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: mailboxId, lastHealthEvaluatedAt: IsNull() },
      expect.objectContaining({
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
        safeFailureCode: 'WARMUP_RECONCILIATION_REQUIRED',
        warmupState: ManagedEmailWarmupState.RECONCILIATION_REQUIRED,
      }),
    );
  });

  it('normalizes provider, metrics, DNS, and connection evidence before readiness evaluation', async () => {
    const test = setup();

    await test.service.evaluateMailbox({ mailboxId, workspaceId });

    expect(test.dnsResolver.resolve).toHaveBeenCalledWith({
      dkimSelector: 'google',
      domain: 'example.com',
      expectedMxSuffixes: ['.google.com'],
    });
    expect(
      test.imapSmtpCaldavService.validateAndTestWorkspaceMailboxConnection,
    ).toHaveBeenCalledWith({
      connectionParameters: {
        IMAP: {
          connectionSecurity: EmailConnectionSecurity.SSL_TLS,
          host: credential.imap.host,
          password: credential.appPassword,
          port: credential.imap.port,
          username: credential.username,
        },
        SMTP: {
          connectionSecurity: EmailConnectionSecurity.SSL_TLS,
          host: credential.smtp.host,
          password: credential.appPassword,
          port: credential.smtp.port,
          username: credential.username,
        },
      },
      handle: address,
    });
    expect(test.readinessService.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialReady: true,
        independentlyResolvedMx: true,
        inboxPlacementBasisPoints: 9800,
        spamPlacementBasisPoints: 100,
        twentyConnectionReady: true,
        warmupDays: 7,
      }),
    );
    const updateCalls = test.mailboxRepository.update.mock.calls;
    const persisted = updateCalls[updateCalls.length - 1]?.[2];
    expect(persisted).toMatchObject({
      campaignEligibility: ManagedEmailCampaignEligibility.ELIGIBLE,
      policySafeDailyCapacity: 10,
      warmupState: ManagedEmailWarmupState.MAINTENANCE,
    });
    expect(persisted.healthFacts).toEqual(
      expect.objectContaining({ schemaVersion: 1, facts: expect.any(Array) }),
    );
  });

  it('fails protocol readiness when real IMAP or SMTP validation fails', async () => {
    const test = setup();

    test.imapSmtpCaldavService.validateAndTestWorkspaceMailboxConnection.mockRejectedValue(
      new Error('authentication failed'),
    );
    test.readinessService.evaluate.mockReturnValue({
      campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
      policySafeDailyCapacity: 0,
      ready: false,
      safeReasonCode: 'READINESS_BLOCKED',
    });

    await test.service.evaluateMailbox({ mailboxId, workspaceId });

    expect(test.readinessService.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        imapReady: false,
        smtpReady: false,
      }),
    );
    expect(
      JSON.stringify(test.mailboxRepository.update.mock.calls),
    ).not.toContain(credential.appPassword);
  });

  it('fails Twenty readiness when account authentication or sync is unhealthy', async () => {
    const test = setup();

    test.workspaceMailboxConnectionService.getManagedWorkspaceMailboxStatus.mockResolvedValue(
      {
        connectedAccountId: 'connected-account-1',
        messageChannelId: 'message-channel-1',
        state: 'RECONNECT_REQUIRED',
        syncStage: MessageChannelSyncStage.FAILED,
        syncStatus: MessageChannelSyncStatus.FAILED_UNKNOWN,
      },
    );

    await test.service.evaluateMailbox({ mailboxId, workspaceId });

    expect(test.readinessService.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ twentyConnectionReady: false }),
    );
  });

  it('rejects a stale readiness write when another worker evaluated the mailbox first', async () => {
    const previousEvaluation = new Date('2026-08-06T10:00:00.000Z');
    const test = setup();

    test.mailboxRepository.findOneBy.mockResolvedValue(
      mailbox({ lastHealthEvaluatedAt: previousEvaluation }),
    );

    await test.service.evaluateMailbox({ mailboxId, workspaceId });

    expect(test.mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: mailboxId, lastHealthEvaluatedAt: previousEvaluation },
      expect.any(Object),
    );
  });

  it('hard-blocks provider status while preserving capacity for invalid health input', async () => {
    const test = setup();
    test.mailboxRepository.findOneBy.mockResolvedValue(
      mailbox({
        adminDailyCap: 3,
        policySafeDailyCapacity: 10,
        warmupEnrollmentId: 'warmup-1',
        warmupState: ManagedEmailWarmupState.WARMING,
      }),
    );
    test.warmupInboxClient.getInbox.mockResolvedValue({
      ...(await test.warmupInboxClient.getInbox('warmup-1')),
      health: {
        ...(await test.warmupInboxClient.getInbox('warmup-1')).health,
        warmupDays: -1,
      },
      status: 'banned',
    });
    test.readinessService.evaluate.mockReturnValue({
      campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
      policySafeDailyCapacity: 0,
      ready: false,
      safeReasonCode: 'INVALID_INPUT',
    });

    await test.service.evaluateMailbox({ mailboxId, workspaceId });

    expect(test.mailboxRepository.update).toHaveBeenCalledWith(
      workspaceId,
      { id: mailboxId, lastHealthEvaluatedAt: IsNull() },
      expect.objectContaining({
        campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
        policySafeDailyCapacity: 10,
        warmupState: ManagedEmailWarmupState.ACTION_REQUIRED,
      }),
    );
  });
});
