import { render, screen, waitFor } from '@testing-library/react';
import { act, useEffect } from 'react';

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
import { ViewFilterOperand } from 'twenty-shared/types';

const mockRecordIndexContainer = jest.fn();
const mockRecordIndexViewBar = jest.fn();
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

jest.mock('@/object-record/record-index/components/RecordIndexViewBar', () => ({
  RecordIndexViewBar: (props: unknown) => {
    const queryOnlyRecordFilters = useAtomComponentStateValue(
      queryOnlyRecordFiltersComponentState,
    );

    mockRecordIndexViewBar(queryOnlyRecordFilters, props);

    return null;
  },
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
    header: React.ReactNode;
    secondaryBar: React.ReactNode;
  }) => (
    <>
      {header}
      {secondaryBar}
      {children}
    </>
  ),
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
    mockRecordIndexLoad.mockClear();
    mockRecordIndexViewFieldsSSESync.mockClear();
    mockQueryOnlyRecordFilterWrites.mockClear();
    mockRecordIndexViewBar.mockClear();
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

  it('forwards no header overrides for an ordinary surface', async () => {
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

  it('mounts the isolated view bar only after its membership filters are installed', async () => {
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
      expect(mockRecordIndexViewBar).toHaveBeenCalled();
    });

    expect(
      mockRecordIndexViewBar.mock.calls.map(([recordFilters]) => recordFilters),
    ).not.toContainEqual([]);
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
