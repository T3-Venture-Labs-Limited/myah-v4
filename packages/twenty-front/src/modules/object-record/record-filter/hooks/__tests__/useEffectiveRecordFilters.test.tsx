import { renderHook } from '@testing-library/react';

import {
  RecordIndexContextProvider,
  type RecordIndexContextValue,
} from '@/object-record/record-index/contexts/RecordIndexContext';
import { useEffectiveRecordFilters } from '@/object-record/record-filter/hooks/useEffectiveRecordFilters';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { type PropsWithChildren } from 'react';
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

  it('includes a synchronous widget constraint for its instance without changing the editable filters', () => {
    const widgetFilter = {
      ...queryOnlyFilter,
      id: 'mandatory',
      value: 'creator-a',
    };
    const BaseWrapper = getJestMetadataAndApolloMocksWrapper({
      apolloMocks: [],
      onInitializeJotaiStore: (store) => {
        store.set(
          currentRecordFiltersComponentState.atomFamily({
            instanceId: 'widget-a',
          }),
          [nativeFilter],
        );
        store.set(
          queryOnlyRecordFiltersComponentState.atomFamily({
            instanceId: 'widget-a',
          }),
          [queryOnlyFilter],
        );
      },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <BaseWrapper>
        <RecordIndexContextProvider
          value={
            {
              recordIndexId: 'widget-a',
              queryOnlyRecordFilters: [widgetFilter],
            } as RecordIndexContextValue
          }
        >
          {children}
        </RecordIndexContextProvider>
      </BaseWrapper>
    );
    const { result } = renderHook(
      () => ({
        matching: useEffectiveRecordFilters('widget-a'),
        unrelated: useEffectiveRecordFilters('widget-b'),
      }),
      { wrapper },
    );
    expect(result.current.matching).toEqual([
      nativeFilter,
      queryOnlyFilter,
      widgetFilter,
    ]);
    expect(result.current.unrelated).toEqual([]);
  });
});
