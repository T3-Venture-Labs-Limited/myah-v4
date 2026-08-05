import { useContext } from 'react';

import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { PageFocusId } from '@/types/PageFocusId';

export const useRecordIndexFocusId = () => {
  const contextStoreInstance = useContext(ContextStoreComponentInstanceContext);
  const { recordIndexId } = useRecordIndexContextOrThrow();

  if (
    !contextStoreInstance ||
    contextStoreInstance.instanceId === MAIN_CONTEXT_STORE_INSTANCE_ID
  ) {
    return PageFocusId.RecordIndex;
  }

  return `${PageFocusId.RecordIndex}-${recordIndexId}`;
};
