import { useParams } from 'react-router-dom';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectNameSingularFromPlural } from '@/object-metadata/hooks/useObjectNameSingularFromPlural';
import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';
import { recordIndexContextualViewNameComponentState } from '@/object-record/record-index/states/recordIndexContextualViewNameComponentState';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useGetCurrentViewOnly } from '@/views/hooks/useGetCurrentViewOnly';

export const ViewBarPageTitle = () => {
  const { objectNamePlural } = useParams();
  const { currentView } = useGetCurrentViewOnly();
  const { recordIndexId } = useRecordIndexContextOrThrow();
  const recordIndexContextualViewName = useAtomComponentStateValue(
    recordIndexContextualViewNameComponentState,
    recordIndexId,
  );

  const { objectNameSingular } = useObjectNameSingularFromPlural({
    objectNamePlural: objectNamePlural ?? '',
  });

  const { objectMetadataItem } = useObjectMetadataItem({ objectNameSingular });

  const viewName = recordIndexContextualViewName ?? currentView?.name;
  const pageTitle = viewName
    ? `${viewName} - ${objectMetadataItem.labelPlural}`
    : objectMetadataItem.labelPlural;

  return <PageTitle title={pageTitle} />;
};
