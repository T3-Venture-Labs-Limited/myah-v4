import { useParams } from 'react-router-dom';

import { AppPageErrorFallback } from '@/error-handler/components/AppPageErrorFallback';
import { MyahCampaignPageContent } from '@/myah/campaign/components/MyahCampaignPageContent';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';

export const MyahCampaignPage = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const { canReadObjectRecords } = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );
  const { record, loading, error, refetch } = useFindOneRecord({
    objectNameSingular: 'campaign',
    objectRecordId: campaignId ?? '',
    recordGqlFields: { id: true },
    skip: !campaignId || !canReadObjectRecords,
  });

  if (!canReadObjectRecords) {
    return (
      <PageCardLayout header={null}>
        You do not have permission to view this Campaign.
      </PageCardLayout>
    );
  }

  if (loading) {
    return <PageCardLayout header={null}>Loading Campaign</PageCardLayout>;
  }

  if (error || !campaignId || !record) {
    return (
      <AppPageErrorFallback
        error={error ?? new Error('Campaign not found.')}
        title={error ? 'Campaign could not load.' : 'Campaign not found.'}
        resetErrorBoundary={() => {
          void refetch().catch(() => undefined);
        }}
      />
    );
  }

  return <MyahCampaignPageContent key={campaignId} campaignId={campaignId} />;
};
