import { getRelationEmptyStateLabel } from '../getRelationEmptyStateLabel';

describe('getRelationEmptyStateLabel', () => {
  const settings = {
    emptyStateLabel: 'Legacy / source unavailable',
    emptyStateWhenBooleanFieldIsFalse: 'isDirectlyAdded',
  };

  it('labels a source-free legacy relation', () => {
    expect(
      getRelationEmptyStateLabel({
        fieldValue: [],
        booleanFieldValue: false,
        settings,
      }),
    ).toBe('Legacy / source unavailable');
  });

  it('does not label direct or source-backed relations as legacy', () => {
    expect(
      getRelationEmptyStateLabel({
        fieldValue: [],
        booleanFieldValue: true,
        settings,
      }),
    ).toBeUndefined();
    expect(
      getRelationEmptyStateLabel({
        fieldValue: [{ id: 'source-id' }],
        booleanFieldValue: false,
        settings,
      }),
    ).toBeUndefined();
  });
});
