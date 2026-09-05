import { type ReactNode, useMemo } from 'react';

import {
  MYAH_INBOX_EMAIL_PANEL_ID,
  MYAH_INBOX_EMAIL_TAB_ID,
  MYAH_INBOX_INSTAGRAM_PANEL_ID,
  MYAH_INBOX_INSTAGRAM_TAB_ID,
  MyahInboxChannelTabs,
} from '@/myah/inbox/components/MyahInboxChannelTabs';
import { MyahInboxContactEmailTimeline } from '@/myah/inbox/components/MyahInboxContactEmailTimeline';
import { MyahInboxContactHeader } from '@/myah/inbox/components/MyahInboxContactHeader';
import { MyahInboxContactLinkAction } from '@/myah/inbox/components/MyahInboxContactLinkAction';
import { MyahInboxInstagramConversationPanel } from '@/myah/inbox/components/MyahInboxInstagramConversationPanel';
import { MyahInboxReplyWorkspace } from '@/myah/inbox/components/MyahInboxReplyWorkspace';
import { MyahInboxThreadActions } from '@/myah/inbox/components/MyahInboxThreadActions';
import type { useMyahInboxContactEmailMessages } from '@/myah/inbox/hooks/useMyahInboxContactEmailMessages';
import type { useMyahInboxSelectedEmailThread } from '@/myah/inbox/hooks/useMyahInboxSelectedEmailThread';
import {
  type MyahInboxChannel,
  type MyahInboxContact,
} from '@/myah/inbox/types/MyahInboxContact';
import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledConversation = styled.section`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
`;

const StyledConversationActions = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: flex-end;
  min-height: ${themeCssVariables.spacing[8]};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

const StyledChannelPanel = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const StyledReply = styled.div`
  border-top: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex: 1;
  font-size: ${themeCssVariables.font.size.sm};
  justify-content: center;
  padding: ${themeCssVariables.spacing[6]};
`;

export type MyahInboxContactConversationProps = {
  workspaceId: string;
  contact: MyahInboxContact;
  selectionChannel: MyahInboxChannel;
  selectedEmailThreadId: string | null;
  email: ReturnType<typeof useMyahInboxContactEmailMessages>;
  selectedThread: ReturnType<typeof useMyahInboxSelectedEmailThread>;
  onSelectChannel: (channel: MyahInboxChannel) => void;
  onSelectEmailThread: (threadId: string) => void;
  onContactLinked: (resultingContactId: string) => Promise<void>;
  onActivity: () => Promise<void>;
  renderInstagramPanel?: () => ReactNode;
  renderEmailReplyWorkspace?: () => ReactNode;
  onThreadUpdated: (message: string) => void;
  onUpdateFailed: (message: string) => void;
};

export const MyahInboxContactConversation = ({
  workspaceId,
  contact,
  selectionChannel,
  selectedEmailThreadId,
  email,
  selectedThread,
  onSelectChannel,
  onSelectEmailThread,
  onContactLinked,
  onActivity,
  renderInstagramPanel,
  renderEmailReplyWorkspace,
  onThreadUpdated,
  onUpdateFailed,
}: MyahInboxContactConversationProps) => {
  const emailThreadOptions = useMemo(
    () =>
      contact.email.threadIds.map((threadId) => {
        const latestMessage = [...email.messages]
          .reverse()
          .find((message) => message.messageThreadId === threadId);
        const sender = latestMessage?.participants.find(
          (participant) => participant.role === 'FROM',
        );
        const senderLabel =
          sender?.displayName?.trim() ||
          sender?.handle?.trim() ||
          'Unknown sender';
        const activityLabel = latestMessage
          ? new Date(latestMessage.receivedAt).toLocaleString()
          : 'No messages';

        return {
          id: threadId,
          subject: latestMessage?.subject ?? null,
          detail: `${senderLabel} · ${activityLabel}`,
        };
      }),
    [contact.email.threadIds, email.messages],
  );
  const canStartInstagram = Boolean(
    contact.creator && contact.instagramUsername,
  );

  return (
    <StyledConversation aria-label="Selected contact conversation">
      <MyahInboxContactHeader
        contact={contact}
        channel={selectionChannel}
        selectedEmailThreadId={selectedEmailThreadId}
        emailThreadOptions={emailThreadOptions}
        onSelectEmailThread={onSelectEmailThread}
      />
      <MyahInboxChannelTabs
        activeChannel={selectionChannel}
        emailAvailable={contact.email.isAvailable}
        instagramAvailable={contact.instagram.isAvailable || canStartInstagram}
        onChannelChange={onSelectChannel}
      />
      <StyledConversationActions>
        {!contact.creator ? (
          <MyahInboxContactLinkAction
            contactId={contact.id}
            onLinked={onContactLinked}
            onError={onUpdateFailed}
          />
        ) : null}
        {selectionChannel === 'EMAIL' && selectedThread.thread ? (
          <MyahInboxThreadActions
            thread={selectedThread.thread}
            onThreadUpdated={onThreadUpdated}
            onUpdateFailed={onUpdateFailed}
          />
        ) : null}
      </StyledConversationActions>
      {selectionChannel === 'EMAIL' ? (
        <StyledChannelPanel
          id={MYAH_INBOX_EMAIL_PANEL_ID}
          role="tabpanel"
          aria-labelledby={MYAH_INBOX_EMAIL_TAB_ID}
        >
          <MyahInboxContactEmailTimeline
            messages={email.messages}
            selectedEmailThreadId={selectedEmailThreadId}
            selectedEmailThreadSubject={selectedThread.thread?.subject ?? null}
            loading={email.loading}
            loadingMore={email.loadingMore}
            error={email.error}
            hasNextPage={email.hasNextPage}
            onSelectEmailThread={onSelectEmailThread}
            onLoadMore={() => void email.loadMore()}
            onRetry={() => void email.refresh()}
          />
        </StyledChannelPanel>
      ) : (
        <StyledChannelPanel
          id={MYAH_INBOX_INSTAGRAM_PANEL_ID}
          role="tabpanel"
          aria-labelledby={MYAH_INBOX_INSTAGRAM_TAB_ID}
        >
          {renderInstagramPanel ? (
            renderInstagramPanel()
          ) : (
            <MyahInboxInstagramConversationPanel
              key={`${contact.id}:${contact.instagram.state}:${
                contact.instagram.conversations.map(({ id }) => id).join(',') ||
                'first-message'
              }`}
              workspaceId={workspaceId}
              contact={contact}
              onActivity={onActivity}
            />
          )}
        </StyledChannelPanel>
      )}
      {selectionChannel === 'EMAIL' ? (
        selectedThread.loading ? (
          <StyledStatus role="status">Loading reply target</StyledStatus>
        ) : selectedThread.error ? (
          <StyledStatus role="alert">
            {selectedThread.error.message}
          </StyledStatus>
        ) : selectedThread.thread ? (
          <StyledReply>
            {renderEmailReplyWorkspace ? (
              renderEmailReplyWorkspace()
            ) : (
              <MyahInboxReplyWorkspace
                thread={selectedThread.thread}
                onSent={onActivity}
              />
            )}
          </StyledReply>
        ) : (
          <StyledStatus>Select an Email thread to reply.</StyledStatus>
        )
      ) : null}
    </StyledConversation>
  );
};
