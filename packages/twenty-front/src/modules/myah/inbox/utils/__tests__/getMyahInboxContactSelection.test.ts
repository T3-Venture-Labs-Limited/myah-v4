import {
  getMyahInboxContactSelection,
  getMyahInboxRegroupedContactSelection,
  getMyahInboxSelectionForChannel,
} from '@/myah/inbox/utils/getMyahInboxContactSelection';
import { type MyahInboxContact } from '@/myah/inbox/types/MyahInboxContact';

const contact: MyahInboxContact = {
  id: 'contact-1',
  identityKind: 'CREATOR',
  displayName: 'Creator One',
  instagramUsername: 'creator',
  creator: { id: 'creator-1', name: 'Creator One' },
  lastActivityAt: '2026-09-05T12:00:00.000Z',
  latestChannel: 'INSTAGRAM',
  initialSelection: {
    channel: 'EMAIL',
    emailThreadId: 'thread-1',
    instagramConversationId: null,
  },
  preview: 'Latest',
  sender: '@creator',
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
    threadIds: ['thread-1', 'thread-2'],
    latestThreadId: 'thread-2',
    needsAttention: false,
  },
  instagram: {
    isAvailable: true,
    state: 'READY',
    needsAttention: true,
    conversations: [
      {
        provider: 'UNIPILE',
        lifecycle: 'ACTIVE',
        id: 'conversation-1',
        providerConversationId: 'provider-1',
        recipientUsername: 'creator',
        recipientDisplayName: 'Creator One',
        lastActivityAt: '2026-09-05T12:00:00.000Z',
        latestDirection: 'INBOUND',
      },
    ],
  },
};

describe('getMyahInboxContactSelection', () => {
  it('does not substitute activity order for unresolved outreach order', () => {
    expect(
      getMyahInboxSelectionForChannel({
        workspaceId: 'workspace-1',
        contact,
        channel: 'EMAIL',
        previousSelection: null,
      }).emailThreadId,
    ).toBeNull();
  });
  it('defaults a new Contact to its projected inbound channel and exact target', () => {
    expect(
      getMyahInboxContactSelection({
        workspaceId: 'workspace-1',
        contact,
        previousSelection: null,
      }),
    ).toEqual({
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      channel: 'EMAIL',
      emailThreadId: 'thread-1',
      instagramConversationId: null,
    });
  });

  it('rejects a projected Email target outside readable contact membership', () => {
    expect(
      getMyahInboxContactSelection({
        workspaceId: 'workspace-1',
        contact: {
          ...contact,
          initialSelection: {
            channel: 'EMAIL',
            emailThreadId: 'stale-thread',
            instagramConversationId: null,
          },
        },
        previousSelection: null,
      }),
    ).toMatchObject({ channel: 'EMAIL', emailThreadId: null });
  });

  it('accepts only the projected sole readable Instagram conversation', () => {
    expect(
      getMyahInboxContactSelection({
        workspaceId: 'workspace-1',
        contact: {
          ...contact,
          initialSelection: {
            channel: 'INSTAGRAM',
            emailThreadId: null,
            instagramConversationId: 'conversation-1',
          },
        },
        previousSelection: null,
      }),
    ).toMatchObject({
      channel: 'INSTAGRAM',
      instagramConversationId: 'conversation-1',
    });

    expect(
      getMyahInboxContactSelection({
        workspaceId: 'workspace-1',
        contact: {
          ...contact,
          initialSelection: {
            channel: 'INSTAGRAM',
            emailThreadId: null,
            instagramConversationId: 'conversation-1',
          },
          instagram: {
            ...contact.instagram,
            state: 'AMBIGUOUS',
            conversations: [
              ...contact.instagram.conversations,
              { ...contact.instagram.conversations[0], id: 'conversation-2' },
            ],
          },
        },
        previousSelection: null,
      }),
    ).toMatchObject({
      channel: 'INSTAGRAM',
      instagramConversationId: null,
    });
  });

  it('keeps the existing exact-target fallback when the recommended channel is unavailable', () => {
    expect(
      getMyahInboxContactSelection({
        workspaceId: 'workspace-1',
        contact: {
          ...contact,
          instagramUsername: null,
          initialSelection: {
            channel: 'INSTAGRAM',
            emailThreadId: null,
            instagramConversationId: null,
          },
          instagram: {
            isAvailable: false,
            state: 'UNAVAILABLE',
            needsAttention: false,
            conversations: [],
          },
        },
        previousSelection: null,
        latestOutreachThreadId: 'thread-2',
      }),
    ).toMatchObject({ channel: 'EMAIL', emailThreadId: 'thread-2' });
  });

  it('preserves a pinned exact Email target despite partial contact membership', () => {
    const previousSelection = {
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      channel: 'EMAIL' as const,
      emailThreadId: 'thread-1',
      instagramConversationId: null,
    };

    expect(
      getMyahInboxContactSelection({
        workspaceId: 'workspace-1',
        contact,
        previousSelection,
      }).emailThreadId,
    ).toBe('thread-1');
    expect(
      getMyahInboxContactSelection({
        workspaceId: 'workspace-1',
        contact: {
          ...contact,
          email: {
            ...contact.email,
            threadIds: ['thread-2'],
            threadCount: 1,
          },
        },
        previousSelection,
      }).emailThreadId,
    ).toBe('thread-1');
  });

  it('clears Email authority immediately on Instagram and blocks an ambiguous target', () => {
    expect(
      getMyahInboxSelectionForChannel({
        workspaceId: 'workspace-1',
        contact: {
          ...contact,
          instagram: {
            ...contact.instagram,
            state: 'AMBIGUOUS',
            conversations: [
              ...contact.instagram.conversations,
              {
                ...contact.instagram.conversations[0],
                id: 'conversation-2',
              },
            ],
          },
        },
        channel: 'INSTAGRAM',
        previousSelection: {
          workspaceId: 'workspace-1',
          contactId: 'contact-1',
          channel: 'EMAIL',
          emailThreadId: 'thread-2',
          instagramConversationId: null,
        },
      }),
    ).toEqual({
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      channel: 'INSTAGRAM',
      emailThreadId: null,
      instagramConversationId: null,
    });
  });

  it('keeps Instagram available for a linked Creator with a username and no chat', () => {
    expect(
      getMyahInboxSelectionForChannel({
        workspaceId: 'workspace-1',
        contact: {
          ...contact,
          latestChannel: 'EMAIL',
          instagram: {
            isAvailable: false,
            state: 'UNAVAILABLE',
            needsAttention: false,
            conversations: [],
          },
        },
        channel: 'INSTAGRAM',
        previousSelection: null,
      }),
    ).toMatchObject({
      channel: 'INSTAGRAM',
      emailThreadId: null,
      instagramConversationId: null,
    });
  });

  it('preserves an exact available Email target when linking regroups the Contact ID', () => {
    expect(
      getMyahInboxRegroupedContactSelection({
        workspaceId: 'workspace-1',
        contact: { ...contact, id: 'creator-contact' },
        previousSelection: {
          workspaceId: 'workspace-1',
          contactId: 'unmatched-contact',
          channel: 'EMAIL',
          emailThreadId: 'thread-1',
          instagramConversationId: null,
        },
      }),
    ).toMatchObject({
      contactId: 'creator-contact',
      channel: 'EMAIL',
      emailThreadId: 'thread-1',
    });
  });

  it('falls back to the only available channel instead of retaining an unavailable one', () => {
    expect(
      getMyahInboxSelectionForChannel({
        workspaceId: 'workspace-1',
        contact: {
          ...contact,
          instagramUsername: null,
          instagram: {
            isAvailable: false,
            state: 'UNAVAILABLE',
            needsAttention: false,
            conversations: [],
          },
        },
        channel: 'INSTAGRAM',
        previousSelection: null,
      }).channel,
    ).toBe('EMAIL');
  });
});
