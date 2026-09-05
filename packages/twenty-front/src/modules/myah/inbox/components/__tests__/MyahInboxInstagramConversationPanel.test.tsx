import { render, screen } from '@testing-library/react';

import { MyahInboxInstagramConversationPanel } from '@/myah/inbox/components/MyahInboxInstagramConversationPanel';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

const flush = jest.fn().mockResolvedValue({ status: 'saved', revision: 1 });
const mockUseDraft = jest.fn();
const mockUseConversation = jest.fn();
const mockUseSend = jest.fn();

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

jest.mock('@/myah/inbox/components/MyahInboxInstagramTimeline', () => ({
  MyahInboxInstagramTimeline: ({ channelState }: { channelState: string }) => (
    <div>Timeline {channelState}</div>
  ),
}));

jest.mock('@/myah/inbox/components/MyahInboxInstagramComposer', () => ({
  MyahInboxInstagramComposer: ({
    username,
    disabled,
    error,
  }: {
    username: string;
    disabled: boolean;
    error: string | null;
  }) => (
    <div>
      Composer {username} {disabled ? 'disabled' : 'ready'}
      {error ? <span>{error}</span> : null}
    </div>
  ),
}));

jest.mock('twenty-ui/theme-constants', () => ({
  themeCssVariables: {
    border: { color: { light: 'gray' }, radius: { md: '8px' } },
    font: {
      color: { primary: 'black', secondary: 'gray' },
      size: { sm: '12px' },
      weight: { semiBold: 600 },
    },
    spacing: { 2: '8px', 3: '12px' },
  },
}));

jest.mock('twenty-ui/input', () => ({
  Button: ({ title, onClick }: { title: string; onClick: () => void }) => (
    <button onClick={onClick}>{title}</button>
  ),
}));

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
  preview: null,
  sender: null,
  needsAttention: false,
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
  });

  it('targets a linked Creator for a no-chat first message', () => {
    render(
      <MyahInboxInstagramConversationPanel
        workspaceId="workspace-1"
        contact={contact()}
        onActivity={jest.fn()}
      />,
    );

    expect(mockUseDraft).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      kind: 'FIRST_MESSAGE',
      creatorRecordId: 'creator-1',
      conversationRecordId: null,
    });
    expect(screen.getByText('Composer ada ready')).toBeVisible();
  });

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
        contact={contact()}
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
    expect(screen.getAllByText('Timeline AMBIGUOUS')).toHaveLength(2);
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
