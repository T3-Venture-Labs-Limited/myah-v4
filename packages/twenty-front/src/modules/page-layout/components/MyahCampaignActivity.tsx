import { gql } from '@apollo/client';
import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { Button } from 'twenty-ui/input';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { useOpenMyahInboxConversation } from '@/myah/inbox/hooks/useOpenMyahInboxConversation';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const GET_CAMPAIGN_ACTIVITY = gql`
  query GetCampaignActivity($input: CampaignActivityInput!) {
    campaignActivity(input: $input) {
      nodes {
        campaignCreatorId
        creatorId
        creatorName
        stage
        stageLabel
        latestOutbound {
          id
          threadId
          happenedAt
          state
        }
        latestInbound {
          id
          threadId
          happenedAt
          state
        }
        plannedAt
        currentAttemptState
        reason
        needsAttention
        inboxContactId
        inboxThreadId
        excluded
        mayStillSend
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const EXCLUDE_CAMPAIGN_CREATOR = gql`
  mutation ExcludeCampaignCreator($input: ExcludeCampaignCreatorInput!) {
    excludeCampaignCreator(input: $input) {
      status
      excludedAt
      mayStillSend
    }
  }
`;

type CampaignActivityMessage = {
  id: string;
  threadId: string;
  happenedAt: string;
  state: string;
};

type CampaignActivityRow = {
  campaignCreatorId: string;
  creatorId: string;
  creatorName: string | null;
  stage: string | null;
  stageLabel: string | null;
  latestOutbound: CampaignActivityMessage | null;
  latestInbound: CampaignActivityMessage | null;
  plannedAt: string | null;
  currentAttemptState: string | null;
  reason: string | null;
  needsAttention: boolean;
  inboxContactId: string | null;
  inboxThreadId: string | null;
  excluded: boolean;
  mayStillSend: boolean;
};

type CampaignActivityData = {
  campaignActivity: {
    nodes: CampaignActivityRow[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

type CampaignActivityVariables = {
  input: { campaignId: string; first: number; after?: string };
};

type ExcludeCampaignCreatorData = {
  excludeCampaignCreator: {
    status: 'EXCLUDED' | 'REPLAYED';
    excludedAt: string;
    mayStillSend: boolean;
  };
};

type ExcludeCampaignCreatorVariables = {
  input: { campaignId: string; campaignCreatorId: string; reason: string };
};

export const MyahCampaignActivity = ({
  campaignId,
}: {
  campaignId: string;
}) => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const metadataClient = useApolloClient();
  const { openMyahInboxConversation } = useOpenMyahInboxConversation();
  const activity = useQuery<CampaignActivityData, CampaignActivityVariables>(
    GET_CAMPAIGN_ACTIVITY,
    {
      client: metadataClient,
      variables: { input: { campaignId, first: 25 } },
      errorPolicy: 'all',
      notifyOnNetworkStatusChange: true,
    },
  );
  const [excludeCreator, exclusion] = useMutation<
    ExcludeCampaignCreatorData,
    ExcludeCampaignCreatorVariables
  >(EXCLUDE_CAMPAIGN_CREATOR, { client: metadataClient });
  const rows = activity.data?.campaignActivity.nodes ?? [];
  const pageInfo = activity.data?.campaignActivity.pageInfo;

  if (activity.loading && rows.length === 0) return <p>Loading activity…</p>;
  if (activity.error && rows.length === 0)
    return (
      <p role="alert">
        Campaign activity is unavailable or you no longer have permission.
      </p>
    );

  return (
    <section aria-label="Campaign creator activity">
      <h3>Creator activity</h3>
      {activity.error && rows.length > 0 ? (
        <p role="status">
          Some Campaign activity is unavailable. Visible facts remain shown.
        </p>
      ) : null}
      {rows.length === 0 ? <p>No Creators in this Campaign.</p> : null}
      {rows.map((row) => (
        <article key={row.campaignCreatorId}>
          <strong>{row.creatorName ?? 'Creator unavailable'}</strong>
          <div>{row.stageLabel ?? 'Stage unavailable'}</div>
          <div>
            {row.latestOutbound
              ? `Last outbound: ${row.latestOutbound.state} at ${row.latestOutbound.happenedAt}`
              : 'Last outbound: unavailable'}
          </div>
          <div>
            {row.latestInbound
              ? `Last verified inbound: ${row.latestInbound.happenedAt}`
              : 'Last verified inbound: unavailable'}
          </div>
          <div>
            {row.plannedAt
              ? `Next planned action: ${row.plannedAt}`
              : 'Next planned action: unavailable'}
          </div>
          <div>
            {row.currentAttemptState
              ? `Current send state: ${row.currentAttemptState}`
              : 'Current send state: unavailable'}
          </div>
          {row.reason ? <div>{row.reason}</div> : null}
          {currentWorkspace && row.inboxContactId && row.inboxThreadId ? (
            <Button
              title="Open conversation"
              variant="secondary"
              onClick={() =>
                openMyahInboxConversation({
                  workspaceId: currentWorkspace.id,
                  contactId: row.inboxContactId as string,
                  threadId: row.inboxThreadId as string,
                })
              }
            />
          ) : null}
          {!row.excluded ? (
            <Button
              title="Exclude Creator"
              variant="secondary"
              disabled={exclusion.loading}
              onClick={() => {
                const reason = window.prompt(
                  'Why should this Creator be excluded from future Campaign sends?',
                );
                if (!reason?.trim()) return;
                const warning = row.mayStillSend
                  ? 'A provider-processing or unknown send may still finish. Exclude this Creator from future sends?'
                  : 'Exclude this Creator from future Campaign sends?';
                if (!window.confirm(warning)) return;
                void excludeCreator({
                  variables: {
                    input: {
                      campaignId,
                      campaignCreatorId: row.campaignCreatorId,
                      reason: reason.trim(),
                    },
                  },
                }).then(({ data }) => {
                  if (data?.excludeCampaignCreator.mayStillSend)
                    window.alert(
                      'Excluded. One provider-processing send may still finish; unknown outcomes remain under reconciliation.',
                    );
                  void activity.refetch();
                });
              }}
            />
          ) : null}
        </article>
      ))}
      {pageInfo?.hasNextPage && pageInfo.endCursor ? (
        <Button
          title="Load more"
          variant="secondary"
          onClick={() =>
            void activity.fetchMore({
              variables: {
                input: {
                  campaignId,
                  first: 25,
                  after: pageInfo.endCursor as string,
                },
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
            })
          }
        />
      ) : null}
    </section>
  );
};
