import { buildInstagramMessageV3ActionAuthority } from '../instagram-message-action.definition';
import { type BuildInstagramMessageV3ActionAuthorityInput } from '../instagram-message-action.types';
import { computeLogicalActionKey } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';

type AuthorityInput = {
  workspaceId: string;
  initiatorUserWorkspaceId: string;
  threadId: string | null;
  interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT' | null;
  interactionContextId: string | null;
  draft: {
    id: string;
    revision: number;
    body: string;
    kind: 'START_CHAT' | 'REPLY';
    creatorRecordId: string | null;
    recipientUsername: string;
    recipientSourceValues: Array<{ field: string; value: string }>;
    conversationRecordId: string | null;
    providerConversationId: string | null;
    recipientProviderId: string;
  };
  account: {
    bindingId: string;
    workspaceInstagramAccountRecordId: string;
    unipileAccountId: string;
    instagramUserId: string;
  };
  evidenceLinks: Array<{
    objectMetadataId: string;
    recordId: string;
    role: string;
  }>;
};

type BuildAuthority = (input: AuthorityInput) => {
  expectedActionBinding: Record<string, unknown>;
};

const loadBuilder = (): BuildAuthority | undefined => {
  try {
    return require('../instagram-message-action.definition')
      .buildLegacyInstagramMessageActionAuthority as BuildAuthority;
  } catch {
    return undefined;
  }
};

const baseInput = (): AuthorityInput => ({
  workspaceId: '00000000-0000-4000-8000-000000000001',
  initiatorUserWorkspaceId: '00000000-0000-4000-8000-000000000002',
  threadId: null,
  interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT' as const,
  interactionContextId: '00000000-0000-4000-8000-000000000003',
  draft: {
    id: '00000000-0000-4000-8000-000000000003',
    revision: 7,
    body: 'Hello from Myah',
    kind: 'START_CHAT' as const,
    creatorRecordId: '00000000-0000-4000-8000-000000000004',
    recipientUsername: 'creator.name',
    recipientSourceValues: [
      { field: 'instagramUsername', value: '@Creator.Name' },
      { field: 'instagramUrl', value: 'https://instagram.com/creator.name/' },
    ],
    conversationRecordId: null,
    providerConversationId: null,
    recipientProviderId: 'creator.name',
  },
  account: {
    bindingId: '00000000-0000-4000-8000-000000000005',
    workspaceInstagramAccountRecordId: '00000000-0000-4000-8000-000000000006',
    unipileAccountId: 'unipile-account',
    instagramUserId: 'brand-instagram-id',
  },
  evidenceLinks: [
    {
      objectMetadataId: '00000000-0000-4000-8000-000000000007',
      recordId: '00000000-0000-4000-8000-000000000003',
      role: 'INSTAGRAM_MESSAGE_DRAFT',
    },
  ],
});

const build = (input = baseInput()) => {
  const builder = loadBuilder();

  expect(builder).toBeDefined();

  return builder!(input);
};

describe('buildLegacyInstagramMessageActionAuthority', () => {
  it('binds exact direct START_CHAT identity, content, revision, source evidence, account, and recipient', () => {
    expect(build().expectedActionBinding).toMatchObject({
      actionName: 'send_instagram_message',
      actionVersion: 2,
      actionKind: 'START_CHAT',
      draftId: baseInput().draft.id,
      initiatorUserWorkspaceId: baseInput().initiatorUserWorkspaceId,
      threadId: null,
      interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
      interactionContextId: baseInput().draft.id,
      workspaceId: baseInput().workspaceId,
    });
    for (const field of [
      'contentDigest',
      'recipientFingerprint',
      'sendingAccountFingerprint',
      'actionContextFingerprint',
    ]) {
      expect(build().expectedActionBinding[field]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('permits an agent-thread REPLY while requiring null direct context', () => {
    const input = baseInput();
    const replyInput = {
      ...input,
      threadId: '00000000-0000-4000-8000-000000000008',
      interactionContextType: null,
      interactionContextId: null,
      draft: {
        ...input.draft,
        kind: 'REPLY' as const,
        conversationRecordId: '00000000-0000-4000-8000-000000000009',
        providerConversationId: 'provider-chat',
      },
    };

    expect(build(replyInput).expectedActionBinding).toMatchObject({
      actionKind: 'REPLY',
      threadId: replyInput.threadId,
      interactionContextType: null,
      interactionContextId: null,
    });
  });

  it('rejects START_CHAT with a current conversation and REPLY without one', () => {
    const startInput = baseInput();
    expect(() =>
      build({
        ...startInput,
        draft: {
          ...startInput.draft,
          conversationRecordId: '00000000-0000-4000-8000-000000000009',
          providerConversationId: 'provider-chat',
        },
      }),
    ).toThrow('START_CHAT authority cannot target an existing conversation');

    const replyInput = baseInput();
    expect(() =>
      build({
        ...replyInput,
        draft: { ...replyInput.draft, kind: 'REPLY' },
      }),
    ).toThrow('REPLY authority requires one exact active conversation');
  });

  it('rejects a fake or mixed interaction context', () => {
    const input = baseInput();
    expect(() =>
      build({
        ...input,
        interactionContextId: '00000000-0000-4000-8000-000000000099',
      }),
    ).toThrow('Direct Instagram approval context does not match the draft');
    expect(() =>
      build({
        ...input,
        threadId: '00000000-0000-4000-8000-000000000008',
      }),
    ).toThrow('Instagram approval cannot mix thread and direct context');
  });

  it('changes authority fingerprints when revision, source evidence, action kind, recipient, account, or conversation changes', () => {
    const original = build().expectedActionBinding;
    const mutations = [
      (input: AuthorityInput) => ({
        ...input,
        draft: { ...input.draft, revision: 8 },
      }),
      (input: AuthorityInput) => ({
        ...input,
        draft: {
          ...input.draft,
          recipientSourceValues: [
            { field: 'instagramUsername', value: 'creator.name' },
          ],
        },
      }),
      (input: AuthorityInput) => ({
        ...input,
        draft: { ...input.draft, recipientUsername: 'another.creator' },
      }),
      (input: AuthorityInput) => ({
        ...input,
        account: { ...input.account, unipileAccountId: 'another-account' },
      }),
    ];

    for (const mutate of mutations) {
      const changed = build(mutate(baseInput())).expectedActionBinding;
      expect(changed).not.toEqual(original);
    }
  });
});

const composerInputDigest = 'e'.repeat(64);

const buildV3StartInput = (): BuildInstagramMessageV3ActionAuthorityInput => {
  const input = baseInput();

  return {
    ...input,
    interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
    instagramMessageSnapshot: {
      publicIdentifier: input.draft.recipientUsername,
      providerId: input.draft.recipientProviderId,
      providerMessagingId: 'messaging-009',
      creatorRecordId: input.draft.creatorRecordId!,
      accountBindingId: input.account.bindingId,
      instagramAccountRecordId: input.account.workspaceInstagramAccountRecordId,
      unipileAccountId: input.account.unipileAccountId,
      instagramUserId: input.account.instagramUserId,
      recipientSourceValues: input.draft.recipientSourceValues,
      actionKind: 'START_CHAT',
      conversationRecordId: null,
      providerChatId: null,
      attendeeProviderId: null,
    },
    composerInputDigest,
  };
};

describe('buildInstagramMessageV3ActionAuthority', () => {
  it('round-trips complete direct START_CHAT, direct REPLY, and thread REPLY snapshots', () => {
    const startInput = buildV3StartInput();
    const start = buildInstagramMessageV3ActionAuthority(startInput);
    const replyInput: BuildInstagramMessageV3ActionAuthorityInput = {
      ...startInput,
      threadId: '00000000-0000-4000-8000-000000000008',
      interactionContextType: null,
      interactionContextId: null,
      draft: {
        ...startInput.draft,
        kind: 'REPLY',
        conversationRecordId: '00000000-0000-4000-8000-000000000009',
        providerConversationId: 'chat-009',
      },
      instagramMessageSnapshot: {
        ...startInput.instagramMessageSnapshot,
        actionKind: 'REPLY',
        conversationRecordId: '00000000-0000-4000-8000-000000000009',
        providerChatId: 'chat-009',
        attendeeProviderId: 'messaging-009',
      },
      composerInputDigest: null,
    };
    const reply = buildInstagramMessageV3ActionAuthority(replyInput);
    const directReply = buildInstagramMessageV3ActionAuthority({
      ...replyInput,
      threadId: null,
      interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
      interactionContextId: replyInput.draft.id,
    });

    expect(start.expectedActionBinding).toMatchObject({
      actionVersion: 3,
      actionKind: 'START_CHAT',
      composerInputDigest,
      instagramMessageSnapshot: startInput.instagramMessageSnapshot,
    });
    expect(reply.expectedActionBinding).toMatchObject({
      actionVersion: 3,
      actionKind: 'REPLY',
      composerInputDigest: null,
      instagramMessageSnapshot: replyInput.instagramMessageSnapshot,
    });
    expect(directReply.expectedActionBinding).toMatchObject({
      actionVersion: 3,
      actionKind: 'REPLY',
      interactionContextType: 'MYAH_INSTAGRAM_MESSAGE_DRAFT',
      composerInputDigest: null,
      instagramMessageSnapshot: replyInput.instagramMessageSnapshot,
    });
  });

  it.each([
    ['publicIdentifier', 'another.creator'],
    ['providerId', 'another-provider-id'],
    ['providerMessagingId', 'messaging-010'],
    ['creatorRecordId', '00000000-0000-4000-8000-000000000010'],
    ['accountBindingId', '00000000-0000-4000-8000-000000000011'],
    ['instagramAccountRecordId', '00000000-0000-4000-8000-000000000012'],
    ['unipileAccountId', 'another-unipile-account'],
    ['instagramUserId', 'another-instagram-user'],
  ])('binds %s into the v3 logical key', (field, value) => {
    const original =
      buildInstagramMessageV3ActionAuthority(
        buildV3StartInput(),
      ).expectedActionBinding;

    expect(
      computeLogicalActionKey({
        ...original,
        instagramMessageSnapshot: {
          ...original.instagramMessageSnapshot,
          [field]: value,
        },
      }),
    ).not.toBe(computeLogicalActionKey(original));
  });

  it('binds source values, route targets, and composer input into the v3 logical key', () => {
    const start =
      buildInstagramMessageV3ActionAuthority(
        buildV3StartInput(),
      ).expectedActionBinding;
    const reply = buildInstagramMessageV3ActionAuthority({
      ...buildV3StartInput(),
      threadId: '00000000-0000-4000-8000-000000000008',
      interactionContextType: null,
      interactionContextId: null,
      draft: {
        ...buildV3StartInput().draft,
        kind: 'REPLY',
        conversationRecordId: '00000000-0000-4000-8000-000000000009',
        providerConversationId: 'chat-009',
      },
      instagramMessageSnapshot: {
        ...buildV3StartInput().instagramMessageSnapshot,
        actionKind: 'REPLY',
        conversationRecordId: '00000000-0000-4000-8000-000000000009',
        providerChatId: 'chat-009',
        attendeeProviderId: 'messaging-009',
      },
      composerInputDigest: null,
    }).expectedActionBinding;

    expect(
      computeLogicalActionKey({
        ...start,
        composerInputDigest: 'f'.repeat(64),
      }),
    ).not.toBe(computeLogicalActionKey(start));
    expect(
      computeLogicalActionKey({
        ...start,
        instagramMessageSnapshot: {
          ...start.instagramMessageSnapshot,
          recipientSourceValues: [
            { field: 'instagramUsername', value: 'creator.name' },
          ],
        },
      }),
    ).not.toBe(computeLogicalActionKey(start));
    expect(computeLogicalActionKey(reply)).not.toBe(
      computeLogicalActionKey(start),
    );
  });

  it.each([
    '@creator',
    'creator name',
    '.creator',
    'creator.',
    'creator..name',
    'a'.repeat(31),
  ])('rejects a non-canonical snapshot handle: %s', (publicIdentifier) => {
    const input = buildV3StartInput();

    expect(() =>
      buildInstagramMessageV3ActionAuthority({
        ...input,
        draft: { ...input.draft, recipientUsername: publicIdentifier },
        instagramMessageSnapshot: {
          ...input.instagramMessageSnapshot,
          publicIdentifier,
        },
      }),
    ).toThrow('Instagram message identity snapshot is unavailable');
  });

  it('rejects missing snapshot fields, historical v2 context, mixed contexts, and thread START_CHAT', () => {
    const input = buildV3StartInput();
    expect(() =>
      buildInstagramMessageV3ActionAuthority({
        ...input,
        instagramMessageSnapshot: {
          ...input.instagramMessageSnapshot,
          providerMessagingId: '',
        },
      }),
    ).toThrow('Instagram message identity snapshot is unavailable');
    expect(() =>
      buildInstagramMessageV3ActionAuthority({
        ...input,
        interactionContextType: 'MYAH_INBOX_INSTAGRAM_DRAFT',
      }),
    ).toThrow('Direct Instagram approval context does not match the draft');
    expect(() =>
      buildInstagramMessageV3ActionAuthority({
        ...input,
        threadId: '00000000-0000-4000-8000-000000000008',
      }),
    ).toThrow('Instagram approval cannot mix thread and direct context');
    expect(() =>
      buildInstagramMessageV3ActionAuthority({
        ...input,
        threadId: '00000000-0000-4000-8000-000000000008',
        interactionContextType: null,
        interactionContextId: null,
        composerInputDigest: null,
      }),
    ).toThrow('START_CHAT is not available to agent threads');
  });
});
