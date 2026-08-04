import { renderHook } from '@testing-library/react';

import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { useCurrentCommandMenuContextApi } from '@/command-menu-item/hooks/useCurrentCommandMenuContextApi';

let mockContextStoreInstanceId = MAIN_CONTEXT_STORE_INSTANCE_ID;
const mockUseAtomComponentSelectorValue = jest.fn();

jest.mock(
  '@/ui/utilities/state/component-state/hooks/useAvailableComponentInstanceIdOrThrow',
  () => ({
    useAvailableComponentInstanceIdOrThrow: () => mockContextStoreInstanceId,
  }),
);

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      { id: 'creator-object', namePlural: 'creators', nameSingular: 'creator' },
    ],
  }),
}));

jest.mock(
  '@/navigation-menu-item/display/hooks/useNavigationMenuItemsData',
  () => ({ useNavigationMenuItemsData: () => ({ navigationMenuItems: [] }) }),
);

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    canDestroyObjectRecords: false,
    canReadObjectRecords: true,
    canSoftDeleteObjectRecords: false,
    canUpdateObjectRecords: true,
    objectMetadataId: 'creator-object',
    restrictedFields: {},
    rowLevelPermissionPredicateGroups: [],
    rowLevelPermissionPredicates: [],
  }),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({
    useAtomComponentSelectorValue: (
      _selector: unknown,
      recordIndexId: string,
    ) => mockUseAtomComponentSelectorValue(recordIndexId),
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (componentState: { key?: string }) => {
      switch (componentState.key) {
        case 'contextStoreCurrentObjectMetadataItemIdComponentState':
          return 'creator-object';
        case 'contextStoreCurrentViewIdComponentState':
          return 'creator-view';
        case 'contextStoreCurrentPageTypeComponentState':
          return undefined;
        case 'contextStoreNumberOfSelectedRecordsComponentState':
          return 0;
        case 'contextStoreTargetedRecordsRuleComponentState':
          return { mode: 'selection', selectedRecordIds: [] };
        default:
          return undefined;
      }
    },
  }),
);

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue',
  () => ({ useAtomFamilySelectorValue: () => [] }),
);

jest.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => undefined,
}));

jest.mock('jotai', () => {
  const actual = jest.requireActual('jotai');

  return {
    ...actual,
    useAtomValue: () => false,
    useStore: () => ({
      get: () => ({ canRead: true, canUpdate: true }),
    }),
  };
});

jest.mock('@/auth/states/currentUserState', () => ({
  currentUserState: { atom: 'current-user' },
}));

jest.mock('@/auth/states/currentUserWorkspaceState', () => ({
  currentUserWorkspaceState: { atom: 'current-user-workspace' },
}));

jest.mock('@/auth/states/currentWorkspaceState', () => ({
  currentWorkspaceState: { atom: 'current-workspace' },
}));

jest.mock('@/auth/states/objectPermissionsFamilySelector', () => ({
  objectPermissionsFamilySelector: {
    selectorFamily: () => 'object-permissions',
  },
}));

jest.mock(
  '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState',
  () => ({
    contextStoreCurrentObjectMetadataItemIdComponentState: {
      key: 'contextStoreCurrentObjectMetadataItemIdComponentState',
    },
  }),
);

jest.mock(
  '@/context-store/states/contextStoreCurrentViewIdComponentState',
  () => ({
    contextStoreCurrentViewIdComponentState: {
      key: 'contextStoreCurrentViewIdComponentState',
    },
  }),
);

jest.mock(
  '@/context-store/states/contextStoreCurrentPageTypeComponentState',
  () => ({
    contextStoreCurrentPageTypeComponentState: {
      key: 'contextStoreCurrentPageTypeComponentState',
    },
  }),
);

jest.mock(
  '@/context-store/states/contextStoreNumberOfSelectedRecordsComponentState',
  () => ({
    contextStoreNumberOfSelectedRecordsComponentState: {
      key: 'contextStoreNumberOfSelectedRecordsComponentState',
    },
  }),
);

jest.mock(
  '@/context-store/states/contextStoreTargetedRecordsRuleComponentState',
  () => ({
    contextStoreTargetedRecordsRuleComponentState: {
      key: 'contextStoreTargetedRecordsRuleComponentState',
    },
  }),
);

jest.mock(
  '@/object-record/record-filter/states/hasAnySoftDeleteFilterOnView',
  () => ({ hasAnySoftDeleteFilterOnViewComponentSelector: {} }),
);

jest.mock(
  '@/object-record/record-store/states/selectors/recordStoreRecordsSelector',
  () => ({
    recordStoreRecordsSelector: {},
  }),
);

jest.mock('@/page-layout/states/currentPageLayoutIdState', () => ({
  currentPageLayoutIdState: { atom: 'current-page-layout' },
}));

jest.mock('@/page-layout/states/isDashboardInEditModeComponentState', () => ({
  isDashboardInEditModeComponentState: {
    atomFamily: () => 'dashboard-edit-mode',
  },
}));

jest.mock(
  '@/layout-customization/states/isLayoutCustomizationModeEnabledState',
  () => ({ isLayoutCustomizationModeEnabledState: { atom: 'layout-mode' } }),
);

describe('useCurrentCommandMenuContextApi', () => {
  beforeEach(() => {
    mockContextStoreInstanceId = MAIN_CONTEXT_STORE_INSTANCE_ID;
    mockUseAtomComponentSelectorValue.mockReset();
    mockUseAtomComponentSelectorValue.mockImplementation(
      (recordIndexId: string) => recordIndexId === 'creators-creator-view',
    );
  });

  it('uses the scoped record index to determine filter-dependent command availability', () => {
    mockContextStoreInstanceId = 'creator-list-pane-list-a';
    mockUseAtomComponentSelectorValue.mockImplementation(
      (recordIndexId: string) =>
        recordIndexId === 'creators-creator-view-creator-list-pane-list-a',
    );

    const { result } = renderHook(() => useCurrentCommandMenuContextApi());

    expect(result.current.hasAnySoftDeleteFilterOnView).toBe(true);
    expect(mockUseAtomComponentSelectorValue).toHaveBeenCalledWith(
      'creators-creator-view-creator-list-pane-list-a',
    );
  });

  it('keeps the default command identity unchanged in the main context', () => {
    const { result } = renderHook(() => useCurrentCommandMenuContextApi());

    expect(result.current.hasAnySoftDeleteFilterOnView).toBe(true);
    expect(mockUseAtomComponentSelectorValue).toHaveBeenCalledWith(
      'creators-creator-view',
    );
  });
});
