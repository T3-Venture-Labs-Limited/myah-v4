import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { useObjectMetadataItemById } from '@/object-metadata/hooks/useObjectMetadataItemById';
import { RecordTableWidget } from '@/object-record/record-table-widget/components/RecordTableWidget';
import { RecordTableWidgetProvider } from '@/object-record/record-table-widget/components/RecordTableWidgetProvider';
import { RecordTableWidgetViewDraftInitEffect } from '@/page-layout/widgets/record-table/components/RecordTableWidgetViewDraftInitEffect';

type RecordTableWidgetRendererContentProps = {
  objectMetadataId: string;
  viewId: string;
  widgetId: string;
  isReadOnly?: boolean;
  isEmptyStateHidden?: boolean;
  recordLimit?: number;
  queryOnlyRecordFilters?: RecordFilter[];
  requiredCreationInput?: Record<string, string>;
  scopeInstanceId?: string;
};

export const RecordTableWidgetRendererContent = ({
  objectMetadataId,
  viewId,
  widgetId,
  isReadOnly = true,
  isEmptyStateHidden = false,
  recordLimit,
  queryOnlyRecordFilters,
  requiredCreationInput,
  scopeInstanceId,
}: RecordTableWidgetRendererContentProps) => {
  const { objectMetadataItem } = useObjectMetadataItemById({
    objectId: objectMetadataId,
  });

  return (
    <>
      <RecordTableWidgetViewDraftInitEffect
        widgetId={widgetId}
        viewId={viewId}
      />
      <RecordTableWidgetProvider
        objectNameSingular={objectMetadataItem.nameSingular}
        viewId={viewId}
        widgetId={widgetId}
        recordLimit={recordLimit}
        queryOnlyRecordFilters={queryOnlyRecordFilters}
        requiredCreationInput={requiredCreationInput}
        scopeInstanceId={scopeInstanceId}
      >
        <RecordTableWidget
          isReadOnly={isReadOnly}
          isEmptyStateHidden={isEmptyStateHidden}
        />
      </RecordTableWidgetProvider>
    </>
  );
};
