import { RecordIndexSurfaceContextStoreInitEffect } from '@/object-record/record-index/components/RecordIndexSurfaceContextStoreInitEffect';

type RecordTableWidgetContextStoreInitEffectProps = {
  contextStoreInstanceId: string;
  objectMetadataItemId: string;
  viewId: string;
};

export const RecordTableWidgetContextStoreInitEffect = ({
  contextStoreInstanceId,
  objectMetadataItemId,
  viewId,
}: RecordTableWidgetContextStoreInitEffectProps) => {
  return (
    <RecordIndexSurfaceContextStoreInitEffect
      contextStoreInstanceId={contextStoreInstanceId}
      objectMetadataItemId={objectMetadataItemId}
      viewId={viewId}
    />
  );
};
