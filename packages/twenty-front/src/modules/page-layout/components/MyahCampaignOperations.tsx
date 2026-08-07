import { gql, useMutation } from '@apollo/client';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { useUpdateOneRecord } from '@/object-record/hooks/useUpdateOneRecord';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { isGraphqlErrorOfType } from '~/utils/is-graphql-error-of-type.util';
import { Status } from 'twenty-ui/data-display';
import { InlineBanner, Loader } from 'twenty-ui/feedback';
import {
  IconAlertTriangle,
  IconCheck,
  IconCircleX,
  IconLock,
} from 'twenty-ui/icon';
import { Button } from 'twenty-ui/input';
import { type ThemeType, useTheme } from 'twenty-ui/theme-constants';

type CampaignLifecycleStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED';

type CampaignReadinessRecord = ObjectRecord & {
  name: string | null;
  objective: string | null;
  lifecycleStatus: CampaignLifecycleStatus | null;
};

type CampaignCreatorRecord = ObjectRecord & {
  campaignId: string;
};

type CampaignReadinessFeedback = {
  kind: 'conflict' | 'error';
  message: string;
};

const statusPresentationByStatus: Record<
  CampaignLifecycleStatus,
  { color: 'gray' | 'green' | 'orange' | 'blue'; text: string }
> = {
  DRAFT: { color: 'gray', text: 'Draft' },
  ACTIVE: { color: 'green', text: 'Active' },
  PAUSED: { color: 'orange', text: 'Paused' },
  COMPLETED: { color: 'blue', text: 'Completed' },
};

const lifecycleActionsByStatus: Record<
  CampaignLifecycleStatus,
  ReadonlyArray<{ label: string; targetStatus: CampaignLifecycleStatus }>
> = {
  DRAFT: [{ label: 'Activate', targetStatus: 'ACTIVE' }],
  ACTIVE: [
    { label: 'Pause', targetStatus: 'PAUSED' },
    { label: 'Complete', targetStatus: 'COMPLETED' },
  ],
  PAUSED: [
    { label: 'Resume', targetStatus: 'ACTIVE' },
    { label: 'Complete', targetStatus: 'COMPLETED' },
  ],
  COMPLETED: [],
};


const ATTACH_CAMPAIGN_CREATOR_LISTS = gql`
  mutation AttachCampaignCreatorLists($input: AttachCampaignCreatorListsInput!) {
    attachCampaignCreatorLists(input: $input) {
      campaignCreators { id creatorId isDirectlyAdded }
    }
  }
`;

const ADD_DIRECT_CAMPAIGN_CREATORS = gql`
  mutation AddDirectCampaignCreators($input: AddDirectCampaignCreatorsInput!) {
    addDirectCampaignCreators(input: $input) {
      campaignCreators { id creatorId isDirectlyAdded }
    }
  }
`;
const hasContent = (value: string | null) => (value?.trim().length ?? 0) > 0;

const isCampaignLifecycleStatus = (
  value: CampaignReadinessRecord['lifecycleStatus'],
): value is CampaignLifecycleStatus =>
  value === 'DRAFT' ||
  value === 'ACTIVE' ||
  value === 'PAUSED' ||
  value === 'COMPLETED';

const MyahCampaignOperationsContent = ({
  campaignId,
}: {
  campaignId: string;
}) => {
  const theme = useTheme();
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdateRestricted, setIsUpdateRestricted] = useState(false);
  const [feedback, setFeedback] = useState<CampaignReadinessFeedback | null>(
    null,
  );
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular: 'campaign',
  });

  return (
    <MyahCampaignOperationsData
      campaignId={campaignId}
      campaignMetadataId={objectMetadataItem.id}
      isSaving={isSaving}
      isUpdateRestricted={isUpdateRestricted}
      setIsSaving={setIsSaving}
      setIsUpdateRestricted={setIsUpdateRestricted}
      feedback={feedback}
      setFeedback={setFeedback}
      theme={theme}
    />
  );
};

type MyahCampaignOperationsDataProps = {
  campaignId: string;
  campaignMetadataId: string;
  isSaving: boolean;
  isUpdateRestricted: boolean;
  setIsSaving: (isSaving: boolean) => void;
  setIsUpdateRestricted: (isUpdateRestricted: boolean) => void;
  feedback: CampaignReadinessFeedback | null;
  setFeedback: (feedback: CampaignReadinessFeedback | null) => void;
  theme: ThemeType;
};

const MyahCampaignOperationsData = ({
  campaignId,
  campaignMetadataId,
  isSaving,
  setIsSaving,
  isUpdateRestricted,
  feedback,
  setIsUpdateRestricted,
  setFeedback,
  theme,
}: MyahCampaignOperationsDataProps) => {
  const campaignPermissions = useObjectPermissionsForObject(campaignMetadataId);
  const [creatorListIds, setCreatorListIds] = useState('');
  const [creatorIds, setCreatorIds] = useState('');
  const [attachLists] = useMutation(ATTACH_CAMPAIGN_CREATOR_LISTS);
  const [addCreators] = useMutation(ADD_DIRECT_CAMPAIGN_CREATORS);
  const { updateOneRecord } = useUpdateOneRecord();
  const {
    record: campaign,
    loading: isCampaignLoading,
    error: campaignError,
    refetch: refetchCampaign,
  } = useFindOneRecord<CampaignReadinessRecord>({
    objectNameSingular: 'campaign',
    objectRecordId: campaignId,
    recordGqlFields: {
      id: true,
      name: true,
      objective: true,
      lifecycleStatus: true,
    },
    skip: !campaignPermissions.canReadObjectRecords,
  });
  const {
    totalCount: effectiveAudienceCount,
    loading: isAudienceLoading,
    error: audienceError,
    hasReadPermission: canReadCampaignCreators,
    refetch: refetchAudience,
  } = useFindManyRecords<CampaignCreatorRecord>({
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
    skip: !campaignPermissions.canReadObjectRecords,
  });

  const splitIds = (value: string) =>
    value.split(',').map((id) => id.trim()).filter(Boolean);
  const attachCreatorLists = async () => {
    await attachLists({
      variables: {
        input: { campaignId, creatorListIds: splitIds(creatorListIds) },
      },
    });
    await refetchAudience();
  };
  const addDirectCreators = async () => {
    await addCreators({
      variables: { input: { campaignId, creatorIds: splitIds(creatorIds) } },
    });
    await refetchAudience();
  };

  const retry = () => {
    void refetchCampaign();
    void refetchAudience();
  };

  const quietStateStyle: CSSProperties = {
    alignItems: 'center',
    color: theme.font.color.secondary,
    display: 'flex',
    gap: theme.spacing[2],
  };

  if (!campaignPermissions.canReadObjectRecords) {
    return (
      <div style={quietStateStyle}>
        <IconLock
          aria-hidden="true"
          color={theme.font.color.tertiary}
          size={theme.icon.size.md}
        />
        <span>You don't have permission to view this Campaign.</span>
      </div>
    );
  }

  if (isCampaignLoading || isAudienceLoading) {
    return (
      <div aria-label="Loading Campaign readiness" style={quietStateStyle}>
        <Loader />
        <span>Loading Campaign readiness</span>
      </div>
    );
  }

  if (campaignError || audienceError || !canReadCampaignCreators) {
    return (
      <InlineBanner
        color="danger"
        LeftIcon={IconAlertTriangle}
        message="Campaign data could not load. Retry."
        button={{ title: 'Retry', onClick: retry }}
      />
    );
  }

  if (!campaign) {
    return <div style={quietStateStyle}>This Campaign is unavailable.</div>;
  }

  const hasName = hasContent(campaign.name);
  const hasObjective = hasContent(campaign.objective);
  const audienceCount = effectiveAudienceCount ?? 0;
  const hasAudience = audienceCount > 0;
  const isActivationReady = hasName && hasObjective && hasAudience;
  const lifecycleStatus = campaign.lifecycleStatus;

  if (!isCampaignLifecycleStatus(lifecycleStatus)) {
    return (
      <InlineBanner
        color="danger"
        LeftIcon={IconAlertTriangle}
        message="Campaign status is unavailable. Retry."
        button={{ title: 'Retry', onClick: retry }}
      />
    );
  }

  const statusPresentation = statusPresentationByStatus[lifecycleStatus];
  const lifecycleActions = lifecycleActionsByStatus[lifecycleStatus];
  const blockers = [
    !hasName ? 'Campaign name is required before activation.' : null,
    !hasObjective ? 'Campaign objective is required before activation.' : null,
    !hasAudience
      ? 'Add at least one creator before activating this campaign.'
      : null,
  ].filter((blocker): blocker is string => blocker !== null);

  const changeStatus = async (targetStatus: CampaignLifecycleStatus) => {
    if (isSaving || !campaignPermissions.canUpdateObjectRecords) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const updatedCampaign = await updateOneRecord<CampaignReadinessRecord>({
        objectNameSingular: 'campaign',
        idToUpdate: campaignId,
        updateOneRecordInput: { lifecycleStatus: targetStatus },
      });

      if (updatedCampaign === null) {
        void refetchCampaign();
        setFeedback({
          kind: 'conflict',
          message: 'This Campaign changed. Review it and try again.',
        });
      }
    } catch (error) {
      if (isGraphqlErrorOfType(error, 'FORBIDDEN')) {
        setIsUpdateRestricted(true);
      } else {
        setFeedback({
          kind: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Campaign status could not be changed.',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const rootStyle: CSSProperties = {
    color: theme.font.color.primary,
    display: 'grid',
    fontFamily: theme.font.family,
    fontSize: theme.font.size.md,
    gap: theme.spacing[4],
    lineHeight: theme.text.lineHeight.md,
    padding: theme.spacing[2],
  };

  return (
    <div style={rootStyle}>
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
        <Status
          color={statusPresentation.color}
          text={statusPresentation.text}
          weight="medium"
        />
      </div>

      <div style={{ display: 'grid', gap: theme.spacing[1] }}>
        <span style={{ color: theme.font.color.secondary }}>
          {audienceCount} {audienceCount === 1 ? 'creator' : 'creators'}
        </span>
        {[
          { label: 'Name', complete: hasName },
          { label: 'Objective', complete: hasObjective },
          { label: 'Audience', complete: hasAudience },
        ].map(({ label, complete }) => {
          const ChecklistIcon = complete ? IconCheck : IconCircleX;

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
                minHeight: theme.spacing[6],
              }}
            >
              <ChecklistIcon
                aria-hidden="true"
                color={
                  complete ? theme.accent.primary : theme.font.color.danger
                }
                size={theme.icon.size.md}
              />
              <span>{`${label} ${complete ? 'complete' : 'incomplete'}`}</span>
            </div>
          );
        })}
      </div>

      {campaignPermissions.canUpdateObjectRecords ? (
        <div style={{ display: 'grid', gap: theme.spacing[2] }}>
          <label>
            Creator List IDs
            <input
              aria-label="Creator List IDs"
              onChange={(event) => setCreatorListIds(event.target.value)}
              placeholder="comma-separated UUIDs"
              value={creatorListIds}
            />
          </label>
          <Button
            disabled={splitIds(creatorListIds).length === 0}
            onClick={() => void attachCreatorLists()}
            title="Attach Creator Lists"
            type="button"
            variant="secondary"
          />
          <label>
            Direct Creator IDs
            <input
              aria-label="Direct Creator IDs"
              onChange={(event) => setCreatorIds(event.target.value)}
              placeholder="comma-separated UUIDs"
              value={creatorIds}
            />
          </label>
          <Button
            disabled={splitIds(creatorIds).length === 0}
            onClick={() => void addDirectCreators()}
            title="Add Direct Creators"
            type="button"
            variant="secondary"
          />
        </div>
      ) : null}
      {blockers.map((blocker) => (
        <InlineBanner key={blocker} color="danger" message={blocker} />
      ))}

      {feedback ? (
        <InlineBanner
          color={feedback.kind === 'error' ? 'danger' : 'blue'}
          LeftIcon={feedback.kind === 'error' ? IconAlertTriangle : undefined}
          message={feedback.message}
        />
      ) : null}

      {isUpdateRestricted || !campaignPermissions.canUpdateObjectRecords ? (
        <div style={quietStateStyle}>
          <IconLock
            aria-hidden="true"
            color={theme.font.color.tertiary}
            size={theme.icon.size.md}
          />
          <span>
            You don't have permission to change this Campaign's status.
          </span>
        </div>
      ) : lifecycleActions.length > 0 ? (
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing[2] }}
        >
          {lifecycleActions.map((action) => (
            <Button
              key={action.targetStatus}
              disabled={
                isSaving ||
                (action.targetStatus === 'ACTIVE' && !isActivationReady)
              }
              isLoading={isSaving}
              onClick={() => void changeStatus(action.targetStatus)}
              size="small"
              title={action.label}
              type="button"
              variant="secondary"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

type MyahCampaignOperationsProps = {
  campaignId: string | undefined;
};

export const MyahCampaignOperations = ({
  campaignId,
}: MyahCampaignOperationsProps) => {
  if (!campaignId) {
    return null;
  }

  return <MyahCampaignOperationsContent campaignId={campaignId} />;
};
