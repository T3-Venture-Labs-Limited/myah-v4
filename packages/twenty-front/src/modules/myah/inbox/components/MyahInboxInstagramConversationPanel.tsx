import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  MyahInboxInstagramComposer,
  type MyahInboxInstagramComposerProps,
} from '@/myah/inbox/components/MyahInboxInstagramComposer';
import { MyahInboxInstagramTimeline } from '@/myah/inbox/components/MyahInboxInstagramTimeline';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { useMyahInboxCampaignAiGuidanceNavigation } from '@/myah/inbox/hooks/useMyahInboxCampaignAiGuidanceNavigation';
import { useMyahInboxInstagramCampaignSelection } from '@/myah/inbox/hooks/useMyahInboxInstagramCampaignSelection';
import {
  useMyahInboxInstagramDraft,
  type MyahInboxInstagramDraftFlushResult,
} from '@/myah/inbox/hooks/useMyahInboxInstagramDraft';
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
  padding: ${themeCssVariables.spacing[2]};
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
// Its own scroll region keeps errors and conflict recovery reachable. No
// padding and a stable scrollbar gutter match Email's StyledReply container
// in MyahInboxContactConversation.tsx so MyahInboxReplyBox receives the same
// available width and an overflowing reply area cannot change card width.
const StyledReplyArea = styled.section`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: ${themeCssVariables.spacing[2]};
  max-height: 60%;
  overflow-y: auto;
  padding: 0;
  scrollbar-gutter: stable;

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

const CREATOR_UNLINKED_CAMPAIGN_REASON =
  'Link this Instagram conversation to a Creator to show Campaign context.';
const CAMPAIGN_METADATA_UNAVAILABLE_REASON =
  'Campaign context is unavailable because associated Campaigns could not be read.';
const REQUIRED_CAMPAIGN_METADATA_NAMES = [
  'campaignCreator',
  'campaign',
] as const;

type MyahInboxInstagramComposerBaseProps = Omit<
  MyahInboxInstagramComposerProps,
  | 'campaignOptions'
  | 'selectedCampaignId'
  | 'onSelectCampaign'
  | 'campaignUnavailableReason'
  | 'onOpenAiGuidance'
  | 'guidanceUnavailableReason'
>;

type MyahInboxInstagramComposerViewProps = {
  composerProps: MyahInboxInstagramComposerBaseProps;
  campaignOptions?: MyahInboxInstagramComposerProps['campaignOptions'];
  selectedCampaignId?: string | null;
  onSelectCampaign?: (campaignId: string) => void;
  campaignUnavailableReason?: string | null;
  onOpenAiGuidance?: () => void;
  guidanceUnavailableReason?: string;
};

const MyahInboxInstagramComposerView = ({
  composerProps,
  campaignOptions,
  selectedCampaignId,
  onSelectCampaign,
  campaignUnavailableReason,
  onOpenAiGuidance,
  guidanceUnavailableReason,
}: MyahInboxInstagramComposerViewProps) => (
  <MyahInboxInstagramComposer
    username={composerProps.username}
    body={composerProps.body}
    channelState={composerProps.channelState}
    provider={composerProps.provider}
    error={composerProps.error}
    disabled={composerProps.disabled}
    sending={composerProps.sending}
    editorVersion={composerProps.editorVersion}
    previewScope={composerProps.previewScope}
    conflict={composerProps.conflict}
    onBodyChange={composerProps.onBodyChange}
    onReviewAndSend={composerProps.onReviewAndSend}
    onReloadConflict={composerProps.onReloadConflict}
    campaignOptions={campaignOptions}
    selectedCampaignId={selectedCampaignId}
    onSelectCampaign={onSelectCampaign}
    campaignUnavailableReason={campaignUnavailableReason}
    onOpenAiGuidance={onOpenAiGuidance}
    guidanceUnavailableReason={guidanceUnavailableReason}
  />
);

type MyahInboxInstagramCampaignComposerProps = {
  composerProps: MyahInboxInstagramComposerBaseProps;
  workspaceId: string;
  contactId: string;
  conversationId: string;
  creatorId: string | null;
  flush: () => Promise<MyahInboxInstagramDraftFlushResult>;
  isStillCurrentConversation: () => boolean;
};

type MyahInboxInstagramCampaignComposerAvailableProps =
  MyahInboxInstagramCampaignComposerProps;

const MyahInboxInstagramCampaignComposerAvailable = ({
  composerProps,
  workspaceId,
  contactId,
  conversationId,
  creatorId,
  flush,
  isStillCurrentConversation,
}: MyahInboxInstagramCampaignComposerAvailableProps) => {
  const campaignSelection = useMyahInboxInstagramCampaignSelection({
    workspaceId,
    contactId,
    conversationId,
    creatorId,
  });
  const guidanceNavigation = useMyahInboxCampaignAiGuidanceNavigation();
  // Re-checked after the guidance flush to catch selection drift during the
  // await without moving Campaign state into the draft/send authority.
  // oxlint-disable-next-line twenty/no-state-useref
  const selectedCampaignIdRef = useRef(campaignSelection.selectedCampaignId);
  selectedCampaignIdRef.current = campaignSelection.selectedCampaignId;

  const campaignSelectorUnavailableReason =
    campaignSelection.status === 'unavailable'
      ? campaignSelection.unavailableReason
      : campaignSelection.status === 'loading'
        ? 'Loading Campaign context…'
        : null;
  const guidanceUnavailableReason = !campaignSelection.selectedCampaignId
    ? 'Select a Campaign to open AI guidance.'
    : !guidanceNavigation.runtimeAgentTabId
      ? 'Campaign AI guidance is unavailable because the active Agent tab could not be found.'
      : undefined;

  const handleOpenAiGuidance = () => {
    const campaignId = campaignSelection.selectedCampaignId;
    void guidanceNavigation.openGuidance({
      campaignId,
      flush: async () => {
        const result = await flush();
        return result.status === 'saved' || result.status === 'empty';
      },
      isStillCurrent: () =>
        isStillCurrentConversation() &&
        selectedCampaignIdRef.current === campaignId,
    });
  };

  return (
    <MyahInboxInstagramComposerView
      composerProps={composerProps}
      campaignOptions={
        campaignSelection.status === 'ready' ? campaignSelection.options : []
      }
      selectedCampaignId={campaignSelection.selectedCampaignId}
      onSelectCampaign={campaignSelection.onSelectCampaign}
      campaignUnavailableReason={campaignSelectorUnavailableReason}
      onOpenAiGuidance={
        campaignSelection.selectedCampaignId &&
        guidanceNavigation.runtimeAgentTabId
          ? handleOpenAiGuidance
          : undefined
      }
      guidanceUnavailableReason={guidanceUnavailableReason}
    />
  );
};

const MyahInboxInstagramCampaignComposer = ({
  composerProps,
  workspaceId,
  contactId,
  conversationId,
  creatorId,
  flush,
  isStillCurrentConversation,
}: MyahInboxInstagramCampaignComposerProps) => {
  const { objectMetadataItems } = useObjectMetadataItems();
  const hasCampaignMetadata = REQUIRED_CAMPAIGN_METADATA_NAMES.every(
    (nameSingular) =>
      objectMetadataItems.some(
        (objectMetadataItem) =>
          objectMetadataItem.nameSingular === nameSingular,
      ),
  );

  if (!creatorId) {
    return (
      <MyahInboxInstagramComposerView
        composerProps={composerProps}
        campaignUnavailableReason={CREATOR_UNLINKED_CAMPAIGN_REASON}
        guidanceUnavailableReason="Select a Campaign to open AI guidance."
      />
    );
  }

  if (!hasCampaignMetadata) {
    return (
      <MyahInboxInstagramComposerView
        composerProps={composerProps}
        campaignUnavailableReason={CAMPAIGN_METADATA_UNAVAILABLE_REASON}
        guidanceUnavailableReason="Select a Campaign to open AI guidance."
      />
    );
  }

  return (
    <MyahInboxInstagramCampaignComposerAvailable
      composerProps={composerProps}
      workspaceId={workspaceId}
      contactId={contactId}
      conversationId={conversationId}
      creatorId={creatorId}
      flush={flush}
      isStillCurrentConversation={isStillCurrentConversation}
    />
  );
};

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

  const activeConversation =
    contact.instagram.state === 'READY' &&
    contact.instagram.conversations.length === 1
      ? contact.instagram.conversations[0]
      : null;
  if (!activeConversation)
    return (
      <StyledPanel aria-label="Instagram conversation">
        <StyledStatus role="status">
          No Instagram conversation is available here. Use Message on Instagram
          from the global command menu to compose a message.
        </StyledStatus>
      </StyledPanel>
    );
  return (
    <MyahInboxInstagramReplyPanel
      workspaceId={workspaceId}
      contact={contact}
      onActivity={onActivity}
      activeConversation={activeConversation}
    />
  );
};

const MyahInboxInstagramReplyPanel = ({
  workspaceId,
  contact,
  onActivity,
  activeConversation,
}: MyahInboxInstagramConversationPanelProps & {
  activeConversation: MyahInboxContactInstagramConversation;
}) => {
  const instagram = useMyahInstagramConversation(
    activeConversation?.id ?? null,
  );
  const draft = useMyahInboxInstagramDraft({
    workspaceId,
    contactId: contact.id,
    kind: 'REPLY',
    creatorRecordId: null,
    conversationRecordId: activeConversation?.id ?? null,
  });
  const send = useMyahInboxInstagramSend({ draft });
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  // Flushes the exact Instagram draft before the selected target unmounts.
  // oxlint-disable-next-line twenty/no-state-useref
  const flushRef = useRef(draft.flush);
  // Re-checked after the guidance flush to catch target drift during the await.
  // oxlint-disable-next-line twenty/no-state-useref
  const activeConversationIdRef = useRef(activeConversation?.id ?? null);
  activeConversationIdRef.current = activeConversation?.id ?? null;
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

  const username =
    activeConversation?.recipientUsername ?? contact.instagramUsername;
  const provider = activeConversation?.provider;
  const isHistorical =
    provider === 'COMPOSIO_HISTORY' ||
    activeConversation?.lifecycle === 'HISTORICAL';
  const isUnlinkedReply = !contact.creator;
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
      : null);

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
      await Promise.allSettled([onActivity(), instagram.refetch()]);
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
          <MyahInboxInstagramCampaignComposer
            workspaceId={workspaceId}
            contactId={contact.id}
            conversationId={activeConversation.id}
            creatorId={contact.creator?.id ?? null}
            flush={draft.flush}
            isStillCurrentConversation={() =>
              activeConversationIdRef.current === activeConversation.id
            }
            composerProps={{
              username: username ?? contact.displayName,
              body: draft.body,
              channelState: 'READY',
              provider,
              editorVersion: draft.editorVersion,
              previewScope: activeConversation.id,
              error: composerError,
              conflict: draft.conflict,
              onReloadConflict: draft.reloadConflict,
              disabled:
                isUnlinkedReply ||
                send.isBlocked ||
                send.lockedUnknown ||
                draft.status === 'conflict' ||
                draft.status === 'loading' ||
                draft.error === 'Could not load the saved Instagram draft.',
              sending: send.sending || draft.status === 'saving',
              onBodyChange: (body) => {
                if (!send.lockedUnknown && !send.isBlocked) {
                  setSendFeedback(null);
                }
                draft.setBody(body);
              },
              onReviewAndSend: () => void handleSend(),
            }}
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
      </StyledReplyArea>
    </StyledPanel>
  );
};
