import { gql } from '@apollo/client';
import { useApolloClient, useQuery } from '@apollo/client/react';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useOpenMyahInboxConversation } from '@/myah/inbox/hooks/useOpenMyahInboxConversation';
import { type CampaignCreatorInboxReturnTarget } from '@/myah/inbox/types/CampaignCreatorInboxReturnTarget';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useState } from 'react';
import { Link } from 'react-router-dom';

const GET_CAMPAIGN_CREATOR_ACTIVITY = gql`
  query GetCampaignCreatorContextActivity($input: CampaignActivityInput!) {
    campaignActivity(input: $input) {
      nodes {
        campaignCreatorId
        latestOutbound {
          id
          happenedAt
          state
        }
        latestInbound {
          id
          happenedAt
          state
        }
        inboxContactId
        inboxThreadId
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
type Row = {
  campaignCreatorId: string;
  latestOutbound: { id: string; happenedAt: string; state: string } | null;
  latestInbound: { id: string; happenedAt: string; state: string } | null;
  inboxContactId: string | null;
  inboxThreadId: string | null;
};
type ActivityData = {
  campaignActivity: {
    nodes: Row[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};
type Variables = {
  input: { campaignId: string; first: number; after?: string };
};

export const MyahCampaignCreatorMessages = ({
  campaignId,
  membershipId,
  returnTarget,
}: {
  campaignId: string;
  membershipId: string;
  returnTarget: CampaignCreatorInboxReturnTarget;
}) => {
  const client = useApolloClient();
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { openMyahInboxConversation } = useOpenMyahInboxConversation();
  const [pageError, setPageError] = useState(false);
  const [paging, setPaging] = useState(false);
  const activity = useQuery<ActivityData, Variables>(
    GET_CAMPAIGN_CREATOR_ACTIVITY,
    {
      client,
      variables: { input: { campaignId, first: 50 } },
      skip: !currentWorkspace,
      fetchPolicy: 'network-only',
      notifyOnNetworkStatusChange: true,
    },
  );
  // The API is campaign-wide, not membership-filtered. A missing row on this page is not an empty history.
  const rows = activity.data?.campaignActivity.nodes ?? [];
  const pageInfo = activity.data?.campaignActivity.pageInfo;
  const matches = rows.filter(
    (item) => item.campaignCreatorId === membershipId,
  );
  const row = matches.length === 1 ? matches[0] : undefined;
  const ambiguous = matches.length > 1;
  const loadMore = async () => {
    if (row || !pageInfo?.hasNextPage || !pageInfo.endCursor || paging) return;
    setPaging(true);
    try {
      await activity.fetchMore({
        variables: {
          input: { campaignId, first: 50, after: pageInfo.endCursor },
        },
        updateQuery: (previous, { fetchMoreResult }) => ({
          campaignActivity: {
            nodes: [
              ...previous.campaignActivity.nodes,
              ...fetchMoreResult.campaignActivity.nodes,
            ],
            pageInfo: fetchMoreResult.campaignActivity.pageInfo,
          },
        }),
      });
      setPageError(false);
    } catch {
      setPageError(true);
    } finally {
      setPaging(false);
    }
  };
  if (!currentWorkspace)
    return <p>Campaign messages are unavailable without a workspace.</p>;
  if (activity.error || pageError)
    return (
      <div role="alert">
        Campaign message activity is unavailable or access has changed.
        Previously loaded pages cannot establish current access.
        {pageError &&
        !row &&
        !paging &&
        pageInfo?.hasNextPage &&
        pageInfo.endCursor ? (
          <button type="button" onClick={() => void loadMore()}>
            Retry loading campaign activity
          </button>
        ) : null}
      </div>
    );
  if (activity.loading || paging)
    return <p role="status">Loading campaign activity…</p>;
  if (ambiguous)
    return (
      <p role="alert">
        Campaign message linkage is ambiguous. Inbox access is unavailable.
      </p>
    );
  return (
    <section aria-label="Read-only campaign messages">
      <p>
        Latest recorded campaign messages · read-only. This is not a complete
        conversation history.
      </p>
      {row ? (
        <>
          <p>
            {row.latestOutbound
              ? `Latest outbound: ${row.latestOutbound.state} · ${row.latestOutbound.happenedAt}`
              : 'Latest outbound unavailable.'}
          </p>
          <p>
            {row.latestInbound
              ? `Latest verified inbound: ${row.latestInbound.state} · ${row.latestInbound.happenedAt}`
              : 'Latest verified inbound unavailable.'}
          </p>
          <p>
            <Link
              to={`/myah/messages?campaign=${encodeURIComponent(campaignId)}`}
            >
              Browse this campaign's read-only message details
            </Link>{' '}
            Individual messages are not identified by this activity summary.
          </p>
          {row.inboxContactId && row.inboxThreadId ? (
            <button
              type="button"
              onClick={() =>
                openMyahInboxConversation({
                  workspaceId: currentWorkspace.id,
                  contactId: row.inboxContactId!,
                  threadId: row.inboxThreadId!,
                  creatorReturnTarget: returnTarget,
                })
              }
            >
              Open exact conversation in Inbox
            </button>
          ) : (
            <p>Exact Inbox binding unavailable.</p>
          )}
        </>
      ) : (
        <p>
          {pageInfo?.hasNextPage
            ? 'This creator is not on the loaded campaign activity pages. More pages remain.'
            : 'No campaign message activity is available for this membership.'}
        </p>
      )}
      {!row && pageInfo?.hasNextPage && pageInfo.endCursor ? (
        <button type="button" disabled={paging} onClick={() => void loadMore()}>
          Load more campaign activity
        </button>
      ) : null}
    </section>
  );
};
