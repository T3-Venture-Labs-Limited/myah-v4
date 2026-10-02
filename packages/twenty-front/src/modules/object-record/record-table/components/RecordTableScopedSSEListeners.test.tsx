import { RecordTableEmptyHasNewRecordEffect } from '@/object-record/record-table/components/RecordTableEmptyHasNewRecordEffect';
import { RecordTableVirtualizedSSESubscribeEffect } from '@/object-record/record-table/virtualization/components/RecordTableVirtualizedSSESubscribeEffect';
import { requiredQueryListenersState } from '@/sse-db-event/states/requiredQueryListenersState';
import { render } from '@testing-library/react';
import { createStore, Provider } from 'jotai';

const mockScope = { recordIndexId: '', creatorId: '', scoped: false };

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    objectMetadataItem: {
      id: 'social-profile-metadata-id',
      nameSingular: 'socialProfile',
    },
    recordIndexId: mockScope.recordIndexId,
    queryOnlyRecordFilters: mockScope.scoped
      ? [{ creatorId: mockScope.creatorId }]
      : undefined,
  }),
}));
jest.mock(
  '@/object-record/record-filter/hooks/useEffectiveRecordFilters',
  () => ({
    useEffectiveRecordFilters: () => [{ creatorId: mockScope.creatorId }],
  }),
);
jest.mock(
  '@/object-record/record-filter/hooks/useFilterValueDependencies',
  () => ({
    useFilterValueDependencies: () => ({ filterValueDependencies: [] }),
  }),
);
jest.mock(
  '@/object-record/object-sort-dropdown/utils/turnSortsIntoOrderBy',
  () => ({
    turnSortsIntoOrderBy: () => [],
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => [],
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({
    useAtomComponentSelectorValue: () => false,
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState',
  () => ({
    useAtomComponentStateCallbackState: () => ({}),
  }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => [],
}));
jest.mock('twenty-shared/utils', () => ({
  ...jest.requireActual('twenty-shared/utils'),
  computeRecordGqlOperationFilter: ({
    recordFilters,
  }: {
    recordFilters: { creatorId: string }[];
  }) => ({
    creatorId: { eq: recordFilters[0].creatorId },
  }),
}));

const ScopedTableListeners = ({
  recordIndexId,
  creatorId,
  scoped = true,
}: {
  recordIndexId: string;
  creatorId: string;
  scoped?: boolean;
}) => {
  mockScope.recordIndexId = recordIndexId;
  mockScope.creatorId = creatorId;
  mockScope.scoped = scoped;

  return (
    <>
      <RecordTableVirtualizedSSESubscribeEffect />
      <RecordTableEmptyHasNewRecordEffect />
    </>
  );
};

describe('record table scoped SSE listeners', () => {
  it('keeps both distinct filtered Creator widgets registered when one unmounts', () => {
    const store = createStore();
    const renderTables = (showFirst: boolean) => (
      <Provider store={store}>
        {showFirst && (
          <ScopedTableListeners
            key="a"
            recordIndexId="socialProfiles-view-widget-a-creator-a"
            creatorId="creator-a"
          />
        )}
        <ScopedTableListeners
          key="b"
          recordIndexId="socialProfiles-view-widget-b-creator-b"
          creatorId="creator-b"
        />
      </Provider>
    );

    const { rerender, unmount } = render(renderTables(true));
    const listeners = store.get(requiredQueryListenersState.atom);
    expect(listeners).toHaveLength(4);
    expect(listeners.map(({ queryId }) => queryId)).toEqual([
      'record-table-virtualized-socialProfile-socialProfiles-view-widget-a-creator-a',
      'record-table-empty-socialProfile-socialProfiles-view-widget-a-creator-a',
      'record-table-virtualized-socialProfile-socialProfiles-view-widget-b-creator-b',
      'record-table-empty-socialProfile-socialProfiles-view-widget-b-creator-b',
    ]);
    expect(
      listeners.map(
        ({ operationSignature }) => operationSignature.variables.filter,
      ),
    ).toEqual([
      { creatorId: { eq: 'creator-a' } },
      { creatorId: { eq: 'creator-a' } },
      { creatorId: { eq: 'creator-b' } },
      { creatorId: { eq: 'creator-b' } },
    ]);

    rerender(renderTables(false));
    expect(store.get(requiredQueryListenersState.atom)).toEqual(
      listeners.slice(2),
    );
    unmount();
    expect(store.get(requiredQueryListenersState.atom)).toEqual([]);
  });

  it('preserves ordinary record index listener IDs', () => {
    const store = createStore();
    const { unmount } = render(
      <Provider store={store}>
        <ScopedTableListeners
          recordIndexId="socialProfiles-view"
          creatorId="creator-a"
          scoped={false}
        />
      </Provider>,
    );
    expect(
      store.get(requiredQueryListenersState.atom).map(({ queryId }) => queryId),
    ).toEqual([
      'record-table-virtualized-socialProfile',
      'record-table-empty-socialProfile',
    ]);
    unmount();
  });
});
