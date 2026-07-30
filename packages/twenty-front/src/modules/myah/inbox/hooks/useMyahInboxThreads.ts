import { useQuery } from '@apollo/client/react';
import { useCallback } from 'react';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';

import { type MyahInboxFilters } from '@/myah/inbox/states/myahInboxSelectionState';
import {
  MyahInboxSnoozeStatus,
  type MyahInboxState,
  MyahInboxThreadsDocument,
} from '~/generated/graphql';

export type MyahInboxThread = {
  id: string;
  lastActivityAt: string;
  subject: string | null;
  lastMessagePreview: string | null;
  lastMessageSender: string | null;
  state: 'NEEDS_REPLY' | 'WAITING_ON_CREATOR' | 'SNOOZED' | 'CLOSED';
  snoozedUntil: string | null;
  creator: { id: string; name: string | null } | null;
  campaign: { id: string; name: string | null } | null;
  inboxOwner: { id: string; name: string | null } | null;
};

export const useMyahInboxThreads = (
  filters: MyahInboxFilters,
  currentWorkspaceId: string | null,
) => {
  const apolloCoreClient = useApolloCoreClient();
  const snoozeStatus =
    filters.snoozeStatus === 'ACTIVE'
      ? MyahInboxSnoozeStatus.ACTIVE
      : filters.snoozeStatus === 'DUE'
        ? MyahInboxSnoozeStatus.DUE
        : undefined;
  const query = useQuery(MyahInboxThreadsDocument, {
    client: apolloCoreClient,
    variables: {
      first: 50,
      owner: filters.owner || undefined,
      campaignId:
        filters.campaignWorkspaceId === currentWorkspaceId
          ? (filters.campaignId ?? undefined)
          : undefined,
      states:
        filters.states.length > 0
          ? (filters.states as MyahInboxState[])
          : undefined,
      snoozeStatus,
      search: filters.search || undefined,
    },
    notifyOnNetworkStatusChange: true,
  });

  const connection = query.data?.myahInboxThreads;

  const loadMore = useCallback(async () => {
    if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) {
      return;
    }

    await query.fetchMore({
      variables: { after: connection.pageInfo.endCursor },
      updateQuery: (previous, { fetchMoreResult }) => {
        return {
          myahInboxThreads: {
            ...fetchMoreResult.myahInboxThreads,
            edges: [
              ...previous.myahInboxThreads.edges,
              ...fetchMoreResult.myahInboxThreads.edges,
            ],
          },
        };
      },
    });
  }, [connection, query]);

  return {
    threads:
      connection?.edges?.map(({ node }) => node as MyahInboxThread) ?? [],
    loading: query.loading && connection === undefined,
    loadingMore: query.loading && connection !== undefined,
    error: query.error,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
    loadMore,
    refetch: query.refetch,
  };
};
