import { RecordIndexSurfaceContextStoreInitEffect } from '@/object-record/record-index/components/RecordIndexSurfaceContextStoreInitEffect';

type RecordTableWidgetContextStoreInitializerProps = {
  contextStoreInstanceId: string;
  objectMetadataItemId: string;
  viewId: string;
};

export const RecordTableWidgetContextStoreInitializer = ({
  contextStoreInstanceId,
  objectMetadataItemId,
  viewId,
}: RecordTableWidgetContextStoreInitializerProps) => {
  return (
    <RecordIndexSurfaceContextStoreInitEffect
      contextStoreInstanceId={contextStoreInstanceId}
      objectMetadataItemId={objectMetadataItemId}
      viewId={viewId}
    />
  );
};
