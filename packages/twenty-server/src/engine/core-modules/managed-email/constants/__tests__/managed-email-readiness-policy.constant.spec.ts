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
  it('keeps the canonical production registry empty until approval', () => {
    expect(managedEmailReadinessPolicies).toEqual({});
    expect(
      resolveManagedEmailReadinessPolicy(approvedPolicy.version),
    ).toBeNull();
  });

  it('resolves an explicitly injected policy by exact version without exposing mutable state', () => {
    const resolve = createManagedEmailReadinessPolicyResolver({
      [approvedPolicy.version]: approvedPolicy,
    });

    const first = resolve(approvedPolicy.version);
    const second = resolve(approvedPolicy.version);

    expect(first).toEqual(approvedPolicy);
    expect(first).not.toBe(approvedPolicy);
    expect(second).not.toBe(first);
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
  });
});
