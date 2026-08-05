export const RECORD_TABLE_CLICK_OUTSIDE_LISTENER_ID = 'record-table';

export function getRecordTableClickOutsideListenerId(recordTableId: string) {
  return `${RECORD_TABLE_CLICK_OUTSIDE_LISTENER_ID}-${recordTableId}`;
}
