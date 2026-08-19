import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { recordIndexContextualViewNameComponentState } from '@/object-record/record-index/states/recordIndexContextualViewNameComponentState';
import { PageTitleEffect } from '@/ui/utilities/page-title/components/PageTitleEffect';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';

export const ViewBarPageTitle = () => {
  const { currentView } = useGetCurrentViewOnly();
  const { objectMetadataItem, recordIndexId } = useRecordIndexContextOrThrow();
  const recordIndexContextualViewName = useAtomComponentStateValue(
    recordIndexContextualViewNameComponentState,
    recordIndexId,
  );

  const viewName = recordIndexContextualViewName ?? currentView?.name;

  const pageTitle = viewName
    ? `${viewName} - ${objectMetadataItem.labelPlural}`
    : objectMetadataItem.labelPlural;

  return (
    <PageTitleEffect
      key={`${recordIndexId}:${currentView?.id ?? ''}`}
      title={pageTitle}
    />
  );
};
