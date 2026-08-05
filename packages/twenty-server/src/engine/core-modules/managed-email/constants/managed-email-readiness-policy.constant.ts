import {
  type ManagedEmailReadinessPolicy,
  type ManagedEmailReadinessPolicyResolver,
} from '../types/managed-email-readiness.type';

export const MANAGED_EMAIL_READINESS_POLICY_RESOLVER = Symbol(
  'MANAGED_EMAIL_READINESS_POLICY_RESOLVER',
);

const isNonEmpty = (value: string): boolean => value.trim() !== '';
const isNonNegativeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;
const isBoundedInteger = (value: number, maximum: number): boolean =>
  isNonNegativeInteger(value) && value <= maximum;

const isValidPolicy = (
  registryVersion: string,
  policy: ManagedEmailReadinessPolicy,
): boolean => {
  const curveDays = new Set<number>();

  return (
    policy.version === registryVersion &&
    isNonEmpty(policy.version) &&
    isNonEmpty(policy.providerConfigurationKey) &&
    policy.warmupConfiguration.version === policy.version &&
    policy.warmupConfiguration.strategy === 'progressive' &&
    isNonNegativeInteger(policy.warmupConfiguration.increasePerDay) &&
    isNonNegativeInteger(policy.warmupConfiguration.maxSendsPerDay) &&
    isBoundedInteger(policy.warmupConfiguration.replyRatePercent, 100) &&
    isNonNegativeInteger(policy.warmupConfiguration.startingBaseline) &&
    Number.isSafeInteger(policy.evaluationIntervalMs) &&
    policy.evaluationIntervalMs > 0 &&
    Number.isSafeInteger(policy.metricsLookbackMs) &&
    policy.metricsLookbackMs > 0 &&
    isNonNegativeInteger(policy.minimumWarmupDays) &&
    isBoundedInteger(policy.minimumInboxPlacementBasisPoints, 10_000) &&
    isBoundedInteger(policy.maximumSpamPlacementBasisPoints, 10_000) &&
    isNonEmpty(policy.dns.dkimSelector) &&
    policy.dns.expectedMxSuffixes.length > 0 &&
    policy.dns.expectedMxSuffixes.every(isNonEmpty) &&
    policy.capacityCurve.length > 0 &&
    policy.capacityCurve.every((point) => {
      if (
        !isNonNegativeInteger(point.days) ||
        !isNonNegativeInteger(point.capacity) ||
        curveDays.has(point.days)
      ) {
        return false;
      }
      curveDays.add(point.days);
      return true;
    })
  );
};

const clonePolicy = (
  policy: ManagedEmailReadinessPolicy,
): ManagedEmailReadinessPolicy => ({
  ...policy,
  capacityCurve: policy.capacityCurve.map((point) => ({ ...point })),
  dns: {
    ...policy.dns,
    expectedMxSuffixes: [...policy.dns.expectedMxSuffixes],
  },
  warmupConfiguration: { ...policy.warmupConfiguration },
});

export const createManagedEmailReadinessPolicyResolver =
  (
    policies: Readonly<Record<string, ManagedEmailReadinessPolicy>>,
  ): ManagedEmailReadinessPolicyResolver =>
  (version) => {
    if (typeof version !== 'string' || version.trim() === '') return null;

    const policy = policies[version];

    return policy === undefined || !isValidPolicy(version, policy)
      ? null
      : clonePolicy(policy);
  };

// Production remains fail-closed until a reviewed pilot policy is approved.
export const managedEmailReadinessPolicies: Readonly<
  Record<string, ManagedEmailReadinessPolicy>
> = Object.freeze({});

export const resolveManagedEmailReadinessPolicy =
  createManagedEmailReadinessPolicyResolver(managedEmailReadinessPolicies);
