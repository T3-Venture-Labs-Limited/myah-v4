import {
  MyahInboxReplyActionDefinition,
  MyahInboxReplyUnavailableCode,
} from 'src/engine/core-modules/action-approval/definitions/myah-inbox-reply-action.definition';
import {
  ConnectedAccountProvider,
  MessageChannelType,
} from 'twenty-shared/types';

import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';
import { MyahInboxReplyAuthorityContextService } from 'src/engine/core-modules/action-approval/services/myah-inbox-reply-authority-context.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const initiatorUserWorkspaceId = '00000000-0000-4000-8000-000000000002';
const otherUserWorkspaceId = '00000000-0000-4000-8000-000000000003';
const messageThreadId = '00000000-0000-4000-8000-000000000004';
const parentMessageId = '00000000-0000-4000-8000-000000000005';
const connectedAccountId = '00000000-0000-4000-8000-000000000006';
const messageChannelId = '00000000-0000-4000-8000-000000000007';

type InboxReplyAuthorityOverride = {
  draft?: Partial<{
    id: string;
    subject: string;
    myahReplyDraftBodyMarkdown: string | null;
    myahReplyDraftBodyBlocknote: null;
    myahReplyDraftRevision: number;
  }>;
  parent?: Partial<{
    id: string;
    messageThreadId: string;
    isDraft: boolean;
    receivedAt: Date;
    headerMessageId: string | null;
    messageParticipants: {
      role: string;
      handle: string;
      displayName: string;
    }[];
    messageChannelMessageAssociations: {
      messageChannelId: string;
      direction: string;
      messageExternalId?: string;
      messageThreadExternalId?: string;
    }[];
  }>;
  account?: Partial<{
    id: string;
    workspaceId: string;
    userWorkspaceId: string;
    handle: string;
    handleAliases: string[];
    provider: string;
    archivedAt: Date | null;
    name: string;
  }>;
  channel?: Partial<{
    id: string;
    workspaceId: string;
    connectedAccountId: string;
    handle: string;
    type: string;
    visibility: string;
    isSyncEnabled: boolean;
    syncStatus: string;
  }>;
};

type InboxReplyDraftFixture = Required<
  NonNullable<InboxReplyAuthorityOverride['draft']>
>;
type InboxReplyParentFixture = Required<
  NonNullable<InboxReplyAuthorityOverride['parent']>
>;
type InboxReplyAccountFixture = Required<
  NonNullable<InboxReplyAuthorityOverride['account']>
>;
type InboxReplyChannelFixture = Required<
  NonNullable<InboxReplyAuthorityOverride['channel']>
>;

const metadata = [
  {
    id: '00000000-0000-4000-8000-000000000008',
    workspaceId,
    universalIdentifier: '20202020-849a-4c3e-84f5-a25a7d802271',
  },
  {
    id: '00000000-0000-4000-8000-000000000009',
    workspaceId,
    universalIdentifier: '20202020-3f6b-4425-80ab-e468899ab4b2',
  },
];

const createDefinition = ({
  draft = {
    id: messageThreadId,
    subject: 'Partnership',
    myahReplyDraftBodyMarkdown: 'Thanks for the update',
    myahReplyDraftBodyBlocknote: null,
    myahReplyDraftRevision: 4,
  },
  parent = {
    id: parentMessageId,
    messageThreadId,
    isDraft: false,
    receivedAt: new Date('2026-08-06T12:00:00.000Z'),
    headerMessageId: '<incoming@example.com>',
    messageParticipants: [
      { role: 'FROM', handle: 'creator@example.com', displayName: 'Creator' },
      { role: 'TO', handle: 'team@brand.com', displayName: 'Brand' },
    ],
    messageChannelMessageAssociations: [
      {
        messageChannelId,
        direction: 'INCOMING',
        messageExternalId: 'provider-message-id',
        messageThreadExternalId: 'provider-thread-id',
      },
    ],
  },
  account = {
    id: connectedAccountId,
    workspaceId,
    userWorkspaceId: initiatorUserWorkspaceId,
    handle: 'team@brand.com',
    handleAliases: ['brand-alias@brand.com'],
    provider: 'google',
    archivedAt: null,
    name: 'Brand',
  },
  channel = {
    id: messageChannelId,
    workspaceId,
    connectedAccountId,
    handle: 'team@brand.com',
    type: 'EMAIL',
    visibility: 'SHARE_EVERYTHING',
    isSyncEnabled: true,
    syncStatus: 'ACTIVE',
  },
  managedMailbox = null,
}: {
  draft?: InboxReplyDraftFixture;
  parent?: InboxReplyParentFixture;
  account?: InboxReplyAccountFixture;
  channel?: InboxReplyChannelFixture;
  managedMailbox?: { id: string } | null;
} = {}) => {
  const repositories = {
    messageThread: { findOneBy: jest.fn().mockResolvedValue(draft) },
    message: { find: jest.fn().mockResolvedValue([parent]) },
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation((callback) => callback()),
    getRepository: jest
      .fn()
      .mockImplementation(
        (_workspaceId: string, name: keyof typeof repositories) =>
          repositories[name],
      ),
  };
  const workspaceRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }),
  };
  const objectMetadataRepository = {
    find: jest.fn().mockResolvedValue(metadata),
  };
  const userWorkspaceRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: initiatorUserWorkspaceId,
      workspaceId,
      user: { id: '00000000-0000-4000-8000-000000000010' },
    }),
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      flatWorkspaceMemberMaps: {
        idByUserId: { '00000000-0000-4000-8000-000000000010': 'member-id' },
        byId: { 'member-id': { id: 'member-id' } },
      },
    }),
  };
  const connectedAccountRepository = {
    find: jest.fn().mockResolvedValue([account]),
  };
  const messageChannelRepository = {
    find: jest.fn().mockResolvedValue([channel]),
  };
  const managedEmailCampaignEligibilityService = {
    assertConnectedIdentityEligibleForFollowUp: jest
      .fn()
      .mockResolvedValue(managedMailbox),
    findConnectedIdentity: jest.fn().mockResolvedValue(managedMailbox),
  };
  const Context =
    MyahInboxReplyAuthorityContextService as unknown as new (
      ...args: unknown[]
    ) => MyahInboxReplyAuthorityContextService;
  const Definition = MyahInboxReplyActionDefinition as unknown as new (
    ...args: unknown[]
  ) => MyahInboxReplyActionDefinition;
  const authorityContext = new Context(
    workspaceRepository,
    globalWorkspaceOrmManager,
    objectMetadataRepository,
    userWorkspaceRepository,
    workspaceCacheService,
  );

  return {
    definition: new Definition(
      authorityContext,
      connectedAccountRepository,
      messageChannelRepository,
      managedEmailCampaignEligibilityService,
    ),
    repositories,
    parent,
    account,
    channel,
    managedEmailCampaignEligibilityService,
  };
};

const buildAuthority = (definition: MyahInboxReplyActionDefinition) =>
  definition.buildAuthority({
    workspaceId,
    initiatorUserWorkspaceId,
    messageThreadId,
    expectedDraftRevision: 4,
  });

describe('MyahInboxReplyActionDefinition', () => {
  it('builds one canonical provider-neutral reply authority with exact evidence', async () => {
    const { definition, managedEmailCampaignEligibilityService } =
      createDefinition();

    const authority = await buildAuthority(definition);

    expect(authority.canonicalGraph).toMatchObject({
      messageThreadId,
      draftRevision: 4,
      draftBody: { markdown: 'Thanks for the update', blocknote: null },
      connectedAccountId,
      messageChannelId,
      senderEmail: 'team@brand.com',
      recipientEmail: 'creator@example.com',
      subject: 'Re: Partnership',
      inReplyTo: '<incoming@example.com>',
      parentMessageId,
      providerMessageExternalId: 'provider-message-id',
      providerThreadExternalId: 'provider-thread-id',
      managedMailboxId: null,
    });
    expect(authority.expectedActionBinding).toMatchObject({
      actionName: 'send_inbox_reply',
      actionVersion: 1,
      draftId: messageThreadId,
      threadId: messageThreadId,
      initiatorUserWorkspaceId,
      contentDigest: computeActionContentDigest(
        JSON.stringify(['Re: Partnership', 'Thanks for the update']),
      ),
      recipientFingerprint: computeActionContentDigest(
        JSON.stringify(['creator@example.com']),
      ),
      sendingAccountFingerprint: computeActionContentDigest(
        JSON.stringify([
          null,
          connectedAccountId,
          messageChannelId,
          'team@brand.com',
          'Brand',
        ]),
      ),
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([
          4,
          '<incoming@example.com>',
          messageThreadId,
          'provider-thread-id',
          'provider-message-id',
          connectedAccountId,
          messageChannelId,
          'team@brand.com',
          'Brand',
        ]),
      ),
    });
    expect(authority.expectedActionBinding.evidenceLinks).toEqual([
      {
        objectMetadataId: metadata[0].id,
        recordId: messageThreadId,
        role: 'draft',
      },
      {
        objectMetadataId: metadata[1].id,
        recordId: parentMessageId,
        role: 'thread_parent',
      },
    ]);
    expect(
      managedEmailCampaignEligibilityService.assertConnectedIdentityEligibleForFollowUp,
    ).toHaveBeenCalledWith({
      workspaceId,
      connectedAccountId,
      messageChannelId,
    });
  });

  it('builds the same canonical authority for an active Email Group channel', async () => {
    const canonical = createDefinition();
    const emailGroup = createDefinition({
      account: {
        id: connectedAccountId,
        workspaceId,
        userWorkspaceId: initiatorUserWorkspaceId,
        handle: 'team@brand.com',
        handleAliases: ['brand-alias@brand.com'],
        provider: ConnectedAccountProvider.EMAIL_GROUP,
        archivedAt: null,
        name: 'Brand',
      },
      channel: {
        id: messageChannelId,
        workspaceId,
        connectedAccountId,
        handle: 'team@brand.com',
        type: MessageChannelType.EMAIL_GROUP,
        visibility: 'SHARE_EVERYTHING',
        isSyncEnabled: true,
        syncStatus: 'ACTIVE',
      },
    });

    const canonicalAuthority = await buildAuthority(canonical.definition);
    const emailGroupAuthority = await buildAuthority(emailGroup.definition);
    const { connectedAccount: _canonicalAccount, ...canonicalGraph } =
      canonicalAuthority.canonicalGraph;
    const { connectedAccount: _emailGroupAccount, ...emailGroupGraph } =
      emailGroupAuthority.canonicalGraph;

    expect(emailGroupGraph).toEqual(canonicalGraph);
    expect(emailGroupAuthority.expectedActionBinding).toEqual(
      canonicalAuthority.expectedActionBinding,
    );
    expect(
      emailGroup.managedEmailCampaignEligibilityService
        .assertConnectedIdentityEligibleForFollowUp,
    ).toHaveBeenCalledWith({
      workspaceId,
      connectedAccountId,
      messageChannelId,
    });
  });

  it('preserves saved Markdown whitespace in the canonical graph and fingerprint', async () => {
    const markdown = '  Thanks for the update  \n';
    const { definition } = createDefinition({
      draft: {
        id: messageThreadId,
        subject: 'Partnership',
        myahReplyDraftBodyMarkdown: markdown,
        myahReplyDraftBodyBlocknote: null,
        myahReplyDraftRevision: 4,
      },
    });

    await expect(buildAuthority(definition)).resolves.toMatchObject({
      canonicalGraph: { draftBody: { markdown } },
      expectedActionBinding: {
        contentDigest: computeActionContentDigest(
          JSON.stringify(['Re: Partnership', markdown]),
        ),
      },
    });
  });

  it.each([
    'not-a-message-id',
    '<invalid value@example.com>',
    '<local,@example.com>',
    '<local..part@example.com>',
    '<local@-example.com>',
    '<local@example-.com>',
  ])('rejects malformed parent Message-ID %s', async (headerMessageId) => {
    const { definition } = createDefinition({
      parent: {
        id: parentMessageId,
        messageThreadId,
        isDraft: false,
        receivedAt: new Date(),
        headerMessageId,
        messageParticipants: [
          {
            role: 'FROM',
            handle: 'creator@example.com',
            displayName: 'Creator',
          },
        ],
        messageChannelMessageAssociations: [
          { messageChannelId, direction: 'INCOMING' },
        ],
      },
    });

    await expect(buildAuthority(definition)).rejects.toThrow(
      MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
    );
  });

  it('requires the channel handle to be an account identity but permits an alias', async () => {
    const mismatch = createDefinition({
      channel: {
        id: messageChannelId,
        workspaceId,
        connectedAccountId,
        handle: 'other@brand.com',
        type: 'EMAIL',
        visibility: 'SHARE_EVERYTHING',
        isSyncEnabled: true,
        syncStatus: 'ACTIVE',
      },
    });
    const alias = createDefinition({
      channel: {
        id: messageChannelId,
        workspaceId,
        connectedAccountId,
        handle: 'brand-alias@brand.com',
        type: 'EMAIL',
        visibility: 'SHARE_EVERYTHING',
        isSyncEnabled: true,
        syncStatus: 'ACTIVE',
      },
    });

    await expect(buildAuthority(mismatch.definition)).rejects.toThrow(
      MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
    );
    await expect(buildAuthority(alias.definition)).resolves.toMatchObject({
      canonicalGraph: { senderEmail: 'brand-alias@brand.com' },
    });
  });

  it('allows SHARE_EVERYTHING channels for another workspace user', async () => {
    const { definition } = createDefinition();

    await expect(
      definition.buildAuthority({
        workspaceId,
        initiatorUserWorkspaceId: otherUserWorkspaceId,
        messageThreadId,
        expectedDraftRevision: 4,
      }),
    ).resolves.toBeDefined();
  });

  it('allows a non-shared channel only for its owning userWorkspaceId', async () => {
    const { definition } = createDefinition({
      channel: {
        id: messageChannelId,
        workspaceId,
        connectedAccountId,
        handle: 'team@brand.com',
        type: 'EMAIL',
        visibility: 'METADATA',
        isSyncEnabled: true,
        syncStatus: 'ACTIVE',
      },
    });

    await expect(buildAuthority(definition)).resolves.toBeDefined();
    await expect(
      definition.buildAuthority({
        workspaceId,
        initiatorUserWorkspaceId: otherUserWorkspaceId,
        messageThreadId,
        expectedDraftRevision: 4,
      }),
    ).rejects.toThrow(MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE);
  });

  it.each<[string, InboxReplyAuthorityOverride, MyahInboxReplyUnavailableCode]>(
    [
      [
        'an archived account',
        { account: { archivedAt: new Date() } },
        MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
      ],
      [
        'a disconnected channel',
        { channel: { isSyncEnabled: false } },
        MyahInboxReplyUnavailableCode.RECONNECT_REQUIRED,
      ],
      [
        'a non-email channel',
        { channel: { type: 'SMS' } },
        MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
      ],
      [
        'a missing parent header',
        { parent: { headerMessageId: null } },
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      ],
      [
        'ambiguous channel associations',
        {
          parent: {
            messageChannelMessageAssociations: [
              { messageChannelId, direction: 'INCOMING' },
              { messageChannelId, direction: 'INCOMING' },
            ],
          },
        },
        MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
      ],
      [
        'an ambiguous recipient',
        {
          parent: {
            messageParticipants: [
              { role: 'FROM', handle: 'one@example.com', displayName: 'One' },
              { role: 'FROM', handle: 'two@example.com', displayName: 'Two' },
            ],
          },
        },
        MyahInboxReplyUnavailableCode.RECIPIENT_UNAVAILABLE,
      ],
      [
        'a blank draft',
        { draft: { myahReplyDraftBodyMarkdown: '   ' } },
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      ],
      [
        'a stale draft revision',
        { draft: { myahReplyDraftRevision: 5 } },
        MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE,
      ],
    ],
  )('fails closed for %s', async (_label, override, code) => {
    const setup = createDefinition();
    const draft = {
      id: messageThreadId,
      subject: 'Partnership',
      myahReplyDraftBodyMarkdown: 'Thanks for the update',
      myahReplyDraftBodyBlocknote: null,
      myahReplyDraftRevision: 4,
      ...(override.draft ?? {}),
    };
    const parent = {
      ...setup.parent,
      ...(override.parent ?? {}),
    };
    const account = { ...setup.account, ...(override.account ?? {}) };
    const channel = { ...setup.channel, ...(override.channel ?? {}) };
    const replacement = createDefinition({ draft, parent, account, channel });

    await expect(buildAuthority(replacement.definition)).rejects.toThrow(code);
  });

  it('does not fall back to a different workspace account', async () => {
    const { definition } = createDefinition({
      account: {
        id: '00000000-0000-4000-8000-000000000099',
        workspaceId,
        userWorkspaceId: initiatorUserWorkspaceId,
        handle: 'other@brand.com',
        handleAliases: [],
        provider: 'google',
        archivedAt: null,
        name: 'Other',
      },
    });

    await expect(buildAuthority(definition)).rejects.toThrow(
      MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE,
    );
  });

  it('keeps an existing Re: prefix exactly once', async () => {
    const { definition } = createDefinition({
      draft: {
        id: messageThreadId,
        subject: 'Re: Partnership',
        myahReplyDraftBodyMarkdown: 'Thanks for the update',
        myahReplyDraftBodyBlocknote: null,
        myahReplyDraftRevision: 4,
      },
    });

    await expect(buildAuthority(definition)).resolves.toMatchObject({
      canonicalGraph: { subject: 'Re: Partnership' },
    });
  });

  it('rejects execution authority when immutable source evidence changes', async () => {
    const setup = createDefinition();
    const authority = await buildAuthority(setup.definition);
    setup.parent.headerMessageId = '<changed@example.com>';

    await expect(
      setup.definition.rebuildExecutionAuthority({
        workspaceId,
        binding: authority.expectedActionBinding,
      }),
    ).rejects.toThrow(MyahInboxReplyUnavailableCode.THREAD_UNAVAILABLE);
  });

  it('preserves a managed mailbox identity during provider-free projection', async () => {
    const managedMailbox = { id: '00000000-0000-4000-8000-000000000099' };
    const setup = createDefinition({ managedMailbox });
    const authority = await buildAuthority(setup.definition);

    await expect(
      setup.definition.rebuildProjectionAuthority({
        workspaceId,
        binding: authority.expectedActionBinding,
      }),
    ).resolves.toMatchObject({
      canonicalGraph: { managedMailboxId: managedMailbox.id },
    });
    expect(
      setup.managedEmailCampaignEligibilityService.findConnectedIdentity,
    ).toHaveBeenCalledWith({
      workspaceId,
      connectedAccountId,
      messageChannelId,
    });
  });

  it('does not reject provider-free projection when its managed mailbox changes after acceptance', async () => {
    const setup = createDefinition({
      managedMailbox: { id: '00000000-0000-4000-8000-000000000099' },
    });
    const authority = await buildAuthority(setup.definition);
    setup.managedEmailCampaignEligibilityService.findConnectedIdentity.mockResolvedValue(
      null,
    );

    await expect(
      setup.definition.rebuildProjectionAuthority({
        workspaceId,
        binding: authority.expectedActionBinding,
      }),
    ).resolves.toMatchObject({ canonicalGraph: { managedMailboxId: null } });
  });

  it('keeps projection authority provider-free after mutable eligibility changes', async () => {
    const setup = createDefinition();
    const authority = await buildAuthority(setup.definition);
    setup.account.archivedAt = new Date();
    setup.channel.isSyncEnabled = false;
    setup.channel.syncStatus = 'NOT_SYNCED';
    setup.managedEmailCampaignEligibilityService.assertConnectedIdentityEligibleForFollowUp.mockRejectedValue(
      new Error('Managed mailbox is not eligible for campaign sending'),
    );

    await expect(
      setup.definition.rebuildExecutionAuthority({
        workspaceId,
        binding: authority.expectedActionBinding,
      }),
    ).rejects.toThrow(MyahInboxReplyUnavailableCode.SENDER_UNAVAILABLE);
    await expect(
      setup.definition.rebuildProjectionAuthority({
        workspaceId,
        binding: authority.expectedActionBinding,
      }),
    ).resolves.toMatchObject({ canonicalGraph: authority.canonicalGraph });
  });
});
