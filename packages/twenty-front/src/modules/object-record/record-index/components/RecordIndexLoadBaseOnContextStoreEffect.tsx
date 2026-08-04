import { useContextStoreObjectMetadataItemOrThrow } from '@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { useLoadRecordIndexStates } from '@/object-record/record-index/hooks/useLoadRecordIndexStates';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { viewFromViewIdFamilySelector } from '@/views/states/selectors/viewFromViewIdFamilySelector';
import { useEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

type RecordIndexLoadBaseOnContextStoreEffectProps = {
  recordIndexId?: string;
  skipGlobalIndexStates?: boolean;
};

export const RecordIndexLoadBaseOnContextStoreEffect = ({
  recordIndexId,
  skipGlobalIndexStates,
}: RecordIndexLoadBaseOnContextStoreEffectProps) => {
  const { loadRecordIndexStates } = useLoadRecordIndexStates();
  const contextStoreCurrentViewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
  );

  const [loadedViewId, setLoadedViewId] = useState<string | undefined>(
    undefined,
  );

  const view = useAtomFamilySelectorValue(viewFromViewIdFamilySelector, {
    viewId: contextStoreCurrentViewId ?? '',
  });

  const { objectMetadataItem } = useContextStoreObjectMetadataItemOrThrow();

  useEffect(() => {
    if (
      isDefined(contextStoreCurrentViewId) &&
      loadedViewId === contextStoreCurrentViewId
    ) {
      return;
    }

    if (!isDefined(objectMetadataItem)) {
      return;
    }

    if (isDefined(view)) {
      loadRecordIndexStates(view, objectMetadataItem, {
        recordIndexId,
        skipGlobalIndexStates,
      });
      setLoadedViewId(contextStoreCurrentViewId);
    }
  }, [
    contextStoreCurrentViewId,
    loadRecordIndexStates,
    loadedViewId,
    objectMetadataItem,
    recordIndexId,
    skipGlobalIndexStates,
    view,
  ]);

  return <></>;
};
