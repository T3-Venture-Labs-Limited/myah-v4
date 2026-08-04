import { render, screen, waitFor } from '@testing-library/react';

import { RecordIndexSurface } from '@/object-record/record-index/components/RecordIndexSurface';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { ViewFilterOperand } from 'twenty-shared/types';

const mockRecordIndexContainer = jest.fn();
const mockRecordTableWidget = jest.fn();
const mockReadOnlyWidgetEffect = jest.fn();
const mockContextStoreIds: string[] = [];
const mockRecordIndexIds: string[] = [];
const mockRecordIndexConfigurations: Array<{
  indexIdentifierUrl: (recordId: string) => string;
  onOpenRecordFromIndexView?: (recordId: string) => void;
  recordIndexId: string;
}> = [];

const creatorObjectMetadataItem = {
  id: 'creator-object',
  nameSingular: 'creator',
  namePlural: 'creators',
  labelPlural: 'Creators',
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
  '@/object-record/record-index/components/RecordIndexContainer',
  () => ({
    RecordIndexContainer: () => {
      const queryOnlyRecordFilters = useAtomComponentStateValue(
        queryOnlyRecordFiltersComponentState,
      );
      const {
        indexIdentifierUrl,
        onOpenRecordFromIndexView,
        recordIndexId,
      } = useRecordIndexContextOrThrow();

      mockRecordIndexContainer(queryOnlyRecordFilters);
      mockRecordIndexIds.push(recordIndexId);
      mockRecordIndexConfigurations.push({
        indexIdentifierUrl,
        onOpenRecordFromIndexView,
        recordIndexId,
      });

      return <div data-testid="native-index-container" />;
    },
  }),
);

jest.mock(
  '@/object-record/record-table-widget/components/RecordTableWidget',
  () => ({
    RecordTableWidget: () => {
      mockRecordTableWidget();
      return null;
    },
  }),
);

jest.mock(
  '@/object-record/record-table-widget/components/RecordTableWidgetSetReadOnlyColumnHeadersEffect',
  () => ({
    RecordTableWidgetSetReadOnlyColumnHeadersEffect: () => {
      mockReadOnlyWidgetEffect();
      return null;
    },
  }),
);

jest.mock(
  '@/object-record/record-index/components/RecordIndexViewBar',
  () => ({
    RecordIndexViewBar: () => null,
  }),
);

jest.mock(
  '@/object-record/record-index/components/RecordIndexPageHeader',
  () => ({
    RecordIndexPageHeader: () => null,
  }),
);

jest.mock(
  '@/object-record/record-index/components/RecordIndexLoadBaseOnContextStoreEffect',
  () => ({
    RecordIndexLoadBaseOnContextStoreEffect: () => null,
  }),
);

jest.mock(
  '@/object-record/record-index/components/RecordIndexViewFieldsSSESyncEffect',
  () => ({
    RecordIndexViewFieldsSSESyncEffect: () => null,
  }),
);

jest.mock(
  '@/object-record/record-index/components/RecordIndexContainerContextStoreNumberOfSelectedRecordsEffect',
  () => ({
    RecordIndexContainerContextStoreNumberOfSelectedRecordsEffect: () => null,
  }),
);
jest.mock(
  '@/context-store/states/contexts/ContextStoreComponentInstanceContext',
  () => ({
    ContextStoreComponentInstanceContext: {
      Provider: ({
        children,
        value,
      }: {
        children: React.ReactNode;
        value: { instanceId: string };
      }) => {
        mockContextStoreIds.push(value.instanceId);
        return <>{children}</>;
      },
    },
  }),
);

jest.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/ui/utilities/page-title/components/PageTitle', () => ({
  PageTitle: () => null,
}));

const creatorShowUrl = (recordId: string) => `/object/creator/${recordId}`;
const openRecordFromListA = jest.fn();
const openRecordFromListB = jest.fn();

const listAFilter = {
  id: 'creator-list-a-filter',
  fieldMetadataId: 'creator-list-memberships',
  relationTargetFieldMetadataId: 'creator-list-member-creator-list',
  type: 'RELATION' as const,
  operand: ViewFilterOperand.IS,
  value: 'list-a',
  displayValue: '',
  label: 'List A',
  subFieldName: null,
};

const listBFilter = {
  ...listAFilter,
  id: 'creator-list-b-filter',
  value: 'list-b',
  label: 'List B',
};

const renderSurface = (surface: React.ReactNode) =>
  render(surface, {
    wrapper: getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] }),
  });

describe('RecordIndexSurface', () => {
  beforeEach(() => {
    mockRecordIndexContainer.mockClear();
    mockRecordTableWidget.mockClear();
    mockReadOnlyWidgetEffect.mockClear();
    mockContextStoreIds.length = 0;
    mockRecordIndexIds.length = 0;
    mockRecordIndexConfigurations.length = 0;
  });

  it('mounts an isolated full native index without widget read-only constraints', async () => {
    renderSurface(
      <>
        <RecordIndexSurface
          contextStoreInstanceId="creator-list-pane-list-a"
          objectNameSingular="creator"
          viewId="creator-default-view"
          indexIdentifierUrl={creatorShowUrl}
          onOpenRecordFromIndexView={openRecordFromListA}
          initialQueryOnlyRecordFilters={[listAFilter]}
        />
        <RecordIndexSurface
          contextStoreInstanceId="creator-list-pane-list-b"
          objectNameSingular="creator"
          viewId="creator-default-view"
          indexIdentifierUrl={creatorShowUrl}
          onOpenRecordFromIndexView={openRecordFromListB}
          initialQueryOnlyRecordFilters={[listBFilter]}
        />
      </>,
    );

    await waitFor(() => {
      expect(mockRecordIndexContainer).toHaveBeenCalled();
    });

    expect(mockRecordTableWidget).not.toHaveBeenCalled();
    expect(mockReadOnlyWidgetEffect).not.toHaveBeenCalled();
    expect(mockRecordIndexContainer.mock.calls.map(([filters]) => filters)).toEqual(
      expect.arrayContaining([[listAFilter], [listBFilter]]),
    );
    expect(mockContextStoreIds).toEqual(
      expect.arrayContaining([
        'creator-list-pane-list-a',
        'creator-list-pane-list-b',
      ]),
    );
    expect(new Set(mockRecordIndexIds)).toEqual(
      new Set([
        'creators-creator-default-view-creator-list-pane-list-a',
        'creators-creator-default-view-creator-list-pane-list-b',
      ]),
    );
    expect(mockRecordIndexConfigurations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          indexIdentifierUrl: creatorShowUrl,
          onOpenRecordFromIndexView: openRecordFromListA,
          recordIndexId:
            'creators-creator-default-view-creator-list-pane-list-a',
        }),
        expect.objectContaining({
          indexIdentifierUrl: creatorShowUrl,
          onOpenRecordFromIndexView: openRecordFromListB,
          recordIndexId:
            'creators-creator-default-view-creator-list-pane-list-b',
        }),
      ]),
    );
  });

  it('installs query-only filters before rendering the table container', async () => {
    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId="creator-list-pane-list-a"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        initialQueryOnlyRecordFilters={[listAFilter]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('native-index-container')).toBeInTheDocument();
    });

    expect(mockRecordIndexContainer).toHaveBeenLastCalledWith([listAFilter]);
  });
});
