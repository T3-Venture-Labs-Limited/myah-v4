import { render, screen, waitFor } from '@testing-library/react';

import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { contextStoreCurrentViewTypeComponentState } from '@/context-store/states/contextStoreCurrentViewTypeComponentState';
import { ContextStoreViewType } from '@/context-store/types/ContextStoreViewType';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
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

const ScopedIndexId = () => {
  const { recordIndexId } = useRecordIndexContextOrThrow();
  return <output data-testid="scoped-index-id">{recordIndexId}</output>;
};

describe('RecordTableWidgetProvider', () => {
  it('isolates the same widget view by current record while leaving unscoped IDs unchanged', () => {
    const wrapper = getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] });
    const renderScoped = (scopeInstanceId?: string) =>
      render(
        <RecordTableWidgetProvider
          objectNameSingular="creator"
          viewId="creator-default-view"
          widgetId="widget-a"
          scopeInstanceId={scopeInstanceId}
        >
          <ScopedIndexId />
        </RecordTableWidgetProvider>,
        { wrapper },
      );
    const first = renderScoped('widget-a-creator-a');
    const a = first.getByTestId('scoped-index-id').textContent;
    first.unmount();
    const second = renderScoped('widget-a-creator-b');
    const b = second.getByTestId('scoped-index-id').textContent;
    second.unmount();
    const ordinary = renderScoped();
    const original = ordinary.getByTestId('scoped-index-id').textContent;
    ordinary.unmount();
    expect(a).not.toBe(b);
    expect(a).toContain('widget-a-creator-a');
    expect(b).toContain('widget-a-creator-b');
    expect(original).not.toContain('widget-a-creator-');
  });
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
