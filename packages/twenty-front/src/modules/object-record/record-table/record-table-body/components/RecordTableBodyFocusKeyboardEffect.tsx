import { useRecordTableRowFocusHotkeys } from '@/object-record/record-table/hooks/useRecordTableRowFocusHotkeys';
import { useRecordIndexFocusId } from '@/object-record/record-index/hooks/useRecordIndexFocusId';

export const RecordTableBodyFocusKeyboardEffect = () => {
  const recordIndexFocusId = useRecordIndexFocusId();
  useRecordTableRowFocusHotkeys({
    focusId: recordIndexFocusId,
  });

  return null;
};
