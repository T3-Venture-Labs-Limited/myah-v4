import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';

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
const mockStore = { get: jest.fn(), set: jest.fn() };
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

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => mockStore,
}));

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
  onRecordCreated: mockOnRecordCreated,
  recordFieldByFieldMetadataItemId: {},
  recordIndexId: 'creator-index-list-a',
  viewBarInstanceId: 'creator-index-list-a',
};
type ScopedContextStoreWrapperProps = {
  children: ReactNode;
};

const ScopedContextStoreWrapper = ({
  children,
}: ScopedContextStoreWrapperProps) => (
  <ContextStoreComponentInstanceContext.Provider
    value={{ instanceId: 'creator-list-pane-list-a' }}
  >
    <RecordIndexContextProvider value={recordIndexContextValue}>
      {children}
    </RecordIndexContextProvider>
  </ContextStoreComponentInstanceContext.Provider>
);

describe('useCreateNewIndexRecord', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.get.mockReturnValue(ViewOpenRecordIn.SIDE_PANEL);
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

  it('does not require record index context when creating from a headless command', async () => {
    const { result } = renderHook(() =>
      useCreateNewIndexRecord({
        instanceId: 'workflow-index-list-a',
        objectMetadataItem,
      }),
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
