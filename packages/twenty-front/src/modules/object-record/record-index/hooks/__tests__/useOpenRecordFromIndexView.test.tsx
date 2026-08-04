import { act, renderHook } from '@testing-library/react';

import {
  RecordIndexContextProvider,
  type RecordIndexContextValue,
} from '@/object-record/record-index/contexts/RecordIndexContext';
import { useOpenRecordFromIndexView } from '@/object-record/record-index/hooks/useOpenRecordFromIndexView';

const mockCloseSidePanelMenu = jest.fn();
const mockNavigate = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();
const mockStore = {
  get: jest.fn(),
  set: jest.fn(),
};

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

    act(() => result.current.openRecordFromIndexView({ recordId: 'list-a' }));

    expect(onOpenRecordFromIndexView).toHaveBeenCalledWith('list-a');
    expect(mockOpenRecordInSidePanel).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockStore.set).not.toHaveBeenCalled();
    expect(mockCloseSidePanelMenu).not.toHaveBeenCalled();
  });
});
