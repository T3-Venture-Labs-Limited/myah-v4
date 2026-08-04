import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { RecordIndexSurface } from '@/object-record/record-index/components/RecordIndexSurface';
import { useHandleIndexIdentifierClick } from '@/object-record/record-index/hooks/useHandleIndexIdentifierClick';
import { useRecordIndexIdFromCurrentContextStore } from '@/object-record/record-index/hooks/useRecordIndexIdFromCurrentContextStore';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';

export type RecordIndexContainerGaterProps = {
  indexIdentifierUrl?: (recordId: string) => string;
  onOpenRecordFromIndexView?: (recordId: string) => void;
};

export const RecordIndexContainerGater = ({
  indexIdentifierUrl: indexIdentifierUrlOverride,
  onOpenRecordFromIndexView,
}: RecordIndexContainerGaterProps) => {
  const { objectMetadataItem } = useRecordIndexIdFromCurrentContextStore();
  const viewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );
  const { indexIdentifierUrl: defaultIndexIdentifierUrl } =
    useHandleIndexIdentifierClick({
      objectMetadataItem,
    });

  if (!viewId) {
    return null;
  }

  return (
    <RecordIndexSurface
      contextStoreInstanceId={MAIN_CONTEXT_STORE_INSTANCE_ID}
      objectNameSingular={objectMetadataItem.nameSingular}
      viewId={viewId}
      indexIdentifierUrl={indexIdentifierUrlOverride ?? defaultIndexIdentifierUrl}
      onOpenRecordFromIndexView={onOpenRecordFromIndexView}
    />
  );
};
