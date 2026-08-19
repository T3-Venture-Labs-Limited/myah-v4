import { render, screen, waitFor } from '@testing-library/react';

import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { contextStoreCurrentViewTypeComponentState } from '@/context-store/states/contextStoreCurrentViewTypeComponentState';
import { ContextStoreViewType } from '@/context-store/types/ContextStoreViewType';
import { RecordTableWidgetProvider } from '@/object-record/record-table-widget/components/RecordTableWidgetProvider';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const creatorObjectMetadataItem = {
  id: 'creator-object',
  nameSingular: 'creator',
  namePlural: 'creators',
};

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: creatorObjectMetadataItem,
  }),
}));

jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({
    objectPermissionsByObjectMetadataId: {
      'creator-object': {
        objectMetadataId: 'creator-object',
        canReadObjectRecords: true,
      },
    },
  }),
}));

jest.mock(
  '@/object-record/record-index/hooks/useRecordIndexFieldMetadataDerivedStates',
  () => ({
    useRecordIndexFieldMetadataDerivedStates: () => ({
      fieldDefinitionByFieldMetadataItemId: {},
      fieldMetadataItemByFieldMetadataItemId: {},
      labelIdentifierFieldMetadataItem: undefined,
      recordFieldByFieldMetadataItemId: {},
    }),
  }),
);

jest.mock(
  '@/object-record/record-table-widget/components/RecordTableWidgetViewLoadEffect',
  () => ({
    RecordTableWidgetViewLoadEffect: () => null,
  }),
);

const ContextStoreState = () => {
  const contextStoreCurrentObjectMetadataItemId = useAtomComponentStateValue(
    contextStoreCurrentObjectMetadataItemIdComponentState,
    'record-table-widget-widget-a',
  );
  const contextStoreCurrentViewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
    'record-table-widget-widget-a',
  );
  const contextStoreCurrentViewType = useAtomComponentStateValue(
    contextStoreCurrentViewTypeComponentState,
    'record-table-widget-widget-a',
  );

  return (
    <output data-testid="context-store-state">
      {JSON.stringify({
        objectMetadataItemId: contextStoreCurrentObjectMetadataItemId,
        viewId: contextStoreCurrentViewId,
        viewType: contextStoreCurrentViewType,
      })}
    </output>
  );
};

describe('RecordTableWidgetProvider', () => {
  it('preserves widget context-store initialization', async () => {
    render(
      <RecordTableWidgetProvider
        objectNameSingular="creator"
        viewId="creator-default-view"
        widgetId="widget-a"
      >
        <ContextStoreState />
      </RecordTableWidgetProvider>,
      {
        wrapper: getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] }),
      },
    );

    await waitFor(() => {
      expect(
        JSON.parse(
          screen.getByTestId('context-store-state').textContent ?? '{}',
        ),
      ).toEqual({
        objectMetadataItemId: 'creator-object',
        viewId: 'creator-default-view',
        viewType: ContextStoreViewType.Table,
      });
    });
  });
});
