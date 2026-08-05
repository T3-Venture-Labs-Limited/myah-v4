import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';

export const getRecordIndexIdFromObjectNamePluralAndViewId = (
  objectNamePlural: string,
  viewId: string,
): string => {
  return `${objectNamePlural}-${viewId}`;
};

export const getRecordIndexIdFromObjectNamePluralAndViewIdAndContextStoreInstanceId =
  (
    objectNamePlural: string,
    viewId: string,
    contextStoreInstanceId: string,
  ): string =>
    getRecordIndexIdFromObjectNamePluralAndViewId(
      objectNamePlural,
      contextStoreInstanceId === MAIN_CONTEXT_STORE_INSTANCE_ID
        ? viewId
        : `${viewId}-${contextStoreInstanceId}`,
    );
