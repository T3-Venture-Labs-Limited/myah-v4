import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { act, renderHook } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SnackBarComponentInstanceContext } from '@/ui/feedback/snack-bar-manager/contexts/SnackBarComponentInstanceContext';
import { type ReactNode } from 'react';
import { createStore, Provider } from 'jotai';
import { recordIndexCreationOptionsComponentState } from '@/object-record/record-index/states/recordIndexCreationOptionsComponentState';
import { recordIndexOpenRecordInState } from '@/object-record/record-index/states/recordIndexOpenRecordInState';

import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import {
  RecordIndexContextProvider,
  type RecordIndexContextValue,
} from '@/object-record/record-index/contexts/RecordIndexContext';
import { useCreateNewIndexRecord } from '@/object-record/record-table/hooks/useCreateNewIndexRecord';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';

const mockBuildRecordInputFromFilters = jest.fn(() => ({}));
const mockBuildRecordInputFromRLSPredicates = jest.fn(() => ({}));
const mockCloseSidePanelMenu = jest.fn();
const mockCreateOneRecord = jest.fn(async (record: { id: string }) => record);
const mockNavigate = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();
let store = createStore();
const mockUpsertRecordsInStore = jest.fn();
const mockOnRecordCreated = jest.fn();

jest.mock(
  '@/object-metadata/utils/getLabelIdentifierFieldMetadataItem',
  () => ({
    getLabelIdentifierFieldMetadataItem: () => undefined,
  }),
);

jest.mock('@/object-record/hooks/useBuildRecordInputFromRLSPredicates', () => ({
  useBuildRecordInputFromRLSPredicates: () => ({
    buildRecordInputFromRLSPredicates: mockBuildRecordInputFromRLSPredicates,
  }),
}));

jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: () => ({ createOneRecord: mockCreateOneRecord }),
}));

jest.mock(
  '@/object-record/record-table/hooks/useBuildRecordInputFromFilters',
  () => ({
    useBuildRecordInputFromFilters: () => ({
      buildRecordInputFromFilters: mockBuildRecordInputFromFilters,
    }),
  }),
);

jest.mock('@/object-record/record-store/hooks/useUpsertRecordsInStore', () => ({
  useUpsertRecordsInStore: () => ({
    upsertRecordsInStore: mockUpsertRecordsInStore,
  }),
}));

jest.mock('@/object-record/utils/canOpenObjectInSidePanel', () => ({
  canOpenObjectInSidePanel: () => true,
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: mockCloseSidePanelMenu }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentFamilyStateCallbackState',
  () => ({
    useAtomComponentFamilyStateCallbackState: () => () => () => [],
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({ useAtomComponentSelectorValue: () => [] }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => undefined,
  }),
);

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({
    currentView: { openRecordIn: ViewOpenRecordIn.RECORD_PAGE },
  }),
}));

jest.mock('uuid', () => ({ v4: () => 'new-creator-id' }));

jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));

const objectMetadataItem = {
  fields: [],
  nameSingular: 'creator',
} as never;
const recordIndexContextValue: RecordIndexContextValue = {
  fieldDefinitionByFieldMetadataItemId: {},
  fieldMetadataItemByFieldMetadataItemId: {},
  indexIdentifierUrl: () => '',
  labelIdentifierFieldMetadataItem: undefined,
  objectMetadataItem,
  objectNamePlural: 'creators',
  objectNameSingular: 'creator',
  objectPermissionsByObjectMetadataId: {},
  onIndexRecordsLoaded: jest.fn(),
  recordFieldByFieldMetadataItemId: {},
  recordIndexId: 'creator-index-list-a',
  viewBarInstanceId: 'creator-index-list-a',
};
type ScopedContextStoreWrapperProps = {
  children: ReactNode;
};
type StoreWrapperProps = ScopedContextStoreWrapperProps;

const StoreWrapper = ({ children }: StoreWrapperProps) => (
  <Provider store={store}>
    <BrowserRouter>
      <SnackBarComponentInstanceContext.Provider
        value={{ instanceId: 'index-test-snacks' }}
      >
        {children}
      </SnackBarComponentInstanceContext.Provider>
    </BrowserRouter>
  </Provider>
);

const ScopedContextStoreWrapper = ({
  children,
}: ScopedContextStoreWrapperProps) => (
  <StoreWrapper>
    <ContextStoreComponentInstanceContext.Provider
      value={{ instanceId: 'creator-list-pane-list-a' }}
    >
      <RecordIndexContextProvider value={recordIndexContextValue}>
        {children}
      </RecordIndexContextProvider>
    </ContextStoreComponentInstanceContext.Provider>
  </StoreWrapper>
);

describe('useCreateNewIndexRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store = createStore();
    store.set(recordIndexOpenRecordInState.atom, ViewOpenRecordIn.SIDE_PANEL);
    mockOnRecordCreated.mockResolvedValue(undefined);
  });

  it('uses the scoped current view Open In choice instead of the main index state', async () => {
    const { result } = renderHook(
      () =>
        useCreateNewIndexRecord({
          instanceId: 'creator-list-pane-list-a',
          objectMetadataItem,
        }),
      { wrapper: ScopedContextStoreWrapper },
    );

    await act(async () => {
      await result.current.createNewIndexRecord();
    });

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ objectRecordId: 'new-creator-id' }),
      undefined,
      expect.anything(),
    );
    expect(mockOpenRecordInSidePanel).not.toHaveBeenCalled();
  });

  it('waits for the scoped create success callback before opening the new record', async () => {
    mockOnRecordCreated.mockImplementation(async () => {
      expect(mockNavigate).not.toHaveBeenCalled();
    });
    store.set(
      recordIndexCreationOptionsComponentState.atomFamily({
        instanceId: 'creator-list-pane-list-a',
      }),
      {
        onRecordCreated: mockOnRecordCreated,
      },
    );

    const { result } = renderHook(
      () =>
        useCreateNewIndexRecord({
          instanceId: 'creator-list-pane-list-a',
          objectMetadataItem,
        }),
      { wrapper: ScopedContextStoreWrapper },
    );

    await act(async () => {
      await result.current.createNewIndexRecord();
    });

    expect(mockOnRecordCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-creator-id' }),
    );
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('preserves scoped membership and the naming panel outside React index context', async () => {
    store.set(
      recordIndexCreationOptionsComponentState.atomFamily({
        instanceId: 'creator-index-list-a',
      }),
      {
        onRecordCreated: mockOnRecordCreated,
        shouldCloseAfterCreation: true,
      },
    );
    const { result } = renderHook(
      () =>
        useCreateNewIndexRecord({
          instanceId: 'creator-index-list-a',
          objectMetadataItem,
        }),
      { wrapper: StoreWrapper },
    );

    await act(async () => {
      await result.current.createNewIndexRecord();
    });

    expect(mockOnRecordCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-creator-id' }),
    );
    expect(mockOpenRecordInSidePanel).toHaveBeenCalledWith({
      recordId: 'new-creator-id',
      objectNameSingular: 'creator',
      isNewRecord: true,
      shouldCloseAfterCreation: true,
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not require record index context when creating from a headless command', async () => {
    store.set(
      recordIndexCreationOptionsComponentState.atomFamily({
        instanceId: 'creator-index-list-a',
      }),
      {
        onRecordCreated: mockOnRecordCreated,
        shouldCloseAfterCreation: true,
      },
    );
    const { result } = renderHook(
      () =>
        useCreateNewIndexRecord({
          instanceId: 'workflow-index-list-a',
          objectMetadataItem,
        }),
      { wrapper: StoreWrapper },
    );

    await act(async () => {
      await result.current.createNewIndexRecord();
    });

    expect(mockCreateOneRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-creator-id' }),
    );
    expect(mockOnRecordCreated).not.toHaveBeenCalled();
  });
});

it('preserves the default headless path with actual native Workflow metadata and caller fields', async () => {
  jest.clearAllMocks();
  const workflow = getTestEnrichedObjectMetadataItemsMock().find(
    (item) => item.nameSingular === 'workflow',
  );
  if (!workflow) throw new Error('Native Workflow metadata fixture missing');
  const { result } = renderHook(
    () =>
      useCreateNewIndexRecord({
        objectMetadataItem: workflow,
        instanceId: 'workflow-index',
      }),
    { wrapper: StoreWrapper },
  );
  await act(async () => {
    await result.current.createNewIndexRecord({
      name: 'Workflow draft',
      position: 'last',
    });
  });
  expect(mockCreateOneRecord).toHaveBeenCalledWith({
    id: 'new-creator-id',
    name: 'Workflow draft',
    position: 'last',
  });
  expect(mockCreateOneRecord.mock.calls[0]).toHaveLength(1);
});

it.each(['first', 'last'] as const)(
  'preserves board group calendar and RLS/filter precedence for default index %s',
  async (position) => {
    jest.clearAllMocks();
    mockBuildRecordInputFromRLSPredicates.mockReturnValue({
      id: 'rls-id',
      name: 'RLS name',
      objective: 'RLS objective',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
    });
    mockBuildRecordInputFromFilters.mockReturnValue({
      id: 'filter-id',
      name: 'Filter name',
      status: 'FILTER_GROUP',
      startDate: '2026-02-01',
    });
    const { result } = renderHook(
      () =>
        useCreateNewIndexRecord({
          objectMetadataItem,
          instanceId: 'default-index',
        }),
      { wrapper: StoreWrapper },
    );
    try {
      await act(async () => {
        await result.current.createNewIndexRecord({
          id: 'caller-id',
          name: 'Caller name',
          status: 'CALLER_GROUP',
          position,
          startDate: '2026-03-01',
          endDate: '2026-03-02',
        });
      });
      expect(mockCreateOneRecord).toHaveBeenCalledWith({
        id: 'caller-id',
        name: 'Caller name',
        objective: 'RLS objective',
        status: 'CALLER_GROUP',
        position,
        startDate: '2026-03-01',
        endDate: '2026-03-02',
      });
      expect(mockCreateOneRecord.mock.calls[0]).toHaveLength(1);
      expect(mockBuildRecordInputFromFilters).toHaveBeenCalledTimes(1);
      expect(mockBuildRecordInputFromRLSPredicates).toHaveBeenCalledTimes(1);
    } finally {
      mockBuildRecordInputFromRLSPredicates.mockReturnValue({});
      mockBuildRecordInputFromFilters.mockReturnValue({});
    }
  },
);
