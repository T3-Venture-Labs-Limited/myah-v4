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
      .buildInstagramMessageActionAuthority as BuildAuthority;
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

describe('buildInstagramMessageActionAuthority', () => {
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
