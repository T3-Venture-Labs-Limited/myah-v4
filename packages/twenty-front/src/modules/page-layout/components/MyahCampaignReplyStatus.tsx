import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useTheme } from 'twenty-ui/theme-constants';

type CampaignReplyRecord = ObjectRecord & {
  replyAgentEnabled: boolean | null;
  replyAgentEnabledAt: string | null;
  replyAgentMode: 'REVIEW' | 'AUTONOMOUS' | null;
};

export const MyahCampaignReplyStatus = ({
  campaignId,
}: {
  campaignId: string;
}) => {
  const theme = useTheme();
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });
  const { canReadObjectRecords } = useObjectPermissionsForObject(
    objectMetadataItem.id,
  );
  const canReadStatusFields = [
    'replyAgentEnabled',
    'replyAgentEnabledAt',
    'replyAgentMode',
  ].every((name) =>
    objectMetadataItem.readableFields.some((field) => field.name === name),
  );
  const { record, loading, error, refetch } =
    useFindOneRecord<CampaignReplyRecord>({
      objectNameSingular: 'campaign',
      objectRecordId: campaignId,
      recordGqlFields: {
        id: true,
        replyAgentEnabled: true,
        replyAgentEnabledAt: true,
        replyAgentMode: true,
      },
      skip: !canReadObjectRecords || !canReadStatusFields,
    });

  let title: string;
  let detail: string | null = null;
  if (!canReadObjectRecords) {
    title = "You don't have permission to view this Campaign.";
  } else if (!canReadStatusFields) {
    title = 'Campaign agent status is unavailable with current permissions.';
  } else if (loading) {
    title = 'Loading Campaign agent status';
  } else if (error || !record) {
    title = 'Campaign agent status is unavailable.';
  } else if (record.replyAgentEnabled === false) {
    title = 'Agent disabled for this Campaign';
  } else if (record.replyAgentEnabled !== true || !record.replyAgentEnabledAt) {
    title = 'Campaign agent status is unavailable.';
  } else if (record.replyAgentMode === 'REVIEW') {
    title = 'Agent · Review mode';
    detail = 'Replies require human review before sending.';
  } else if (record.replyAgentMode === 'AUTONOMOUS') {
    title = 'Agent · Autonomous';
    detail =
      'Automatic replies still require current permission and channel eligibility.';
  } else {
    title = 'Campaign agent status is unavailable.';
  }

  return (
    <div
      aria-label="Campaign reply agent status"
      role="status"
      style={{
        color: theme.font.color.primary,
        fontFamily: theme.font.family,
        fontSize: theme.font.size.md,
        padding: theme.spacing[2],
      }}
    >
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {canReadObjectRecords &&
        canReadStatusFields &&
        !loading &&
        (error || !record) && (
          <button onClick={() => void refetch()} type="button">
            Retry
          </button>
        )}
    </div>
  );
};
