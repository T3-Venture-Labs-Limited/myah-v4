import { Key } from 'ts-key-enum';

import { useResetTableRowSelection } from '@/object-record/record-table/hooks/internal/useResetTableRowSelection';
import { isAtLeastOneTableRowSelectedSelector } from '@/object-record/record-table/record-table-row/states/isAtLeastOneTableRowSelectedSelector';
import { useRecordIndexFocusId } from '@/object-record/record-index/hooks/useRecordIndexFocusId';
import { useHotkeysOnFocusedElement } from '@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';

export const RecordTableBodyEscapeHotkeyEffect = () => {
  const recordIndexFocusId = useRecordIndexFocusId();
  const { resetTableRowSelection } = useResetTableRowSelection();

  const isAtLeastOneRecordSelected = useAtomComponentSelectorValue(
    isAtLeastOneTableRowSelectedSelector,
  );

  const handleEscape = () => {
    if (isAtLeastOneRecordSelected) {
      resetTableRowSelection();
    }
  };

  useHotkeysOnFocusedElement({
    keys: [Key.Escape],
    callback: handleEscape,
    focusId: recordIndexFocusId,
    dependencies: [handleEscape, recordIndexFocusId],
    options: {
      preventDefault: true,
    },
  });

  return null;
};
