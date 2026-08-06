import { Inject, Injectable } from '@nestjs/common';

import { MANAGED_EMAIL_READINESS_POLICY_RESOLVER } from '../constants/managed-email-readiness-policy.constant';
import { ManagedEmailCampaignEligibility } from '../enums/managed-email-campaign-eligibility.enum';
import {
  type ManagedEmailReadinessInput,
  type ManagedEmailReadinessPolicyResolver,
  type ManagedEmailReadinessResult,
} from '../types/managed-email-readiness.type';

const MAX_CAPACITY = 1_000_000;
const MAX_BASIS_POINTS = 10_000;

const isBoundedInteger = (value: number, maximum: number): boolean =>
  Number.isSafeInteger(value) && value >= 0 && value <= maximum;

const blocked = (
  safeReasonCode: string,
  policySafeDailyCapacity = 0,
): ManagedEmailReadinessResult => ({
  campaignEligibility: ManagedEmailCampaignEligibility.BLOCKED,
  policySafeDailyCapacity,
  ready: false,
  safeReasonCode,
});

@Injectable()
export class ManagedEmailReadinessService {
  constructor(
    @Inject(MANAGED_EMAIL_READINESS_POLICY_RESOLVER)
    private readonly resolvePolicy: ManagedEmailReadinessPolicyResolver,
  ) {}

  assertApprovedPurchasePolicy({
    policyVersion,
    providerConfigurationKey,
  }: {
    policyVersion: string;
    providerConfigurationKey: string;
  }): void {
    const policy = this.resolvePolicy(policyVersion);

    if (
      policy === null ||
      policy.approvalState !== 'APPROVED' ||
      policy.version !== policyVersion ||
      policy.providerConfigurationKey !== providerConfigurationKey
    ) {
      throw new Error('Managed email readiness policy is unavailable');
    }
  }

  evaluate(input: ManagedEmailReadinessInput): ManagedEmailReadinessResult {
    const policy = this.resolvePolicy(input.policyVersion);

    if (
      policy === null ||
      policy.approvalState !== 'APPROVED' ||
      policy.version !== input.policyVersion
    ) {
      return blocked('POLICY_UNAVAILABLE');
    }
    const inputInvalid =
      isBoundedInteger(input.warmupDays, MAX_CAPACITY) === false ||
      (input.adminDailyCap !== null &&
        isBoundedInteger(input.adminDailyCap, MAX_CAPACITY) === false) ||
      (input.inboxPlacementBasisPoints !== null &&
        isBoundedInteger(input.inboxPlacementBasisPoints, MAX_BASIS_POINTS) ===
          false) ||
      (input.spamPlacementBasisPoints !== null &&
        isBoundedInteger(input.spamPlacementBasisPoints, MAX_BASIS_POINTS) ===
          false);

    if (inputInvalid) {
      return blocked('INVALID_INPUT');
    }

    let policyCapacity = 0;
    let selectedDays = -1;

    for (const point of policy.capacityCurve) {
      if (
        isBoundedInteger(point.days, MAX_CAPACITY) &&
        isBoundedInteger(point.capacity, MAX_CAPACITY) &&
        point.days <= input.warmupDays &&
        point.days > selectedDays
      ) {
        selectedDays = point.days;
        policyCapacity = point.capacity;
      }
    }

    const readinessBlocked =
      input.paid === false ||
      input.infrastructureActive === false ||
      input.dns.spf === false ||
      input.dns.dkim === false ||
      input.dns.dmarc === false ||
      input.dns.mx === false ||
      input.independentlyResolvedMx === false ||
      input.hardBlacklisted ||
      input.credentialReady === false ||
      input.smtpReady === false ||
      input.imapReady === false ||
      input.twentyConnectionReady === false ||
      input.hardProviderBlock;

    if (readinessBlocked) {
      return blocked('READINESS_BLOCKED', policyCapacity);
    }

    const effectiveCapacity =
      input.adminDailyCap === null
        ? policyCapacity
        : Math.min(policyCapacity, input.adminDailyCap);

    if (effectiveCapacity === 0) {
      return {
        campaignEligibility:
          ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED,
        policySafeDailyCapacity: policyCapacity,
        ready: false,
        safeReasonCode: 'CAPACITY_UNAVAILABLE',
      };
    }

    if (input.warmupDays < policy.minimumWarmupDays) {
      return {
        campaignEligibility:
          ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED,
        policySafeDailyCapacity: policyCapacity,
        ready: false,
        safeReasonCode: 'WARMUP_INCOMPLETE',
      };
    }
    if (
      input.inboxPlacementBasisPoints === null ||
      input.spamPlacementBasisPoints === null
    ) {
      return {
        campaignEligibility:
          ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED,
        policySafeDailyCapacity: policyCapacity,
        ready: false,
        safeReasonCode: 'HEALTH_EVIDENCE_UNAVAILABLE',
      };
    }
    const healthRegressed =
      input.warmupHealthy === false ||
      input.inboxPlacementBasisPoints <
        policy.minimumInboxPlacementBasisPoints ||
      input.spamPlacementBasisPoints > policy.maximumSpamPlacementBasisPoints;

    if (healthRegressed) {
      return {
        campaignEligibility:
          ManagedEmailCampaignEligibility.NEW_THREADS_BLOCKED,
        policySafeDailyCapacity: policyCapacity,
        ready: false,
        safeReasonCode: 'HEALTH_REGRESSION',
      };
    }

    return {
      campaignEligibility: ManagedEmailCampaignEligibility.ELIGIBLE,
      policySafeDailyCapacity: policyCapacity,
      ready: true,
      safeReasonCode: null,
    };
  }
}
