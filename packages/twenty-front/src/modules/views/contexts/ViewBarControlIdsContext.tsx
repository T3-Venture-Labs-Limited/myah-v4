import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { VIEW_SORT_DROPDOWN_ID } from '@/object-record/object-sort-dropdown/constants/ViewSortDropdownId';
import { ViewBarFilterDropdownIds } from '@/views/constants/ViewBarFilterDropdownIds';
import { VIEW_PICKER_DROPDOWN_ID } from '@/views/view-picker/constants/ViewPickerDropdownId';

export type ViewBarControlIds = {
  advancedFilterDropdownId: string;
  filterDropdownId: string;
  viewPickerDropdownId: string;
  viewSortDropdownId: string;
};

const defaultViewBarControlIds: ViewBarControlIds = {
  advancedFilterDropdownId: ViewBarFilterDropdownIds.ADVANCED,
  filterDropdownId: ViewBarFilterDropdownIds.MAIN,
  viewPickerDropdownId: VIEW_PICKER_DROPDOWN_ID,
  viewSortDropdownId: VIEW_SORT_DROPDOWN_ID,
};

const ViewBarControlIdsContext = createContext<ViewBarControlIds>(
  defaultViewBarControlIds,
);

export const getViewBarControlIds = (viewBarId: string): ViewBarControlIds => ({
  advancedFilterDropdownId: `${ViewBarFilterDropdownIds.ADVANCED}-${viewBarId}`,
  filterDropdownId: `${ViewBarFilterDropdownIds.MAIN}-${viewBarId}`,
  viewPickerDropdownId: `${VIEW_PICKER_DROPDOWN_ID}-${viewBarId}`,
  viewSortDropdownId: `${VIEW_SORT_DROPDOWN_ID}-${viewBarId}`,
});

type ViewBarControlIdsProviderProps = {
  children: ReactNode;
  viewBarId: string;
};

export const ViewBarControlIdsProvider = ({
  children,
  viewBarId,
}: ViewBarControlIdsProviderProps) => {
  const controlIds = useMemo(
    () => getViewBarControlIds(viewBarId),
    [viewBarId],
  );
  return (
    <ViewBarControlIdsContext.Provider value={controlIds}>
      {children}
    </ViewBarControlIdsContext.Provider>
  );
};

export const useViewBarControlIds = () => useContext(ViewBarControlIdsContext);
