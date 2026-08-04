import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';

import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { useOpenRecordFromIndexView } from '@/object-record/record-index/hooks/useOpenRecordFromIndexView';
import { AppPath } from 'twenty-shared/types';
import { ViewOpenRecordIn } from '~/generated-metadata/graphql';

const mockNavigate = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();
const mockCloseSidePanelMenu = jest.fn();
const mockStoreGet = jest.fn();
const mockStoreSet = jest.fn();
let mockCurrentViewOpenRecordIn = ViewOpenRecordIn.SIDE_PANEL;
let mockQueryOnlyRecordFilters: unknown[] = [];

jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: mockCloseSidePanelMenu }),
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

jest.mock('@/side-panel/states/sidePanelPageState', () => ({
  sidePanelPageState: { atom: 'side-panel-page' },
}));

jest.mock(
  '@/context-store/states/contextStoreRecordShowParentViewComponentState',
  () => ({
    contextStoreRecordShowParentViewComponentState: {
      atomFamily: ({ instanceId }: { instanceId: string }) =>
        `parent-view-${instanceId}`,
    },
  }),
);

jest.mock(
  '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState',
  () => ({
    currentRecordFilterGroupsComponentState: { key: 'filter-groups' },
  }),
);

jest.mock(
  '@/object-record/record-filter/states/currentRecordFiltersComponentState',
  () => ({ currentRecordFiltersComponentState: { key: 'record-filters' } }),
);

jest.mock(
  '@/object-record/record-filter/states/queryOnlyRecordFiltersComponentState',
  () => ({
    queryOnlyRecordFiltersComponentState: { key: 'query-only-record-filters' },
  }),
);

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: () => ({
    objectNameSingular: 'creator',
    recordIndexId: 'creator-list-pane-index',
  }),
}));

jest.mock(
  '@/object-record/record-index/states/recordIndexOpenRecordInState',
  () => ({ recordIndexOpenRecordInState: { atom: 'open-record-in' } }),
);

jest.mock(
  '@/object-record/record-sort/states/currentRecordSortsComponentState',
  () => ({ currentRecordSortsComponentState: { key: 'record-sorts' } }),
);

jest.mock('@/object-record/utils/canOpenObjectInSidePanel', () => ({
  canOpenObjectInSidePanel: () => true,
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState',
  () => ({
    useAtomComponentStateCallbackState: (componentState: { key: string }) =>
      componentState.key,
  }),
);

jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({
    currentView: { openRecordIn: mockCurrentViewOpenRecordIn },
  }),
}));

jest.mock('jotai', () => {
  const actual = jest.requireActual('jotai');

  return {
    ...actual,
    useStore: () => ({ get: mockStoreGet, set: mockStoreSet }),
  };
});

jest.mock('twenty-ui/utilities', () => ({ useIsMobile: () => false }));

jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));

const storedRecordFilters = [{ id: 'saved-filter', value: 'saved' }] as const;
const membershipFilter = { id: 'creator-list-membership', value: 'list-a' };

const renderOpenRecordHook = (contextStoreInstanceId: string) =>
  renderHook(() => useOpenRecordFromIndexView(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ContextStoreComponentInstanceContext.Provider
        value={{ instanceId: contextStoreInstanceId }}
      >
        {children}
      </ContextStoreComponentInstanceContext.Provider>
    ),
  });

describe('useOpenRecordFromIndexView', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockOpenRecordInSidePanel.mockClear();
    mockCloseSidePanelMenu.mockClear();
    mockStoreGet.mockClear();
    mockStoreSet.mockClear();
    mockQueryOnlyRecordFilters = [membershipFilter];

    mockStoreGet.mockImplementation((state) => {
      switch (state) {
        case 'record-filters':
          return storedRecordFilters;
        case 'query-only-record-filters':
          return mockQueryOnlyRecordFilters;
        case 'record-sorts':
          return [{ fieldMetadataId: 'name' }];
        case 'filter-groups':
          return [{ id: 'filter-group' }];
        case 'side-panel-page':
          return undefined;
        default:
          return undefined;
      }
    });
  });

  it.each([ViewOpenRecordIn.SIDE_PANEL, ViewOpenRecordIn.RECORD_PAGE])(
    'keeps membership filters in parent pagination when the scoped view opens records in %s',
    (openRecordIn) => {
      mockCurrentViewOpenRecordIn = openRecordIn;
      const { result } = renderOpenRecordHook('creator-list-pane-list-a');

      act(() => {
        result.current.openRecordFromIndexView({
          recordId: 'creator-a',
          source: 'record-chip',
        });
      });

      expect(mockStoreSet).toHaveBeenCalledWith(
        'parent-view-main-context-store',
        expect.objectContaining({
          parentViewFilters: [storedRecordFilters[0], membershipFilter],
        }),
      );

      if (openRecordIn === ViewOpenRecordIn.SIDE_PANEL) {
        expect(mockOpenRecordInSidePanel).toHaveBeenCalledWith({
          objectNameSingular: 'creator',
          recordId: 'creator-a',
          resetNavigationStack: true,
        });
        expect(mockNavigate).not.toHaveBeenCalled();
      } else {
        expect(mockNavigate).toHaveBeenCalledWith(AppPath.RecordShowPage, {
          objectNameSingular: 'creator',
          objectRecordId: 'creator-a',
        });
        expect(mockOpenRecordInSidePanel).not.toHaveBeenCalled();
      }
    },
  );
});
