import { useMutation, useQuery } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useState } from 'react';
import { INSTAGRAM_MESSAGE_MAX_BODY_BYTES } from 'twenty-shared/constants';
import { getUtf8ByteLength } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import {
  GET_MYAH_REPLY_AGENT_REVIEW,
  type MyahReplyAgentReviewData,
  type MyahReplyAgentReviewNode,
  REGENERATE_MYAH_REPLY_AGENT_DRAFT,
} from '@/myah/agent/graphql/myahReplyAgentOperations';
import { GET_MYAH_INBOX_REPLY_DRAFT } from '@/myah/inbox/graphql/operations';
import { useMyahInboxInstagramDraft } from '@/myah/inbox/hooks/useMyahInboxInstagramDraft';
import { useMyahInboxInstagramSend } from '@/myah/inbox/hooks/useMyahInboxInstagramSend';
import { useOpenMyahInboxConversation } from '@/myah/inbox/hooks/useOpenMyahInboxConversation';
import { type CampaignCreatorInboxReturnTarget } from '@/myah/inbox/types/CampaignCreatorInboxReturnTarget';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';

const StyledCard = styled.section`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  margin-bottom: ${themeCssVariables.spacing[4]};
  padding: ${themeCssVariables.spacing[3]};
`;
const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  font-weight: ${themeCssVariables.font.weight.medium};
  justify-content: space-between;
`;
const StyledMuted = styled.span`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;
const StyledText = styled.textarea`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-height: 120px;
  padding: ${themeCssVariables.spacing[2]};
  resize: vertical;
`;
const StyledBody = styled.p`
  margin: 0;
  white-space: pre-wrap;
`;
const StyledActions = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
`;

const InstagramDraft = ({
  workspaceId,
  node,
  onSent,
}: {
  workspaceId: string;
  node: MyahReplyAgentReviewNode;
  onSent: () => void;
}) => {
  const draft = useMyahInboxInstagramDraft({
    workspaceId,
    contactId: node.inboxContactId,
    kind: 'REPLY',
    creatorRecordId: null,
    conversationRecordId: node.conversationRecordId,
  });
  const send = useMyahInboxInstagramSend({
    draft,
    conversationId: node.conversationRecordId ?? '',
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const bytes = getUtf8ByteLength(draft.body.trim());
  const overLimit = bytes > INSTAGRAM_MESSAGE_MAX_BODY_BYTES;
  const onSend = async () => {
    setFeedback(null);
    const result = await send.send(draft.body);
    if (result.status === 'SENT' || result.status === 'PROVIDER_ACCEPTED') {
      draft.resetAfterSend();
      onSent();
      return;
    }
    setFeedback(
      result.status === 'UNKNOWN'
        ? 'Delivery is unconfirmed. Do not resend; check the conversation in Instagram.'
        : (result.error ?? 'The reply was not sent. Try again from Inbox.'),
    );
  };
  return (
    <>
      <StyledText
        aria-label="Proposed reply"
        value={draft.body}
        disabled={draft.executionLocked || send.sending}
        onChange={(event) => draft.setBody(event.target.value)}
      />
      {feedback || draft.error ? (
        <StyledMuted role="alert">{feedback ?? draft.error}</StyledMuted>
      ) : null}
      <StyledActions>
        <StyledMuted>{`${bytes} / ${INSTAGRAM_MESSAGE_MAX_BODY_BYTES} bytes`}</StyledMuted>
        <Button
          title={send.sending ? 'Sending…' : 'Send'}
          accent="brand"
          variant="primary"
          disabled={
            send.sending ||
            send.lockedUnknown ||
            send.isBlocked ||
            draft.executionLocked ||
            !draft.body.trim() ||
            overLimit
          }
          onClick={() => void onSend()}
        />
      </StyledActions>
    </>
  );
};

const EmailDraft = ({
  workspaceId,
  campaignId,
  node,
}: {
  workspaceId: string;
  campaignId: string;
  node: MyahReplyAgentReviewNode;
}) => {
  const client = useApolloCoreClient();
  const { data, loading } = useQuery<{
    myahInboxReplyDraft: { body: { markdown: string } | null } | null;
  }>(GET_MYAH_INBOX_REPLY_DRAFT, {
    client,
    fetchPolicy: 'network-only',
    skip: !node.inboxContactId || !node.conversationRecordId,
    variables: {
      input: {
        expectedWorkspaceId: workspaceId,
        target: {
          channel: 'EMAIL',
          contactId: node.inboxContactId,
          threadId: node.conversationRecordId,
        },
        replyContext: { kind: 'CAMPAIGN', campaignId },
      },
    },
  });
  const body = data?.myahInboxReplyDraft?.body?.markdown;
  if (loading) return <StyledMuted role="status">Loading draft…</StyledMuted>;
  return body ? (
    <StyledBody>{body}</StyledBody>
  ) : (
    <StyledMuted>The draft is available in Inbox.</StyledMuted>
  );
};

// The agent's proposed reply or hand-off for one Campaign influencer, with
// send (Instagram), review in Inbox (email) and Regenerate (MYAH-445).
export const MyahCampaignCreatorAgentDraft = ({
  campaignId,
  membershipId,
  returnTarget,
}: {
  campaignId: string;
  membershipId: string;
  returnTarget: CampaignCreatorInboxReturnTarget;
}) => {
  const currentWorkspace = useAtomStateValue(currentWorkspaceState);
  const { openMyahInboxConversation } = useOpenMyahInboxConversation();
  const review = useQuery<MyahReplyAgentReviewData>(
    GET_MYAH_REPLY_AGENT_REVIEW,
    {
      variables: { input: { campaignId } },
      fetchPolicy: 'cache-and-network',
    },
  );
  const [regenerate, { loading: regenerating, error: regenerateError }] =
    useMutation(REGENERATE_MYAH_REPLY_AGENT_DRAFT);
  const [draftVersion, setDraftVersion] = useState(0);
  const node = review.data?.myahReplyAgentReview.nodes.find(
    (item) => item.campaignCreatorId === membershipId,
  );
  if (
    !currentWorkspace ||
    !node?.channel ||
    !node.conversationRecordId ||
    !['REVIEW_DRAFT', 'NEEDS_YOU', 'SEND_UNKNOWN'].includes(
      node.nextAction ?? '',
    )
  )
    return null;
  const channelLabel = node.channel === 'INSTAGRAM' ? 'Instagram' : 'Email';
  return (
    <StyledCard aria-label="Agent reply">
      <StyledHeader>
        <span>
          {node.nextAction === 'NEEDS_YOU' ? 'Needs you' : 'Proposed reply'}
        </span>
        <StyledMuted>
          {node.nextAction === 'NEEDS_YOU'
            ? 'Handed off by agent'
            : 'Drafted by agent'}
        </StyledMuted>
      </StyledHeader>
      <StyledMuted>
        {node.reason ? `${node.reason} · ` : ''}
        {`Send on: ${channelLabel}`}
      </StyledMuted>
      {node.channel === 'INSTAGRAM' ? (
        <InstagramDraft
          key={draftVersion}
          workspaceId={currentWorkspace.id}
          node={node}
          onSent={() => void review.refetch()}
        />
      ) : (
        <EmailDraft
          key={draftVersion}
          workspaceId={currentWorkspace.id}
          campaignId={campaignId}
          node={node}
        />
      )}
      {regenerateError ? (
        <StyledMuted role="alert">{regenerateError.message}</StyledMuted>
      ) : null}
      <StyledActions>
        <Button
          title={regenerating ? 'Regenerating…' : 'Regenerate'}
          variant="secondary"
          disabled={regenerating}
          onClick={async () => {
            await regenerate({
              variables: { input: { campaignCreatorId: membershipId } },
            }).catch(() => undefined);
            await review.refetch();
            setDraftVersion((version) => version + 1);
          }}
        />
        {node.inboxContactId ? (
          <Button
            title={
              node.channel === 'EMAIL'
                ? 'Review and send in Inbox'
                : 'Open in Inbox'
            }
            variant="secondary"
            onClick={() =>
              openMyahInboxConversation({
                workspaceId: currentWorkspace.id,
                contactId: node.inboxContactId!,
                threadId: node.conversationRecordId!,
                channel: node.channel ?? 'EMAIL',
                creatorReturnTarget: returnTarget,
              })
            }
          />
        ) : null}
      </StyledActions>
    </StyledCard>
  );
};
