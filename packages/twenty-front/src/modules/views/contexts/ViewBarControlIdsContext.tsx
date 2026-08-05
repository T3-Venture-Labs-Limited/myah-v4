import { createContext, type ReactNode, useContext, useMemo } from 'react';

import { OBJECT_OPTIONS_DROPDOWN_ID } from '@/object-record/object-options-dropdown/constants/ObjectOptionsDropdownId';
import { VIEW_SORT_DROPDOWN_ID } from '@/object-record/object-sort-dropdown/constants/ViewSortDropdownId';
import { RECORD_INDEX_REMOVE_SORTING_MODAL_ID } from '@/object-record/record-index/constants/RecordIndexRemoveSortingModalId';
import { HIDDEN_TABLE_COLUMN_DROPDOWN_ID } from '@/object-record/record-table/constants/HiddenTableColumnDropdownId';
import { RECORD_TABLE_CLICK_OUTSIDE_LISTENER_ID } from '@/object-record/record-table/constants/RecordTableClickOutsideListenerId';
import { ANY_FIELD_SEARCH_DROPDOWN_ID } from '@/views/constants/AnyFieldSearchDropdownId';
import { UPDATE_VIEW_BUTTON_DROPDOWN_ID } from '@/views/constants/UpdateViewButtonDropdownId';
import { ViewBarFilterDropdownIds } from '@/views/constants/ViewBarFilterDropdownIds';
import { VIEW_PICKER_CALENDAR_FIELD_DROPDOWN_ID } from '@/views/view-picker/constants/ViewPickerCalendarFieldDropdownId';
import { VIEW_PICKER_KANBAN_FIELD_DROPDOWN_ID } from '@/views/view-picker/constants/ViewPickerKanbanFieldDropdownId';
import { VIEW_PICKER_DROPDOWN_ID } from '@/views/view-picker/constants/ViewPickerDropdownId';
import { VIEW_PICKER_VIEW_TYPE_DROPDOWN_ID } from '@/views/view-picker/constants/ViewPickerViewTypeDropdownId';

export type ViewBarControlIds = {
  advancedFilterDropdownId: string;
  anyFieldSearchDropdownId: string;
  filterDropdownId: string;
  hiddenTableColumnDropdownId: string;
  objectOptionsDropdownId: string;
  recordIndexRemoveSortingModalId: string;
  recordTableClickOutsideListenerId: string;
  updateViewDropdownId: string;
  viewPickerCalendarFieldDropdownId: string;
  viewPickerDropdownId: string;
  viewPickerKanbanFieldDropdownId: string;
  viewPickerViewTypeDropdownId: string;
  viewSortDropdownId: string;
};

const defaultViewBarControlIds: ViewBarControlIds = {
  advancedFilterDropdownId: ViewBarFilterDropdownIds.ADVANCED,
  anyFieldSearchDropdownId: ANY_FIELD_SEARCH_DROPDOWN_ID,
  filterDropdownId: ViewBarFilterDropdownIds.MAIN,
  hiddenTableColumnDropdownId: HIDDEN_TABLE_COLUMN_DROPDOWN_ID,
  objectOptionsDropdownId: OBJECT_OPTIONS_DROPDOWN_ID,
  recordIndexRemoveSortingModalId: RECORD_INDEX_REMOVE_SORTING_MODAL_ID,
  recordTableClickOutsideListenerId: RECORD_TABLE_CLICK_OUTSIDE_LISTENER_ID,
  updateViewDropdownId: UPDATE_VIEW_BUTTON_DROPDOWN_ID,
  viewPickerCalendarFieldDropdownId: VIEW_PICKER_CALENDAR_FIELD_DROPDOWN_ID,
  viewPickerDropdownId: VIEW_PICKER_DROPDOWN_ID,
  viewPickerKanbanFieldDropdownId: VIEW_PICKER_KANBAN_FIELD_DROPDOWN_ID,
  viewPickerViewTypeDropdownId: VIEW_PICKER_VIEW_TYPE_DROPDOWN_ID,
  viewSortDropdownId: VIEW_SORT_DROPDOWN_ID,
};

const ViewBarControlIdsContext = createContext<ViewBarControlIds>(
  defaultViewBarControlIds,
);

export const getViewBarControlIds = (viewBarId: string): ViewBarControlIds => ({
  advancedFilterDropdownId: `${ViewBarFilterDropdownIds.ADVANCED}-${viewBarId}`,
  anyFieldSearchDropdownId: `${ANY_FIELD_SEARCH_DROPDOWN_ID}-${viewBarId}`,
  filterDropdownId: `${ViewBarFilterDropdownIds.MAIN}-${viewBarId}`,
  hiddenTableColumnDropdownId: `${HIDDEN_TABLE_COLUMN_DROPDOWN_ID}-${viewBarId}`,
  objectOptionsDropdownId: `${OBJECT_OPTIONS_DROPDOWN_ID}-${viewBarId}`,
  recordIndexRemoveSortingModalId: `${RECORD_INDEX_REMOVE_SORTING_MODAL_ID}-${viewBarId}`,
  recordTableClickOutsideListenerId: `${RECORD_TABLE_CLICK_OUTSIDE_LISTENER_ID}-${viewBarId}`,
  updateViewDropdownId: `${UPDATE_VIEW_BUTTON_DROPDOWN_ID}-${viewBarId}`,
  viewPickerCalendarFieldDropdownId: `${VIEW_PICKER_CALENDAR_FIELD_DROPDOWN_ID}-${viewBarId}`,
  viewPickerDropdownId: `${VIEW_PICKER_DROPDOWN_ID}-${viewBarId}`,
  viewPickerKanbanFieldDropdownId: `${VIEW_PICKER_KANBAN_FIELD_DROPDOWN_ID}-${viewBarId}`,
  viewPickerViewTypeDropdownId: `${VIEW_PICKER_VIEW_TYPE_DROPDOWN_ID}-${viewBarId}`,
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
