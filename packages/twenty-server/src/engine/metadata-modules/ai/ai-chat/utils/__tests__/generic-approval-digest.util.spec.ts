import {
  canonicalJson,
  computeGenericApprovalDigest,
} from 'src/engine/metadata-modules/ai/ai-chat/utils/generic-approval-digest.util';

const ALICE_ID = '7f1c1c1e-0d8a-4b37-9f6a-8e9d2f1b0a11';
const TIM_ID = '2b0c1a55-6e1f-4c33-8d92-44f0e8a1c7b2';

describe('generic approval digest', () => {
  it('ignores object key order at every depth', () => {
    expect(
      computeGenericApprovalDigest({
        id: ALICE_ID,
        name: { firstName: 'Alice', lastName: 'Doe' },
      }),
    ).toBe(
      computeGenericApprovalDigest({
        name: { lastName: 'Doe', firstName: 'Alice' },
        id: ALICE_ID,
      }),
    );
  });

  it('keeps array order significant', () => {
    expect(computeGenericApprovalDigest({ ids: [ALICE_ID, TIM_ID] })).not.toBe(
      computeGenericApprovalDigest({ ids: [TIM_ID, ALICE_ID] }),
    );
  });

  it('drops undefined values the executor would also drop', () => {
    expect(
      computeGenericApprovalDigest({ id: ALICE_ID, city: undefined }),
    ).toBe(computeGenericApprovalDigest({ id: ALICE_ID }));
    expect(canonicalJson({ b: undefined, a: [1, { d: 2, c: 3 }] })).toBe(
      '{"a":[1,{"c":3,"d":2}]}',
    );
  });

  it.each([
    ['a different value', { id: ALICE_ID, creatorStatus: 'REJECTED' }],
    ['a different record', { id: TIM_ID, creatorStatus: 'QUALIFIED' }],
    [
      'an added field',
      { id: ALICE_ID, creatorStatus: 'QUALIFIED', city: 'Paris' },
    ],
    ['a differently cased value', { id: ALICE_ID, creatorStatus: 'qualified' }],
    [
      'a null instead of a missing field',
      { id: ALICE_ID, creatorStatus: null },
    ],
  ])('distinguishes %s', (_label, changed) => {
    expect(computeGenericApprovalDigest(changed)).not.toBe(
      computeGenericApprovalDigest({
        id: ALICE_ID,
        creatorStatus: 'QUALIFIED',
      }),
    );
  });

  it('returns a lowercase sha256 hex digest', () => {
    expect(computeGenericApprovalDigest({})).toMatch(/^[0-9a-f]{64}$/);
  });
});
