import { styled } from '@linaria/react';

import { CustomResolverFetchMoreLoader } from '@/activities/components/CustomResolverFetchMoreLoader';
import { SkeletonLoader } from '@/activities/components/SkeletonLoader';
import { EventList } from '@/activities/timeline-activities/components/EventList';
import { useCreatorTimelineMessages } from '@/activities/timeline-activities/hooks/useCreatorTimelineMessages';
import { type ActivityTargetableObject } from '@/activities/types/ActivityTargetableEntity';
import { useFindOneRecord } from '@/object-record/hooks/useFindOneRecord';
import { useTimelineActivities } from '@/activities/timeline-activities/hooks/useTimelineActivities';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { useTargetRecord } from '@/ui/layout/contexts/useTargetRecord';
import { t } from '@lingui/core/macro';
import {
  AnimatedPlaceholder,
  AnimatedPlaceholderEmptyContainer,
  AnimatedPlaceholderEmptySubTitle,
  AnimatedPlaceholderEmptyTextContainer,
  AnimatedPlaceholderEmptyTitle,
} from 'twenty-ui/feedback';
import { MOBILE_VIEWPORT, themeCssVariables } from 'twenty-ui/theme-constants';

const StyledMainContainer = styled.div`
  align-items: flex-start;
  align-self: stretch;
  border-top: none;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};

  justify-content: center;
  overflow: auto;
  padding-left: ${themeCssVariables.spacing[6]};
  padding-right: ${themeCssVariables.spacing[6]};
  padding-top: ${themeCssVariables.spacing[6]};

  @media (max-width: ${MOBILE_VIEWPORT}px) {
    border-top: 1px solid ${themeCssVariables.border.color.medium};
    padding-right: ${themeCssVariables.spacing[1]};
    padding-left: ${themeCssVariables.spacing[1]};
  }
`;

const StyledSidePanelPlaceholderWrapper = styled.div`
  > * {
    height: auto;
    padding-top: ${themeCssVariables.spacing[8]};
  }
`;

export const TimelineCard = () => {
  const targetRecord = useTargetRecord();
  return targetRecord.targetObjectNameSingular === 'creator' ? (
    <CreatorTimelineCard key={targetRecord.id} targetRecord={targetRecord} />
  ) : (
    <RecordTimelineCard targetRecord={targetRecord} />
  );
};

const RecordTimelineCard = ({
  targetRecord,
}: {
  targetRecord: ActivityTargetableObject;
}) => (
  <TimelineCardContent
    targetRecord={targetRecord}
    data={useTimelineActivities(targetRecord)}
  />
);

const CreatorTimelineCard = ({
  targetRecord,
}: {
  targetRecord: ActivityTargetableObject;
}) => {
  const timeline = useTimelineActivities(targetRecord);
  const creator = useFindOneRecord<{ id: string; __typename: string }>({
    objectNameSingular: 'creator',
    objectRecordId: targetRecord.id,
    recordGqlFields: { id: true },
    freshRead: true,
  });
  const readableId =
    creator.hasReadPermission &&
    !creator.loading &&
    !creator.error &&
    creator.record?.id === targetRecord.id
      ? targetRecord.id
      : undefined;
  const email = useCreatorTimelineMessages(readableId, 'EMAIL');
  const instagram = useCreatorTimelineMessages(readableId, 'INSTAGRAM');
  const streams = [
    {
      activities: timeline.timelineActivities,
      hasNextPage: timeline.hasNextPage,
    },
    email,
    instagram,
  ];
  // Do not display old entries from one stream ahead of unread newer entries in
  // another. Each stream keeps its native cursor; Load more advances all three.
  const frontier = Math.max(
    ...streams
      .filter((stream) => stream.hasNextPage)
      .map((stream) =>
        stream.activities.length
          ? Math.min(
              ...stream.activities.map((event) => Date.parse(event.happensAt)),
            )
          : Infinity,
      ),
  );
  const activities = streams
    .flatMap((stream) => stream.activities)
    .filter((event) => Date.parse(event.happensAt) >= frontier)
    .sort(
      (left, right) =>
        Date.parse(right.happensAt) - Date.parse(left.happensAt) ||
        left.id.localeCompare(right.id),
    );
  const error = creator.error || email.error || instagram.error;
  return (
    <TimelineCardContent
      targetRecord={targetRecord}
      error={Boolean(error)}
      retry={() => {
        void creator.refetch().catch(() => undefined);
        email.retry();
        instagram.retry();
      }}
      data={{
        timelineActivities: activities,
        hasNextPage: streams.some((stream) => stream.hasNextPage),
        firstQueryLoading:
          timeline.firstQueryLoading ||
          creator.loading ||
          email.loading ||
          instagram.loading,
        loadingMore:
          timeline.loadingMore || email.loadingMore || instagram.loadingMore,
        fetchMoreRecords: async () => {
          await Promise.all([
            timeline.hasNextPage ? timeline.fetchMoreRecords() : undefined,
            email.hasNextPage ? email.fetchMore() : undefined,
            instagram.hasNextPage ? instagram.fetchMore() : undefined,
          ]);
          return undefined;
        },
      }}
    />
  );
};

const TimelineCardContent = ({
  targetRecord,
  data,
  error,
  retry,
}: {
  targetRecord: ActivityTargetableObject;
  data: ReturnType<typeof useTimelineActivities>;
  error?: boolean;
  retry?: () => void;
}) => {
  const { isInSidePanel } = useLayoutRenderingContext();
  const {
    timelineActivities,
    firstQueryLoading,
    loadingMore,
    fetchMoreRecords,
  } = data;
  const isTimelineActivitiesEmpty =
    timelineActivities.length === 0 && !data.hasNextPage && !error;

  if (firstQueryLoading === true) {
    return <SkeletonLoader withSubSections />;
  }

  if (isTimelineActivitiesEmpty) {
    const placeholderContent = (
      <AnimatedPlaceholderEmptyContainer>
        <AnimatedPlaceholder type="emptyTimeline" />
        <AnimatedPlaceholderEmptyTextContainer>
          <AnimatedPlaceholderEmptyTitle>
            {t`No activity yet`}
          </AnimatedPlaceholderEmptyTitle>
          <AnimatedPlaceholderEmptySubTitle>
            {t`There is no activity associated with this record.`}
          </AnimatedPlaceholderEmptySubTitle>
        </AnimatedPlaceholderEmptyTextContainer>
      </AnimatedPlaceholderEmptyContainer>
    );

    return isInSidePanel ? (
      <StyledSidePanelPlaceholderWrapper>
        {placeholderContent}
      </StyledSidePanelPlaceholderWrapper>
    ) : (
      placeholderContent
    );
  }

  return (
    <StyledMainContainer>
      {error && (
        <div role="alert">
          Could not load all message activity.{' '}
          <button type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}
      <EventList
        targetableObject={targetRecord}
        title={t`All`}
        events={timelineActivities ?? []}
      />
      <CustomResolverFetchMoreLoader
        loading={loadingMore}
        onLastRowVisible={fetchMoreRecords}
      />
    </StyledMainContainer>
  );
};
