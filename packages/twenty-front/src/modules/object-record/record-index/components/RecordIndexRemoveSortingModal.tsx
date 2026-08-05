import { useRemoveRecordSort } from '@/object-record/record-sort/hooks/useRemoveRecordSort';
import { currentRecordSortsComponentState } from '@/object-record/record-sort/states/currentRecordSortsComponentState';
import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';
import { useLingui } from '@lingui/react/macro';

export const RecordIndexRemoveSortingModal = () => {
  const { t } = useLingui();
  const { recordIndexRemoveSortingModalId } = useViewBarControlIds();

  const currentRecordSorts = useAtomComponentStateValue(
    currentRecordSortsComponentState,
  );

  const fieldMetadataIds = currentRecordSorts.map(
    (viewSort) => viewSort.fieldMetadataId,
  );

  const { removeRecordSort } = useRemoveRecordSort();

  const handleRemoveClick = () => {
    fieldMetadataIds.forEach((id) => {
      removeRecordSort(id);
    });
  };

  return (
    <ConfirmationModal
      modalInstanceId={recordIndexRemoveSortingModalId}
      title={t`Remove sorting?`}
      subtitle={t`This is required to enable manual row reordering.`}
      onConfirmClick={handleRemoveClick}
      confirmButtonText={t`Remove Sorting`}
    />
  );
};
