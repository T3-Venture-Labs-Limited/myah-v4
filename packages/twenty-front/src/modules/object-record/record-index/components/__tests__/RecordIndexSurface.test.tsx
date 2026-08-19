import { render, screen, waitFor } from '@testing-library/react';
import { act, createElement, type ComponentProps, useEffect } from 'react';

import type { ViewBar as ViewBarComponent } from '@/views/components/ViewBar';

import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { RecordIndexSurface } from '@/object-record/record-index/components/RecordIndexSurface';
import {
  type RecordIndexOpenRequest,
  useRecordIndexContextOrThrow,
} from '@/object-record/record-index/contexts/RecordIndexContext';
import { queryOnlyRecordFiltersComponentState } from '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { IconArrowLeft } from 'twenty-ui/icon';
import { IconButton } from 'twenty-ui/input';
import { ViewFilterOperand, ViewType } from 'twenty-shared/types';

const mockRecordIndexContainer = jest.fn();
const mockViewBar = jest.fn();
const mockRecordTableWidget = jest.fn();
const mockReadOnlyWidgetEffect = jest.fn();
const mockContextStoreIds: string[] = [];
const mockRecordIndexIds: string[] = [];
const mockRecordIndexConfigurations: Array<{
  indexIdentifierUrl: (recordId: string) => string;
  onOpenRecordFromIndexView?: (request: RecordIndexOpenRequest) => void;
  shouldUseIndexIdentifierUrlOnFullPageOpen?: boolean;
  recordIndexId: string;
}> = [];
const mockRecordIndexLoad = jest.fn();
const mockRecordIndexViewFieldsSSESync = jest.fn();
let hasCurrentViewNonReadableFields = false;
let deferContextStoreInitialization = false;
let mockInitializeContextStore: (() => void) | undefined;
const mockQueryOnlyRecordFilterWrites = jest.fn();
const mockRecordIndexPageHeader = jest.fn();

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

jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => {
  const actual = jest.requireActual(
    '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState',
  );

  return {
    ...actual,
    useSetAtomComponentState: (
      componentState: { key: string },
      instanceId?: string,
    ) => {
      const setValue = actual.useSetAtomComponentState(
        componentState,
        instanceId,
      );

      if (componentState.key !== 'queryOnlyRecordFiltersComponentState') {
        return setValue;
      }

      return (value: unknown) => {
        mockQueryOnlyRecordFilterWrites({ instanceId, value });
        setValue(value);
      };
    },
  };
});

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
    RecordIndexContainer: ({
      recordIndexViewTypeOverride,
    }: {
      recordIndexViewTypeOverride?: string;
    }) => {
      const queryOnlyRecordFilters = useAtomComponentStateValue(
        queryOnlyRecordFiltersComponentState,
      );
      const {
        indexIdentifierUrl,
        onOpenRecordFromIndexView,
        recordIndexId,
        shouldUseIndexIdentifierUrlOnFullPageOpen,
      } = useRecordIndexContextOrThrow();

      mockRecordIndexContainer(
        queryOnlyRecordFilters,
        recordIndexId,
        recordIndexViewTypeOverride,
      );
      mockRecordIndexIds.push(recordIndexId);
      mockRecordIndexConfigurations.push({
        indexIdentifierUrl,
        onOpenRecordFromIndexView,
        recordIndexId,
        shouldUseIndexIdentifierUrlOnFullPageOpen,
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
  '@/object-record/record-index/components/RecordIndexViewBarEffect',
  () => ({
    RecordIndexViewBarEffect: () => null,
  }),
);

jest.mock(
  '@/object-record/record-index/hooks/useHasCurrentViewNonReadableFields',
  () => ({
    useHasCurrentViewNonReadableFields: () => ({
      hasCurrentViewNonReadableFields,
    }),
  }),
);

jest.mock(
  '@/object-record/object-options-dropdown/components/ObjectOptionsDropdown',
  () => ({
    ObjectOptionsDropdown: () => <div data-testid="options-control" />,
  }),
);

jest.mock(
  '@/spreadsheet-import/provider/components/SpreadsheetImportProvider',
  () => ({
    SpreadsheetImportProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => <>{children}</>,
  }),
);

jest.mock('@/ui/layout/top-bar/components/TopBar', () => ({
  TopBar: ({
    leftComponent,
    rightComponent,
  }: {
    leftComponent?: React.ReactNode;
    rightComponent?: React.ReactNode;
  }) => (
    <div data-testid="view-bar-top-bar">
      {leftComponent}
      <div data-testid="view-bar-right">{rightComponent}</div>
    </div>
  ),
}));

jest.mock('@/views/view-picker/components/ViewPickerDropdown', () => ({
  ViewPickerDropdown: () => <div data-testid="view-picker-control" />,
}));

jest.mock('@/views/components/ViewBarFilterDropdown', () => ({
  ViewBarFilterDropdown: () => <div data-testid="filter-control" />,
}));

jest.mock(
  '@/object-record/object-sort-dropdown/components/ObjectSortDropdownButton',
  () => ({
    ObjectSortDropdownButton: () => <div data-testid="sort-control" />,
  }),
);

jest.mock('@/views/contexts/ViewBarControlIdsContext', () => ({
  ViewBarControlIdsProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useViewBarControlIds: () => ({
    filterDropdownId: 'filter-dropdown',
    viewSortDropdownId: 'view-sort-dropdown',
  }),
}));

jest.mock('@/views/components/ViewBarRecordFilterGroupEffect', () => ({
  ViewBarRecordFilterGroupEffect: () => null,
}));
jest.mock('@/views/components/ViewBarAnyFieldFilterEffect', () => ({
  ViewBarAnyFieldFilterEffect: () => null,
}));
jest.mock('@/views/components/ViewBarRecordFieldEffect', () => ({
  ViewBarRecordFieldEffect: () => null,
}));
jest.mock('@/views/components/ViewBarRecordFilterEffect', () => ({
  ViewBarRecordFilterEffect: () => null,
}));
jest.mock('@/views/components/ViewBarRecordSortEffect', () => ({
  ViewBarRecordSortEffect: () => null,
}));
jest.mock('@/views/components/QueryParamsFiltersEffect', () => ({
  QueryParamsFiltersEffect: () => null,
}));
jest.mock('@/views/components/QueryParamsSortsEffect', () => ({
  QueryParamsSortsEffect: () => null,
}));
jest.mock('@/views/components/QueryParamsCleanupEffect', () => ({
  QueryParamsCleanupEffect: () => null,
}));
jest.mock('@/views/components/ViewBarPageTitle', () => ({
  ViewBarPageTitle: () => null,
}));
jest.mock('@/views/components/ViewBar', () => {
  const actual = jest.requireActual('@/views/components/ViewBar') as {
    ViewBar: typeof ViewBarComponent;
  };

  return {
    ...actual,
    ViewBar: (props: ComponentProps<typeof actual.ViewBar>) => {
      mockViewBar(props);
      return createElement(actual.ViewBar, props);
    },
  };
});
jest.mock('@/views/components/UpdateViewButtonGroup', () => ({
  UpdateViewButtonGroup: () => null,
}));

jest.mock(
  '@/object-record/record-index/components/RecordIndexPageHeader',
  () => ({
    RecordIndexPageHeader: (props: unknown) => {
      mockRecordIndexPageHeader(props);
      return null;
    },
  }),
);

jest.mock(
  '@/object-record/record-index/components/RecordIndexLoadBaseOnContextStoreEffect',
  () => ({
    RecordIndexLoadBaseOnContextStoreEffect: (props: {
      recordIndexId?: string;
      skipGlobalIndexStates?: boolean;
    }) => {
      mockRecordIndexLoad(props);
      return null;
    },
  }),
);

jest.mock(
  '@/object-record/record-index/components/RecordIndexViewFieldsSSESyncEffect',
  () => ({
    RecordIndexViewFieldsSSESyncEffect: (props: {
      recordIndexId?: string;
      skipGlobalIndexStates?: boolean;
    }) => {
      mockRecordIndexViewFieldsSSESync(props);
      return null;
    },
  }),
);

jest.mock(
  '@/object-record/record-index/components/RecordIndexContainerContextStoreNumberOfSelectedRecordsEffect',
  () => ({
    RecordIndexContainerContextStoreNumberOfSelectedRecordsEffect: () => null,
  }),
);
jest.mock(
  '@/object-record/record-index/components/RecordIndexSurfaceContextStoreInitEffect',
  () => ({
    RecordIndexSurfaceContextStoreInitEffect: ({
      onInitialized,
    }: {
      onInitialized?: () => void;
    }) => {
      mockInitializeContextStore = onInitialized;
      useEffect(() => {
        if (!deferContextStoreInitialization) {
          onInitialized?.();
        }
      }, [onInitialized]);
      return null;
    },
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
  PageCardLayout: ({
    children,
    header,
    secondaryBar,
  }: {
    children: React.ReactNode;
    header?: React.ReactNode;
    secondaryBar: React.ReactNode;
  }) => (
    <>
      {header === undefined || header === null ? null : (
        <div data-testid="page-header">{header}</div>
      )}
      {secondaryBar}
      {children}
    </>
  ),
}));

jest.mock('@/ui/utilities/page-title/components/PageTitleEffect', () => ({
  PageTitleEffect: () => null,
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
    mockRecordIndexLoad.mockClear();
    mockRecordIndexViewFieldsSSESync.mockClear();
    mockQueryOnlyRecordFilterWrites.mockClear();
    mockViewBar.mockClear();
    hasCurrentViewNonReadableFields = false;
    mockRecordIndexPageHeader.mockClear();
    deferContextStoreInitialization = false;
    mockInitializeContextStore = undefined;
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
          shouldUseIndexIdentifierUrlOnFullPageOpen
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
    expect(
      mockRecordIndexContainer.mock.calls.map(([filters]) => filters),
    ).toEqual(expect.arrayContaining([[listAFilter], [listBFilter]]));
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
          shouldUseIndexIdentifierUrlOnFullPageOpen: true,
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

  it('renders the page header for an ordinary surface', async () => {
    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId={MAIN_CONTEXT_STORE_INSTANCE_ID}
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
      />,
    );

    await waitFor(() => {
      expect(mockRecordIndexPageHeader).toHaveBeenLastCalledWith({
        contextStoreInstanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
        headerActionButton: undefined,
        headerTitle: undefined,
      });
    });

    expect(screen.getByTestId('page-header')).toBeInTheDocument();
  });

  it('removes the page-header block for an embedded surface', async () => {
    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId="embedded-creator-index"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        embeddedSurfaceOptions={{ hidePageHeader: true }}
      />,
    );

    await waitFor(() => {
      expect(mockRecordIndexContainer).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('page-header')).not.toBeInTheDocument();
    expect(mockRecordIndexPageHeader).not.toHaveBeenCalled();
  });
  it('hides the embedded view-picker title while retaining native toolbar controls', async () => {
    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId="campaign-influencers-index"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        initialQueryOnlyRecordFilters={[listAFilter]}
        embeddedSurfaceOptions={{
          hideViewPicker: true,
          hideCurrentRecordFilter: {
            fieldMetadataId: listAFilter.fieldMetadataId,
            relationTargetFieldMetadataId: null,
            operand: ViewFilterOperand.IS,
          },
          toolbarAction: <button type="button">Add influencers</button>,
        }}
      />,
    );

    const toolbarAction = await screen.findByRole('button', {
      name: 'Add influencers',
    });

    expect(screen.queryByTestId('view-picker-control')).not.toBeInTheDocument();
    expect(screen.getByTestId('filter-control')).toBeInTheDocument();
    expect(screen.getByTestId('sort-control')).toBeInTheDocument();
    expect(screen.getByTestId('options-control')).toBeInTheDocument();
    expect(
      toolbarAction.compareDocumentPosition(
        screen.getByTestId('filter-control'),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(mockRecordIndexContainer).toHaveBeenLastCalledWith(
      [listAFilter],
      expect.any(String),
      ViewType.TABLE,
    );
    expect(mockViewBar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hideCurrentRecordFilter: expect.objectContaining({
          relationTargetFieldMetadataId: null,
        }),
      }),
    );
  });

  it('renders an embedded toolbar action before native view controls', async () => {
    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId="embedded-creator-index"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        embeddedSurfaceOptions={{
          toolbarAction: <button type="button">Add creator</button>,
        }}
      />,
    );

    const toolbarAction = await screen.findByRole('button', {
      name: 'Add creator',
    });

    expect(
      toolbarAction.compareDocumentPosition(
        screen.getByTestId('filter-control'),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      toolbarAction.compareDocumentPosition(screen.getByTestId('sort-control')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      toolbarAction.compareDocumentPosition(
        screen.getByTestId('options-control'),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders an embedded toolbar action in a read-only view bar', async () => {
    hasCurrentViewNonReadableFields = true;

    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId="embedded-creator-index"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        embeddedSurfaceOptions={{
          toolbarAction: <button type="button">Add creator</button>,
        }}
      />,
    );

    const toolbarAction = await screen.findByRole('button', {
      name: 'Add creator',
    });

    expect(screen.getByTestId('view-bar-right').contains(toolbarAction)).toBe(
      true,
    );
    expect(screen.queryByTestId('filter-control')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sort-control')).not.toBeInTheDocument();
    expect(screen.queryByTestId('options-control')).not.toBeInTheDocument();
  });

  it('forwards scoped header overrides to the native header', async () => {
    const headerActionButton = (
      <IconButton Icon={IconArrowLeft} ariaLabel="Back to Creator Lists" />
    );

    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId="creator-list-pane-list-a"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        headerActionButton={headerActionButton}
        headerTitle="List A"
      />,
    );

    await waitFor(() => {
      expect(mockRecordIndexPageHeader).toHaveBeenLastCalledWith({
        contextStoreInstanceId: 'creator-list-pane-list-a',
        headerActionButton,
        headerTitle: 'List A',
      });
    });
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

    expect(mockRecordIndexContainer.mock.calls.at(-1)?.[0]).toEqual([
      listAFilter,
    ]);
  });

  it('forwards query-only filter visibility policy without changing isolated filter scope', async () => {
    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId="creator-list-pane-list-a"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        initialQueryOnlyRecordFilters={[listAFilter]}
        hideQueryOnlyRecordFilters
      />,
    );

    await waitFor(() => {
      expect(mockViewBar).toHaveBeenCalled();
    });

    expect(mockViewBar).toHaveBeenLastCalledWith(
      expect.objectContaining({ hideQueryOnlyRecordFilters: true }),
    );
    expect(mockRecordIndexContainer).toHaveBeenLastCalledWith(
      [listAFilter],
      expect.any(String),
      ViewType.TABLE,
    );
  });

  it('shows query-only filters by default on isolated surfaces', async () => {
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
      expect(mockViewBar).toHaveBeenCalled();
    });

    expect(mockViewBar).toHaveBeenLastCalledWith(
      expect.objectContaining({ hideQueryOnlyRecordFilters: undefined }),
    );
  });

  it('retains canonical record-index identity for the main context gater', async () => {
    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId={MAIN_CONTEXT_STORE_INSTANCE_ID}
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
      />,
    );

    await waitFor(() => {
      expect(mockRecordIndexContainer).toHaveBeenCalled();
    });

    expect(mockRecordIndexContainer).toHaveBeenCalledWith(
      [],
      'creators-creator-default-view',
      undefined,
    );
    expect(mockRecordIndexLoad).toHaveBeenCalledWith({
      recordIndexId: 'creators-creator-default-view',
      skipGlobalIndexStates: false,
    });
    expect(mockRecordIndexViewFieldsSSESync).toHaveBeenCalledWith({
      recordIndexId: 'creators-creator-default-view',
      skipGlobalIndexStates: false,
    });
  });

  it('renders the main context without the isolated initialization gate', () => {
    deferContextStoreInitialization = true;

    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId={MAIN_CONTEXT_STORE_INSTANCE_ID}
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
      />,
    );

    expect(mockRecordIndexContainer).toHaveBeenCalledWith(
      [],
      'creators-creator-default-view',
      undefined,
    );
    expect(mockInitializeContextStore).toBeUndefined();
  });

  it('does not write default query-only filters for the main context', async () => {
    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId={MAIN_CONTEXT_STORE_INSTANCE_ID}
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
      />,
    );

    await waitFor(() => {
      expect(mockRecordIndexContainer).toHaveBeenCalled();
    });

    await act(async () => {});

    expect(mockQueryOnlyRecordFilterWrites).not.toHaveBeenCalled();
  });

  it('withholds context consumers until its context store is initialized', async () => {
    deferContextStoreInitialization = true;

    renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId="creator-list-pane-list-a"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        initialQueryOnlyRecordFilters={[listAFilter]}
      />,
    );

    expect(mockRecordIndexLoad).not.toHaveBeenCalled();
    expect(mockRecordIndexViewFieldsSSESync).not.toHaveBeenCalled();
    expect(mockRecordIndexContainer).not.toHaveBeenCalled();

    expect(mockInitializeContextStore).toBeDefined();
    act(() => {
      mockInitializeContextStore?.();
    });

    await waitFor(() => {
      expect(mockRecordIndexContainer).toHaveBeenCalled();
    });
    expect(mockRecordIndexLoad).toHaveBeenCalledWith({
      recordIndexId: 'creators-creator-default-view-creator-list-pane-list-a',
      skipGlobalIndexStates: true,
    });
    expect(mockRecordIndexViewFieldsSSESync).toHaveBeenCalledWith({
      recordIndexId: 'creators-creator-default-view-creator-list-pane-list-a',
      skipGlobalIndexStates: true,
    });
  });

  it('routes isolated VIEW_FIELD synchronization to its index without global writes', async () => {
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
      expect(mockRecordIndexViewFieldsSSESync).toHaveBeenCalledWith({
        recordIndexId: 'creators-creator-default-view-creator-list-pane-list-a',
        skipGlobalIndexStates: true,
      });
    });
  });

  it('reinitializes a changed surface identity and filter scope before mounting its table', async () => {
    const { rerender } = renderSurface(
      <RecordIndexSurface
        contextStoreInstanceId="creator-list-pane-list-a"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        initialQueryOnlyRecordFilters={[listAFilter]}
      />,
    );

    await waitFor(() => {
      expect(mockRecordIndexContainer).toHaveBeenCalled();
    });
    mockRecordIndexContainer.mockClear();

    rerender(
      <RecordIndexSurface
        contextStoreInstanceId="creator-list-pane-list-b"
        objectNameSingular="creator"
        viewId="creator-default-view"
        indexIdentifierUrl={creatorShowUrl}
        initialQueryOnlyRecordFilters={[listBFilter]}
      />,
    );

    await waitFor(() => {
      expect(mockRecordIndexContainer).toHaveBeenCalled();
    });

    expect(mockRecordIndexContainer.mock.calls).toEqual(
      expect.arrayContaining([
        [
          [listBFilter],
          'creators-creator-default-view-creator-list-pane-list-b',
          'TABLE',
        ],
      ]),
    );
    expect(mockRecordIndexContainer.mock.calls).not.toContainEqual([
      [],
      'creators-creator-default-view-creator-list-pane-list-b',
      'TABLE',
    ]);
  });
});
