import {
  createManagedEmailReadinessPolicyResolver,
  managedEmailReadinessPolicies,
  resolveManagedEmailReadinessPolicy,
} from '../managed-email-readiness-policy.constant';
import { type ManagedEmailReadinessPolicy } from '../../types/managed-email-readiness.type';

const approvedPolicy: ManagedEmailReadinessPolicy = {
  approvalState: 'APPROVED',
  capacityCurve: [{ capacity: 10, days: 7 }],
  dns: { dkimSelector: 'google', expectedMxSuffixes: ['.google.com'] },
  evaluationIntervalMs: 60 * 60 * 1000,
  maximumSpamPlacementBasisPoints: 100,
  metricsLookbackMs: 7 * 24 * 60 * 60 * 1000,
  minimumInboxPlacementBasisPoints: 9500,
  minimumWarmupDays: 7,
  requiresPlacementMetrics: true,
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

describe('managed email readiness policy registry', () => {
  it('keeps production fail-closed until the provider DKIM selector is observed', () => {
    expect(managedEmailReadinessPolicies).toEqual({});
    expect(
      resolveManagedEmailReadinessPolicy('production-technical-pilot-v1'),
    ).toBeNull();
  });
  it('resolves an explicitly injected policy by exact version without exposing mutable state', () => {
    const technicalPolicy: ManagedEmailReadinessPolicy = {
      ...approvedPolicy,
      requiresPlacementMetrics: false,
      version: 'technical-test-v1',
      warmupConfiguration: {
        ...approvedPolicy.warmupConfiguration,
        version: 'technical-test-v1',
      },
    };
    const resolve = createManagedEmailReadinessPolicyResolver({
      [approvedPolicy.version]: approvedPolicy,
      [technicalPolicy.version]: technicalPolicy,
    });

    const first = resolve(approvedPolicy.version);
    const second = resolve(approvedPolicy.version);

    expect(first).toEqual(approvedPolicy);
    expect(first).not.toBe(approvedPolicy);
    expect(second).not.toBe(first);
    expect(resolve(technicalPolicy.version)).toMatchObject({
      requiresPlacementMetrics: false,
      version: technicalPolicy.version,
    });
    expect(resolve('unknown')).toBeNull();
  });

  it('rejects malformed approved policies instead of treating their registry key as approval', () => {
    const wrongVersion = {
      ...approvedPolicy,
      version: 'different-version',
    };
    const negativeCapacity = {
      ...approvedPolicy,
      capacityCurve: [{ capacity: -1, days: 7 }],
    };
    const invalidPlacementMetricRequirement = {
      ...approvedPolicy,
      requiresPlacementMetrics: 'false',
    } as unknown as ManagedEmailReadinessPolicy;
    const {
      requiresPlacementMetrics: _requiresPlacementMetrics,
      ...policyWithoutPlacementMetricRequirement
    } = approvedPolicy;
    const missingPlacementMetricRequirement =
      policyWithoutPlacementMetricRequirement as unknown as ManagedEmailReadinessPolicy;

    expect(
      createManagedEmailReadinessPolicyResolver({
        [approvedPolicy.version]: wrongVersion,
      })(approvedPolicy.version),
    ).toBeNull();
    expect(
      createManagedEmailReadinessPolicyResolver({
        [approvedPolicy.version]: negativeCapacity,
      })(approvedPolicy.version),
    ).toBeNull();
    expect(
      createManagedEmailReadinessPolicyResolver({
        [approvedPolicy.version]: invalidPlacementMetricRequirement,
      })(approvedPolicy.version),
    ).toBeNull();
    expect(
      createManagedEmailReadinessPolicyResolver({
        [approvedPolicy.version]: missingPlacementMetricRequirement,
      })(approvedPolicy.version),
    ).toBeNull();
  });
});
