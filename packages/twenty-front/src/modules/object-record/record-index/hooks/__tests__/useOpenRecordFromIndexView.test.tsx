import { act, renderHook } from '@testing-library/react';

import {
  RecordIndexContextProvider,
  type RecordIndexContextValue,
} from '@/object-record/record-index/contexts/RecordIndexContext';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { useOpenRecordFromIndexView } from '@/object-record/record-index/hooks/useOpenRecordFromIndexView';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';
import { AppPath } from 'twenty-shared/types';

const mockCloseSidePanelMenu = jest.fn();
const mockNavigate = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();
const mockStore = {
  get: jest.fn(),
  set: jest.fn(),
};
const mockUseGetCurrentViewOnly = jest.fn();

jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: mockCloseSidePanelMenu }),
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState',
  () => ({
    useAtomComponentStateCallbackState: jest.fn(),
  }),
);

jest.mock('jotai', () => ({
  ...jest.requireActual('jotai'),
  useStore: () => mockStore,
}));

jest.mock('twenty-ui/utilities', () => ({
  useIsMobile: () => false,
}));

jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => mockUseGetCurrentViewOnly(),
}));

const recordIndexContextValue: RecordIndexContextValue = {
  fieldDefinitionByFieldMetadataItemId: {},
  fieldMetadataItemByFieldMetadataItemId: {},
  indexIdentifierUrl: () => '',
  labelIdentifierFieldMetadataItem: undefined,
  objectMetadataItem: {} as never,
  objectNamePlural: 'people',
  objectNameSingular: 'person',
  objectPermissionsByObjectMetadataId: {},
  onIndexRecordsLoaded: jest.fn(),
  recordFieldByFieldMetadataItemId: {},
  recordIndexId: 'record-index-id',
  viewBarInstanceId: 'record-index-id',
};

describe('useOpenRecordFromIndexView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetCurrentViewOnly.mockReturnValue({ currentView: undefined });
  });

  it('delegates a configured index record open before native side-panel or route behavior', () => {
    const onOpenRecordFromIndexView = jest.fn();
    const { result } = renderHook(() => useOpenRecordFromIndexView(), {
      wrapper: ({ children }) => (
        <RecordIndexContextProvider
          value={{
            ...recordIndexContextValue,
            onOpenRecordFromIndexView,
          }}
        >
          {children}
        </RecordIndexContextProvider>
      ),
    });

    const activationElement = document.createElement('button');

    act(() =>
      result.current.openRecordFromIndexView({
        activationElement,
        recordId: 'list-a',
        source: 'table-identifier-action',
      }),
    );

    expect(onOpenRecordFromIndexView).toHaveBeenCalledWith({
      activationElement,
      recordId: 'list-a',
      source: 'table-identifier-action',
    });
    expect(mockOpenRecordInSidePanel).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockStore.set).not.toHaveBeenCalled();
    expect(mockCloseSidePanelMenu).not.toHaveBeenCalled();
  });

  it('uses the isolated view open mode instead of the global index state', () => {
    mockStore.get.mockReturnValue(ViewOpenRecordIn.SIDE_PANEL);
    mockUseGetCurrentViewOnly.mockReturnValue({
      currentView: { openRecordIn: ViewOpenRecordIn.RECORD_PAGE },
    });

    const { result } = renderHook(() => useOpenRecordFromIndexView(), {
      wrapper: ({ children }) => (
        <ContextStoreComponentInstanceContext.Provider
          value={{ instanceId: 'creator-list-pane-list-a' }}
        >
          <RecordIndexContextProvider value={recordIndexContextValue}>
            {children}
          </RecordIndexContextProvider>
        </ContextStoreComponentInstanceContext.Provider>
      ),
    });

    act(() =>
      result.current.openRecordFromIndexView({
        recordId: 'creator-a',
        source: 'record-chip',
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith(AppPath.RecordShowPage, {
      objectNameSingular: 'person',
      objectRecordId: 'creator-a',
    });
    expect(mockOpenRecordInSidePanel).not.toHaveBeenCalled();
  });
});
