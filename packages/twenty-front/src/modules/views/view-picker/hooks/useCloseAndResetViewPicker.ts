import { useCallback } from 'react';

import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';
import { viewPickerIsPersistingComponentState } from '@/views/view-picker/states/viewPickerIsPersistingComponentState';
import { viewPickerModeComponentState } from '@/views/view-picker/states/viewPickerModeComponentState';

export const useCloseAndResetViewPicker = () => {
  const {
    viewPickerCalendarFieldDropdownId,
    viewPickerDropdownId,
    viewPickerKanbanFieldDropdownId,
    viewPickerViewTypeDropdownId,
  } = useViewBarControlIds();
  const setViewPickerMode = useSetAtomComponentState(
    viewPickerModeComponentState,
  );

  const setViewPickerIsPersisting = useSetAtomComponentState(
    viewPickerIsPersistingComponentState,
  );

  const { closeDropdown } = useCloseDropdown();

  const closeAndResetViewPicker = useCallback(() => {
    setViewPickerIsPersisting(false);
    setViewPickerMode('list');
    closeDropdown(viewPickerKanbanFieldDropdownId);
    closeDropdown(viewPickerViewTypeDropdownId);
    closeDropdown(viewPickerCalendarFieldDropdownId);
    closeDropdown(viewPickerDropdownId);
  }, [
    closeDropdown,
    setViewPickerIsPersisting,
    setViewPickerMode,
    viewPickerCalendarFieldDropdownId,
    viewPickerKanbanFieldDropdownId,
    viewPickerViewTypeDropdownId,
    viewPickerDropdownId,
  ]);

  return { closeAndResetViewPicker };
};
