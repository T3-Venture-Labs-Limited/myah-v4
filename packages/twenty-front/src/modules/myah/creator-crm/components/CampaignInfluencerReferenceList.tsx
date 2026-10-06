import { myahReplyAgentFailureText } from '@/myah/agent/components/MyahReplyAgentFailureReason';
import { useTextFieldFocusProps } from '@/ui/utilities/focus/hooks/useTextFieldFocusProps';
import { useQuery } from '@apollo/client/react';
import { useListenToObjectRecordOperationBrowserEvent } from '@/browser-event/hooks/useListenToObjectRecordOperationBrowserEvent';
import { type ObjectRecordOperation } from '@/object-record/types/ObjectRecordOperation';
import {
  GET_MYAH_REPLY_AGENT_REVIEW,
  type MyahReplyAgentReviewData,
  type MyahReplyAgentReviewNode,
} from '@/myah/agent/graphql/myahReplyAgentOperations';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useObjectPermissionsForObject } from '@/object-record/hooks/useObjectPermissionsForObject';
import { type RecordIndexOpenRequest } from '@/object-record/record-index/contexts/RecordIndexContext';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

type SocialProfile = ObjectRecord & {
  creatorId: string;
  platform: string;
  handle?: string | null;
};

type Membership = ObjectRecord & {
  campaignId: string;
  creatorId: string | null;
  stage: string | null;
  creator?: {
    id: string;
    name?: string | null;
  } | null;
};

const StyledList = styled.section`
  color: ${themeCssVariables.font.color.primary};
  container-type: inline-size;
  min-width: 0;
  width: 100%;
`;
const StyledToolbar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
  input,
  select {
    background: ${themeCssVariables.background.primary};
    border: 1px solid ${themeCssVariables.border.color.medium};
    border-radius: ${themeCssVariables.border.radius.sm};
    color: ${themeCssVariables.font.color.primary};
    max-width: 100%;
    padding: ${themeCssVariables.spacing[2]};
  }
  span {
    color: ${themeCssVariables.font.color.secondary};
    font-size: ${themeCssVariables.font.size.sm};
  }
`;
const StyledColumnHeaders = styled.div`
  background: ${themeCssVariables.background.secondary};
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  border-top: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.secondary};
  display: grid;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns:
    minmax(180px, 2fr) repeat(2, minmax(110px, 1fr))
    minmax(135px, 1fr);
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
  @container (max-width: 700px) {
    display: none;
  }
`;
const StyledRow = styled.button`
  align-items: center;
  background: ${themeCssVariables.background.primary};
  border: 0;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  color: ${themeCssVariables.font.color.primary};
  cursor: pointer;
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns:
    minmax(180px, 2fr) repeat(2, minmax(110px, 1fr))
    minmax(135px, 1fr);
  min-height: 76px;
  padding: ${themeCssVariables.spacing[3]};
  text-align: left;
  width: 100%;
  &:hover,
  &:focus-visible,
  &[aria-pressed='true'] {
    background: ${themeCssVariables.color.pink3};
  }
  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.pink};
    outline-offset: -2px;
  }
  @container (max-width: 700px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
`;
const StyledCreator = styled.span`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  min-width: 0;
  @container (max-width: 700px) {
    grid-column: 1 / -1;
  }
`;
const StyledAvatar = styled.span`
  align-items: center;
  background: ${themeCssVariables.color.pink4};
  border-radius: 50%;
  color: ${themeCssVariables.color.pink11};
  display: inline-flex;
  flex: 0 0 34px;
  height: 34px;
  justify-content: center;
`;
const StyledIdentity = styled.span`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[1]};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  span {
    color: ${themeCssVariables.font.color.secondary};
    font-size: ${themeCssVariables.font.size.sm};
  }
`;
const StyledName = styled.strong`
  font-weight: ${themeCssVariables.font.weight.medium};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const StyledStage = styled.span`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  flex: 0 0 auto;
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[2]};
`;
const StyledUnavailable = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;
const StyledWarning = styled.span`
  color: ${themeCssVariables.color.orange};
  font-size: ${themeCssVariables.font.size.sm};
`;
const StyledActionBadge = styled.span`
  align-self: center;
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.color.pink};
  font-size: ${themeCssVariables.font.size.sm};
  justify-self: start;
  padding: 2px ${themeCssVariables.spacing[2]};
`;
const StyledFeedback = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  padding: ${themeCssVariables.spacing[3]};
`;

const NEED_REVIEW_ACTIONS = ['REVIEW_DRAFT', 'NEEDS_YOU', 'SEND_UNKNOWN'];
const REVIEW_REFRESH_OPERATION_TYPES: ObjectRecordOperation['type'][] = [
  'create-one',
  'create-many',
  'update-one',
  'update-many',
  'delete-one',
  'delete-many',
  'restore-one',
  'restore-many',
];
const NEXT_ACTION_LABELS: Record<string, string> = {
  REVIEW_DRAFT: 'Review draft',
  NEEDS_YOU: 'Needs you',
  SEND_UNKNOWN: 'Check send',
  SENT_AUTOMATICALLY: 'Replied by agent',
};

const OUTREACH_LABELS: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  CONTACTED: 'Contacted',
  REPLIED: 'Replied',
  NEEDS_YOU: 'Needs you',
  FINISHED: 'Finished',
  EXCLUDED: 'Removed from sequence',
  PAUSED: 'Paused',
};

const OutreachProgress = ({ node }: { node?: MyahReplyAgentReviewNode }) => {
  if (!node) return <StyledUnavailable>Progress unavailable</StyledUnavailable>;
  const progress = node.outreach;
  if (!progress) return <StyledUnavailable>Not started</StyledUnavailable>;
  if (progress.state === 'REPLIED')
    return <StyledActionBadge>Replied</StyledActionBadge>;
  const active =
    progress.state === 'SCHEDULED' || progress.state === 'CONTACTED';
  return (
    <StyledIdentity title={progress.reason ?? undefined}>
      <span>
        {active
          ? `${progress.sentSteps === 0 ? 'Scheduled · ' : ''}Step ${Math.max(1, progress.sentSteps)} of ${progress.totalSteps}`
          : (OUTREACH_LABELS[progress.state] ?? 'Progress unavailable')}
      </span>
      {progress.nextEligibleAt && (
        <span>
          Next eligible {new Date(progress.nextEligibleAt).toLocaleString()}
        </span>
      )}
    </StyledIdentity>
  );
};

// The agent's outcome or the reason a creator was not contacted (MYAH-445).
const NextAction = ({ node }: { node?: MyahReplyAgentReviewNode }) => {
  if (!node?.nextAction) {
    const state = node?.outreach?.state;
    return (
      <StyledUnavailable>
        {state === 'NEEDS_YOU'
          ? 'Review sending issue'
          : state === 'CONTACTED'
            ? 'Awaiting reply or next step'
            : state === 'SCHEDULED'
              ? 'Waiting to send'
              : state === 'REPLIED'
                ? 'Follow up on reply'
                : state === 'FINISHED'
                  ? 'Sequence complete'
                  : '—'}
      </StyledUnavailable>
    );
  }
  if (node.nextAction === 'NEEDS_YOU' && node.reason)
    return (
      <StyledWarning>
        Needs you · {myahReplyAgentFailureText(node.reason)}
      </StyledWarning>
    );
  if (node.nextAction === 'SKIPPED' || node.nextAction === 'NOT_CONTACTABLE')
    return <StyledWarning>{node.reason}</StyledWarning>;
  return (
    <StyledActionBadge title={node.reason ?? undefined}>
      {NEXT_ACTION_LABELS[node.nextAction] ?? node.nextAction}
    </StyledActionBadge>
  );
};

export const CampaignInfluencerReferenceList = ({
  campaignId,
  campaignCreatorMetadataId,
  creatorMetadataId,
  creatorFieldIds,
  socialProfileMetadataId,
  socialProfileFieldIds,
  stageOptions,
  onOpenCreatorContext,
}: {
  campaignId: string;
  campaignCreatorMetadataId: string;
  creatorMetadataId?: string;
  creatorFieldIds?: { name?: string; socialProfiles?: string };
  socialProfileMetadataId?: string;
  socialProfileFieldIds?: {
    creator?: string;
    platform?: string;
    handle?: string;
  };
  stageOptions: Array<{ value: string; label: string }>;
  onOpenCreatorContext?: (request: RecordIndexOpenRequest) => void;
}) => {
  const textFieldFocus = useTextFieldFocusProps();
  const [search, setSearch] = useState('');
  const [needReviewOnly, setNeedReviewOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const agentReview = useQuery<MyahReplyAgentReviewData>(
    GET_MYAH_REPLY_AGENT_REVIEW,
    {
      variables: { input: { campaignId } },
      fetchPolicy: 'cache-and-network',
      pollInterval: 15_000,
    },
  );
  // Memberships, handles and emails change what the agent review reports.
  const refetchAgentReview = () => void agentReview.refetch();
  useListenToObjectRecordOperationBrowserEvent({
    objectMetadataItemId: campaignCreatorMetadataId,
    operationTypes: REVIEW_REFRESH_OPERATION_TYPES,
    onObjectRecordOperationBrowserEvent: refetchAgentReview,
  });
  useListenToObjectRecordOperationBrowserEvent({
    objectMetadataItemId: creatorMetadataId ?? '',
    operationTypes: REVIEW_REFRESH_OPERATION_TYPES,
    onObjectRecordOperationBrowserEvent: refetchAgentReview,
  });
  useListenToObjectRecordOperationBrowserEvent({
    objectMetadataItemId: socialProfileMetadataId ?? '',
    operationTypes: REVIEW_REFRESH_OPERATION_TYPES,
    onObjectRecordOperationBrowserEvent: refetchAgentReview,
  });
  const reviewByMembership = new Map(
    (agentReview.error
      ? []
      : (agentReview.data?.myahReplyAgentReview.nodes ?? [])
    ).map((node) => [node.campaignCreatorId, node]),
  );
  const repliedCount = [...reviewByMembership.values()].filter(
    (node) => node.outreach?.state === 'REPLIED',
  ).length;
  const needReviewCount =
    agentReview.data?.myahReplyAgentReview.needReviewCount ?? 0;
  const matchesProgressFilter = (id: string) => {
    const node = reviewByMembership.get(id);
    const needsReview = NEED_REVIEW_ACTIONS.includes(node?.nextAction ?? '');
    return (
      (!needReviewOnly || needsReview) &&
      (!statusFilter ||
        node?.outreach?.state === statusFilter ||
        (statusFilter === 'NEEDS_YOU' && needsReview))
    );
  };
  const progressFilteredIds = [...reviewByMembership.keys()].filter(
    matchesProgressFilter,
  );
  const [selectedMembershipId, setSelectedMembershipId] = useState<string>();
  const { objectMetadataItems } = useObjectMetadataItems();
  const stageFieldId = objectMetadataItems
    .find((item) => item.id === campaignCreatorMetadataId)
    ?.fields.find((field) => field.name === 'stage')?.id;
  const membershipPermissions = useObjectPermissionsForObject(
    campaignCreatorMetadataId,
  );
  const canReadStage =
    !!stageFieldId &&
    membershipPermissions.restrictedFields?.[stageFieldId]?.canRead !== false;
  const creatorPermissions = useObjectPermissionsForObject(
    creatorMetadataId ?? '',
  );
  const canReadCreator =
    !!creatorMetadataId && creatorPermissions.canReadObjectRecords;
  const canReadCreatorName =
    canReadCreator &&
    !!creatorFieldIds?.name &&
    creatorPermissions.restrictedFields?.[creatorFieldIds.name]?.canRead !==
      false;
  const profilePermissions = useObjectPermissionsForObject(
    socialProfileMetadataId ?? '',
  );
  const canReadCreatorHandle =
    canReadCreator &&
    !!creatorFieldIds?.socialProfiles &&
    creatorPermissions.restrictedFields?.[creatorFieldIds.socialProfiles]
      ?.canRead !== false &&
    !!socialProfileMetadataId &&
    profilePermissions.canReadObjectRecords &&
    !!socialProfileFieldIds?.creator &&
    !!socialProfileFieldIds.platform &&
    !!socialProfileFieldIds.handle &&
    [
      socialProfileFieldIds.creator,
      socialProfileFieldIds.platform,
      socialProfileFieldIds.handle,
    ].every(
      (fieldId) =>
        profilePermissions.restrictedFields?.[fieldId]?.canRead !== false,
    );
  const {
    records,
    totalCount,
    loading,
    error,
    hasReadPermission,
    hasNextPage,
    isFetchingMoreRecords,
    fetchMoreRecords,
    refetch,
  } = useFindManyRecords<Membership>({
    objectNameSingular: 'campaignCreator',
    filter: {
      campaignId: { eq: campaignId },
      ...(statusFilter || needReviewOnly
        ? {
            // Empty IN is rejected by the record API; a null primary key matches nothing.
            id: progressFilteredIds.length
              ? { in: progressFilteredIds }
              : { is: 'NULL' },
          }
        : {}),
    },
    recordGqlFields: {
      id: true,
      campaignId: true,
      creatorId: true,
      ...(canReadStage ? { stage: true } : {}),
      ...(canReadCreator
        ? {
            creator: {
              id: true,
              ...(canReadCreatorName ? { name: true } : {}),
            },
          }
        : {}),
    },
    skip: !campaignCreatorMetadataId,
  });
  useEffect(() => {
    if (!hasReadPermission || !campaignCreatorMetadataId) return;
    const timer = window.setInterval(() => {
      void refetch().catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refetch, hasReadPermission, campaignCreatorMetadataId]);

  const safeRecords =
    hasReadPermission && !error
      ? records.filter((record) => record.campaignId === campaignId)
      : [];
  const creatorIds = [
    ...new Set(
      safeRecords.flatMap((record) =>
        canReadCreator &&
        record.creator?.id === record.creatorId &&
        record.creatorId
          ? [record.creatorId]
          : [],
      ),
    ),
  ];
  const {
    records: profiles,
    totalCount: profileTotalCount,
    loading: profilesLoading,
    error: profilesError,
    hasReadPermission: hasProfileReadPermission,
    hasNextPage: hasMoreProfiles,
    isFetchingMoreRecords: isFetchingMoreProfiles,
    fetchMoreRecords: fetchMoreProfiles,
    refetch: refetchProfiles,
  } = useFindManyRecords<SocialProfile>({
    objectNameSingular: 'socialProfile',
    filter: {
      and: [
        { creatorId: { in: creatorIds } },
        { platform: { eq: 'INSTAGRAM' } },
      ],
    },
    recordGqlFields: {
      id: true,
      creatorId: true,
      platform: true,
      handle: true,
    },
    limit: 60,
    skip: !canReadCreatorHandle || creatorIds.length === 0,
  });
  const profilesComplete =
    canReadCreatorHandle &&
    hasProfileReadPermission &&
    !profilesLoading &&
    !profilesError &&
    !hasMoreProfiles &&
    typeof profileTotalCount === 'number' &&
    profiles.length === profileTotalCount;
  const instagramProfiles = (record: Membership) =>
    canReadCreatorHandle &&
    hasProfileReadPermission &&
    !profilesError &&
    record.creator?.id === record.creatorId
      ? profiles.filter(
          (profile) =>
            profile.creatorId === record.creatorId &&
            profile.platform === 'INSTAGRAM',
        )
      : [];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const shownRecords = safeRecords.filter(
    (record) =>
      matchesProgressFilter(record.id) &&
      (!normalizedSearch ||
        (canReadCreator &&
          ((canReadCreatorName &&
            record.creator?.name
              ?.toLocaleLowerCase()
              .includes(normalizedSearch)) ||
            instagramProfiles(record).some((profile) =>
              profile.handle?.toLocaleLowerCase().includes(normalizedSearch),
            )))),
  );

  if (!hasReadPermission) {
    return (
      <StyledFeedback role="alert">
        You do not have permission to view Campaign Influencers.
      </StyledFeedback>
    );
  }
  return (
    <StyledList aria-label="Campaign influencers reference list">
      <StyledToolbar>
        <input
          onFocus={textFieldFocus.onFocus}
          onBlur={textFieldFocus.onBlur}
          aria-label="Search loaded influencers"
          placeholder="Search loaded influencers"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          aria-pressed={needReviewOnly}
          onClick={() => setNeedReviewOnly((value) => !value)}
        >
          {`Need review ${needReviewCount}`}
        </button>
        <select
          aria-label="Outreach status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All statuses</option>
          {['SCHEDULED', 'CONTACTED', 'REPLIED', 'NEEDS_YOU', 'FINISHED'].map(
            (status) => (
              <option key={status} value={status}>
                {OUTREACH_LABELS[status]}
              </option>
            ),
          )}
        </select>
        {repliedCount > 0 && <span role="status">{repliedCount} replied</span>}
        <span>
          {typeof totalCount === 'number'
            ? `${safeRecords.length} loaded of ${totalCount}`
            : `${safeRecords.length} loaded · total unknown`}
        </span>
        {canReadCreatorHandle && hasMoreProfiles && !profilesError && (
          <button
            type="button"
            disabled={isFetchingMoreProfiles}
            onClick={() => void fetchMoreProfiles()}
          >
            {isFetchingMoreProfiles
              ? 'Loading more profiles…'
              : 'Load more profiles'}
          </button>
        )}
        {canReadCreatorHandle && profilesError && (
          <button type="button" onClick={() => void refetchProfiles()}>
            Retry profiles
          </button>
        )}
      </StyledToolbar>
      {!error && !loading && safeRecords.length > 0 && (
        <StyledColumnHeaders aria-hidden="true">
          <span>Influencer</span>
          <span>Outreach progress</span>
          <span>Next action</span>
          <span>Partnership stage</span>
        </StyledColumnHeaders>
      )}
      {error ? (
        <StyledFeedback role="alert">
          Unable to load influencers. Audience size is unknown.{' '}
          <button type="button" onClick={() => void refetch()}>
            Retry influencers
          </button>
        </StyledFeedback>
      ) : loading && safeRecords.length === 0 ? (
        <StyledFeedback role="status">Loading influencers…</StyledFeedback>
      ) : (
        <>
          {shownRecords.map((record) => {
            const creator =
              canReadCreator && record.creator?.id === record.creatorId
                ? record.creator
                : null;
            const name =
              (canReadCreatorName && creator?.name?.trim()) ||
              'Creator unavailable';
            const profiles = instagramProfiles(record);
            const handle =
              profilesComplete && profiles.length === 1
                ? profiles[0].handle?.trim()
                : null;
            const stage =
              (canReadStage &&
                stageOptions.find((option) => option.value === record.stage)
                  ?.label) ||
              'Stage unavailable';
            return (
              <StyledRow
                key={record.id}
                type="button"
                aria-pressed={selectedMembershipId === record.id}
                onClick={(event) => {
                  setSelectedMembershipId(record.id);
                  onOpenCreatorContext?.({
                    recordId: record.id,
                    source: 'table-identifier-action',
                    activationElement: event.currentTarget,
                  });
                }}
              >
                <StyledCreator>
                  <StyledAvatar aria-hidden="true">
                    {(canReadCreatorName &&
                      creator?.name?.trim().slice(0, 1).toUpperCase()) ||
                      '?'}
                  </StyledAvatar>
                  <StyledIdentity>
                    <StyledName>{name}</StyledName>
                    <span>
                      {!creator ||
                      !canReadCreatorHandle ||
                      !hasProfileReadPermission ||
                      profilesError
                        ? 'Handle unavailable'
                        : !profilesComplete
                          ? 'Instagram profiles still loading'
                          : profiles.length > 1
                            ? `${profiles.length} Instagram accounts`
                            : handle
                              ? `@${handle.replace(/^@/, '')}`
                              : 'Handle unavailable'}
                    </span>
                  </StyledIdentity>
                </StyledCreator>
                <OutreachProgress node={reviewByMembership.get(record.id)} />
                <NextAction node={reviewByMembership.get(record.id)} />
                <StyledStage>Recorded stage: {stage}</StyledStage>
              </StyledRow>
            );
          })}
          {shownRecords.length === 0 && (
            <StyledFeedback>
              {statusFilter || needReviewOnly
                ? 'No influencers match this status.'
                : normalizedSearch
                  ? canReadCreatorHandle && profilesError
                    ? 'Profile search is unavailable. Retry profiles.'
                    : hasMoreProfiles && canReadCreatorHandle
                      ? 'No matches in loaded influencers or profiles. Load more profiles to search further.'
                      : 'No matches in loaded influencers. Load more to search further.'
                  : hasNextPage
                    ? 'No influencers in the loaded page. Load more to continue.'
                    : totalCount === 0
                      ? 'No influencers in this Campaign.'
                      : 'No readable influencers in this page; audience status unknown.'}
            </StyledFeedback>
          )}
          {hasNextPage && (
            <StyledFeedback>
              <button
                type="button"
                disabled={isFetchingMoreRecords}
                onClick={() => void fetchMoreRecords()}
              >
                {isFetchingMoreRecords
                  ? 'Loading more influencers…'
                  : 'Load more influencers'}
              </button>
            </StyledFeedback>
          )}
        </>
      )}
    </StyledList>
  );
};
