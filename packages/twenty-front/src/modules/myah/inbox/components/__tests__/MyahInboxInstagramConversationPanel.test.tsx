import { readFileSync } from 'node:fs';
import { type forwardRef as ReactForwardRef } from 'react';

import {
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
    disabled,
    error,
    conflict,
    onReloadConflict,
    onReviewAndSend,
    campaignOptions,
    selectedCampaignId,
    onSelectCampaign,
    campaignUnavailableReason,
    onOpenAiGuidance,
    guidanceUnavailableReason,
  }: {
    username: string;
    disabled: boolean;
    error: string | null;
    conflict?: { revision: number; body: string } | null;
    onReloadConflict?: () => void;
    onReviewAndSend: () => void;
    campaignOptions?: Array<{ value: string; label: string }>;
    selectedCampaignId?: string | null;
    onSelectCampaign?: (value: string) => void;
    campaignUnavailableReason?: string | null;
    onOpenAiGuidance?: () => void;
    guidanceUnavailableReason?: string;
  }) => (
    <div>
      Composer {username} {disabled ? 'disabled' : 'ready'}
      <button onClick={onReviewAndSend}>Review and send</button>
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
      { title: string; onClick: () => void }
    >(({ title, onClick }, ref) => (
      <button ref={ref} onClick={onClick}>
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
  instagramUsername: 'ada',
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
    });
    mockUseDraft.mockReturnValue({
      draftId: 'draft-1',
      body: '',
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

  it('refetches the saved conversation page only after delayed confirmed projection', async () => {
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
    mockUseSend.mockReturnValue({
      ...mockUseSend(),
      send,
    });
    mockUseConversation.mockReturnValue({
      ...mockUseConversation(),
      refetch,
    });
    mockUseDraft.mockReturnValue({
      ...mockUseDraft(),
      body: 'Saved draft',
      resetAfterSend,
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
        onActivity={onActivity}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Review and send' }));
    expect(refetch).not.toHaveBeenCalled();
    resolveSend?.({ status: 'SENT', error: null });

    await waitFor(() => expect(resetAfterSend).toHaveBeenCalledTimes(1));
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('Instagram did not confirm a completed send.'),
    ).not.toBeInTheDocument();
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
          instagramUsername: null,
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

  it('keeps an unlinked reply blocked without a conversation username', () => {
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact({
          creator: null,
          instagramUsername: null,
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
    (instagramUsername) => {
      render(
        <MyahInboxInstagramConversationPanel
          workspaceId="workspace-1"
          contact={contact({ instagramUsername })}
          onActivity={jest.fn()}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'Message on Instagram',
      );
      expect(
        screen.queryByRole('button', { name: 'Review and send' }),
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
