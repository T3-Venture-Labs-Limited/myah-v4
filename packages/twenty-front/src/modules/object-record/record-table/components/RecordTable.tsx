import { isNonEmptyString } from '@sniptt/guards';
import { useRef } from 'react';

import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { hasRecordGroupsComponentSelector } from '@/object-record/record-group/states/selectors/hasRecordGroupsComponentSelector';
import { recordIndexHasRecordsComponentSelector } from '@/object-record/record-index/states/selectors/recordIndexHasRecordsComponentSelector';
import { RecordTableBodyEffectsWrapper } from '@/object-record/record-table/components/RecordTableBodyEffectsWrapper';
import { RecordTableContent } from '@/object-record/record-table/components/RecordTableContent';
import { RecordTableEmpty } from '@/object-record/record-table/components/RecordTableEmpty';
import { RecordTableScrollToFocusedCellEffect } from '@/object-record/record-table/components/RecordTableScrollToFocusedCellEffect';
import { RecordTableScrollToFocusedRowEffect } from '@/object-record/record-table/components/RecordTableScrollToFocusedRowEffect';
import { getRecordTableClickOutsideListenerId } from '@/object-record/record-table/constants/RecordTableClickOutsideListenerId';
import { useRecordTableContextOrThrow } from '@/object-record/record-table/contexts/RecordTableContext';
import { useResetTableRowSelection } from '@/object-record/record-table/hooks/internal/useResetTableRowSelection';
import { isRecordTableEmptyStateHiddenComponentState } from '@/object-record/record-table/states/isRecordTableEmptyStateHiddenComponentState';
import { isRecordTableInitialLoadingComponentState } from '@/object-record/record-table/states/isRecordTableInitialLoadingComponentState';
import { recordTableInitialReadErrorComponentState } from '@/object-record/record-table/states/recordTableInitialReadErrorComponentState';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useTriggerInitialRecordTableDataLoad } from '@/object-record/record-table/virtualization/hooks/useTriggerInitialRecordTableDataLoad';
import { Button } from 'twenty-ui/input';
import { useClickOutsideListener } from '@/ui/utilities/pointer-event/hooks/useClickOutsideListener';
import { useAtomComponentSelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import isEmpty from 'lodash.isempty';

export const RecordTable = () => {
  const {
    recordTableId,
    objectNameSingular,
    objectMetadataItem,
    visibleRecordFields,
  } = useRecordTableContextOrThrow();

  const objectPermissions = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );
  const { embeddedSurfaceOptions } = useRecordIndexContextOrThrow();
  const { triggerInitialRecordTableDataLoad } =
    useTriggerInitialRecordTableDataLoad();

  const tableBodyRef = useRef<HTMLDivElement>(null);

  const { toggleClickOutside } = useClickOutsideListener(
    getRecordTableClickOutsideListenerId(recordTableId),
  );

  const isRecordTableInitialLoading = useAtomComponentStateValue(
    isRecordTableInitialLoadingComponentState,
    recordTableId,
  );

  const recordTableInitialReadError = useAtomComponentStateValue(
    recordTableInitialReadErrorComponentState,
    recordTableId,
  );

  const recordTableHasRecords = useAtomComponentSelectorValue(
    recordIndexHasRecordsComponentSelector,
    recordTableId,
  );

  const isRecordTableEmptyStateHidden = useAtomComponentStateValue(
    isRecordTableEmptyStateHiddenComponentState,
    recordTableId,
  );

  const hasRecordGroups = useAtomComponentSelectorValue(
    hasRecordGroupsComponentSelector,
    recordTableId,
  );

  const { resetTableRowSelection } = useResetTableRowSelection(recordTableId);

  const recordTableIsEmpty =
    !isRecordTableInitialLoading && !recordTableHasRecords;

  if (!isNonEmptyString(objectNameSingular)) {
    return <></>;
  }

  const handleDragSelectionStart = () => {
    resetTableRowSelection();
    toggleClickOutside(false);
  };

  const handleDragSelectionEnd = () => {
    toggleClickOutside(true);
  };

  return (
    <>
      {objectPermissions.canReadObjectRecords && (
        <>
          <RecordTableBodyEffectsWrapper
            hasRecordGroups={hasRecordGroups}
            tableBodyRef={tableBodyRef}
          />
          <RecordTableScrollToFocusedCellEffect />
          <RecordTableScrollToFocusedRowEffect />
        </>
      )}
      {embeddedSurfaceOptions?.showInitialReadError &&
      recordTableInitialReadError ? (
        <p role="alert">
          Campaign Influencers could not load. The audience count is unknown.{' '}
          <Button
            title="Retry Campaign Influencers"
            variant="secondary"
            onClick={() => void triggerInitialRecordTableDataLoad()}
          />
        </p>
      ) : isRecordTableInitialLoading &&
        isEmpty(visibleRecordFields) ? null : recordTableIsEmpty &&
        !hasRecordGroups &&
        !isRecordTableEmptyStateHidden ? (
        <RecordTableEmpty tableBodyRef={tableBodyRef} />
      ) : (
        <RecordTableContent
          tableBodyRef={tableBodyRef}
          handleDragSelectionStart={handleDragSelectionStart}
          handleDragSelectionEnd={handleDragSelectionEnd}
          hasRecordGroups={hasRecordGroups}
          recordTableId={recordTableId}
        />
      )}
    </>
  );
};
