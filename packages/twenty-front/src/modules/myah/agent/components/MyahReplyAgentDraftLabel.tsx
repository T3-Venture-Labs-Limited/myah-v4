import { getApolloContext, useQuery } from '@apollo/client/react';
import { useContext } from 'react';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { MyahReplyAgentFailureReason } from '@/myah/agent/components/MyahReplyAgentFailureReason';
import { GET_MYAH_REPLY_AGENT_DRAFT_LABEL } from '@/myah/agent/graphql/myahReplyAgentOperations';

const StyledLabel = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
  padding: ${themeCssVariables.spacing[1]} 0;
`;

// "Drafted by agent" or "Needs you" above an Inbox composer until a person
// edits or sends the draft (MYAH-445).
type MyahReplyAgentDraftLabelProps = {
  channel: 'EMAIL' | 'INSTAGRAM';
  conversationRecordId: string;
};

// Inbox surfaces also render without Apollo (isolated tests); no client, no label.
export const MyahReplyAgentDraftLabel = ({
  channel,
  conversationRecordId,
}: MyahReplyAgentDraftLabelProps) =>
  useContext(getApolloContext()).client ? (
    <AgentLabel channel={channel} conversationRecordId={conversationRecordId} />
  ) : null;

type AgentLabelProps = MyahReplyAgentDraftLabelProps;

const AgentLabel = ({ channel, conversationRecordId }: AgentLabelProps) => {
  const { data } = useQuery<{
    myahReplyAgentDraftLabel: {
      kind: 'DRAFTED' | 'NEEDS_YOU';
      reason: string | null;
      campaignName: string | null;
    } | null;
  }>(GET_MYAH_REPLY_AGENT_DRAFT_LABEL, {
    variables: { input: { channel, conversationRecordId } },
    fetchPolicy: 'cache-and-network',
    // ponytail: polls so the label clears after an edit; drive it from the draft revision if polling shows up in load.
    pollInterval: 15_000,
  });
  const label = data?.myahReplyAgentDraftLabel;
  if (!label) return null;
  return (
    <StyledLabel role="note">
      {label.kind === 'NEEDS_YOU' ? (
        <>
          Needs you:{' '}
          <MyahReplyAgentFailureReason
            reason={label.reason ?? 'the agent handed this off'}
          />
        </>
      ) : (
        `✦ Drafted by agent${label.campaignName ? ` · ${label.campaignName}` : ''}`
      )}
    </StyledLabel>
  );
};
