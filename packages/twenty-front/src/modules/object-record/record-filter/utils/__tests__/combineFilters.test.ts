import { type RecordGqlOperationFilter } from 'twenty-shared/types';
import { combineFilters } from 'twenty-shared/utils';

describe('combineFilters', () => {
  it('should return empty object when all filters are empty', () => {
    const result = combineFilters([{}, {}, {}]);
    expect(result).toEqual({});
  });

  it('should return the single non-empty filter directly', () => {
    const filter: RecordGqlOperationFilter = { field1: { eq: 'Test' } };
    const result = combineFilters([{}, filter, {}]);
    expect(result).toEqual(filter);
  });

  it('should combine multiple non-empty filters with AND logic', () => {
    const filter1: RecordGqlOperationFilter = { field1: { eq: 'Test' } };
    const filter2: RecordGqlOperationFilter = { field2: { eq: 'Active' } };
    const result = combineFilters([filter1, filter2]);
    expect(result).toEqual({
      and: [filter1, filter2],
    });
  });

  it('preserves a relation constraint when a group or search filter uses the same field', () => {
    const required: RecordGqlOperationFilter = {
      creatorId: { in: ['creator-a'] },
    };
    const group: RecordGqlOperationFilter = {
      creatorId: { in: ['creator-b'] },
    };
    expect(combineFilters([required, group])).toEqual({
      and: [required, group],
    });
  });

  it('should handle an empty array by returning an empty object', () => {
    const result = combineFilters([]);
    expect(result).toEqual({});
  });
});
