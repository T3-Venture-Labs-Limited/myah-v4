import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { type TimelineActivity } from '@/activities/timeline-activities/types/TimelineActivity';

type Source = { id: string; __typename: string; creatorId: string | null };
type Message = {
  id: string;
  __typename: string;
  messageThreadId?: string;
  conversationId?: string;
  direction?: string;
  messageChannelMessageAssociations?: { direction: string }[];
  receivedAt?: string | null;
  providerCreatedAt?: string | null;
  createdAt: string;
  isDraft?: boolean;
  deliveryState?: string | null;
};

// Read the canonical sources rather than copying their history into timelineActivity.
// This also covers old messages and makes relinking/removal take effect on the next read.
export const useCreatorTimelineMessages = (
  creatorId: string | undefined,
  channel: 'EMAIL' | 'INSTAGRAM',
) => {
  const [browsingHistory, setBrowsingHistory] = useState(false);
  const [paginationError, setPaginationError] = useState(false);
  const email = channel === 'EMAIL';
  const foreignKey = email ? 'messageThreadId' : 'conversationId';
  const timestampField = email ? 'receivedAt' : 'providerCreatedAt';
  const sources = useFindManyRecords<Source>({
    objectNameSingular: email ? 'messageThread' : 'myahSocialConversation',
    filter: creatorId
      ? { creatorId: { eq: creatorId } }
      : { id: { is: 'NULL' } },
    recordGqlFields: { id: true, creatorId: true },
    fetchPolicy: 'network-only',
    skip: !creatorId,
  });
  const sourceIds = useMemo(
    () =>
      !creatorId ||
      paginationError ||
      sources.error ||
      !sources.hasReadPermission
        ? []
        : sources.records
            .filter((source) => source.creatorId === creatorId)
            .map(({ id }) => id),
    [
      creatorId,
      paginationError,
      sources.error,
      sources.hasReadPermission,
      sources.records,
    ],
  );

  const { fetchMoreRecords: fetchMoreSources, refetch: refetchSources } =
    sources;

  const fetchPage = useCallback(
    async (fetchMore: typeof sources.fetchMoreRecords) => {
      try {
        const result = await fetchMore();
        if (result?.error) setPaginationError(true);
      } catch {
        setPaginationError(true);
      }
    },
    [],
  );

  // Finish discovering sources before paging messages, so additional source IDs do
  // not reset the message cursor. Native record pagination handles both streams.
  useEffect(() => {
    if (
      creatorId &&
      !paginationError &&
      !sources.loading &&
      !sources.error &&
      sources.hasReadPermission &&
      sources.hasNextPage &&
      !sources.isFetchingMoreRecords
    ) {
      void fetchPage(fetchMoreSources);
    }
  }, [
    creatorId,
    paginationError,
    fetchPage,
    sources.loading,
    sources.error,
    sources.hasReadPermission,
    sources.hasNextPage,
    sources.isFetchingMoreRecords,
    fetchMoreSources,
  ]);

  const messages = useFindManyRecords<Message>({
    objectNameSingular: email ? 'message' : 'myahSocialMessage',
    filter: {
      [foreignKey]: sourceIds.length ? { in: sourceIds } : { is: 'NULL' },
      ...(email ? { isDraft: { eq: false } } : {}),
    },
    recordGqlFields: {
      id: true,
      [foreignKey]: true,
      createdAt: true,
      [timestampField]: true,
      ...(email
        ? {
            isDraft: true,
            messageChannelMessageAssociations: { direction: true },
          }
        : { direction: true, deliveryState: true }),
    },
    orderBy: [{ [timestampField]: 'DescNullsLast' }, { id: 'DescNullsLast' }],
    fetchPolicy: 'network-only',
    skip: sourceIds.length === 0 || sources.hasNextPage || sources.loading,
  });

  const { refetch: refetchMessages } = messages;

  useEffect(() => {
    // Avoid resetting paginated history and jumping the reader back to the top.
    if (
      !creatorId ||
      !sources.hasReadPermission ||
      browsingHistory ||
      paginationError
    )
      return;
    const timer = window.setInterval(() => {
      if (
        sources.hasNextPage ||
        sources.isFetchingMoreRecords ||
        messages.isFetchingMoreRecords
      )
        return;
      void refetchSources().catch(() => undefined);
      if (sourceIds.length && messages.hasReadPermission)
        void refetchMessages().catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [
    browsingHistory,
    paginationError,
    creatorId,
    sources.hasReadPermission,
    sources.hasNextPage,
    sources.isFetchingMoreRecords,
    refetchSources,
    sourceIds.length,
    messages.hasReadPermission,
    messages.isFetchingMoreRecords,
    refetchMessages,
  ]);

  const activities: TimelineActivity[] =
    !messages.hasReadPermission || messages.error
      ? []
      : messages.records.flatMap((message) => {
          // Email direction belongs to its mailbox association, not the message.
          const associations = message.messageChannelMessageAssociations ?? [];
          const messageDirection = email
            ? associations.some(
                (association) => association.direction === 'OUTGOING',
              )
              ? 'OUTGOING'
              : associations.some(
                    (association) => association.direction === 'INCOMING',
                  )
                ? 'INCOMING'
                : undefined
            : message.direction;
          if (
            !sourceIds.includes(message[foreignKey] ?? '') ||
            message.isDraft ||
            !['INCOMING', 'OUTGOING', 'INBOUND', 'OUTBOUND'].includes(
              messageDirection ?? '',
            )
          )
            return [];
          // Pending, failed and unknown Instagram sends are not sent-message evidence.
          if (
            !email &&
            messageDirection === 'OUTBOUND' &&
            !['SENT', 'DELIVERED', 'READ'].includes(message.deliveryState ?? '')
          )
            return [];
          const timestamp = message[timestampField] ?? message.createdAt;
          const direction = ['OUTGOING', 'OUTBOUND'].includes(messageDirection!)
            ? 'SENT'
            : 'RECEIVED';
          return [
            {
              id: `creator-message:${channel}:${message.id}`,
              name: 'creator-message.linked',
              happensAt: timestamp,
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: null,
              workspaceMemberId: null,
              workspaceMember: null,
              linkedRecordId: message.id,
              linkedObjectMetadataId: messages.objectMetadataItem.id,
              linkedRecordCachedName: '',
              __typename: 'TimelineActivity' as const,
              properties: { creatorMessage: { channel, direction } },
            },
          ];
        });

  return {
    activities,
    loading:
      Boolean(creatorId) &&
      !paginationError &&
      !sources.error &&
      sources.hasReadPermission &&
      ((sources.loading && sources.totalCount === undefined) ||
        sources.hasNextPage ||
        (sourceIds.length > 0 &&
          messages.loading &&
          messages.totalCount === undefined)),

    loadingMore: messages.isFetchingMoreRecords,
    hasNextPage:
      sourceIds.length > 0 &&
      messages.hasReadPermission &&
      !messages.error &&
      messages.hasNextPage,
    error:
      paginationError ||
      sources.error ||
      (sourceIds.length ? messages.error : undefined),
    fetchMore: () => {
      setBrowsingHistory(true);
      return fetchPage(messages.fetchMoreRecords);
    },
    retry: () => {
      setPaginationError(false);
      void sources.refetch().catch(() => undefined);
      if (sourceIds.length) void messages.refetch().catch(() => undefined);
    },
  };
};
