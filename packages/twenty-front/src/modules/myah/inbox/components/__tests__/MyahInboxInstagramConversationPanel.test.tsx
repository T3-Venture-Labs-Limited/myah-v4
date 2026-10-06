import { readFileSync } from 'node:fs';
import { type forwardRef as ReactForwardRef } from 'react';

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import { MyahInboxInstagramConversationPanel } from '@/myah/inbox/components/MyahInboxInstagramConversationPanel';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

const flush = jest.fn().mockResolvedValue({ status: 'saved', revision: 1 });
const mockUseDraft = jest.fn();
const mockUseConversation = jest.fn();
const mockUseSend = jest.fn();
const mockUseCampaignSelection = jest.fn();
const mockUseGuidanceNavigation = jest.fn();
const mockUseObjectMetadataItems = jest.fn();
const mockMutate = jest.fn();

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ mutate: mockMutate }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => mockUseObjectMetadataItems(),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxInstagramDraft', () => ({
  useMyahInboxInstagramDraft: (...args: unknown[]) => mockUseDraft(...args),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxInstagramSend', () => ({
  useMyahInboxInstagramSend: (...args: unknown[]) => mockUseSend(...args),
}));

jest.mock('@/myah/inbox/hooks/useMyahInstagramConversation', () => ({
  useMyahInstagramConversation: (...args: unknown[]) =>
    mockUseConversation(...args),
}));

jest.mock('@/myah/inbox/hooks/useMyahInboxInstagramCampaignSelection', () => ({
  useMyahInboxInstagramCampaignSelection: (...args: unknown[]) =>
    mockUseCampaignSelection(...args),
}));

jest.mock(
  '@/myah/inbox/hooks/useMyahInboxCampaignAiGuidanceNavigation',
  () => ({
    useMyahInboxCampaignAiGuidanceNavigation: (...args: unknown[]) =>
      mockUseGuidanceNavigation(...args),
  }),
);

jest.mock('@/myah/inbox/components/MyahInboxInstagramComposer', () => ({
  MyahInboxInstagramComposer: ({
    username,
    body,
    editorVersion,
    disabled,
    error,
    conflict,
    onReloadConflict,
    onSend,
    campaignOptions,
    selectedCampaignId,
    onSelectCampaign,
    campaignUnavailableReason,
    onOpenAiGuidance,
    guidanceUnavailableReason,
  }: {
    username: string;
    body: string;
    editorVersion: number;
    disabled: boolean;
    error: string | null;
    conflict?: { revision: number; body: string } | null;
    onReloadConflict?: () => void;
    onSend: () => void;
    campaignOptions?: Array<{ value: string; label: string }>;
    selectedCampaignId?: string | null;
    onSelectCampaign?: (value: string) => void;
    campaignUnavailableReason?: string | null;
    onOpenAiGuidance?: () => void;
    guidanceUnavailableReason?: string;
  }) => (
    <div>
      Composer {username} {disabled ? 'disabled' : 'ready'}
      <span data-testid="reply-editor" data-version={editorVersion}>
        {body}
      </span>
      <button onClick={onSend}>Send reply</button>
      {error ? <span>{error}</span> : null}
      {conflict ? (
        <div data-testid="shared-conflict" role="alert" tabIndex={-1}>
          <button onClick={onReloadConflict}>
            Reload saved Instagram draft
          </button>
        </div>
      ) : null}
      <div data-testid="campaign-context-fixture">
        {campaignUnavailableReason ??
          `${selectedCampaignId ?? 'none'}:${(campaignOptions ?? [])
            .map((option) => option.value)
            .join(',')}`}
      </div>
      {onSelectCampaign && (
        <button onClick={() => onSelectCampaign('campaign-b')}>
          Choose campaign-b
        </button>
      )}
      <button
        disabled={!onOpenAiGuidance}
        aria-disabled={
          Boolean(guidanceUnavailableReason || !onOpenAiGuidance) || undefined
        }
        onClick={onOpenAiGuidance}
      >
        Open AI guidance
      </button>
    </div>
  ),
}));

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    background: { transparent: { lighter: 'white' } },
    brand: { focusRing: 'pink' },
    border: {
      color: { light: 'gray' },
      radius: { lg: '8px', md: '8px', sm: '4px' },
    },
    font: {
      color: { primary: 'black', secondary: 'gray' },
      size: { sm: '12px', xs: '10px' },
      weight: { semiBold: 600 },
    },
    spacing: { 1: '4px', 2: '8px', 3: '12px', 6: '24px' },
    tag: { background: { violet: 'violet' }, text: { violet: 'white' } },
  },
}));

jest.mock('twenty-ui/input', () => {
  const { forwardRef } = jest.requireActual<{
    forwardRef: typeof ReactForwardRef;
  }>('react');
  return {
    Button: forwardRef<
      HTMLButtonElement,
      {
        title: string;
        onClick: () => void;
        disabled?: boolean;
        'aria-disabled'?: boolean;
      }
    >(({ title, onClick, disabled, 'aria-disabled': ariaDisabled }, ref) => (
      <button
        ref={ref}
        onClick={onClick}
        disabled={disabled}
        aria-disabled={ariaDisabled}
      >
        {title}
      </button>
    )),
  };
});

const contact = (
  overrides: Partial<MyahInboxContact> = {},
): MyahInboxContact => ({
  id: 'contact-1',
  identityKind: 'CREATOR',
  displayName: 'Ada',
  instagramDisplayHandle: 'ada',
  creator: { id: 'creator-1', name: 'Ada' },
  lastActivityAt: '2026-09-05T10:00:00.000Z',
  latestChannel: 'INSTAGRAM',
  initialSelection: {
    channel: 'INSTAGRAM',
    emailThreadId: null,
    instagramConversationId: null,
  },
  preview: null,
  sender: null,
  needsAttention: false,
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
    threadCount: 1,
    threadIds: ['thread-1'],
    latestThreadId: 'thread-1',
    needsAttention: false,
  },
  instagram: {
    isAvailable: false,
    state: 'UNAVAILABLE',
    needsAttention: false,
    conversations: [],
  },
  ...overrides,
});

const conversation = (
  id: string,
  provider: 'UNIPILE' | 'COMPOSIO_HISTORY' = 'UNIPILE',
) => ({
  id,
  providerConversationId: `provider-${id}`,
  provider,
  lifecycle:
    provider === 'UNIPILE' ? ('ACTIVE' as const) : ('HISTORICAL' as const),
  recipientUsername: 'ada',
  recipientDisplayName: 'Ada',
  lastActivityAt: '2026-09-05T10:00:00.000Z',
  latestDirection: 'INBOUND' as const,
});

describe('MyahInboxInstagramConversationPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseObjectMetadataItems.mockReturnValue({
      objectMetadataItems: [
        { nameSingular: 'campaignCreator' },
        { nameSingular: 'campaign' },
      ],
    });
    mockUseConversation.mockReturnValue({
      messages: [],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseSend.mockReturnValue({
      send: jest.fn(),
      sending: false,
      lockedUnknown: false,
      isBlocked: false,
      blockedUntil: null,
      pendingMessages: [],
      dismissPending: jest.fn(),
      refreshPendingProviderIds: jest.fn().mockResolvedValue(true),
    });
    mockUseDraft.mockReturnValue({
      draftId: 'draft-1',
      body: '',
      editorVersion: 0,
      revision: 0,
      status: 'saved',
      conflict: null,
      error: null,
      executionLocked: false,
      setBody: jest.fn(),
      flush,
      reloadConflict: jest.fn(),
      resetAfterSend: jest.fn(),
    });
    mockUseCampaignSelection.mockReturnValue({
      status: 'unavailable',
      options: [],
      selectedCampaignId: null,
      onSelectCampaign: jest.fn(),
      unavailableReason:
        'Link this Instagram conversation to a Creator to show Campaign context.',
    });
    mockUseGuidanceNavigation.mockReturnValue({
      runtimeAgentTabId: undefined,
      openGuidance: jest.fn(),
    });
  });

  it('acknowledges only a visible current reaction version, never an off-screen or hidden one', async () => {
    let notify: IntersectionObserverCallback = () => undefined;
    const observe = jest.fn();
    const disconnect = jest.fn();
    const original = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe = observe;
      unobserve = jest.fn();
      disconnect = disconnect;
    } as unknown as typeof IntersectionObserver;
    const onReactionViewed = jest.fn();
    mockMutate.mockResolvedValue({
      data: { acknowledgeMyahInboxInstagramReaction: true },
    });
    mockUseConversation.mockReturnValue({
      ...mockUseConversation(),
      messages: [
        {
          id: 'parent-1',
          text: 'Sent',
          direction: 'OUTBOUND',
          sentVia: 'UNIPILE',
          provider: 'UNIPILE',
          deliveryState: 'SENT',
          providerCreatedAt: '2026-09-05T12:00:00.000Z',
          createdAt: '2026-09-05T12:00:00.000Z',
          hasAttachments: false,
          attachmentCount: 0,
          reactionEmoji: '👍',
          reactionActorLabel: 'Instagram participant',
          reactionVersion: 'a'.repeat(64),
        },
      ],
    });
    const selectedContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        reactionNeedsAttention: true,
        conversations: [conversation('conversation-1')],
      },
    });
    try {
      const panel = (selected = selectedContact) => (
        <MyahInboxInstagramConversationPanel
          workspaceId="workspace-1"
          contact={selected}
          onActivity={jest.fn()}
          onReactionViewed={onReactionViewed}
        />
      );
      const { rerender } = render(panel());
      const reaction = screen.getByRole('img', {
        name: 'Instagram participant reacted 👍',
      });
      expect(observe).toHaveBeenCalledWith(reaction);
      const entry = (
        ratio: number,
        target: Element = reaction,
      ): IntersectionObserverEntry => ({
        target,
        isIntersecting: ratio > 0,
        intersectionRatio: ratio,
        boundingClientRect: target.getBoundingClientRect(),
        intersectionRect: target.getBoundingClientRect(),
        rootBounds: null,
        time: 0,
      });
      await act(async () => {
        notify([entry(0.4)], {} as IntersectionObserver);
      });
      expect(mockMutate).not.toHaveBeenCalled();
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      await act(async () => {
        notify([entry(1)], {} as IntersectionObserver);
      });
      expect(mockMutate).not.toHaveBeenCalled();
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      const oldObserver = notify;
      const readablePage = mockUseConversation();
      mockUseConversation.mockReturnValue({
        ...readablePage,
        error: 'Read denied',
      });
      rerender(panel());
      await act(async () => {
        oldObserver([entry(1)], {} as IntersectionObserver);
      });
      expect(mockMutate).not.toHaveBeenCalled();
      mockUseConversation.mockReturnValue({ ...readablePage, messages: [] });
      rerender(panel());
      await act(async () => {
        oldObserver([entry(1)], {} as IntersectionObserver);
      });
      expect(mockMutate).not.toHaveBeenCalled();
      mockUseConversation.mockReturnValue(readablePage);
      rerender(panel({ ...selectedContact, id: 'other-contact' }));
      await act(async () => {
        oldObserver([entry(1)], {} as IntersectionObserver);
      });
      expect(mockMutate).not.toHaveBeenCalled();
      rerender(panel());
      await act(async () => {
        notify([entry(1)], {} as IntersectionObserver);
      });
      await waitFor(() => expect(onReactionViewed).toHaveBeenCalledTimes(1));
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: {
            input: {
              expectedWorkspaceId: 'workspace-1',
              conversationId: 'conversation-1',
              messageId: 'parent-1',
              version: 'a'.repeat(64),
            },
          },
        }),
      );
      mockUseConversation.mockReturnValue({
        ...readablePage,
        messages: readablePage.messages.map((message: { id: string }) => ({
          ...message,
          reactionVersion: 'b'.repeat(64),
        })),
      });
      mockMutate.mockResolvedValueOnce({
        data: { acknowledgeMyahInboxInstagramReaction: false },
      });
      rerender(panel());
      const currentReaction = screen.getByRole('img', {
        name: 'Instagram participant reacted 👍',
      });
      await act(async () => {
        notify([entry(1, currentReaction)], {} as IntersectionObserver);
      });
      expect(mockMutate).toHaveBeenCalledTimes(2);
      expect(onReactionViewed).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.IntersectionObserver = original;
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
    }
  });

  it('reuses the visible Inbox arrival epoch for the selected Instagram page without stacking reads', () => {
    const refetch = jest.fn();
    mockUseConversation.mockReturnValue({ ...mockUseConversation(), refetch });
    const selectedContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        reactionNeedsAttention: true,
        conversations: [conversation('conversation-1')],
      },
    });
    const { rerender } = render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={selectedContact}
        onActivity={jest.fn()}
        arrivalEpoch={0}
      />,
    );
    expect(refetch).not.toHaveBeenCalled();
    mockUseConversation.mockReturnValue({
      ...mockUseConversation(),
      refetch,
      messages: [
        {
          id: 'arrived-parent',
          text: 'Creator arrived',
          direction: 'INBOUND',
          provider: 'UNIPILE',
          sentVia: 'UNIPILE',
          deliveryState: 'RECEIVED',
          providerCreatedAt: '2026-09-05T12:00:00.000Z',
          createdAt: '2026-09-05T12:00:00.000Z',
          hasAttachments: false,
          attachmentCount: 0,
          reactionEmoji: '❤️',
          reactionActorLabel: 'Instagram participant',
          reactionVersion: 'a'.repeat(64),
        },
      ],
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={selectedContact}
        onActivity={jest.fn()}
        arrivalEpoch={1}
      />,
    );
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole('img', { name: 'Instagram participant reacted ❤️' }),
    ).toBeVisible();
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={selectedContact}
        onActivity={jest.fn()}
        arrivalEpoch={1}
      />,
    );
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows an accepted reply immediately and clears the box without a delivery warning', async () => {
    let resolveSend:
      | ((value: { status: string; error: null }) => void)
      | undefined;
    const send = jest.fn(
      () =>
        new Promise<{ status: string; error: null }>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const refetch = jest.fn();
    const onActivity = jest.fn();
    const resetAfterSend = jest.fn();
    const pending = {
      localId: 'one',
      text: 'Saved draft',
      createdAt: new Date().toISOString(),
      receiptId: null,
      providerMessageId: null,
      accepted: false,
    };
    const sendState = {
      ...mockUseSend(),
      send,
      pendingMessages: [] as (typeof pending)[],
    };
    mockUseSend.mockImplementation(() => sendState);
    mockUseConversation.mockReturnValue({
      ...mockUseConversation(),
      refetch,
    });
    mockUseDraft.mockReturnValue({
      ...mockUseDraft(),
      body: 'Saved draft',
      resetAfterSend,
    });

    const panel = () => (
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={onActivity}
      />
    );
    const view = render(panel());

    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    sendState.pendingMessages = [pending];
    view.rerender(panel());
    expect(screen.getByTestId('reply-editor')).toBeEmptyDOMElement();
    expect(screen.getByText('Composer ada disabled')).toBeVisible();
    expect(screen.getByTestId('reply-editor')).toHaveAttribute(
      'data-version',
      '1',
    );
    expect(screen.getByText('Saved draft')).toBeVisible();
    expect(refetch).not.toHaveBeenCalled();
    resolveSend?.({ status: 'PROVIDER_ACCEPTED', error: null });
    sendState.pendingMessages = [{ ...pending, accepted: true }];
    view.rerender(panel());

    await waitFor(() => expect(resetAfterSend).toHaveBeenCalledTimes(1));
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/Delivery is unconfirmed/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Instagram did not confirm a completed send.'),
    ).not.toBeInTheDocument();
  });

  it('keeps the editor empty on a revisit while the same send is in flight', () => {
    mockUseDraft.mockReturnValue({
      ...mockUseDraft(),
      body: 'Still sending',
      executionLocked: true,
    });
    mockUseSend.mockReturnValue({
      ...mockUseSend(),
      sending: true,
      lockedUnknown: true,
      pendingMessages: [
        {
          localId: 'in-flight',
          text: 'Still sending',
          createdAt: new Date().toISOString(),
          receiptId: null,
          providerMessageId: null,
          accepted: false,
        },
      ],
    });

    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(screen.getByTestId('reply-editor')).toBeEmptyDOMElement();
    expect(screen.getByText('Composer ada disabled')).toBeVisible();
    expect(
      screen.queryByText(/Delivery is unconfirmed/),
    ).not.toBeInTheDocument();
  });

  it('restores the reply and removes its pending bubble when sending fails', async () => {
    let resolveSend:
      | ((result: { status: string; error: string }) => void)
      | undefined;
    const send = jest.fn(
      () =>
        new Promise<{ status: string; error: string }>((resolve) => {
          resolveSend = resolve;
        }),
    );
    const pending = {
      localId: 'failed',
      text: 'Failed text',
      createdAt: new Date().toISOString(),
      receiptId: null,
      providerMessageId: null,
      accepted: false,
    };
    const sendState = {
      ...mockUseSend(),
      send,
      pendingMessages: [] as (typeof pending)[],
    };
    mockUseSend.mockImplementation(() => sendState);
    const resetAfterSend = jest.fn();
    mockUseDraft.mockReturnValue({
      ...mockUseDraft(),
      body: 'Failed text',
      resetAfterSend,
    });
    const panel = () => (
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />
    );
    const view = render(panel());
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    sendState.pendingMessages = [pending];
    view.rerender(panel());
    expect(screen.getByTestId('reply-editor')).toBeEmptyDOMElement();
    expect(screen.getByText('Failed text')).toBeVisible();
    resolveSend?.({ status: 'FAILED', error: 'Provider failed' });
    sendState.pendingMessages = [];
    view.rerender(panel());
    await waitFor(() =>
      expect(screen.getByTestId('reply-editor')).toHaveTextContent(
        'Failed text',
      ),
    );
    expect(
      screen.queryByRole('region', { name: 'Outbound Instagram message' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Provider failed')).toBeVisible();
    expect(resetAfterSend).not.toHaveBeenCalled();
  });

  it('scrolls to the latest message when sending from earlier history', () => {
    mockUseDraft.mockReturnValue({ ...mockUseDraft(), body: 'New reply' });
    mockUseSend.mockReturnValue({
      ...mockUseSend(),
      send: jest.fn(() => new Promise(() => undefined)),
    });
    mockUseConversation.mockReturnValue({
      ...mockUseConversation(),
      messages: [
        {
          id: 'earlier',
          text: 'Earlier history',
          direction: 'INBOUND',
          provider: 'UNIPILE',
          providerMessageId: 'earlier',
          createdAt: new Date().toISOString(),
          providerCreatedAt: null,
          hasAttachments: false,
          attachmentCount: 0,
        },
      ],
    });
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );
    const messages = screen.getByRole('region', { name: 'Instagram messages' });
    Object.defineProperties(messages, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, value: 40, writable: true },
    });
    fireEvent.scroll(messages);
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(messages.scrollTop).toBe(600);
  });

  it('keeps the timeline and accepted bubble visible during a background refresh', () => {
    mockUseConversation.mockReturnValue({
      ...mockUseConversation(),
      loading: true,
      messages: [
        {
          id: 'inbound-1',
          text: 'Earlier message',
          direction: 'INBOUND',
          provider: 'UNIPILE',
          providerMessageId: 'inbound-1',
          createdAt: new Date().toISOString(),
          providerCreatedAt: null,
          hasAttachments: false,
          attachmentCount: 0,
        },
      ],
    });
    mockUseSend.mockReturnValue({
      ...mockUseSend(),
      pendingMessages: [
        {
          localId: 'pending-1',
          text: 'Pending reply',
          createdAt: new Date().toISOString(),
          receiptId: 'receipt-1',
          providerMessageId: 'provider-1',
          accepted: true,
        },
      ],
    });

    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );
    expect(screen.getByText('Earlier message')).toBeVisible();
    expect(screen.getByText('Pending reply')).toBeVisible();
    expect(
      screen.queryByText('Loading Instagram messages'),
    ).not.toBeInTheDocument();
  });

  it('keeps refetching an accepted row even when receipt status cannot reveal its provider ID', async () => {
    jest.useFakeTimers();
    try {
      const refetch = jest.fn();
      const refreshPendingProviderIds = jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      mockUseConversation.mockReturnValue({
        ...mockUseConversation(),
        refetch,
      });
      mockUseSend.mockReturnValue({
        ...mockUseSend(),
        refreshPendingProviderIds,
        pendingMessages: [
          {
            localId: 'missing-id',
            text: 'Accepted reply',
            createdAt: new Date().toISOString(),
            receiptId: 'receipt-1',
            providerMessageId: null,
            accepted: true,
          },
        ],
      });
      render(
        <MyahInboxInstagramConversationPanel
          workspaceId="workspace-1"
          contact={contact({
            instagram: {
              isAvailable: true,
              state: 'READY',
              needsAttention: false,
              conversations: [conversation('conversation-1')],
            },
          })}
          onActivity={jest.fn()}
        />,
      );
      await act(async () => Promise.resolve());
      expect(refreshPendingProviderIds).toHaveBeenCalledTimes(1);
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Accepted reply')).toBeVisible();
      await act(async () => jest.advanceTimersByTimeAsync(5_000));
      expect(refreshPendingProviderIds).toHaveBeenCalledTimes(2);
      expect(refetch).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('deduplicates an accepted reply by receipt when status has no provider ID', () => {
    const now = new Date().toISOString();
    mockUseConversation.mockReturnValue({
      ...mockUseConversation(),
      messages: [
        {
          id: 'stored-1',
          text: 'Accepted reply',
          direction: 'OUTBOUND',
          sentVia: 'MANUAL',
          provider: 'UNIPILE',
          deliveryState: 'SENT',
          providerMessageId: 'provider-1',
          replyReceiptId: 'receipt-1',
          providerCreatedAt: now,
          createdAt: now,
          hasAttachments: false,
          attachmentCount: 0,
        },
      ],
    });
    const dismissPending = jest.fn();
    mockUseSend.mockReturnValue({
      ...mockUseSend(),
      dismissPending,
      pendingMessages: [
        {
          localId: 'pending-1',
          text: 'Accepted reply',
          createdAt: now,
          receiptId: 'receipt-1',
          providerMessageId: null,
          accepted: true,
        },
      ],
    });
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );
    expect(screen.getAllByText('Accepted reply')).toHaveLength(1);
    expect(dismissPending).toHaveBeenCalledWith('pending-1');
  });

  it('does not use receipt fallback when the known provider IDs disagree', () => {
    const now = new Date().toISOString();
    mockUseConversation.mockReturnValue({
      ...mockUseConversation(),
      messages: [
        {
          id: 'stored-1',
          text: 'Reply',
          direction: 'OUTBOUND',
          sentVia: 'MANUAL',
          provider: 'UNIPILE',
          deliveryState: 'SENT',
          providerMessageId: 'different-provider',
          replyReceiptId: 'receipt-1',
          providerCreatedAt: now,
          createdAt: now,
          hasAttachments: false,
          attachmentCount: 0,
        },
      ],
    });
    const dismissPending = jest.fn();
    mockUseSend.mockReturnValue({
      ...mockUseSend(),
      dismissPending,
      pendingMessages: [
        {
          localId: 'pending-1',
          text: 'Reply',
          createdAt: now,
          receiptId: 'receipt-1',
          providerMessageId: 'expected-provider',
          accepted: true,
        },
      ],
    });
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );
    expect(screen.getAllByText('Reply')).toHaveLength(2);
    expect(dismissPending).not.toHaveBeenCalled();
  });

  it('matches bubbles by provider ID, not text, and stops refetching after both match', async () => {
    jest.useFakeTimers();
    try {
      const refetch = jest.fn();
      const conversationState = {
        ...mockUseConversation(),
        refetch,
        messages: [] as Array<Record<string, unknown>>,
      };
      mockUseConversation.mockImplementation(() => conversationState);
      const createdAt = new Date().toISOString();
      const pending = ['one', 'two'].map((localId) => ({
        localId,
        text: 'same text',
        createdAt,
        receiptId: localId,
        providerMessageId: `provider-${localId}`,
        accepted: true,
      }));
      const dismissPending = jest.fn();
      mockUseSend.mockReturnValue({
        ...mockUseSend(),
        pendingMessages: pending,
        dismissPending,
      });
      const panel = () => (
        <MyahInboxInstagramConversationPanel
          workspaceId="workspace-1"
          contact={contact({
            instagram: {
              isAvailable: true,
              state: 'READY',
              needsAttention: false,
              conversations: [conversation('conversation-1')],
            },
          })}
          onActivity={jest.fn()}
        />
      );
      const view = render(panel());
      expect(screen.getAllByText('same text')).toHaveLength(2);
      expect(refetch).toHaveBeenCalledTimes(1);
      await act(async () => jest.advanceTimersByTimeAsync(5_000));
      expect(refetch).toHaveBeenCalledTimes(2);
      const row = (id: string) => ({
        id,
        text: 'same text',
        direction: 'OUTBOUND',
        sentVia: 'MANUAL',
        provider: 'UNIPILE',
        deliveryState: 'SENT',
        providerMessageId: `provider-${id}`,
        providerCreatedAt: createdAt,
        createdAt,
        hasAttachments: false,
        attachmentCount: 0,
      });
      conversationState.messages = [row('one')];
      view.rerender(panel());
      expect(screen.getAllByText('same text')).toHaveLength(2);
      expect(dismissPending).toHaveBeenCalledWith('one');
      conversationState.messages = [row('one'), row('two')];
      view.rerender(panel());
      expect(screen.getAllByText('same text')).toHaveLength(2);
      expect(dismissPending).toHaveBeenCalledWith('two');
      const callsAfterMatch = refetch.mock.calls.length;
      await act(async () => jest.advanceTimersByTimeAsync(10_000));
      expect(refetch).toHaveBeenCalledTimes(callsAfterMatch);
    } finally {
      jest.useRealTimers();
    }
  });

  it('separates keyboard-scrollable messages from bounded composer and recovery controls', () => {
    const reloadConflict = jest.fn();
    mockUseDraft.mockReturnValue({
      ...mockUseDraft(),
      status: 'conflict',
      conflict: { revision: 2 },
      reloadConflict,
    });
    mockUseSend.mockReturnValue({
      ...mockUseSend(),
      isBlocked: true,
    });

    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: true,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    const messages = screen.getByRole('region', { name: 'Instagram messages' });
    const reply = screen.getByRole('region', {
      name: 'Instagram reply and status',
    });
    expect(messages).toHaveAttribute('tabindex', '0');
    expect(reply).toHaveAttribute('tabindex', '0');
    expect(
      within(messages).getByRole('region', {
        name: 'Instagram conversation',
      }),
    ).toBeVisible();
    expect(within(messages).queryByText(/Composer/)).not.toBeInTheDocument();
    expect(within(reply).getByText('Composer ada disabled')).toBeVisible();
    expect(within(reply).getByText(/temporarily blocked/)).toHaveAttribute(
      'role',
      'alert',
    );
    const sharedConflict = within(reply).getByTestId('shared-conflict');
    const recovery = within(sharedConflict).getByRole('button', {
      name: 'Reload saved Instagram draft',
    });
    expect(sharedConflict).toHaveAttribute('tabindex', '-1');
    fireEvent.click(recovery);
    expect(reloadConflict).toHaveBeenCalledTimes(1);

    // Jest does not extract Linaria CSS or lay out scroll boxes. Keep the
    // short-height constraints explicit; browser UAT verifies actual geometry.
    const source = readFileSync(
      `${__dirname}/../MyahInboxInstagramConversationPanel.tsx`,
      'utf8',
    );
    expect(source).toMatch(
      /const StyledMessages[^`]+`[^`]*flex: 1;[^`]*min-height: 0;[^`]*overflow-y: auto;/,
    );
    expect(source).toMatch(
      /const StyledReplyArea[^`]+`[^`]*flex-shrink: 0;[^`]*max-height: 60%;[^`]*overflow-y: auto;/,
    );
  });

  it('gives every keyboard-scrollable conversation region the shared inset brand focus indicator', () => {
    // MYAH-478: JSDOM neither applies Linaria CSS nor the browser's
    // :focus-visible heuristic. The Email pane's rendered indicator is proven
    // in the MyahInboxContactConversationFocus browser story; this pins that
    // all three keyboard-scrollable regions reuse the same shared definition.
    const sharedIndicator = '${MYAH_INBOX_KEYBOARD_SCROLL_REGION_FOCUS_STYLES}';
    const instagramSource = readFileSync(
      `${__dirname}/../MyahInboxInstagramConversationPanel.tsx`,
      'utf8',
    );
    const emailSource = readFileSync(
      `${__dirname}/../MyahInboxContactConversation.tsx`,
      'utf8',
    );
    const styledBlock = (source: string, name: string) =>
      source.match(
        new RegExp(`const ${name} = styled[^\`]*\`([^\`]*)\`;`),
      )?.[1];

    expect(styledBlock(instagramSource, 'StyledMessages')).toContain(
      sharedIndicator,
    );
    expect(styledBlock(instagramSource, 'StyledReplyArea')).toContain(
      sharedIndicator,
    );
    expect(styledBlock(emailSource, 'StyledEmailConversation')).toContain(
      sharedIndicator,
    );
  });

  it('aligns the Instagram reply gutter with Email so MyahInboxReplyBox receives the same available width', () => {
    // Deterministic static geometry proof: JSDOM does not lay out Linaria CSS,
    // so this asserts the same scrollbar-independent-width strategy Email's
    // StyledReply already uses, matching the shared card width requirement.
    // Live pixel-rectangle geometry is proven separately in authenticated
    // browser acceptance (Tasks 10.1/10.2).
    const source = readFileSync(
      `${__dirname}/../MyahInboxInstagramConversationPanel.tsx`,
      'utf8',
    );
    const styledPanelBlock = source.match(
      /const StyledPanel = styled\.section[^`]*`([\s\S]*?)`;/,
    )?.[1];
    const styledReplyAreaBlock = source.match(
      /const StyledReplyArea = styled\.section`([\s\S]*?)`;/,
    )?.[1];
    expect(styledPanelBlock).toContain(
      'padding: ${themeCssVariables.spacing[2]}',
    );
    expect(styledReplyAreaBlock).toBeDefined();
    expect(styledReplyAreaBlock).toContain('scrollbar-gutter: stable');
    expect(styledReplyAreaBlock).not.toMatch(
      /padding: \$\{themeCssVariables\.spacing\[\d+\]\}/,
    );

    const emailReplyContainerSource = readFileSync(
      `${__dirname}/../MyahInboxContactConversation.tsx`,
      'utf8',
    );
    const styledReplyBlock = emailReplyContainerSource.match(
      /const StyledReply = styled\.section`([\s\S]*?)`;/,
    )?.[1];
    expect(styledReplyBlock).toBeDefined();
    expect(styledReplyBlock).toContain(
      'margin: 0 ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[2]}',
    );
    expect(styledReplyBlock).toContain('scrollbar-gutter: stable');
    expect(styledReplyBlock).not.toMatch(
      /padding: \$\{themeCssVariables\.spacing\[\d+\]\}/,
    );
  });

  it('fails closed before reading Campaign records when object metadata is missing', () => {
    mockUseObjectMetadataItems.mockReturnValue({ objectMetadataItems: [] });

    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: true,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(mockUseCampaignSelection).not.toHaveBeenCalled();
    expect(screen.getByTestId('campaign-context-fixture')).toHaveTextContent(
      'Campaign context is unavailable because associated Campaigns could not be read.',
    );
    expect(
      screen.getByRole('button', { name: 'Open AI guidance' }),
    ).toBeDisabled();
  });

  it('passes Campaign selection state through to the composer and threads the choice back to the hook', () => {
    const onSelectCampaign = jest.fn();
    mockUseCampaignSelection.mockReturnValue({
      status: 'ready',
      options: [
        { value: 'campaign-a', label: 'Alpha' },
        { value: 'campaign-b', label: 'Beta' },
      ],
      selectedCampaignId: 'campaign-a',
      onSelectCampaign,
      unavailableReason: null,
    });

    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(mockUseCampaignSelection).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      conversationId: 'conversation-1',
      creatorId: 'creator-1',
    });
    expect(screen.getByTestId('campaign-context-fixture')).toHaveTextContent(
      'campaign-a:campaign-a,campaign-b',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Choose campaign-b' }));
    expect(onSelectCampaign).toHaveBeenCalledWith('campaign-b');
  });

  it('opens AI guidance only with a selected Campaign and an active Agent tab, flushing and re-checking before navigating', async () => {
    const openGuidance = jest.fn().mockResolvedValue(undefined);
    mockUseCampaignSelection.mockReturnValue({
      status: 'ready',
      options: [{ value: 'campaign-a', label: 'Alpha' }],
      selectedCampaignId: 'campaign-a',
      onSelectCampaign: jest.fn(),
      unavailableReason: null,
    });
    mockUseGuidanceNavigation.mockReturnValue({
      runtimeAgentTabId: 'agent-tab-1',
      openGuidance,
    });

    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    const guidanceButton = screen.getByRole('button', {
      name: 'Open AI guidance',
    });
    expect(guidanceButton).not.toHaveAttribute('aria-disabled');
    fireEvent.click(guidanceButton);

    expect(openGuidance).toHaveBeenCalledTimes(1);
    const call = openGuidance.mock.calls[0][0];
    expect(call.campaignId).toBe('campaign-a');
    expect(call.isStillCurrent()).toBe(true);
    await expect(call.flush()).resolves.toBe(true);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('disables AI guidance without a selected Campaign or an active Agent tab', () => {
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Open AI guidance' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('opens the active timeline at the latest message without moving an older-page reader', () => {
    const activeContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        conversations: [conversation('conversation-1')],
      },
    });
    const { rerender } = render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    const messages = screen.getByRole('region', { name: 'Instagram messages' });
    Object.defineProperties(messages, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
    });
    Object.defineProperty(messages, 'scrollTop', {
      configurable: true,
      value: 0,
      writable: true,
    });

    mockUseConversation.mockReturnValue({
      messages: [
        {
          id: 'message-1',
          text: 'Hello',
          direction: 'INBOUND',
          provider: 'UNIPILE',
          providerCreatedAt: '2026-09-05T12:00:00.000Z',
          createdAt: '2026-09-05T12:00:00.000Z',
          hasAttachments: false,
          attachmentCount: 0,
        },
      ],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );

    expect(messages.scrollTop).toBe(600);

    messages.scrollTop = 25;
    const originalMessage = messages.querySelector<HTMLElement>(
      '[data-instagram-message-id="message-1"]',
    );
    expect(originalMessage).not.toBeNull();
    jest
      .spyOn(messages, 'getBoundingClientRect')
      .mockReturnValue({ top: 0 } as DOMRect);
    jest
      .spyOn(originalMessage!, 'getBoundingClientRect')
      .mockReturnValue({ top: 20, bottom: 40 } as DOMRect);
    fireEvent.scroll(messages);
    mockUseConversation.mockReturnValue({
      messages: [
        {
          id: 'message-1',
          text: 'Hello',
          direction: 'INBOUND',
          provider: 'UNIPILE',
          providerCreatedAt: '2026-09-05T12:00:00.000Z',
          createdAt: '2026-09-05T12:00:00.000Z',
          hasAttachments: false,
          attachmentCount: 0,
        },
      ],
      loading: false,
      loadingMore: true,
      error: null,
      refetch: jest.fn(),
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    Object.defineProperty(messages, 'scrollHeight', {
      configurable: true,
      value: 800,
    });
    jest
      .spyOn(
        messages.querySelector<HTMLElement>(
          '[data-instagram-message-id="message-1"]',
        )!,
        'getBoundingClientRect',
      )
      .mockImplementation(
        () =>
          ({
            top: 245 - messages.scrollTop,
            bottom: 265 - messages.scrollTop,
          }) as DOMRect,
      );
    mockUseConversation.mockReturnValue({
      messages: [
        {
          id: 'older-message',
          text: 'Earlier',
          direction: 'INBOUND',
          provider: 'UNIPILE',
          providerCreatedAt: '2026-09-05T11:00:00.000Z',
          createdAt: '2026-09-05T11:00:00.000Z',
          hasAttachments: false,
          attachmentCount: 0,
        },
        {
          id: 'message-1',
          text: 'Hello',
          direction: 'INBOUND',
          provider: 'UNIPILE',
          providerCreatedAt: '2026-09-05T12:00:00.000Z',
          createdAt: '2026-09-05T12:00:00.000Z',
          hasAttachments: false,
          attachmentCount: 0,
        },
      ],
      loading: false,
      loadingMore: false,
      error: null,
      refetch: jest.fn(),
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );

    expect(messages.scrollTop).toBe(225);
    expect(
      messages
        .querySelector<HTMLElement>('[data-instagram-message-id="message-1"]')!
        .getBoundingClientRect().top - messages.getBoundingClientRect().top,
    ).toBe(20);
  });

  it('keeps an older reader anchored and offers a latest-messages action for a new tail message', () => {
    const activeContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        conversations: [conversation('conversation-1')],
      },
    });
    const firstMessage = {
      id: 'message-1',
      text: 'First',
      direction: 'INBOUND' as const,
      provider: 'UNIPILE' as const,
      providerCreatedAt: '2026-09-05T12:00:00.000Z',
      createdAt: '2026-09-05T12:00:00.000Z',
      hasAttachments: false,
      attachmentCount: 0,
    };
    mockUseConversation.mockReturnValue({
      messages: [firstMessage],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    const { rerender } = render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    const messages = screen.getByRole('region', { name: 'Instagram messages' });
    Object.defineProperties(messages, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
    });
    Object.defineProperty(messages, 'scrollTop', {
      configurable: true,
      value: 40,
      writable: true,
    });
    fireEvent.scroll(messages);

    mockUseConversation.mockReturnValue({
      messages: [
        firstMessage,
        { ...firstMessage, id: 'newest', text: 'Newest' },
      ],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );

    expect(messages.scrollTop).toBe(40);
    const latest = screen.getByRole('button', { name: 'Latest messages' });
    fireEvent.click(latest);
    expect(messages.scrollTop).toBe(600);
    expect(
      screen.queryByRole('button', { name: 'Latest messages' }),
    ).not.toBeInTheDocument();
  });

  it('offers the latest action when an ambient burst replaces the visible page', () => {
    const activeContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        conversations: [conversation('conversation-1')],
      },
    });
    const parent = {
      id: 'old-tail',
      text: 'Previously visible',
      direction: 'INBOUND' as const,
      provider: 'UNIPILE' as const,
      providerCreatedAt: '2026-09-05T12:00:00.000Z',
      createdAt: '2026-09-05T12:00:00.000Z',
      hasAttachments: false,
      attachmentCount: 0,
    };
    mockUseConversation.mockReturnValue({ messages: [parent], loading: false });
    const { rerender } = render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    const messages = screen.getByRole('region', { name: 'Instagram messages' });
    Object.defineProperties(messages, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, value: 40, writable: true },
    });
    fireEvent.scroll(messages);
    mockUseConversation.mockReturnValue({
      messages: [
        {
          ...parent,
          id: 'new-tail',
          text: 'Newer',
          providerCreatedAt: '2026-09-05T13:00:00.000Z',
        },
      ],
      loading: false,
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Latest messages' }),
    ).toBeVisible();
  });

  it('does not announce newer messages when only the newest message was removed', () => {
    const activeContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        conversations: [conversation('conversation-1')],
      },
    });
    const old = {
      id: 'old',
      text: 'Old',
      direction: 'INBOUND' as const,
      provider: 'UNIPILE' as const,
      providerCreatedAt: '2026-09-05T11:00:00.000Z',
      createdAt: '2026-09-05T11:00:00.000Z',
      hasAttachments: false,
      attachmentCount: 0,
    };
    const newer = {
      ...old,
      id: 'newer',
      providerCreatedAt: '2026-09-05T12:00:00.000Z',
    };
    mockUseConversation.mockReturnValue({
      messages: [old, newer],
      loading: false,
    });
    const { rerender } = render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    const messages = screen.getByRole('region', { name: 'Instagram messages' });
    Object.defineProperties(messages, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, value: 40, writable: true },
    });
    fireEvent.scroll(messages);
    mockUseConversation.mockReturnValue({ messages: [old], loading: false });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Latest messages' }),
    ).not.toBeInTheDocument();
  });

  it('keeps load-more focusable but disabled during a background refresh', () => {
    const activeContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        conversations: [conversation('conversation-1')],
      },
    });
    mockUseConversation.mockReturnValue({
      messages: [],
      loading: false,
      hasNextPage: true,
      refreshing: false,
    });
    const { rerender } = render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    const loadMoreButton = screen.getByRole('button', {
      name: 'Load more Instagram messages',
    });
    loadMoreButton.focus();
    mockUseConversation.mockReturnValue({
      messages: [],
      loading: false,
      hasNextPage: true,
      refreshing: true,
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    expect(loadMoreButton).toHaveFocus();
    expect(loadMoreButton).toHaveAttribute('aria-disabled', 'true');
    expect(loadMoreButton).toBeEnabled();
    mockUseConversation.mockReturnValue({
      messages: [],
      loading: false,
      hasNextPage: true,
      refreshing: false,
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    expect(loadMoreButton).toHaveFocus();
    expect(loadMoreButton).not.toHaveAttribute('aria-disabled');
  });

  it('restores the visible message anchor when an ambient reaction refresh changes layout', () => {
    const activeContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        conversations: [conversation('conversation-1')],
      },
    });
    const parent = {
      id: 'message-1',
      text: 'Earlier message',
      direction: 'INBOUND' as const,
      provider: 'UNIPILE' as const,
      providerCreatedAt: '2026-09-05T12:00:00.000Z',
      createdAt: '2026-09-05T12:00:00.000Z',
      hasAttachments: false,
      attachmentCount: 0,
    };
    const refetch = jest.fn();
    mockUseConversation.mockReturnValue({
      messages: [parent],
      loading: false,
      refetch,
    });
    const { rerender } = render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
        arrivalEpoch={0}
      />,
    );
    const messages = screen.getByRole('region', { name: 'Instagram messages' });
    Object.defineProperties(messages, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, value: 40, writable: true },
    });
    jest
      .spyOn(messages, 'getBoundingClientRect')
      .mockReturnValue({ top: 0 } as DOMRect);
    const anchored = messages.querySelector<HTMLElement>(
      '[data-instagram-message-id="message-1"]',
    );
    expect(anchored).not.toBeNull();
    let layoutTop = 60;
    jest.spyOn(anchored!, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: layoutTop - messages.scrollTop,
          bottom: layoutTop + 20 - messages.scrollTop,
        }) as DOMRect,
    );
    fireEvent.scroll(messages);
    layoutTop += 100;
    mockUseConversation.mockReturnValue({
      messages: [
        { ...parent, reactionEmoji: '❤️', reactionVersion: 'new-version' },
      ],
      loading: false,
      refetch,
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
        arrivalEpoch={1}
      />,
    );
    expect(messages.scrollTop).toBe(140);
    expect(anchored!.getBoundingClientRect().top).toBe(20);
  });

  it('does not restore an obsolete reading anchor after Latest messages changes the panel height', () => {
    const callbacks: ResizeObserverCallback[] = [];
    const originalResizeObserver = global.ResizeObserver;

    class ControlledResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback);
      }

      observe() {}
      disconnect() {}
      unobserve() {}
    }

    Object.defineProperty(global, 'ResizeObserver', {
      configurable: true,
      value: ControlledResizeObserver,
    });

    try {
      const activeContact = contact({
        instagram: {
          isAvailable: true,
          state: 'READY',
          needsAttention: false,
          conversations: [conversation('conversation-1')],
        },
      });
      const firstMessage = {
        id: 'message-1',
        text: 'First',
        direction: 'INBOUND' as const,
        provider: 'UNIPILE' as const,
        providerCreatedAt: '2026-09-05T12:00:00.000Z',
        createdAt: '2026-09-05T12:00:00.000Z',
        hasAttachments: false,
        attachmentCount: 0,
      };
      mockUseConversation.mockReturnValue({
        messages: [firstMessage],
        loading: false,
        error: null,
        refetch: jest.fn(),
      });
      const { rerender } = render(
        <MyahInboxInstagramConversationPanel
          workspaceId="workspace-1"
          contact={activeContact}
          onActivity={jest.fn()}
        />,
      );
      const messages = screen.getByRole('region', {
        name: 'Instagram messages',
      });
      Object.defineProperties(messages, {
        clientHeight: { configurable: true, value: 100 },
        scrollHeight: { configurable: true, value: 600 },
      });
      Object.defineProperty(messages, 'scrollTop', {
        configurable: true,
        value: 40,
        writable: true,
      });
      jest
        .spyOn(messages, 'getBoundingClientRect')
        .mockReturnValue({ top: 0 } as DOMRect);
      const anchoredMessage = messages.querySelector<HTMLElement>(
        '[data-instagram-message-id="message-1"]',
      );
      expect(anchoredMessage).not.toBeNull();
      let resized = false;
      jest.spyOn(anchoredMessage!, 'getBoundingClientRect').mockImplementation(
        () =>
          ({
            top: resized ? 245 - messages.scrollTop : 20,
            bottom: resized ? 265 - messages.scrollTop : 40,
          }) as DOMRect,
      );
      fireEvent.scroll(messages);

      mockUseConversation.mockReturnValue({
        messages: [firstMessage, { ...firstMessage, id: 'newest' }],
        loading: false,
        error: null,
        refetch: jest.fn(),
      });
      rerender(
        <MyahInboxInstagramConversationPanel
          workspaceId="workspace-1"
          contact={activeContact}
          onActivity={jest.fn()}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Latest messages' }));
      expect(messages.scrollTop).toBe(600);
      resized = true;
      callbacks.forEach((callback) => callback([], {} as ResizeObserver));
      expect(messages.scrollTop).toBe(600);
    } finally {
      Object.defineProperty(global, 'ResizeObserver', {
        configurable: true,
        value: originalResizeObserver,
      });
    }
  });

  it('keeps rendered messages, their anchor, and retry available after an older-page error', () => {
    const loadMore = jest.fn();
    const activeContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        conversations: [conversation('conversation-1')],
      },
    });
    mockUseConversation.mockReturnValue({
      messages: [
        {
          id: 'message-1',
          text: 'Still visible',
          direction: 'INBOUND',
          provider: 'UNIPILE',
          providerCreatedAt: '2026-09-05T12:00:00.000Z',
          createdAt: '2026-09-05T12:00:00.000Z',
          hasAttachments: false,
          attachmentCount: 0,
        },
      ],
      loading: false,
      loadingMore: false,
      hasNextPage: true,
      error: 'Could not load older Instagram messages.',
      loadMore,
      refetch: jest.fn(),
    });

    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );

    const messages = screen.getByRole('region', { name: 'Instagram messages' });
    expect(within(messages).getByText('Still visible')).toBeVisible();
    expect(within(messages).getByRole('alert')).toHaveTextContent(
      'Could not load older Instagram messages.',
    );
    expect(
      within(messages).getByRole('article', {
        name: 'Inbound Instagram message',
      }),
    ).toHaveAttribute('data-instagram-message-id', 'message-1');
    fireEvent.click(
      within(messages).getByRole('button', {
        name: 'Load more Instagram messages',
      }),
    );
    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('places latest-messages control outside the scroll content and scrolls to the end', () => {
    const activeContact = contact({
      instagram: {
        isAvailable: true,
        state: 'READY',
        needsAttention: false,
        conversations: [conversation('conversation-1')],
      },
    });
    const firstMessage = {
      id: 'message-1',
      text: 'First',
      direction: 'INBOUND' as const,
      provider: 'UNIPILE' as const,
      providerCreatedAt: '2026-09-05T12:00:00.000Z',
      createdAt: '2026-09-05T12:00:00.000Z',
      hasAttachments: false,
      attachmentCount: 0,
    };
    mockUseConversation.mockReturnValue({
      messages: [firstMessage],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    const { rerender } = render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );
    const messages = screen.getByRole('region', { name: 'Instagram messages' });
    Object.defineProperties(messages, {
      clientHeight: { configurable: true, value: 100 },
      scrollHeight: { configurable: true, value: 600 },
    });
    Object.defineProperty(messages, 'scrollTop', {
      configurable: true,
      value: 40,
      writable: true,
    });
    fireEvent.scroll(messages);
    mockUseConversation.mockReturnValue({
      messages: [firstMessage, { ...firstMessage, id: 'newest' }],
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    rerender(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={activeContact}
        onActivity={jest.fn()}
      />,
    );

    const latest = screen.getByRole('button', { name: 'Latest messages' });
    expect(messages).not.toContainElement(latest);
    fireEvent.click(latest);
    expect(messages.scrollTop).toBe(600);
    const source = readFileSync(
      `${__dirname}/../MyahInboxInstagramConversationPanel.tsx`,
      'utf8',
    );
    expect(source).toMatch(
      /const StyledLatestMessagesAction[^`]+`[^`]*flex-shrink: 0;/,
    );
  });

  it('keeps a linked active reply editable when its conversation has no username', () => {
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagramDisplayHandle: null,
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [
              { ...conversation('conversation-1'), recipientUsername: null },
            ],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(screen.getByText('Composer Ada ready')).toBeVisible();
  });

  it('does not substitute a contact display handle for a selected conversation recipient', () => {
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagramDisplayHandle: 'different.profile',
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [
              { ...conversation('conversation-1'), recipientUsername: null },
            ],
          },
        })}
        onActivity={jest.fn()}
      />,
    );
    expect(screen.getByText('Instagram conversation')).toBeVisible();
    expect(screen.queryByText('@different.profile')).not.toBeInTheDocument();
    expect(screen.getByText('Composer Ada ready')).toBeVisible();
  });

  it('keeps an unlinked reply blocked without a conversation username', () => {
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          creator: null,
          instagramDisplayHandle: null,
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [
              { ...conversation('conversation-1'), recipientUsername: null },
            ],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(screen.getByText('Composer Ada disabled')).toBeVisible();
    expect(
      screen.getByText(
        'Link this Instagram conversation to a Creator before replying.',
      ),
    ).toBeVisible();
  });

  it.each(['ada', null])(
    'shows neutral global-command guidance without creating a draft for no conversation (%s)',
    (instagramDisplayHandle) => {
      render(
        <MyahInboxInstagramConversationPanel
          workspaceId="workspace-1"
          contact={contact({ instagramDisplayHandle })}
          onActivity={jest.fn()}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Message on Instagram',
      );
      expect(
        screen.queryByRole('button', { name: 'Send reply' }),
      ).not.toBeInTheDocument();
      expect(mockUseDraft).not.toHaveBeenCalled();
      expect(mockUseSend).not.toHaveBeenCalled();
    },
  );

  it('explains a server-persisted unconfirmed delivery lock after reload', () => {
    mockUseSend.mockReturnValue({
      send: jest.fn(),
      sending: false,
      lockedUnknown: true,
      isBlocked: false,
      blockedUntil: null,
      pendingMessages: [],
      dismissPending: jest.fn(),
    });

    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('conversation-1')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(screen.getByText('Composer ada disabled')).toBeVisible();
    expect(screen.getByText(/Delivery is unconfirmed/)).toBeVisible();
  });

  it('targets the exact active conversation for a reply', () => {
    const activeConversation = conversation('conversation-1');

    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: true,
            conversations: [activeConversation],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(mockUseDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'REPLY',
        creatorRecordId: null,
        conversationRecordId: 'conversation-1',
      }),
    );
  });

  it('renders every duplicate conversation as labelled read-only and no composer', () => {
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'AMBIGUOUS',
            needsAttention: true,
            conversations: [conversation('one'), conversation('two')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(screen.getAllByText('@ada')).toHaveLength(2);
    expect(
      screen.getAllByText(
        'Multiple Instagram conversations found (read-only).',
      ),
    ).toHaveLength(2);
    expect(screen.queryByText(/Composer/)).not.toBeInTheDocument();
  });

  it('keeps Composio history read-only', () => {
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          instagram: {
            isAvailable: true,
            state: 'READY',
            needsAttention: false,
            conversations: [conversation('history', 'COMPOSIO_HISTORY')],
          },
        })}
        onActivity={jest.fn()}
      />,
    );

    expect(
      screen.getByText(
        'Read-only Instagram history. New messages cannot be sent from this copy.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Composer/)).not.toBeInTheDocument();
  });
});
