import { ManagedEmailCampaignEligibility } from '../../enums/managed-email-campaign-eligibility.enum';
import {
  type ManagedEmailReadinessInput,
  type ManagedEmailReadinessPolicy,
} from '../../types/managed-email-readiness.type';
import { ManagedEmailReadinessService } from '../managed-email-readiness.service';

const approvedPolicy: ManagedEmailReadinessPolicy = {
  approvalState: 'APPROVED',
  capacityCurve: [
    { capacity: 4, days: 0 },
    { capacity: 10, days: 7 },
  ],
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

const readyInput = (
  overrides: Partial<ManagedEmailReadinessInput> = {},
): ManagedEmailReadinessInput => ({
  adminDailyCap: null,
  credentialReady: true,
  dns: { dkim: true, dmarc: true, mx: true, spf: true },
  hardBlacklisted: false,
  hardProviderBlock: false,
  imapReady: true,
  inboxPlacementBasisPoints: 9800,
  independentlyResolvedMx: true,
  infrastructureActive: true,
  paid: true,
  policyVersion: approvedPolicy.version,
  smtpReady: true,
  spamPlacementBasisPoints: 50,
  twentyConnectionReady: true,
  warmupDays: 7,
  warmupHealthy: true,
  ...overrides,
});

const service = (policy: ManagedEmailReadinessPolicy | null = approvedPolicy) =>
  new ManagedEmailReadinessService(() => policy);

describe('ManagedEmailReadinessService', () => {
  it.each([
    ['payment', { paid: false }],
    ['infrastructure', { infrastructureActive: false }],
    ['SPF', { dns: { dkim: true, dmarc: true, mx: true, spf: false } }],
    ['independent MX', { independentlyResolvedMx: false }],
    ['credential', { credentialReady: false }],
    ['SMTP', { smtpReady: false }],
    ['IMAP', { imapReady: false }],
    ['Twenty connection', { twentyConnectionReady: false }],
    ['blacklist', { hardBlacklisted: true }],
    ['provider block', { hardProviderBlock: true }],
  ])('hard-blocks on %s', (_name, overrides) => {
    expect(service().evaluate(readyInput(overrides as never))).toMatchObject({
      campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
      policySafeDailyCapacity: 0,
      ready: false,
    });
  });

  it('fails closed when the policy is absent, unapproved, or mismatched', () => {
    expect(service(null).evaluate(readyInput()).safeReasonCode).toBe(
      'POLICY_UNAVAILABLE',
    );
    expect(
      service({ ...approvedPolicy, approvalState: 'UNAPPROVED' }).evaluate(
        readyInput(),
      ).policySafeDailyCapacity,
    ).toBe(0);
    expect(
      service().evaluate(readyInput({ policyVersion: 'other' }))
        .policySafeDailyCapacity,
    ).toBe(0);
  });

  it('treats unavailable placement metrics as a soft block, never as zero-quality evidence', () => {
    expect(
      service().evaluate(
        readyInput({
          inboxPlacementBasisPoints: null,
          spamPlacementBasisPoints: null,
        }),
      ),
    ).toMatchObject({
      campaignEligibility: ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED,
      ready: false,
      safeReasonCode: 'HEALTH_EVIDENCE_UNAVAILABLE',
    });
  });

  it('soft-regresses health while retaining bounded policy capacity', () => {
    const result = service().evaluate(readyInput({ warmupHealthy: false }));

    expect(result).toMatchObject({
      campaignEligibility: ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED,
      policySafeDailyCapacity: 10,
      ready: false,
    });
  });

  it('uses the lower administrator cap and never a caller-supplied provider running flag', () => {
    const input = readyInput({
      adminDailyCap: 3,
    }) as ManagedEmailReadinessInput & {
      providerStatus?: string;
    };
    input.providerStatus = 'running';

    expect(service().evaluate(input)).toMatchObject({
      campaignEligibility: ManagedEmailCampaignEligibility.ELIGIBLE,
      policySafeDailyCapacity: 3,
      ready: true,
    });
  });

  it('never marks a mailbox eligible when its effective capacity is zero', () => {
    expect(service().evaluate(readyInput({ adminDailyCap: 0 }))).toMatchObject({
      campaignEligibility: ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED,
      policySafeDailyCapacity: 0,
      ready: false,
      safeReasonCode: 'CAPACITY_UNAVAILABLE',
    });
  });
});
