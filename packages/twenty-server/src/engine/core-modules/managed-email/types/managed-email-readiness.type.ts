import { type ManagedEmailCampaignEligibility } from '../enums/managed-email-campaign-eligibility.enum';
import { type ManagedWarmupPolicyConfiguration } from '../providers/warmup-inbox/warmup-inbox.types';

export type ManagedEmailReadinessPolicy = Readonly<{
  approvalState: 'APPROVED' | 'UNAPPROVED';
  capacityCurve: readonly Readonly<{ capacity: number; days: number }>[];
  dns: Readonly<{
    dkimSelector: string;
    expectedMxSuffixes: readonly string[];
  }>;
  evaluationIntervalMs: number;
  maximumSpamPlacementBasisPoints: number;
  metricsLookbackMs: number;
  minimumInboxPlacementBasisPoints: number;
  minimumWarmupDays: number;
  providerConfigurationKey: string;
  version: string;
  warmupConfiguration: ManagedWarmupPolicyConfiguration;
}>;

export type ManagedEmailReadinessPolicyResolver = (
  version: string,
) => ManagedEmailReadinessPolicy | null;

export type ManagedEmailReadinessInput = Readonly<{
  adminDailyCap: number | null;
  credentialReady: boolean;
  dns: Readonly<{ dkim: boolean; dmarc: boolean; mx: boolean; spf: boolean }>;
  hardBlacklisted: boolean;
  hardProviderBlock: boolean;
  imapReady: boolean;
  inboxPlacementBasisPoints: number | null;
  independentlyResolvedMx: boolean;
  infrastructureActive: boolean;
  paid: boolean;
  policyVersion: string;
  smtpReady: boolean;
  spamPlacementBasisPoints: number | null;
  twentyConnectionReady: boolean;
  warmupDays: number;
  warmupHealthy: boolean;
}>;

export type ManagedEmailReadinessResult = Readonly<{
  campaignEligibility: ManagedEmailCampaignEligibility;
  policySafeDailyCapacity: number;
  ready: boolean;
  safeReasonCode: string | null;
}>;
