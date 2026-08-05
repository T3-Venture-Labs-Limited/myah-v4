import {
  MessageChannelSyncStage,
  MessageChannelSyncStatus,
} from 'twenty-shared/types';

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { type QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

import { EmailConnectionSecurity } from 'src/engine/core-modules/imap-smtp-caldav-connection/enums/email-connection-security.enum';
import { ImapSmtpCaldavService } from 'src/engine/core-modules/imap-smtp-caldav-connection/services/imap-smtp-caldav-connection.service';
import { WorkspaceMailboxConnectionService } from 'src/engine/core-modules/myah/services/workspace-mailbox-connection.service';
import { type PlaintextString } from 'src/engine/core-modules/secret-encryption/branded-strings/plaintext-string.type';
import { MANAGED_EMAIL_READINESS_POLICY_RESOLVER } from '../constants/managed-email-readiness-policy.constant';
import { ManagedEmailMailboxEntity } from '../entities/managed-email-mailbox.entity';
import { ManagedEmailCampaignEligibility } from '../enums/managed-email-campaign-eligibility.enum';
import { ManagedEmailInfrastructureState } from '../enums/managed-email-infrastructure-state.enum';
import { ManagedEmailWarmupState } from '../enums/managed-email-warmup-state.enum';
import { IcemailClient } from '../providers/icemail/icemail.client';
import { type IcemailMailboxCredential } from '../providers/icemail/icemail.types';
import {
  WarmupInboxException,
  WarmupInboxExceptionCode,
} from '../providers/warmup-inbox/warmup-inbox.exception';
import { WarmupInboxClient } from '../providers/warmup-inbox/warmup-inbox.client';
import {
  type ManagedWarmupPolicyConfiguration,
  type WarmupInboxDetail,
  type WarmupInboxMetrics,
} from '../providers/warmup-inbox/warmup-inbox.types';
import {
  type ManagedEmailReadinessPolicy,
  type ManagedEmailReadinessPolicyResolver,
  type ManagedEmailReadinessResult,
} from '../types/managed-email-readiness.type';
import { type ManagedEmailSafeFacts } from '../types/managed-email-persistence.type';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

import { ManagedEmailDnsResolverService } from './managed-email-dns-resolver.service';
import { ManagedEmailReadinessService } from './managed-email-readiness.service';

export const MANAGED_EMAIL_WARMUP_CLOCK = Symbol('MANAGED_EMAIL_WARMUP_CLOCK');
const DEFAULT_RECONCILIATION_DELAY_MS = 60 * 60 * 1000;
const MIN_EVALUATION_INTERVAL_MS = 60 * 1000;
const MAX_EVALUATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_METRICS_LOOKBACK_MS = 60 * 60 * 1000;
const MAX_METRICS_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const WARMUP_PROVIDER_KEY = 'WARMUP_INBOX';

export type ManagedEmailWarmupEvaluationResult = Readonly<{
  campaignEligibility: ManagedEmailCampaignEligibility;
  nextReconciliationAt: Date;
  policySafeDailyCapacity: number;
  safeFailureCode: string | null;
  warmupState: ManagedEmailWarmupState;
}>;

type ManagedEmailEnrollmentResult =
  | Readonly<{ enrollmentId: string }>
  | Readonly<{
      safeFailureCode: string;
      warmupState: ManagedEmailWarmupState;
    }>;

@Injectable()
export class ManagedEmailWarmupService {
  constructor(
    @InjectWorkspaceScopedRepository(ManagedEmailMailboxEntity)
    private readonly mailboxRepository: WorkspaceScopedRepository<ManagedEmailMailboxEntity>,
    private readonly warmupInboxClient: WarmupInboxClient,
    private readonly icemailClient: IcemailClient,
    private readonly imapSmtpCaldavService: ImapSmtpCaldavService,
    private readonly workspaceMailboxConnectionService: WorkspaceMailboxConnectionService,
    private readonly dnsResolverService: ManagedEmailDnsResolverService,
    private readonly readinessService: ManagedEmailReadinessService,
    @Inject(MANAGED_EMAIL_READINESS_POLICY_RESOLVER)
    private readonly resolvePolicy: ManagedEmailReadinessPolicyResolver,
    @Inject(MANAGED_EMAIL_WARMUP_CLOCK)
    private readonly now: () => Date = () => new Date(),
  ) {}

  async evaluateMailbox(
    input: Readonly<{
      mailboxId: string;
      workspaceId: string;
    }>,
  ): Promise<ManagedEmailWarmupEvaluationResult> {
    const mailbox = await this.mailboxRepository.findOneBy(input.workspaceId, {
      id: input.mailboxId,
    });

    if (mailbox === null) {
      throw new Error('Managed email mailbox was not found');
    }

    const evaluatedAt = this.now();
    const policy = this.resolvePolicy(mailbox.readinessPolicyVersion);

    if (!this.isOperationalPolicy(policy)) {
      return this.persistBlocked(mailbox, evaluatedAt, {
        safeFailureCode: 'POLICY_UNAVAILABLE',
        warmupState: ManagedEmailWarmupState.ACTION_REQUIRED,
      });
    }

    const nextReconciliationAt = new Date(
      evaluatedAt.getTime() + policy.evaluationIntervalMs,
    );
    const warmupPaid = this.isFuture(mailbox.warmupPaidThrough, evaluatedAt);
    const infrastructurePaid = this.isFuture(
      mailbox.infrastructurePaidThrough,
      evaluatedAt,
    );
    const infrastructureActive =
      infrastructurePaid &&
      mailbox.infrastructureState === ManagedEmailInfrastructureState.ACTIVE;

    if (!warmupPaid || !infrastructureActive) {
      return this.persistBlocked(mailbox, evaluatedAt, {
        nextReconciliationAt,
        safeFailureCode: warmupPaid
          ? 'INFRASTRUCTURE_NOT_ACTIVE'
          : 'WARMUP_PAYMENT_REQUIRED',
        warmupState: mailbox.warmupState,
      });
    }

    const enrollment = await this.ensureEnrollment(mailbox, policy);

    if ('safeFailureCode' in enrollment) {
      return this.persistBlocked(mailbox, evaluatedAt, {
        nextReconciliationAt,
        safeFailureCode: enrollment.safeFailureCode,
        warmupState: enrollment.warmupState,
      });
    }
    const { enrollmentId } = enrollment;

    let detail: WarmupInboxDetail | null;

    try {
      detail = await this.warmupInboxClient.getInbox(enrollmentId);
    } catch {
      return this.persistBlocked(mailbox, evaluatedAt, {
        nextReconciliationAt,
        safeFailureCode: 'WARMUP_PROVIDER_UNAVAILABLE',
        warmupEnrollmentId: enrollmentId,
        warmupState: mailbox.warmupState,
      });
    }
    if (detail === null || detail.address !== mailbox.normalizedAddress) {
      return this.persistBlocked(mailbox, evaluatedAt, {
        nextReconciliationAt,
        safeFailureCode: 'WARMUP_RECONCILIATION_REQUIRED',
        warmupEnrollmentId: enrollmentId,
        warmupState: ManagedEmailWarmupState.RECONCILIATION_REQUIRED,
      });
    }

    const policyApplied = await this.ensureProviderPolicy(
      enrollmentId,
      detail,
      policy.warmupConfiguration,
    );

    if (!policyApplied) {
      return this.persistBlocked(mailbox, evaluatedAt, {
        nextReconciliationAt,
        safeFailureCode: 'WARMUP_POLICY_RECONCILIATION_REQUIRED',
        warmupEnrollmentId: enrollmentId,
        warmupState: ManagedEmailWarmupState.RECONCILIATION_REQUIRED,
      });
    }

    if (detail.status === 'paused') {
      try {
        await this.warmupInboxClient.start(enrollmentId);
      } catch {
        return this.persistBlocked(mailbox, evaluatedAt, {
          nextReconciliationAt,
          safeFailureCode: 'WARMUP_START_FAILED',
          warmupEnrollmentId: enrollmentId,
          warmupState: ManagedEmailWarmupState.ACTION_REQUIRED,
        });
      }
    }

    const credential = mailbox.providerMailboxId
      ? await this.icemailClient
          .getMailboxCredential(mailbox.providerMailboxId)
          .catch(() => null)
      : null;
    const domain = mailbox.normalizedAddress.split('@')[1] ?? '';
    const credentialReady =
      credential !== null &&
      credential.username.trim().toLowerCase() === mailbox.normalizedAddress;
    const [dns, metrics, protocolsReady, twentyConnectionReady] =
      await Promise.all([
        this.dnsResolverService.resolve({
          dkimSelector: policy.dns.dkimSelector,
          domain,
          expectedMxSuffixes: policy.dns.expectedMxSuffixes,
        }),
        this.getMetrics(enrollmentId, evaluatedAt, policy),
        credentialReady
          ? this.validateMailboxProtocols(credential)
          : Promise.resolve(false),
        this.isTwentyConnectionReady(mailbox),
      ]);
    const inboxPlacementBasisPoints = this.basisPoints(
      metrics?.totals.landedInbox,
      metrics?.totals.messages,
    );
    const spamPlacementBasisPoints = this.basisPoints(
      metrics?.totals.landedSpam,
      metrics?.totals.messages,
    );
    const providerBlocked = ['banned', 'error', 'suspended'].includes(
      detail.status,
    );
    const imapReady = protocolsReady;
    const smtpReady = protocolsReady;
    const readiness: ManagedEmailReadinessResult = providerBlocked
      ? {
          campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
          policySafeDailyCapacity: 0,
          ready: false,
          safeReasonCode: 'WARMUP_PROVIDER_BLOCKED',
        }
      : this.readinessService.evaluate({
          adminDailyCap: mailbox.adminDailyCap,
          credentialReady,
          dns,
          hardBlacklisted: detail.health.detectedBlacklists > 0,
          hardProviderBlock: false,
          imapReady,
          inboxPlacementBasisPoints,
          independentlyResolvedMx: dns.mx,
          infrastructureActive,
          paid: warmupPaid,
          policyVersion: mailbox.readinessPolicyVersion,
          smtpReady,
          spamPlacementBasisPoints,
          twentyConnectionReady,
          warmupDays: detail.health.warmupDays ?? 0,
          warmupHealthy: detail.status === 'running',
        });
    const warmupState = providerBlocked
      ? ManagedEmailWarmupState.ACTION_REQUIRED
      : readiness.ready
        ? ManagedEmailWarmupState.MAINTENANCE
        : ManagedEmailWarmupState.WARMING;
    const healthFacts = this.buildSafeFacts({
      detail,
      dns,
      inboxPlacementBasisPoints,
      spamPlacementBasisPoints,
    });

    return this.persist(mailbox, {
      campaignEligibility: readiness.campaignEligibility,
      healthFacts,
      lastHealthEvaluatedAt: evaluatedAt,
      nextReconciliationAt,
      policySafeDailyCapacity: readiness.policySafeDailyCapacity,
      safeFailureCode: readiness.safeReasonCode,
      warmupEnrollmentId: enrollmentId,
      warmupProviderConfigurationKey: policy.providerConfigurationKey,
      warmupProviderKey: WARMUP_PROVIDER_KEY,
      warmupState,
    });
  }

  private async ensureEnrollment(
    mailbox: ManagedEmailMailboxEntity,
    policy: ManagedEmailReadinessPolicy,
  ): Promise<ManagedEmailEnrollmentResult> {
    if (mailbox.warmupEnrollmentId !== null) {
      return { enrollmentId: mailbox.warmupEnrollmentId };
    }

    let matches;

    try {
      matches = await this.warmupInboxClient.findByExactAddress(
        mailbox.normalizedAddress,
      );
    } catch {
      return {
        safeFailureCode: 'WARMUP_PROVIDER_UNAVAILABLE',
        warmupState: ManagedEmailWarmupState.ACTION_REQUIRED,
      };
    }
    if (matches.length === 1) return { enrollmentId: matches[0].id };
    if (matches.length > 1) {
      return {
        safeFailureCode: 'WARMUP_RECONCILIATION_REQUIRED',
        warmupState: ManagedEmailWarmupState.RECONCILIATION_REQUIRED,
      };
    }
    if (mailbox.providerMailboxId === null) {
      return {
        safeFailureCode: 'CREDENTIALS_UNAVAILABLE',
        warmupState: ManagedEmailWarmupState.ACTION_REQUIRED,
      };
    }

    const credential = await this.icemailClient
      .getMailboxCredential(mailbox.providerMailboxId)
      .catch(() => null);

    if (
      credential === null ||
      credential.username.trim().toLowerCase() !== mailbox.normalizedAddress
    ) {
      return {
        safeFailureCode: 'CREDENTIALS_UNAVAILABLE',
        warmupState: ManagedEmailWarmupState.ACTION_REQUIRED,
      };
    }

    try {
      const receipt = await this.warmupInboxClient.createAdvanced({
        address: mailbox.normalizedAddress,
        credential,
        policy: policy.warmupConfiguration,
        senderFirstName: mailbox.personaFirstName,
        senderLastName: mailbox.personaLastName,
      });

      return { enrollmentId: receipt.id };
    } catch (error) {
      if (
        error instanceof WarmupInboxException &&
        [
          WarmupInboxExceptionCode.CONFLICT,
          WarmupInboxExceptionCode.RECONCILIATION_REQUIRED,
          WarmupInboxExceptionCode.WRITE_OUTCOME_UNCERTAIN,
        ].includes(error.code)
      ) {
        return {
          safeFailureCode: 'WARMUP_RECONCILIATION_REQUIRED',
          warmupState: ManagedEmailWarmupState.RECONCILIATION_REQUIRED,
        };
      }
      return {
        safeFailureCode: 'WARMUP_PROVIDER_UNAVAILABLE',
        warmupState: ManagedEmailWarmupState.ACTION_REQUIRED,
      };
    }
  }

  private async ensureProviderPolicy(
    enrollmentId: string,
    detail: WarmupInboxDetail,
    policy: ManagedWarmupPolicyConfiguration,
  ): Promise<boolean> {
    try {
      await this.warmupInboxClient.updatePolicy(enrollmentId, policy);
      return true;
    } catch (error) {
      return (
        error instanceof WarmupInboxException &&
        error.code === WarmupInboxExceptionCode.CONFLICT &&
        detail.policy.increasePerDay === policy.increasePerDay &&
        detail.policy.maxSendsPerDay === policy.maxSendsPerDay &&
        detail.policy.replyRatePercent === policy.replyRatePercent &&
        detail.policy.startingBaseline === policy.startingBaseline &&
        detail.policy.strategy === policy.strategy
      );
    }
  }

  private async getMetrics(
    enrollmentId: string,
    evaluatedAt: Date,
    policy: ManagedEmailReadinessPolicy,
  ): Promise<WarmupInboxMetrics | null> {
    try {
      return await this.warmupInboxClient.getMetrics(enrollmentId, {
        from: new Date(evaluatedAt.getTime() - policy.metricsLookbackMs),
        to: evaluatedAt,
      });
    } catch {
      return null;
    }
  }

  private basisPoints(
    numerator: number | undefined,
    denominator: number | undefined,
  ): number | null {
    if (
      numerator === undefined ||
      denominator === undefined ||
      !Number.isSafeInteger(numerator) ||
      !Number.isSafeInteger(denominator) ||
      numerator < 0 ||
      denominator <= 0 ||
      numerator > denominator
    ) {
      return null;
    }

    return Math.floor((numerator * 10_000) / denominator);
  }

  private buildSafeFacts(
    input: Readonly<{
      detail: WarmupInboxDetail;
      dns: Readonly<{
        dkim: boolean;
        dmarc: boolean;
        mx: boolean;
        spf: boolean;
      }>;
      inboxPlacementBasisPoints: number | null;
      spamPlacementBasisPoints: number | null;
    }>,
  ): ManagedEmailSafeFacts {
    const facts: ManagedEmailSafeFacts['facts'][number][] = [
      { name: 'dnsDkim', value: input.dns.dkim },
      { name: 'dnsDmarc', value: input.dns.dmarc },
      { name: 'dnsMx', value: input.dns.mx },
      { name: 'dnsSpf', value: input.dns.spf },
      {
        name: 'providerDetectedBlacklists',
        value: input.detail.health.detectedBlacklists,
      },
      { name: 'providerScore', value: input.detail.score },
      { name: 'providerStatus', value: input.detail.status },
      { name: 'warmupDays', value: input.detail.health.warmupDays },
    ];

    if (input.inboxPlacementBasisPoints !== null) {
      facts.push({
        name: 'inboxPlacementBasisPoints',
        value: input.inboxPlacementBasisPoints,
      });
    }
    if (input.spamPlacementBasisPoints !== null) {
      facts.push({
        name: 'spamPlacementBasisPoints',
        value: input.spamPlacementBasisPoints,
      });
    }

    return { facts, schemaVersion: 1 };
  }

  private async validateMailboxProtocols(
    credential: IcemailMailboxCredential,
  ): Promise<boolean> {
    try {
      await this.imapSmtpCaldavService.validateAndTestWorkspaceMailboxConnection(
        {
          connectionParameters: {
            IMAP: {
              connectionSecurity: EmailConnectionSecurity.SSL_TLS,
              host: credential.imap.host,
              password: credential.appPassword as PlaintextString,
              port: credential.imap.port,
              username: credential.username,
            },
            SMTP: {
              connectionSecurity: EmailConnectionSecurity.SSL_TLS,
              host: credential.smtp.host,
              password: credential.appPassword as PlaintextString,
              port: credential.smtp.port,
              username: credential.username,
            },
          },
          handle: credential.username,
        },
      );
      return true;
    } catch {
      return false;
    }
  }

  private async isTwentyConnectionReady(
    mailbox: ManagedEmailMailboxEntity,
  ): Promise<boolean> {
    if (
      mailbox.connectedAccountId === null ||
      mailbox.messageChannelId === null
    ) {
      return false;
    }
    try {
      const status =
        await this.workspaceMailboxConnectionService.getManagedWorkspaceMailboxStatus(
          {
            connectedAccountId: mailbox.connectedAccountId,
            idempotencyKey: `managed-mailbox:${mailbox.id}`,
            messageChannelId: mailbox.messageChannelId,
            workspaceId: mailbox.workspaceId,
          },
        );

      return (
        status.connectedAccountId === mailbox.connectedAccountId &&
        status.messageChannelId === mailbox.messageChannelId &&
        status.state === 'CONNECTED' &&
        status.syncStatus === MessageChannelSyncStatus.ACTIVE &&
        status.syncStage !== MessageChannelSyncStage.FAILED
      );
    } catch {
      return false;
    }
  }

  private isOperationalPolicy(
    policy: ManagedEmailReadinessPolicy | null,
  ): policy is ManagedEmailReadinessPolicy {
    return (
      policy !== null &&
      policy.approvalState === 'APPROVED' &&
      Number.isSafeInteger(policy.evaluationIntervalMs) &&
      policy.evaluationIntervalMs >= MIN_EVALUATION_INTERVAL_MS &&
      policy.evaluationIntervalMs <= MAX_EVALUATION_INTERVAL_MS &&
      Number.isSafeInteger(policy.metricsLookbackMs) &&
      policy.metricsLookbackMs >= MIN_METRICS_LOOKBACK_MS &&
      policy.metricsLookbackMs <= MAX_METRICS_LOOKBACK_MS
    );
  }

  private isFuture(value: Date | null, comparedAt: Date): boolean {
    return value instanceof Date && value.getTime() > comparedAt.getTime();
  }

  private async persistBlocked(
    mailbox: ManagedEmailMailboxEntity,
    evaluatedAt: Date,
    input: Readonly<{
      nextReconciliationAt?: Date;
      safeFailureCode: string;
      warmupEnrollmentId?: string;
      warmupState: ManagedEmailWarmupState;
    }>,
  ): Promise<ManagedEmailWarmupEvaluationResult> {
    return this.persist(mailbox, {
      campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
      lastHealthEvaluatedAt: evaluatedAt,
      nextReconciliationAt:
        input.nextReconciliationAt ??
        new Date(evaluatedAt.getTime() + DEFAULT_RECONCILIATION_DELAY_MS),
      policySafeDailyCapacity: 0,
      safeFailureCode: input.safeFailureCode,
      ...(input.warmupEnrollmentId === undefined
        ? {}
        : { warmupEnrollmentId: input.warmupEnrollmentId }),
      warmupState: input.warmupState,
    });
  }

  private async persist(
    mailbox: ManagedEmailMailboxEntity,
    update: QueryDeepPartialEntity<ManagedEmailMailboxEntity> & {
      campaignEligibility: ManagedEmailCampaignEligibility;
      nextReconciliationAt: Date;
      policySafeDailyCapacity: number;
      safeFailureCode: string | null;
      warmupState: ManagedEmailWarmupState;
    },
  ): Promise<ManagedEmailWarmupEvaluationResult> {
    const result = await this.mailboxRepository.update(
      mailbox.workspaceId,
      {
        id: mailbox.id,
        lastHealthEvaluatedAt: mailbox.lastHealthEvaluatedAt ?? IsNull(),
      },
      update,
    );

    if (result.affected !== 1) {
      throw new Error('Managed email mailbox readiness update failed');
    }

    return {
      campaignEligibility: update.campaignEligibility,
      nextReconciliationAt: update.nextReconciliationAt,
      policySafeDailyCapacity: update.policySafeDailyCapacity,
      safeFailureCode: update.safeFailureCode,
      warmupState: update.warmupState,
    };
  }
}
