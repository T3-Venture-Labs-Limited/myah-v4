import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { contextStoreCurrentViewTypeComponentState } from '@/context-store/states/contextStoreCurrentViewTypeComponentState';
import { ContextStoreViewType } from '@/context-store/types/ContextStoreViewType';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { useEffect } from 'react';

export type RecordIndexSurfaceContextStoreInitEffectProps = {
  contextStoreInstanceId: string;
  objectMetadataItemId: string;
  viewId: string;
};

export const RecordIndexSurfaceContextStoreInitEffect = ({
  contextStoreInstanceId,
  objectMetadataItemId,
  viewId,
}: RecordIndexSurfaceContextStoreInitEffectProps) => {
  const setContextStoreCurrentObjectMetadataItemId = useSetAtomComponentState(
    contextStoreCurrentObjectMetadataItemIdComponentState,
    contextStoreInstanceId,
  );
  const setContextStoreCurrentViewId = useSetAtomComponentState(
    contextStoreCurrentViewIdComponentState,
    contextStoreInstanceId,
  );
  const setContextStoreCurrentViewType = useSetAtomComponentState(
    contextStoreCurrentViewTypeComponentState,
    contextStoreInstanceId,
  );

  useEffect(() => {
    setContextStoreCurrentObjectMetadataItemId(objectMetadataItemId);
    setContextStoreCurrentViewId(viewId);
    setContextStoreCurrentViewType(ContextStoreViewType.Table);
  }, [
    objectMetadataItemId,
    setContextStoreCurrentObjectMetadataItemId,
    setContextStoreCurrentViewId,
    setContextStoreCurrentViewType,
    viewId,
  ]);

  return null;
};
