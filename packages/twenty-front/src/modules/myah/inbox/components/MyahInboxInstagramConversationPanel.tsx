import { useEffect, useRef, useState } from 'react';

import { MyahInboxInstagramComposer } from '@/myah/inbox/components/MyahInboxInstagramComposer';
import { MyahInboxInstagramTimeline } from '@/myah/inbox/components/MyahInboxInstagramTimeline';
import { useMyahInboxInstagramDraft } from '@/myah/inbox/hooks/useMyahInboxInstagramDraft';
import { useMyahInboxInstagramSend } from '@/myah/inbox/hooks/useMyahInboxInstagramSend';
import { useMyahInstagramConversation } from '@/myah/inbox/hooks/useMyahInstagramConversation';
import {
  type MyahInboxContact,
  type MyahInboxContactInstagramConversation,
} from '@/myah/inbox/types/MyahInboxContact';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { Button } from 'twenty-ui/input';

const StyledPanel = styled.section`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 0;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledConversation = styled.section`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledConversationLabel = styled.h3`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  margin: 0;
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.sm};
`;

type MyahInboxInstagramConversationReadOnlyProps = {
  conversation: MyahInboxContactInstagramConversation;
  channelState: 'READY' | 'AMBIGUOUS';
};

const MyahInboxInstagramConversationReadOnly = ({
  conversation,
  channelState,
}: MyahInboxInstagramConversationReadOnlyProps) => {
  const instagram = useMyahInstagramConversation(conversation.id);
  const username = conversation.recipientUsername
    ? `@${conversation.recipientUsername}`
    : (conversation.recipientDisplayName ?? 'Instagram conversation');

  return (
    <StyledConversation>
      <StyledConversationLabel>{username}</StyledConversationLabel>
      {instagram.loading ? (
        <StyledStatus role="status">Loading Instagram messages</StyledStatus>
      ) : (
        <MyahInboxInstagramTimeline
          channelState={channelState}
          messages={instagram.messages}
          error={instagram.error}
          provider={conversation.provider}
          lifecycle={conversation.lifecycle}
          hasNextPage={instagram.hasNextPage}
          loadingMore={instagram.loadingMore}
          onLoadMore={() => void instagram.loadMore()}
        />
      )}
    </StyledConversation>
  );
};

export type MyahInboxInstagramConversationPanelProps = {
  workspaceId: string;
  contact: MyahInboxContact;
  onActivity: () => void | Promise<void>;
};

export const MyahInboxInstagramConversationPanel = ({
  workspaceId,
  contact,
  onActivity,
}: MyahInboxInstagramConversationPanelProps) => {
  const activeConversation =
    contact.instagram.state === 'READY' &&
    contact.instagram.conversations.length === 1
      ? contact.instagram.conversations[0]
      : null;
  const isFirstMessage = activeConversation === null;
  const instagram = useMyahInstagramConversation(
    activeConversation?.id ?? null,
  );
  const draft = useMyahInboxInstagramDraft({
    workspaceId,
    contactId: contact.id,
    kind: isFirstMessage ? 'FIRST_MESSAGE' : 'REPLY',
    creatorRecordId: isFirstMessage ? (contact.creator?.id ?? null) : null,
    conversationRecordId: activeConversation?.id ?? null,
  });
  const send = useMyahInboxInstagramSend({ draft });
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  // Moves conflict recovery focus to the actionable control.
  // oxlint-disable-next-line twenty/no-state-useref
  const conflictActionRef = useRef<HTMLButtonElement>(null);
  // Flushes the exact Instagram draft before the selected target unmounts.
  // oxlint-disable-next-line twenty/no-state-useref
  const flushRef = useRef(draft.flush);

  flushRef.current = draft.flush;

  useEffect(() => {
    const flushDraft = () => {
      void flushRef.current();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushDraft();
      }
    };

    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushDraft);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushDraft();
    };
  }, [contact.id, activeConversation?.id, workspaceId]);

  useEffect(() => {
    if (draft.conflict) {
      conflictActionRef.current?.focus();
    }
  }, [draft.conflict]);

  if (contact.instagram.state === 'AMBIGUOUS') {
    return (
      <StyledPanel aria-label="Instagram conversations">
        <StyledStatus role="alert">
          Multiple Instagram conversations found. Choose the correct chat in
          Instagram before sending; these copies are read-only here.
        </StyledStatus>
        {contact.instagram.conversations.map((conversation) => (
          <MyahInboxInstagramConversationReadOnly
            key={conversation.id}
            conversation={conversation}
            channelState="AMBIGUOUS"
          />
        ))}
      </StyledPanel>
    );
  }

  const username =
    activeConversation?.recipientUsername ?? contact.instagramUsername;
  const provider = activeConversation?.provider;
  const isHistorical =
    provider === 'COMPOSIO_HISTORY' ||
    activeConversation?.lifecycle === 'HISTORICAL';
  const isUnlinkedReply = Boolean(activeConversation && !contact.creator);
  const targetUnavailable = !username || (isFirstMessage && !contact.creator);
  const draftError =
    draft.status === 'conflict'
      ? 'This Instagram draft changed elsewhere. Reload it before sending.'
      : draft.error;
  const composerError =
    sendFeedback ??
    (send.lockedUnknown
      ? 'Delivery is unconfirmed. Do not resend. Check the conversation in Instagram, then reload the Inbox page to show the current server status.'
      : null) ??
    draftError ??
    (isUnlinkedReply
      ? 'Link this Instagram conversation to a Creator before replying.'
      : targetUnavailable
        ? 'Add an Instagram username to this Creator before starting a message.'
        : null);
  const effectiveChannelState =
    activeConversation || (contact.creator && username)
      ? 'READY'
      : 'UNAVAILABLE';

  const handleSend = async () => {
    setSendFeedback(null);
    const result = await send.send();

    if (result.status === 'BLOCKED') {
      return;
    }

    if (result.status === 'UNKNOWN') {
      setSendFeedback(
        'Delivery is unconfirmed. Do not resend. Check the conversation in Instagram, then reload the Inbox page to show the current server status.',
      );
      return;
    }

    if (result.error) {
      setSendFeedback(result.error);
      return;
    }

    if (result.status === 'SENT') {
      draft.resetAfterSend();
      await Promise.allSettled([
        onActivity(),
        ...(activeConversation ? [instagram.refetch()] : []),
      ]);
      setSendFeedback(null);
      return;
    }

    setSendFeedback('Instagram did not confirm a completed send.');
  };

  return (
    <StyledPanel aria-label="Instagram conversation">
      {activeConversation ? (
        <StyledConversation>
          <StyledConversationLabel>
            {username ? `@${username}` : 'Instagram conversation'}
          </StyledConversationLabel>
          {instagram.loading ? (
            <StyledStatus role="status">
              Loading Instagram messages
            </StyledStatus>
          ) : (
            <MyahInboxInstagramTimeline
              channelState="READY"
              messages={instagram.messages}
              error={instagram.error}
              provider={activeConversation.provider}
              lifecycle={activeConversation.lifecycle}
              hasNextPage={instagram.hasNextPage}
              loadingMore={instagram.loadingMore}
              onLoadMore={() => void instagram.loadMore()}
            />
          )}
        </StyledConversation>
      ) : (
        <StyledStatus>No Instagram messages yet.</StyledStatus>
      )}
      {isHistorical ? (
        <StyledStatus role="status">
          Read-only Instagram history. New messages cannot be sent from this
          copy.
        </StyledStatus>
      ) : (
        <MyahInboxInstagramComposer
          username={username ?? contact.displayName}
          body={draft.body}
          channelState={effectiveChannelState}
          provider={provider}
          error={composerError}
          disabled={
            isUnlinkedReply ||
            targetUnavailable ||
            send.isBlocked ||
            send.lockedUnknown ||
            draft.status === 'conflict' ||
            draft.status === 'loading' ||
            draft.error === 'Could not load the saved Instagram draft.'
          }
          sending={send.sending || draft.status === 'saving'}
          onBodyChange={(body) => {
            if (!send.lockedUnknown && !send.isBlocked) {
              setSendFeedback(null);
            }
            draft.setBody(body);
          }}
          onReviewAndSend={() => void handleSend()}
        />
      )}
      {send.isBlocked ? (
        <StyledStatus role="alert">
          Instagram sending is temporarily blocked
          {send.blockedUntil ? (
            <>
              {' '}
              until{' '}
              <time dateTime={send.blockedUntil}>
                {new Date(send.blockedUntil).toLocaleString()}
              </time>
            </>
          ) : (
            '. Try again later.'
          )}
        </StyledStatus>
      ) : null}
      {draft.conflict ? (
        <Button
          ref={conflictActionRef}
          title="Reload saved Instagram draft"
          variant="secondary"
          size="small"
          onClick={draft.reloadConflict}
        />
      ) : null}
    </StyledPanel>
  );
};
