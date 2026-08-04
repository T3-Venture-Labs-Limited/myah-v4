import { render } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { useEffect } from 'react';

import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { useLoadRecordIndexStates } from '@/object-record/record-index/hooks/useLoadRecordIndexStates';

jest.mock('@/object-metadata/hooks/useGetFieldMetadataItemById', () => ({
  useGetFieldMetadataItemByIdOrThrow: () => ({
    getFieldMetadataItemByIdOrThrow: jest.fn(),
  }),
}));
jest.mock(
  '@/object-metadata/utils/formatFieldMetadataItemAsColumnDefinition',
  () => ({
    formatFieldMetadataItemAsColumnDefinition: ({
      field,
    }: {
      field: { id: string };
    }) => ({
      fieldMetadataId: field.id,
    }),
  }),
);
jest.mock('@/object-metadata/utils/isHiddenSystemField', () => ({
  isHiddenSystemField: () => false,
}));
jest.mock('@/object-record/record-group/hooks/useSetRecordGroups', () => ({
  useSetRecordGroups: () => ({ setRecordGroupsFromViewGroups: jest.fn() }),
}));
jest.mock('@/object-record/utils/filterAvailableTableColumns', () => ({
  filterAvailableTableColumns: () => true,
}));
jest.mock(
  '@/object-record/utils/convertAggregateOperationToExtendedAggregateOperation',
  () => ({
    convertAggregateOperationToExtendedAggregateOperation: jest.fn(),
  }),
);
jest.mock('@/views/utils/mapViewFieldsToColumnDefinitions', () => ({
  mapViewFieldsToColumnDefinitions: () => [],
}));
jest.mock('@/views/utils/mapViewFieldToRecordField', () => ({
  mapViewFieldToRecordField: () => ({ fieldMetadataId: 'creator-name' }),
}));
jest.mock('@/views/utils/mapViewFiltersToFilters', () => ({
  mapViewFiltersToFilters: () => [],
}));
jest.mock('@/views/utils/mapViewFilterGroupsToRecordFilterGroups', () => ({
  mapViewFilterGroupsToRecordFilterGroups: () => [],
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState',
  () => ({
    useAtomComponentStateCallbackState: (componentState: {
      atomFamily: ({ instanceId }: { instanceId: string }) => unknown;
    }) => componentState.atomFamily({ instanceId: 'test-instance' }),
  }),
);

const view = {
  id: 'creator-default-view',
  viewFields: [{ fieldMetadataId: 'creator-name', id: 'view-field' }],
  viewFilterGroups: [],
  viewFilters: [],
  viewGroups: [],
  viewSorts: [],
};

const objectMetadataItem = {
  fields: [{ id: 'creator-name', isActive: true }],
  id: 'creator-object',
  namePlural: 'creators',
};

const LoadScopedViewEffect = ({ recordIndexId }: { recordIndexId: string }) => {
  const { loadRecordIndexStates } = useLoadRecordIndexStates();

  useEffect(() => {
    loadRecordIndexStates(view as never, objectMetadataItem as never, {
      recordIndexId,
      skipGlobalIndexStates: true,
    });
  }, [loadRecordIndexStates, recordIndexId]);

  return null;
};

describe('useLoadRecordIndexStates', () => {
  it('initializes fields for the supplied scoped record index', () => {
    const store = createStore();
    const recordIndexId =
      'creators-creator-default-view-creator-list-pane-list-a';

    render(
      <Provider store={store}>
        <LoadScopedViewEffect recordIndexId={recordIndexId} />
      </Provider>,
    );

    expect(
      store.get(
        currentRecordFieldsComponentState.atomFamily({
          instanceId: recordIndexId,
        }),
      ),
    ).toEqual([{ fieldMetadataId: 'creator-name' }]);
  });
});
