import { type CSSProperties } from 'react';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { Status } from 'twenty-ui/data-display';
import { InlineBanner, Loader } from 'twenty-ui/feedback';
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleX,
  IconLock,
} from 'twenty-ui/icon';
import { type ThemeType, useTheme } from 'twenty-ui/theme-constants';

type CampaignLifecycleStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';
type CampaignReadinessRecord = ObjectRecord & {
  name: string | null;
  objective: string | null;
  lifecycleStatus: CampaignLifecycleStatus | null;
};
type CampaignCreatorRecord = ObjectRecord & { campaignId: string };

const statusPresentationByStatus: Record<
  CampaignLifecycleStatus,
  { color: 'gray' | 'green' | 'orange' | 'blue'; text: string }
> = {
  DRAFT: { color: 'gray', text: 'Draft' },
  ACTIVE: { color: 'green', text: 'Active' },
  PAUSED: { color: 'orange', text: 'Stopped' },
  COMPLETED: { color: 'blue', text: 'Completed' },
};
const isStatus = (value: unknown): value is CampaignLifecycleStatus =>
  value === 'DRAFT' ||
  value === 'ACTIVE' ||
  value === 'PAUSED' ||
  value === 'COMPLETED';
const hasContent = (value: string | null) => (value?.trim().length ?? 0) > 0;

const ReadinessData = ({
  campaignId,
  metadataId,
  theme,
}: {
  campaignId: string;
  metadataId: string;
  theme: ThemeType;
}) => {
  const permissions = useObjectPermissionsForObject(metadataId);
  const campaignQuery = useFindOneRecord<CampaignReadinessRecord>({
    objectNameSingular: 'campaign',
    objectRecordId: campaignId,
    recordGqlFields: {
      id: true,
      name: true,
      objective: true,
      lifecycleStatus: true,
    },
    skip: !permissions.canReadObjectRecords,
  });
  const audienceQuery = useFindManyRecords<CampaignCreatorRecord>({
    objectNameSingular: 'campaignCreator',
    filter: {
      and: [
        { campaignId: { eq: campaignId } },
        { creatorId: { is: 'NOT_NULL' } },
        { deletedAt: { is: 'NULL' } },
      ],
    },
    recordGqlFields: { id: true },
    limit: 1,
    skip: !permissions.canReadObjectRecords,
  });
  const quiet: CSSProperties = {
    alignItems: 'center',
    color: theme.font.color.secondary,
    display: 'flex',
    gap: theme.spacing[2],
  };
  const retry = () => {
    void campaignQuery.refetch();
    void audienceQuery.refetch();
  };

  if (!permissions.canReadObjectRecords)
    return (
      <div style={quiet}>
        <IconLock aria-hidden="true" />
        <span>You don't have permission to view this Campaign.</span>
      </div>
    );
  if (campaignQuery.loading || audienceQuery.loading)
    return (
      <div aria-label="Loading Campaign readiness" style={quiet}>
        <Loader />
        <span>Loading Campaign readiness</span>
      </div>
    );
  if (
    campaignQuery.error ||
    audienceQuery.error ||
    !audienceQuery.hasReadPermission
  )
    return (
      <InlineBanner
        color="danger"
        LeftIcon={IconAlertTriangle}
        message="Campaign data could not load. Retry."
        button={{ title: 'Retry', onClick: retry }}
      />
    );
  const campaign = campaignQuery.record;
  if (!campaign) return <div style={quiet}>This Campaign is unavailable.</div>;
  if (!isStatus(campaign.lifecycleStatus))
    return (
      <InlineBanner
        color="danger"
        LeftIcon={IconAlertTriangle}
        message="Campaign status is unavailable. Retry."
        button={{ title: 'Retry', onClick: retry }}
      />
    );

  const audienceCount = audienceQuery.totalCount ?? 0;
  const checks = [
    { label: 'Name', complete: hasContent(campaign.name) },
    { label: 'Objective', complete: hasContent(campaign.objective) },
    { label: 'Audience', complete: audienceCount > 0 },
  ];
  const status = statusPresentationByStatus[campaign.lifecycleStatus];
  return (
    <div
      style={{
        color: theme.font.color.primary,
        display: 'grid',
        fontFamily: theme.font.family,
        fontSize: theme.font.size.md,
        gap: theme.spacing[4],
        lineHeight: theme.text.lineHeight.md,
        padding: theme.spacing[2],
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: theme.spacing[2],
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: theme.font.weight.medium }}>
          Campaign readiness
        </span>
        <Status color={status.color} text={status.text} weight="medium" />
      </div>
      <span style={{ color: theme.font.color.secondary }}>
        {audienceCount} {audienceCount === 1 ? 'creator' : 'creators'}
      </span>
      {checks.map(({ label, complete }) => {
        const Icon = complete ? IconCheck : IconCircleX;
        return (
          <div
            key={label}
            style={{
              alignItems: 'center',
              color: complete
                ? theme.font.color.primary
                : theme.font.color.danger,
              display: 'flex',
              gap: theme.spacing[1],
            }}
          >
            <Icon aria-hidden="true" />
            <span>{`${label} ${complete ? 'complete' : 'incomplete'}`}</span>
          </div>
        );
      })}
      <span style={quiet}>Use Start and Stop in Campaign Operations.</span>
    </div>
  );
};

export const MyahCampaignReadiness = ({
  campaignId,
}: {
  campaignId: string | undefined;
}) => {
  const theme = useTheme();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  if (!campaignId) return null;
  return (
    <ReadinessData
      campaignId={campaignId}
      metadataId={objectMetadataItem.id}
      theme={theme}
    />
  );
};
