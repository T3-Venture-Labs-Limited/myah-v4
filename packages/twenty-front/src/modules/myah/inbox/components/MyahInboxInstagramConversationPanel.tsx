import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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

const StyledPanel = styled.section<{ $scrollable?: boolean }>`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  min-height: 0;
  min-width: 0;
  overflow-y: ${({ $scrollable }) => ($scrollable ? 'auto' : 'hidden')};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledMessages = styled.section`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
`;

const StyledLatestMessagesAction = styled.div`
  align-self: center;
  flex-shrink: 0;
  padding: ${themeCssVariables.spacing[2]};
`;

// Bound the nonshrinking footer so short panels retain a message viewport.
// Its own scroll region keeps errors and conflict recovery reachable.
const StyledReplyArea = styled.section`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
  max-height: 60%;
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[1]};

  > * {
    flex-shrink: 0;
  }
`;

const StyledConversation = styled.section`
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
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
          inboundSenderName={
            conversation.recipientDisplayName ?? conversation.recipientUsername
          }
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
  // Keeps a reader at a rendered message rather than assuming page direction.
  // oxlint-disable-next-line twenty/no-state-useref
  const messagesRef = useRef<HTMLElement>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const pendingPageAnchorRef = useRef<{ id: string; offset: number } | null>(
    null,
  );
  // Keeps the current reader position stable across independent layout changes.
  // oxlint-disable-next-line twenty/no-state-useref
  const readingAnchorRef = useRef<{ id: string; offset: number } | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const previousLoadingMoreRef = useRef(false);
  // oxlint-disable-next-line twenty/no-state-useref
  const previousLastMessageIdRef = useRef<string | null>(null);
  // oxlint-disable-next-line twenty/no-state-useref
  const wasAtBottomRef = useRef(true);
  const [hasNewerMessages, setHasNewerMessages] = useState(false);

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

  const clearMessageAnchors = () => {
    pendingPageAnchorRef.current = null;
    readingAnchorRef.current = null;
  };

  const captureVisibleMessageAnchor = () => {
    const messages = messagesRef.current;
    if (!messages || wasAtBottomRef.current) {
      clearMessageAnchors();
      return null;
    }

    const containerTop = messages.getBoundingClientRect().top;
    const visibleMessage = Array.from(
      messages.querySelectorAll<HTMLElement>('[data-instagram-message-id]'),
    ).find((message) => message.getBoundingClientRect().bottom > containerTop);
    const id = visibleMessage?.dataset.instagramMessageId;
    if (!visibleMessage || !id) {
      clearMessageAnchors();
      return null;
    }
    const anchor = {
      id,
      offset: visibleMessage.getBoundingClientRect().top - containerTop,
    };
    readingAnchorRef.current = anchor;
    return anchor;
  };

  const restoreMessageAnchor = (
    anchor: { id: string; offset: number } | null,
  ) => {
    const messages = messagesRef.current;
    if (!messages || !anchor) return false;
    const anchoredMessage = Array.from(
      messages.querySelectorAll<HTMLElement>('[data-instagram-message-id]'),
    ).find((message) => message.dataset.instagramMessageId === anchor.id);
    if (!anchoredMessage) return false;
    messages.scrollTop +=
      anchoredMessage.getBoundingClientRect().top -
      messages.getBoundingClientRect().top -
      anchor.offset;
    return true;
  };

  useLayoutEffect(() => {
    const messages = messagesRef.current;
    if (!messages) return;

    if (instagram.loadingMore && !pendingPageAnchorRef.current) {
      pendingPageAnchorRef.current = captureVisibleMessageAnchor();
    }
    const settledOlderPage =
      previousLoadingMoreRef.current && !instagram.loadingMore;
    if (settledOlderPage) {
      restoreMessageAnchor(pendingPageAnchorRef.current);
      pendingPageAnchorRef.current = null;
    }

    const lastMessageId = instagram.messages.at(-1)?.id ?? null;
    const previousLastMessageId = previousLastMessageIdRef.current;
    const didReceiveNewerMessage =
      previousLastMessageId !== null &&
      lastMessageId !== null &&
      lastMessageId !== previousLastMessageId &&
      instagram.messages.some(
        (message) => message.id === previousLastMessageId,
      );

    if (previousLastMessageId === null || wasAtBottomRef.current) {
      messages.scrollTop = messages.scrollHeight;
      setHasNewerMessages(false);
    } else if (didReceiveNewerMessage) {
      setHasNewerMessages(true);
    }
    previousLastMessageIdRef.current = lastMessageId;
    previousLoadingMoreRef.current = instagram.loadingMore;
    captureVisibleMessageAnchor();
  }, [
    activeConversation?.id,
    instagram.loading,
    instagram.loadingMore,
    instagram.messages,
  ]);

  useEffect(() => {
    const messages = messagesRef.current;
    if (!messages || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      restoreMessageAnchor(readingAnchorRef.current);
    });
    observer.observe(messages);
    return () => observer.disconnect();
  }, []);

  const handleMessagesScroll = () => {
    const messages = messagesRef.current;
    if (!messages) return;
    wasAtBottomRef.current =
      messages.scrollHeight - messages.scrollTop - messages.clientHeight < 8;
    if (wasAtBottomRef.current) {
      clearMessageAnchors();
      setHasNewerMessages(false);
      return;
    }
    if (instagram.loadingMore) {
      pendingPageAnchorRef.current = null;
    }
    captureVisibleMessageAnchor();
  };

  const handleLoadMore = () => {
    pendingPageAnchorRef.current = captureVisibleMessageAnchor();
    void instagram.loadMore();
  };

  const handleShowLatestMessages = () => {
    const messages = messagesRef.current;
    if (messages) {
      messages.scrollTop = messages.scrollHeight;
      wasAtBottomRef.current = true;
    }
    clearMessageAnchors();
    setHasNewerMessages(false);
  };

  if (contact.instagram.state === 'AMBIGUOUS') {
    return (
      <StyledPanel $scrollable aria-label="Instagram conversations">
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
  const targetUnavailable = isFirstMessage && (!username || !contact.creator);
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
      <StyledMessages
        ref={messagesRef}
        aria-label="Instagram messages"
        tabIndex={0}
        onScroll={handleMessagesScroll}
      >
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
                inboundSenderName={
                  activeConversation.recipientDisplayName ?? contact.displayName
                }
                error={instagram.error}
                provider={activeConversation.provider}
                lifecycle={activeConversation.lifecycle}
                hasNextPage={instagram.hasNextPage}
                loadingMore={instagram.loadingMore}
                onLoadMore={handleLoadMore}
              />
            )}
          </StyledConversation>
        ) : (
          <StyledStatus>No Instagram messages yet.</StyledStatus>
        )}
      </StyledMessages>
      {hasNewerMessages ? (
        <StyledLatestMessagesAction>
          <Button
            title="Latest messages"
            variant="secondary"
            size="small"
            onClick={handleShowLatestMessages}
          />
        </StyledLatestMessagesAction>
      ) : null}
      <StyledReplyArea aria-label="Instagram reply and status" tabIndex={0}>
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
      </StyledReplyArea>
    </StyledPanel>
  );
};
