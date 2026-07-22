import { renderHook } from '@testing-library/react';

import { useEffectiveRecordFilters } from '@/object-record/record-filter/hooks/useEffectiveRecordFilters';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { ViewFilterOperand } from 'twenty-shared/types';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const nativeFilter = {
  id: 'native-filter',
  fieldMetadataId: 'native-field',
  value: 'native',
  displayValue: 'native',
  type: 'TEXT' as const,
  operand: ViewFilterOperand.CONTAINS,
  label: 'Native',
};

const queryOnlyFilter = {
  id: 'query-only-filter',
  fieldMetadataId: 'membership-field',
  value: 'list-id',
  displayValue: '',
  type: 'RELATION' as const,
  operand: ViewFilterOperand.IS,
  label: 'Membership',
};

describe('useEffectiveRecordFilters', () => {
  it('combines persisted and query-only filters for index consumers', () => {
    const { result } = renderHook(
      () => useEffectiveRecordFilters('record-index'),
      {
        wrapper: getJestMetadataAndApolloMocksWrapper({
          apolloMocks: [],
          onInitializeJotaiStore: (store) => {
            store.set(
              currentRecordFiltersComponentState.atomFamily({
                instanceId: 'record-index',
              }),
              [nativeFilter],
            );
            store.set(
              queryOnlyRecordFiltersComponentState.atomFamily({
                instanceId: 'record-index',
              }),
              [queryOnlyFilter],
            );
          },
        }),
      },
    );

    expect(result.current).toEqual([nativeFilter, queryOnlyFilter]);
  });
});
