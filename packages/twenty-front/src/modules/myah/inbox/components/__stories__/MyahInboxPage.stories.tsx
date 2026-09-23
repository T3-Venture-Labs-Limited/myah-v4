import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { useEffect, useState } from 'react';

import { type useMyahInboxEmailHistory } from '@/myah/inbox/hooks/useMyahInboxEmailHistory';
import { MyahInboxContactConversation } from '@/myah/inbox/components/MyahInboxContactConversation';
import { MyahInboxContactList } from '@/myah/inbox/components/MyahInboxContactList';
import { MyahInboxInstagramComposer } from '@/myah/inbox/components/MyahInboxInstagramComposer';
import { MyahInboxInstagramTimeline } from '@/myah/inbox/components/MyahInboxInstagramTimeline';
import { DEFAULT_MYAH_INBOX_FILTERS } from '@/myah/inbox/states/myahInboxSelectionState';
import {
  type MyahInboxChannel,
  type MyahInboxContact,
  type MyahInboxContactEmailMessage,
  type MyahInstagramConversationMessage,
} from '@/myah/inbox/types/MyahInboxContact';
import { styled } from '@linaria/react';
import { SegmentedControl } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { ComponentDecorator } from 'twenty-ui/testing';
import { RootDecorator } from '~/testing/decorators/RootDecorator';

const StyledSurface = styled.div`
  background: ${themeCssVariables.background.primary};
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(0, 3fr);
  height: 720px;
`;

const StyledMobileSurface = styled.div`
  background: ${themeCssVariables.background.primary};
  display: flex;
  flex-direction: column;
  height: 720px;
`;

const StyledMobileNavigation = styled.nav`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledMobilePanel = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const StyledDetail = styled.section`
  border-left: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const StyledIdentity = styled.header`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledStatus = styled.div`
  color: ${themeCssVariables.font.color.secondary};
  padding: ${themeCssVariables.spacing[3]};
`;

const StyledInstagramFixture = styled.section`
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[3]};
`;

type PermissionFixture = 'neither' | 'reply-only' | 'first-only' | 'both';

type InboxStoryProps = {
  contacts: MyahInboxContact[];
  selectedContactId: string | null;
  channel: MyahInboxChannel;
  emailMessages: MyahInboxContactEmailMessage[];
  loading?: boolean;
  error?: string | null;
  synchronizationWarning?: string | null;
  sendError?: string | null;
  permissions: PermissionFixture;
  mobile?: boolean;
};

const dualContact: MyahInboxContact = {
  id: 'contact-ada',
  identityKind: 'CREATOR',
  displayName: 'Ada Okafor',
  instagramUsername: 'ada.creates',
  creator: { id: 'creator-ada', name: 'Ada Okafor' },
  lastActivityAt: '2026-09-05T12:00:00.000Z',
  latestChannel: 'INSTAGRAM',
  initialSelection: {
    channel: 'INSTAGRAM',
    emailThreadId: null,
    instagramConversationId: 'instagram-ada',
  },
  preview: 'The revised rate works for me.',
  sender: '@ada.creates',
  needsAttention: true,
  triage: {
    isAvailable: true,
    inboxOwnerId: null,
    inboxState: 'NEEDS_REPLY',
    snoozedUntil: null,
    revision: 1,
    identityGeneration: '1',
  },
  email: {
    isAvailable: true,
    threadCount: 2,
    threadIds: ['email-rates', 'email-shipping'],
    latestThreadId: 'email-rates',
    needsAttention: false,
  },
  instagram: {
    isAvailable: true,
    state: 'READY',
    needsAttention: true,
    conversations: [
      {
        id: 'instagram-ada',
        providerConversationId: 'provider-ada',
        provider: 'UNIPILE',
        lifecycle: 'ACTIVE',
        recipientUsername: 'ada.creates',
        recipientDisplayName: 'Ada Okafor',
        lastActivityAt: '2026-09-05T12:00:00.000Z',
        latestDirection: 'INBOUND',
      },
    ],
  },
};

const emailOnlyContact: MyahInboxContact = {
  ...dualContact,
  id: 'contact-email-only',
  latestChannel: 'EMAIL',
  instagramUsername: null,
  instagram: {
    isAvailable: false,
    state: 'UNAVAILABLE',
    needsAttention: false,
    conversations: [],
  },
};

const unmatchedEmailContact: MyahInboxContact = {
  ...dualContact,
  id: 'contact-unmatched-email',
  identityKind: 'EMAIL_THREAD',
  displayName: 'newcreator@example.com',
  instagramUsername: null,
  creator: null,
  latestChannel: 'EMAIL',
  instagram: {
    isAvailable: false,
    state: 'UNAVAILABLE',
    needsAttention: false,
    conversations: [],
  },
};

const unmatchedInstagramContact: MyahInboxContact = {
  ...dualContact,
  id: 'contact-unmatched-instagram',
  identityKind: 'INSTAGRAM_CONVERSATION',
  displayName: '@new.creator',
  instagramUsername: null,
  creator: null,
  email: {
    isAvailable: false,
    threadCount: 0,
    threadIds: [],
    latestThreadId: null,
    needsAttention: false,
  },
};

const emailMessages: MyahInboxContactEmailMessage[] = [
  {
    id: 'message-1',
    messageThreadId: 'email-shipping',
    subject: 'Product delivery',
    text: 'Your parcel should arrive tomorrow.',
    receivedAt: '2026-09-04T10:00:00.000Z',
    direction: 'OUTGOING',
    visibility: 'FULL',
    participants: [
      { role: 'FROM', handle: 'brand@example.com', displayName: 'Brand' },
    ],
    attachmentFileIds: [],
  },
  {
    id: 'message-2',
    messageThreadId: 'email-rates',
    subject: 'Fall launch rates',
    text: 'The revised rate works for me.',
    receivedAt: '2026-09-05T09:00:00.000Z',
    direction: 'INCOMING',
    visibility: 'FULL',
    participants: [
      { role: 'FROM', handle: 'ada@example.com', displayName: 'Ada Okafor' },
    ],
    attachmentFileIds: [],
  },
];

const instagramMessages: MyahInstagramConversationMessage[] = [
  {
    id: 'instagram-message-inbound',
    text: 'The revised rate works for me.',
    direction: 'INBOUND',
    sentVia: 'UNIPILE',
    provider: 'UNIPILE',
    deliveryState: 'RECEIVED',
    providerCreatedAt: '2026-09-05T11:45:00.000Z',
    createdAt: '2026-09-05T11:45:00.000Z',
    hasAttachments: false,
    attachmentCount: 0,
  },
  {
    id: 'instagram-message-outbound',
    text: 'Great, I will update the campaign.',
    direction: 'OUTBOUND',
    sentVia: 'UNIPILE',
    provider: 'UNIPILE',
    deliveryState: 'SENT',
    providerCreatedAt: '2026-09-05T11:50:00.000Z',
    createdAt: '2026-09-05T11:50:00.000Z',
    hasAttachments: false,
    attachmentCount: 0,
  },
];

const MyahInboxStorySurface = ({
  contacts,
  selectedContactId,
  channel,
  emailMessages,
  loading = false,
  error = null,
  synchronizationWarning = null,
  sendError = null,
  permissions,
  mobile = false,
}: InboxStoryProps) => {
  const [storyContactId, setStoryContactId] = useState(selectedContactId);
  const [storyChannel, setStoryChannel] = useState(channel);
  const [storyEmailThreadId, setStoryEmailThreadId] = useState<string | null>(
    null,
  );
  const [storyMobilePanel, setStoryMobilePanel] = useState<
    'contacts' | 'conversation'
  >('contacts');
  const [instagramBody, setInstagramBody] = useState(
    'Thanks — I will update the campaign.',
  );
  // Membership-scoped Campaign guidance fixture. MYAH-413 owns evidence-
  // backed context/draft/send authority; this only demonstrates the shared
  // Campaign context selector and Open AI guidance/thumbs controls.
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    'campaign-spring',
  );
  const selectedContact =
    contacts.find(({ id }) => id === storyContactId) ?? null;

  useEffect(() => {
    setStoryContactId(selectedContactId);
    setStoryChannel(channel);
  }, [channel, selectedContactId]);

  useEffect(() => {
    setStoryEmailThreadId(selectedContact?.email.latestThreadId ?? null);
  }, [selectedContact]);

  const selectedThreadSubject =
    emailMessages.find(
      (message) => message.messageThreadId === storyEmailThreadId,
    )?.subject ?? null;
  const selectedThread = storyEmailThreadId
    ? {
        id: storyEmailThreadId,
        lastActivityAt: '2026-09-05T12:00:00.000Z',
        subject: selectedThreadSubject,
        lastMessagePreview: 'Latest message',
        lastMessageSender: 'ada@example.com',
        state: 'NEEDS_REPLY' as const,
        snoozedUntil: null,
        creator: selectedContact?.creator ?? null,
        campaign: null,
        inboxOwner: null,
      }
    : null;
  const storyCards = [
    ...new Set(emailMessages.map((message) => message.messageThreadId)),
  ].map((threadId) => {
    const root = emailMessages.find(
      (message) => message.messageThreadId === threadId,
    )!;
    return {
      threadId,
      rootMessageId: root.id,
      startTimestamp: root.receivedAt,
      subject: root.subject,
      campaignLabel: null,
      historyBasis: 'EARLIEST_AUTHORIZED_RETAINED',
    };
  });
  const emailState: ReturnType<typeof useMyahInboxEmailHistory> = {
    segments: [
      {
        id: 'story',
        origin: 'retained',
        snapshot: 'story',
        olderCursor: null,
        requests: [],
        pages: [
          {
            cards: storyCards,
            snapshot: 'story',
            olderCursor: null,
            latestThreadId: storyCards.at(-1)?.threadId ?? null,
          },
        ],
      },
    ],
    windows: storyCards.map((card) => ({
      id: card.threadId,
      threadId: card.threadId,
      card,
      snapshot: 'story',
      requests: [{}],
      olderCursor: null,
      newerCursor: null,
      anchorMessageId: null,
      pages: [
        {
          threadId: card.threadId,
          root: emailMessages.find(
            (message) => message.id === card.rootMessageId,
          )!,
          messages: emailMessages.filter(
            (message) =>
              message.messageThreadId === card.threadId &&
              message.id !== card.rootMessageId,
          ),
          olderCursor: null,
          newerCursor: null,
        },
      ],
    })),
    detachedCards: [],
    missingMessageIds: [],
    historyRebased: false,
    cardPageBudget: 1,
    locationMissing: false,
    status: 'ready',
    loading: false,
    error: undefined,
    incrementalFailure: undefined,
    loadOlderCards: async () => undefined,
    openCard: async () => undefined,
    openDetachedCard: async () => undefined,
    loadMessages: async () => undefined,
    retryIncremental: async () => undefined,
    locateMessage: async () => undefined,
    refresh: async () => undefined,
    rebase: async () => undefined,
    setReadingAnchor: () => undefined,
    purge: () => undefined,
  };
  const selectedThreadState = {
    thread: selectedThread,
    loading: false,
    error: null,
    refresh: async () => selectedThread,
  };
  const instagramConversation = selectedContact?.instagram.conversations[0];
  const effectiveInstagramChannelState =
    selectedContact?.instagram.state === 'AMBIGUOUS'
      ? 'AMBIGUOUS'
      : instagramConversation ||
          (selectedContact?.creator && selectedContact.instagramUsername)
        ? 'READY'
        : 'UNAVAILABLE';
  const isFirstInstagramMessage =
    selectedContact?.instagram.conversations.length === 0;
  const canReplyOnInstagram =
    permissions === 'reply-only' || permissions === 'both';
  const canSendFirstInstagramMessage =
    permissions === 'first-only' || permissions === 'both';
  const isInstagramHistorical =
    instagramConversation?.provider === 'COMPOSIO_HISTORY' ||
    instagramConversation?.lifecycle === 'HISTORICAL';
  const instagramComposerDisabled =
    Boolean(sendError || synchronizationWarning) ||
    selectedContact?.instagram.state === 'AMBIGUOUS' ||
    isInstagramHistorical ||
    !selectedContact?.creator ||
    (isFirstInstagramMessage
      ? !canSendFirstInstagramMessage
      : !canReplyOnInstagram);

  const contactList = (
    <MyahInboxContactList
      contacts={contacts}
      filters={DEFAULT_MYAH_INBOX_FILTERS}
      selectedContactId={storyContactId}
      loading={loading}
      loadingMore={false}
      isRefreshing={false}
      refreshStatus="idle"
      refreshError={null}
      error={error ? { message: error } : undefined}
      hasNextPage={false}
      onSelectContact={(contactId, options) => {
        const nextContact = contacts.find(({ id }) => id === contactId);

        setStoryContactId(contactId);
        setStoryChannel(nextContact?.latestChannel ?? 'EMAIL');
        if (mobile && options?.openConversation) {
          setStoryMobilePanel('conversation');
        }
      }}
      onFiltersChange={fn()}
      onLoadMore={fn()}
      onRefresh={fn()}
      onRetry={fn()}
    />
  );
  const detail = (
    <StyledDetail>
      <StyledIdentity>
        <strong>{selectedContact?.displayName ?? 'No contact selected'}</strong>
        <div data-testid="permission-fixture">
          Instagram authority: {permissions}
        </div>
      </StyledIdentity>
      {synchronizationWarning ? (
        <StyledStatus role="alert">{synchronizationWarning}</StyledStatus>
      ) : null}
      {sendError ? <StyledStatus role="alert">{sendError}</StyledStatus> : null}
      {selectedContact ? (
        <MyahInboxContactConversation
          workspaceId="storybook-workspace"
          contact={selectedContact}
          selectionChannel={storyChannel}
          selectedEmailThreadId={storyEmailThreadId}
          email={emailState}
          latestThreadId={storyCards.at(-1)?.threadId ?? null}
          onSwitchToLatest={fn()}
          selectedThread={selectedThreadState}
          onSelectChannel={setStoryChannel}
          onReplyToCard={fn()}
          onContactLinked={async () => undefined}
          onActivity={async () => undefined}
          onThreadUpdated={fn()}
          onUpdateFailed={fn()}
          renderEmailReplyWorkspace={() => (
            <StyledStatus aria-label="Reply composer">
              Shared workspace draft · revision protected
            </StyledStatus>
          )}
          renderInstagramPanel={() => (
            <StyledInstagramFixture aria-label="Instagram conversations">
              {selectedContact.instagram.state === 'AMBIGUOUS' ? (
                <StyledStatus role="alert">
                  Multiple Instagram conversations found. Choose the correct
                  chat in Instagram before sending; these copies are read-only
                  here.
                </StyledStatus>
              ) : null}
              <MyahInboxInstagramTimeline
                channelState={effectiveInstagramChannelState}
                messages={
                  selectedContact.instagram.state === 'UNAVAILABLE' &&
                  !selectedContact.creator
                    ? []
                    : instagramMessages.map((message) => ({
                        ...message,
                        provider: instagramConversation?.provider ?? 'UNIPILE',
                      }))
                }
                provider={instagramConversation?.provider}
                lifecycle={instagramConversation?.lifecycle}
              />
              {selectedContact.instagram.state === 'AMBIGUOUS' ? null : (
                <MyahInboxInstagramComposer
                  username={
                    instagramConversation?.recipientUsername ??
                    selectedContact.instagramUsername ??
                    'unlinked-contact'
                  }
                  body={instagramBody}
                  channelState={effectiveInstagramChannelState}
                  provider={instagramConversation?.provider}
                  error={
                    sendError ??
                    (selectedContact.creator
                      ? null
                      : 'Link this Instagram conversation to a Creator before replying.')
                  }
                  disabled={instagramComposerDisabled}
                  editorVersion={0}
                  onBodyChange={setInstagramBody}
                  onReviewAndSend={fn()}
                  campaignOptions={
                    selectedContact.creator
                      ? [
                          {
                            value: 'campaign-spring',
                            label: 'Spring Campaign',
                          },
                          { value: 'campaign-fall', label: 'Fall Campaign' },
                        ]
                      : []
                  }
                  selectedCampaignId={
                    selectedContact.creator ? selectedCampaignId : null
                  }
                  onSelectCampaign={setSelectedCampaignId}
                  onOpenAiGuidance={
                    selectedContact.creator && selectedCampaignId
                      ? fn()
                      : undefined
                  }
                  guidanceUnavailableReason={
                    selectedContact.creator && selectedCampaignId
                      ? undefined
                      : 'Select a Campaign to open AI guidance.'
                  }
                />
              )}
            </StyledInstagramFixture>
          )}
        />
      ) : (
        <StyledStatus>Select a contact.</StyledStatus>
      )}
    </StyledDetail>
  );

  if (mobile) {
    return (
      <StyledMobileSurface>
        <StyledMobileNavigation aria-label="Inbox panels">
          <SegmentedControl
            ariaLabel="Inbox panels"
            width="100%"
            value={storyMobilePanel}
            options={[
              { label: 'Contacts', value: 'contacts' },
              {
                label: 'Conversation',
                value: 'conversation',
                disabled: !selectedContact,
              },
            ]}
            onChange={setStoryMobilePanel}
          />
        </StyledMobileNavigation>
        <StyledStatus role="status">
          {selectedContact
            ? `Selected: ${selectedContact.displayName}`
            : `${contacts.length} contacts`}
        </StyledStatus>
        <StyledMobilePanel>
          {storyMobilePanel === 'contacts' ? contactList : detail}
        </StyledMobilePanel>
      </StyledMobileSurface>
    );
  }

  return (
    <StyledSurface>
      {contactList}
      {detail}
    </StyledSurface>
  );
};

const meta: Meta<typeof MyahInboxStorySurface> = {
  title: 'Myah/Inbox/Contact-first Inbox',
  component: MyahInboxStorySurface,
  decorators: [RootDecorator, ComponentDecorator],
  parameters: { disableHotkeyInitialization: true, layout: 'fullscreen' },
  args: {
    contacts: [dualContact, unmatchedEmailContact, unmatchedInstagramContact],
    selectedContactId: dualContact.id,
    channel: 'EMAIL',
    emailMessages,
    permissions: 'both',
  },
};

export default meta;
type Story = StoryObj<typeof MyahInboxStorySurface>;

export const LinkedDualChannel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('tab', { name: 'Instagram' }));
    await expect(
      canvas.getByRole('tab', { name: 'Instagram' }),
    ).toHaveAttribute('aria-selected', 'true');
  },
};
export const Loading: Story = {
  args: { contacts: [], selectedContactId: null, loading: true },
};
export const Empty: Story = { args: { contacts: [], selectedContactId: null } };
export const PermissionDenied: Story = {
  args: {
    contacts: [],
    selectedContactId: null,
    permissions: 'neither',
    error: 'Inbox access is unavailable.',
  },
};
export const ReplyOnly: Story = {
  args: { channel: 'INSTAGRAM', permissions: 'reply-only' },
};
export const FirstMessageOnly: Story = {
  args: { channel: 'INSTAGRAM', permissions: 'first-only' },
};
export const EmailOnlyMultiSubject: Story = {
  args: {
    contacts: [emailOnlyContact],
    selectedContactId: emailOnlyContact.id,
    channel: 'EMAIL',
  },
};
export const InstagramNoChatFirstMessage: Story = {
  args: {
    channel: 'INSTAGRAM',
    contacts: [
      {
        ...dualContact,
        instagram: {
          ...dualContact.instagram,
          isAvailable: false,
          state: 'UNAVAILABLE',
          conversations: [],
        },
      },
    ],
    selectedContactId: dualContact.id,
    permissions: 'first-only',
  },
};
export const InstagramActiveChat: Story = {
  args: { channel: 'INSTAGRAM', permissions: 'reply-only' },
};
export const UnmatchedEmail: Story = {
  args: {
    contacts: [unmatchedEmailContact],
    selectedContactId: unmatchedEmailContact.id,
    channel: 'EMAIL',
  },
};
export const UnmatchedInstagram: Story = {
  args: {
    contacts: [unmatchedInstagramContact],
    selectedContactId: unmatchedInstagramContact.id,
    channel: 'INSTAGRAM',
    permissions: 'neither',
  },
};
export const DuplicateChats: Story = {
  args: {
    channel: 'INSTAGRAM',
    contacts: [
      {
        ...dualContact,
        instagram: {
          ...dualContact.instagram,
          state: 'AMBIGUOUS',
          conversations: [
            dualContact.instagram.conversations[0],
            {
              ...dualContact.instagram.conversations[0],
              id: 'instagram-duplicate',
              providerConversationId: 'provider-duplicate',
            },
          ],
        },
      },
    ],
    selectedContactId: dualContact.id,
    permissions: 'both',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('alert')).toHaveTextContent(
      /Multiple Instagram conversations found/,
    );
    await expect(
      canvas.queryByRole('button', { name: 'Review and send' }),
    ).not.toBeInTheDocument();
  },
};
export const DisconnectedAccount: Story = {
  args: {
    channel: 'INSTAGRAM',
    sendError: 'Instagram is disconnected.',
    permissions: 'neither',
  },
};
export const FailedSynchronizationWithCachedHistory: Story = {
  args: {
    channel: 'INSTAGRAM',
    synchronizationWarning:
      'Instagram could not refresh. Showing cached history; sending is disabled.',
    sendError: 'Reconnect Instagram before sending.',
  },
};
export const LimitBlocked: Story = {
  args: {
    channel: 'INSTAGRAM',
    sendError: 'Instagram sending is temporarily blocked. Try again later.',
  },
};
export const UnknownReceipt: Story = {
  args: {
    channel: 'INSTAGRAM',
    sendError:
      "We couldn't confirm whether the message was sent. Check Instagram before trying again.",
  },
};
export const ComposioHistory: Story = {
  args: {
    channel: 'INSTAGRAM',
    contacts: [
      {
        ...dualContact,
        instagram: {
          ...dualContact.instagram,
          conversations: dualContact.instagram.conversations.map(
            (conversation) => ({
              ...conversation,
              provider: 'COMPOSIO_HISTORY' as const,
              lifecycle: 'HISTORICAL' as const,
            }),
          ),
        },
      },
    ],
    permissions: 'neither',
  },
};
export const Mobile: Story = {
  args: { mobile: true },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('button', { name: 'Contacts' }),
    ).toBeVisible();
    await userEvent.click(canvas.getAllByRole('option')[0]);
    await expect(
      canvas.getByLabelText('Selected contact conversation'),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Conversation' }),
    ).toBeVisible();
  },
};
