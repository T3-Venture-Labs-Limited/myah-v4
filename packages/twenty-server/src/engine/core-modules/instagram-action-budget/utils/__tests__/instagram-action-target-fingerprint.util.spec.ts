import { createHash } from 'crypto';

import { computeInstagramActionTargetFingerprints } from '../instagram-action-target-fingerprint.util';

const target = {
  instagramAccountRecordId: 'account',
  normalizedHandle: 'creator.name',
  providerId: 'profile-001',
  providerMessagingId: 'messaging-009',
};

describe('computeInstagramActionTargetFingerprints', () => {
  it('keeps one stable account and messaging target across mutable handle, profile, Creator, body and route', () => {
    const original = computeInstagramActionTargetFingerprints(target);
    const changed = {
      ...target,
      normalizedHandle: 'renamed.creator',
      providerId: 'other-profile',
      creatorRecordId: 'other-creator',
      body: 'different body',
      actionKind: 'REPLY',
    };
    expect(
      computeInstagramActionTargetFingerprints(changed).targetFingerprint,
    ).toBe(original.targetFingerprint);
    expect(
      computeInstagramActionTargetFingerprints({
        ...target,
        instagramAccountRecordId: 'other-account',
      }).targetFingerprint,
    ).not.toBe(original.targetFingerprint);
    expect(
      computeInstagramActionTargetFingerprints({
        ...target,
        providerMessagingId: 'other-recipient',
      }).targetFingerprint,
    ).not.toBe(original.targetFingerprint);
  });

  it('retains the historical v2 handle/profile fingerprint without rewriting reservations', () => {
    expect(
      computeInstagramActionTargetFingerprints(target).legacyTargetFingerprints,
    ).toEqual([
      createHash('sha256')
        .update(JSON.stringify(['creator.name', 'profile-001']), 'utf8')
        .digest('hex'),
    ]);
  });
});
