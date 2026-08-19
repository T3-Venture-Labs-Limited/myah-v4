import { RecordIndexRemoveSortingModal } from '@/object-record/record-index/components/RecordIndexRemoveSortingModal';
import { RecordIndexTableContainerEffect } from '@/object-record/record-index/components/RecordIndexTableContainerEffect';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { RecordTableWithWrappers } from '@/object-record/record-table/components/RecordTableWithWrappers';
import { isModalOpenedComponentState } from '@/ui/layout/modal/states/isModalOpenedComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useViewBarControlIds } from '@/views/contexts/ViewBarControlIdsContext';

type RecordIndexTableContainerProps = {
  recordTableId: string;
};

export const RecordIndexTableContainer = ({
  recordTableId,
}: RecordIndexTableContainerProps) => {
  const { objectNameSingular, viewBarInstanceId } =
    useRecordIndexContextOrThrow();
  const { recordIndexRemoveSortingModalId } = useViewBarControlIds();

  const isModalOpened = useAtomComponentStateValue(
    isModalOpenedComponentState,
    recordIndexRemoveSortingModalId,
  );

  return (
    <>
      <RecordIndexTableContainerEffect />
      <RecordTableWithWrappers
        recordTableId={recordTableId}
        objectNameSingular={objectNameSingular}
        viewBarId={viewBarInstanceId}
      />
      {isModalOpened && <RecordIndexRemoveSortingModal />}
    </>
  );
};
