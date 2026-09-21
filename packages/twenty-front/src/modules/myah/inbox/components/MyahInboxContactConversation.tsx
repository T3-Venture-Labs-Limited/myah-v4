import { type ReactNode } from 'react';
import { Button } from 'twenty-ui/input';
import {
  getMyahInboxOutreachCards,
  MyahInboxEmailOutreachHistory,
} from '@/myah/inbox/components/MyahInboxEmailOutreachHistory';

import {
  MYAH_INBOX_EMAIL_PANEL_ID,
  MYAH_INBOX_EMAIL_TAB_ID,
  MYAH_INBOX_INSTAGRAM_PANEL_ID,
  MYAH_INBOX_INSTAGRAM_TAB_ID,
  MyahInboxChannelTabs,
} from '@/myah/inbox/components/MyahInboxChannelTabs';
import { MyahInboxContactHeader } from '@/myah/inbox/components/MyahInboxContactHeader';
import { getMyahInboxSafeEmailSubject } from '@/myah/inbox/components/MyahInboxEmailSubjectSeparator';
import { MyahInboxContactLinkAction } from '@/myah/inbox/components/MyahInboxContactLinkAction';
import { MyahInboxInstagramConversationPanel } from '@/myah/inbox/components/MyahInboxInstagramConversationPanel';
import { MyahInboxReplyWorkspace } from '@/myah/inbox/components/MyahInboxReplyWorkspace';
import { MyahInboxThreadActions } from '@/myah/inbox/components/MyahInboxThreadActions';
import type { useMyahInboxEmailHistory } from '@/myah/inbox/hooks/useMyahInboxEmailHistory';
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

const StyledEmailConversation = styled(StyledConversation)`
  overflow-y: auto;
`;

const StyledChannelPanel = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const StyledEmailPanel = styled(StyledChannelPanel)`
  flex-direction: column;
  flex-shrink: 0;
  min-height: ${themeCssVariables.spacing[32]};
  min-width: 0;
`;

const StyledReply = styled.section`
  flex-shrink: 0;
  margin: 0 ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[2]};
  min-height: 0;
  overflow-wrap: anywhere;
  overflow-y: auto;
  scrollbar-gutter: stable;
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
  draftScopeGeneration?: string;
  draftScopeAvailable?: boolean;
  contact: MyahInboxContact;
  selectionChannel: MyahInboxChannel;
  selectedEmailThreadId: string | null;
  email: ReturnType<typeof useMyahInboxEmailHistory>;
  latestThreadId: string | null;
  onSwitchToLatest: () => void;
  selectedThread: ReturnType<typeof useMyahInboxSelectedEmailThread>;
  onSelectChannel: (channel: MyahInboxChannel) => void;
  onReplyToCard: (threadId: string) => void;
  onContactLinked: (resultingContactId: string) => Promise<void>;
  onActivity: () => Promise<void>;
  renderInstagramPanel?: () => ReactNode;
  renderEmailReplyWorkspace?: () => ReactNode;
  onThreadUpdated: (message: string) => void;
  onUpdateFailed: (message: string) => void;
};

export const MyahInboxContactConversation = ({
  workspaceId,
  draftScopeGeneration,
  draftScopeAvailable = true,
  contact,
  selectionChannel,
  selectedEmailThreadId,
  email,
  latestThreadId,
  onSwitchToLatest,
  selectedThread,
  onSelectChannel,
  onReplyToCard,
  onContactLinked,
  onActivity,
  renderInstagramPanel,
  renderEmailReplyWorkspace,
  onThreadUpdated,
  onUpdateFailed,
}: MyahInboxContactConversationProps) => {
  const canStartInstagram = Boolean(
    contact.creator && contact.instagramUsername,
  );

  const replyTargets = getMyahInboxOutreachCards(email).map(
    ({ threadId, subject, campaignLabel }) => ({
      threadId,
      subject: subject ?? null,
      campaignLabel: campaignLabel ?? null,
    }),
  );
  const availableIds = new Set(replyTargets.map(({ threadId }) => threadId));
  const renderMainEditor = () =>
    renderEmailReplyWorkspace ? (
      renderEmailReplyWorkspace()
    ) : selectedThread.loading ? (
      <StyledStatus role="status">Loading reply target</StyledStatus>
    ) : selectedThread.error ? (
      <StyledStatus role="alert">{selectedThread.error.message}</StyledStatus>
    ) : selectedThread.thread &&
      selectedThread.thread.id === selectedEmailThreadId ? (
      <MyahInboxReplyWorkspace
        key={`${workspaceId}:${selectedEmailThreadId}`}
        thread={selectedThread.thread}
        contactId={contact.id}
        scopeGeneration={draftScopeGeneration}
        targetAvailable={
          draftScopeAvailable &&
          email.status === 'ready' &&
          availableIds.has(selectedThread.thread.id)
        }
        replyTargets={replyTargets}
        onReplyTargetChange={onReplyToCard}
        onSent={onActivity}
        presentation="main"
      />
    ) : (
      <StyledStatus>Latest Email conversation is unavailable.</StyledStatus>
    );

  const StyledActiveConversation =
    selectionChannel === 'EMAIL' ? StyledEmailConversation : StyledConversation;
  return (
    <StyledActiveConversation
      aria-label="Selected contact conversation"
      tabIndex={selectionChannel === 'EMAIL' ? 0 : undefined}
    >
      <MyahInboxContactHeader
        contact={contact}
        channel={selectionChannel}
        onTriageUpdated={onActivity}
        actions={
          <>
            {!contact.creator ? (
              <MyahInboxContactLinkAction
                contactId={contact.id}
                onLinked={onContactLinked}
                onError={onUpdateFailed}
              />
            ) : null}
            {selectionChannel === 'EMAIL' &&
            selectedThread.thread?.id === selectedEmailThreadId &&
            draftScopeAvailable &&
            email.status === 'ready' &&
            availableIds.has(selectedThread.thread.id) ? (
              <div
                role="group"
                aria-label={`Email actions for ${getMyahInboxSafeEmailSubject(selectedThread.thread.subject)}`}
                key={`${workspaceId}:${selectedThread.thread.id}`}
              >
                <MyahInboxThreadActions
                  thread={selectedThread.thread}
                  onThreadUpdated={onThreadUpdated}
                  onUpdateFailed={onUpdateFailed}
                />
              </div>
            ) : null}
          </>
        }
      />
      <MyahInboxChannelTabs
        activeChannel={selectionChannel}
        emailAvailable={contact.email.isAvailable}
        instagramAvailable={contact.instagram.isAvailable || canStartInstagram}
        onChannelChange={onSelectChannel}
      />
      {selectionChannel === 'EMAIL' ? (
        <StyledEmailPanel
          id={MYAH_INBOX_EMAIL_PANEL_ID}
          role="tabpanel"
          aria-labelledby={MYAH_INBOX_EMAIL_TAB_ID}
        >
          <MyahInboxEmailOutreachHistory
            history={email}
            onReply={onReplyToCard}
          />
          {latestThreadId &&
            selectedEmailThreadId &&
            latestThreadId !== selectedEmailThreadId && (
              <div role="status">
                A newer conversation is available. Your current draft target is
                unchanged.
                <Button
                  title="Switch to latest conversation"
                  onClick={onSwitchToLatest}
                />
              </div>
            )}
          <StyledReply aria-label="Main reply" tabIndex={-1}>
            {renderMainEditor()}
          </StyledReply>
        </StyledEmailPanel>
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
    </StyledActiveConversation>
  );
};
