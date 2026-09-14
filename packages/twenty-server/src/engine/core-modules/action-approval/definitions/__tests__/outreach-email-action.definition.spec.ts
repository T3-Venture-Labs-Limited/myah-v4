import {
  ConnectedAccountProvider,
  MessageChannelType,
} from 'twenty-shared/types';

import {
  OutreachEmailActionDefinition,
  OutreachEmailActionProposalInputZodSchema,
} from 'src/engine/core-modules/action-approval/definitions/outreach-email-action.definition';
import { computeActionContentDigest } from 'src/engine/core-modules/action-approval/utils/action-binding-digest.util';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const userWorkspaceId = '00000000-0000-4000-8000-000000000002';
const threadId = '00000000-0000-4000-8000-000000000003';
const outreachActionId = '00000000-0000-4000-8000-000000000004';
const campaignCreatorId = '00000000-0000-4000-8000-000000000005';
const creatorId = '00000000-0000-4000-8000-000000000006';
const campaignId = '00000000-0000-4000-8000-000000000007';
const connectedAccountId = '00000000-0000-4000-8000-000000000008';
const messageChannelId = '00000000-0000-4000-8000-000000000009';
const parentMessageId = '00000000-0000-4000-8000-000000000010';
const messageThreadId = '00000000-0000-4000-8000-000000000011';
const otherWorkspaceId = '00000000-0000-4000-8000-000000000012';
const managedMailboxId = '00000000-0000-4000-8000-000000000013';
const campaignAccountId = '00000000-0000-4000-8000-000000000014';

const metadataIds = {
  outreachAction: '00000000-0000-4000-8000-000000000101',
  campaignCreator: '00000000-0000-4000-8000-000000000102',
  creator: '00000000-0000-4000-8000-000000000103',
  campaign: '00000000-0000-4000-8000-000000000104',
  message: '00000000-0000-4000-8000-000000000105',
  campaignAccount: '00000000-0000-4000-8000-000000000106',
};

const universalIdentifiers = {
  outreachAction: 'b4459926-2c01-560a-8432-fa1974168439',
  campaignCreator: 'f9f0d7a8-7e05-519b-b158-5f543f7a7e9a',
  creator: '5ca82f72-9778-4ae1-8a8e-9b762c4ce0de',
  campaign: '9a09d54a-d464-5692-ac74-70527fb00ddd',
  message: '20202020-3f6b-4425-80ab-e468899ab4b2',
  campaignAccount: '5999e4dd-01a4-5ef5-8c95-754bf079defb',
};

type FixtureState = {
  action: {
    id: string;
    name: string;
    campaignCreatorId: string;
    channel: string;
    status: string;
    subject: string;
    body: string;
    contentDigest: string;
    recipientEmail: string;
    campaignAccountId: string | null;
    connectedAccountId: string;
    messageChannelId: string;
    senderEmail: string;
    senderDisplayName: string | null;
    approvalBindingId: string | null;
    executionReceiptId: string | null;
    providerDraftExternalId: string;
    sentHeaderMessageId: string | null;
    providerMessageExternalId: string | null;
    providerThreadExternalId: string | null;
    messageId: string | null;
    messageThreadId: string | null;
    inReplyTo: string | null;
    completedAt: Date | null;
  };
  campaignCreator: {
    id: string;
    creatorId: string;
    campaignId: string;
    selectedContactMethod: string;
    assignedManagedMailboxId: string | null;
  };
  creator: { id: string; name: string; email: string };
  campaign: { id: string; name: string };
  connectedAccount: {
    id: string;
    workspaceId: string;
    provider: ConnectedAccountProvider;
    handle: string;
    name: string;
    archivedAt: Date | null;
  };
  messageChannel: {
    id: string;
    workspaceId: string;
    connectedAccountId: string;
    handle: string;
  };
  parentMessage: {
    id: string;
    headerMessageId: string;
    messageThreadId: string;
  };
  parentAssociation: {
    messageId: string;
    messageChannelId: string;
    messageThreadExternalId: string;
  };
};

const createFixtureState = (reply = false): FixtureState => {
  const subject = 'Partnership opportunity';
  const body = 'Would you like to collaborate?';

  return {
    action: {
      id: outreachActionId,
      name: 'Launch Campaign: Creator Name',
      campaignCreatorId,
      channel: 'EMAIL',
      status: 'PENDING',
      subject,
      body,
      contentDigest: computeActionContentDigest(
        JSON.stringify([subject, body]),
      ),
      recipientEmail: 'creator@example.com',
      campaignAccountId: null,
      connectedAccountId,
      messageChannelId,
      senderEmail: 'sender@example.com',
      senderDisplayName: 'Sender Name',
      approvalBindingId: null,
      executionReceiptId: null,
      providerDraftExternalId: 'provider-draft-id',
      sentHeaderMessageId: null,
      providerMessageExternalId: null,
      providerThreadExternalId: reply ? 'provider-thread-id' : null,
      messageId: null,
      messageThreadId: reply ? messageThreadId : null,
      inReplyTo: reply ? '<parent@example.com>' : null,
      completedAt: null,
    },
    campaignCreator: {
      id: campaignCreatorId,
      creatorId,
      campaignId,
      selectedContactMethod: 'EMAIL',
      assignedManagedMailboxId: managedMailboxId,
    },
    creator: {
      id: creatorId,
      name: 'Creator Name',
      email: 'creator@example.com',
    },
    campaign: {
      id: campaignId,
      name: 'Launch Campaign',
    },
    connectedAccount: {
      id: connectedAccountId,
      workspaceId,
      provider: ConnectedAccountProvider.GOOGLE,
      handle: 'sender@example.com',
      name: 'Sender Name',
      archivedAt: null,
    },
    messageChannel: {
      id: messageChannelId,
      workspaceId,
      connectedAccountId,
      handle: 'sender@example.com',
    },
    parentMessage: {
      id: parentMessageId,
      headerMessageId: '<parent@example.com>',
      messageThreadId,
    },
    parentAssociation: {
      messageId: parentMessageId,
      messageChannelId,
      messageThreadExternalId: 'provider-thread-id',
    },
  };
};

const buildDefinition = ({
  state = createFixtureState(),
  metadataWorkspaceId = workspaceId,
  updateAffected = 1,
}: {
  state?: FixtureState;
  metadataWorkspaceId?: string;
  updateAffected?: number;
} = {}) => {
  const repositories = {
    outreachAction: {
      findOneBy: jest.fn(async () => ({ ...state.action })),
      update: jest.fn().mockResolvedValue({ affected: updateAffected }),
    },
    campaignCreator: {
      findOneBy: jest.fn(async () => ({ ...state.campaignCreator })),
    },
    creator: {
      findOneBy: jest.fn(async () => ({ ...state.creator })),
    },
    campaign: {
      findOneBy: jest.fn(async () => ({ ...state.campaign })),
    },
    message: {
      find: jest.fn(async () =>
        state.action.inReplyTo ? [{ ...state.parentMessage }] : [],
      ),
    },
    messageChannelMessageAssociation: {
      find: jest.fn(async () =>
        state.action.inReplyTo ? [{ ...state.parentAssociation }] : [],
      ),
    },
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
      callback(),
    ),
    getRepository: jest.fn(
      async (_workspaceId: string, objectName: keyof typeof repositories) =>
        repositories[objectName],
    ),
    getGlobalWorkspaceDataSource: jest.fn().mockResolvedValue({
      query: jest.fn(async () => [
        {
          assignedManagedMailboxId:
            state.campaignCreator.assignedManagedMailboxId,
        },
      ]),
    }),
  };
  const workspaceRepository = {
    findOneBy: jest.fn().mockResolvedValue({ id: workspaceId }),
  };
  const objectMetadataRepository = {
    find: jest.fn().mockResolvedValue(
      Object.entries(universalIdentifiers).map(
        ([name, universalIdentifier]) => ({
          id: metadataIds[name as keyof typeof metadataIds],
          workspaceId: metadataWorkspaceId,
          universalIdentifier,
        }),
      ),
    ),
  };
  const userWorkspaceRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: userWorkspaceId,
      workspaceId,
      user: { id: 'user-id' },
    }),
  };
  const workspaceCacheService = {
    getOrRecompute: jest.fn().mockResolvedValue({
      flatWorkspaceMemberMaps: {
        idByUserId: { 'user-id': 'workspace-member-id' },
        byId: { 'workspace-member-id': { id: 'workspace-member-id' } },
      },
      userWorkspaceRoleMap: { [userWorkspaceId]: 'role-id' },
      apiKeyRoleMap: {},
    }),
  };
  const connectedAccountRepository = {
    findOne: jest.fn(async () => ({ ...state.connectedAccount })),
  };
  const messageChannelRepository = {
    find: jest.fn(async () => [{ ...state.messageChannel }]),
  };
  const assertEligible = jest.fn().mockResolvedValue({
    id: managedMailboxId,
    connectedAccountId,
    messageChannelId,
    effectiveDailyCap: 10,
  });
  const resolveDefaultEmailAccount = jest.fn().mockResolvedValue({
    id: campaignAccountId,
    connectedAccountId,
    messageChannelId,
    senderEmail: 'sender@example.com',
    senderDisplayName: 'Sender Name',
    health: 'AVAILABLE',
    isDefault: true,
  });
  const assertConnectedAccountSendable = jest.fn().mockResolvedValue(undefined);
  const Definition = OutreachEmailActionDefinition as unknown as new (
    ...args: unknown[]
  ) => OutreachEmailActionDefinition;

  return {
    state,
    repositories,
    globalWorkspaceOrmManager,
    objectMetadataRepository,
    connectedAccountRepository,
    messageChannelRepository,
    assertEligible,
    resolveDefaultEmailAccount,
    assertConnectedAccountSendable,
    definition: new Definition(
      workspaceRepository,
      globalWorkspaceOrmManager,
      objectMetadataRepository,
      userWorkspaceRepository,
      workspaceCacheService,
      connectedAccountRepository,
      messageChannelRepository,
      { assertEligible },
      { resolveDefaultEmailAccount },
      { assertConnectedAccountSendable },
    ),
  };
};

const propose = (definition: OutreachEmailActionDefinition) =>
  definition.propose({
    workspaceId,
    initiatorUserWorkspaceId: userWorkspaceId,
    threadId,
    input: { outreachActionId },
  });

describe('OutreachEmailActionDefinition', () => {
  it('accepts only one Outreach Action UUID as proposal input', () => {
    expect(
      OutreachEmailActionProposalInputZodSchema.parse({ outreachActionId }),
    ).toEqual({ outreachActionId });
    expect(() =>
      OutreachEmailActionProposalInputZodSchema.parse({
        outreachActionId,
        recipientEmail: 'other@example.com',
      }),
    ).toThrow();
    expect(() =>
      OutreachEmailActionProposalInputZodSchema.parse({
        outreachActionId,
        connectedAccountId,
      }),
    ).toThrow();
  });

  it('derives exact preview, immutable fingerprints, and canonical evidence', async () => {
    const { definition, globalWorkspaceOrmManager, objectMetadataRepository } =
      buildDefinition();
    const proposal = await propose(definition);
    const expectedContentDigest = computeActionContentDigest(
      JSON.stringify([
        'Partnership opportunity',
        'Would you like to collaborate?',
      ]),
    );

    expect(proposal).toMatchObject({
      proposal: {
        title: 'Partnership opportunity',
        preview: {
          format: 'text',
          content:
            'From: sender@example.com\nTo: Creator Name <creator@example.com>\nSubject: Partnership opportunity\n\nWould you like to collaborate?',
        },
        targetLabel: 'Creator Name <creator@example.com>',
      },
      expectedActionBinding: {
        workspaceId,
        actionName: 'send_outreach_email',
        actionVersion: 1,
        draftId: outreachActionId,
        contentDigest: expectedContentDigest,
        recipientFingerprint: computeActionContentDigest(
          JSON.stringify(['creator@example.com']),
        ),
        sendingAccountFingerprint: computeActionContentDigest(
          JSON.stringify([
            managedMailboxId,
            null,
            connectedAccountId,
            messageChannelId,
            'sender@example.com',
            'Sender Name',
          ]),
        ),
        actionContextFingerprint: computeActionContentDigest(
          JSON.stringify(['provider-draft-id', null, null, null]),
        ),
        threadId,
        initiatorUserWorkspaceId: userWorkspaceId,
        evidenceLinks: [
          {
            objectMetadataId: metadataIds.outreachAction,
            recordId: outreachActionId,
            role: 'draft',
          },
          {
            objectMetadataId: metadataIds.campaignCreator,
            recordId: campaignCreatorId,
            role: 'campaign_creator',
          },
          {
            objectMetadataId: metadataIds.creator,
            recordId: creatorId,
            role: 'recipient',
          },
          {
            objectMetadataId: metadataIds.campaign,
            recordId: campaignId,
            role: 'campaign',
          },
        ],
      },
      canonicalGraph: {
        managedMailboxId,
        outreachActionId,
        subject: 'Partnership opportunity',
        body: 'Would you like to collaborate?',
        recipientEmail: 'creator@example.com',
        providerDraftExternalId: 'provider-draft-id',
      },
    });
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'outreachAction',
      { intersectionOf: ['role-id'] },
    );
    expect(objectMetadataRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId }),
      }),
    );
  });

  it('binds a linked default Campaign account with null managed identity and exact evidence', async () => {
    const state = createFixtureState();
    state.campaignCreator.assignedManagedMailboxId = null as never;
    state.action.campaignAccountId = campaignAccountId;
    const { definition, assertEligible, resolveDefaultEmailAccount } =
      buildDefinition({ state });

    const proposal = await propose(definition);

    expect(proposal.canonicalGraph).toMatchObject({
      managedMailboxId: null,
      campaignAccountId,
    });
    expect(proposal.expectedActionBinding.sendingAccountFingerprint).toBe(
      computeActionContentDigest(
        JSON.stringify([
          null,
          campaignAccountId,
          connectedAccountId,
          messageChannelId,
          'sender@example.com',
          'Sender Name',
        ]),
      ),
    );
    expect(proposal.expectedActionBinding.evidenceLinks).toContainEqual({
      objectMetadataId: metadataIds.campaignAccount,
      recordId: campaignAccountId,
      role: 'campaign_account',
    });
    expect(assertEligible).not.toHaveBeenCalled();
    expect(resolveDefaultEmailAccount).toHaveBeenCalledWith(
      campaignId,
      workspaceId,
    );
  });

  it('rebuilds linked sender authority and transport sendability immediately before execution', async () => {
    const state = createFixtureState();
    state.campaignCreator.assignedManagedMailboxId = null;
    state.action.campaignAccountId = campaignAccountId;
    const {
      definition,
      assertEligible,
      resolveDefaultEmailAccount,
      assertConnectedAccountSendable,
    } = buildDefinition({ state });
    const proposal = await propose(definition);

    await expect(
      definition.rebuildExecutionAuthority({
        workspaceId,
        binding: proposal.expectedActionBinding,
      }),
    ).resolves.toBeDefined();

    expect(assertEligible).not.toHaveBeenCalled();
    expect(resolveDefaultEmailAccount).toHaveBeenCalledTimes(2);
    expect(assertConnectedAccountSendable).toHaveBeenCalledWith(
      expect.objectContaining({ id: connectedAccountId }),
    );
  });

  it('rejects execution when a second matching EMAIL channel appears after approval', async () => {
    const state = createFixtureState();
    state.campaignCreator.assignedManagedMailboxId = null;
    state.action.campaignAccountId = campaignAccountId;
    const {
      definition,
      messageChannelRepository,
      assertConnectedAccountSendable,
    } = buildDefinition({ state });
    const proposal = await propose(definition);
    messageChannelRepository.find.mockResolvedValue([
      state.messageChannel,
      { ...state.messageChannel, id: otherWorkspaceId },
    ]);
    const transportCallsBeforeRebuild =
      assertConnectedAccountSendable.mock.calls.length;

    await expect(
      definition.rebuildExecutionAuthority({
        workspaceId,
        binding: proposal.expectedActionBinding,
      }),
    ).rejects.toThrow('Outreach email source graph is unavailable');
    expect(assertConnectedAccountSendable).toHaveBeenCalledTimes(
      transportCallsBeforeRebuild,
    );
    expect(messageChannelRepository.find).toHaveBeenLastCalledWith({
      where: {
        workspaceId,
        connectedAccountId,
        handle: 'sender@example.com',
        type: MessageChannelType.EMAIL,
      },
      take: 2,
    });
  });

  it('rejects linked execution when transport sendability changes', async () => {
    const state = createFixtureState();
    state.campaignCreator.assignedManagedMailboxId = null;
    state.action.campaignAccountId = campaignAccountId;
    const { definition, assertConnectedAccountSendable } = buildDefinition({
      state,
    });
    const proposal = await propose(definition);
    assertConnectedAccountSendable.mockRejectedValueOnce(
      new Error('Transport sendability rejected'),
    );

    await expect(
      definition.rebuildExecutionAuthority({
        workspaceId,
        binding: proposal.expectedActionBinding,
      }),
    ).rejects.toThrow('Transport sendability rejected');
  });

  it.each([
    ['default changed', { id: otherWorkspaceId }],
    ['default no longer active', { isDefault: false }],
    ['linked account changed', { connectedAccountId: otherWorkspaceId }],
    ['linked channel changed', { messageChannelId: otherWorkspaceId }],
    ['linked sender changed', { senderEmail: 'other@example.com' }],
    ['linked health changed', { health: 'UNAVAILABLE' }],
  ])('rejects rebuild when %s', async (_label, changedDefault) => {
    const state = createFixtureState();
    state.campaignCreator.assignedManagedMailboxId = null;
    state.action.campaignAccountId = campaignAccountId;
    const { definition, resolveDefaultEmailAccount } = buildDefinition({
      state,
    });
    const proposal = await propose(definition);
    resolveDefaultEmailAccount.mockResolvedValue(changedDefault);

    await expect(
      definition.rebuildExecutionAuthority({
        workspaceId,
        binding: proposal.expectedActionBinding,
      }),
    ).rejects.toThrow('Outreach email source graph is unavailable');
  });

  it.each([
    ['removed', new Error('Campaign has no unambiguous default email account')],
    [
      'authentication failed',
      new Error('Campaign default email account is unavailable'),
    ],
    ['sendability failed', new Error('Transport sendability rejected')],
  ])('rejects linked send when the default is %s', async (_label, error) => {
    const state = createFixtureState();
    state.campaignCreator.assignedManagedMailboxId = null;
    state.action.campaignAccountId = campaignAccountId;
    const { definition, resolveDefaultEmailAccount } = buildDefinition({
      state,
    });
    const proposal = await propose(definition);
    resolveDefaultEmailAccount.mockRejectedValue(error);

    await expect(
      definition.rebuildExecutionAuthority({
        workspaceId,
        binding: proposal.expectedActionBinding,
      }),
    ).rejects.toThrow('Outreach email source graph is unavailable');
  });

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace', '   '],
    ['invalid', 'malformed'],
  ])(
    'rejects post-approval %s managed mailbox assignment before transport',
    async (_label, assignedManagedMailboxId) => {
      const state = createFixtureState();
      state.campaignCreator.assignedManagedMailboxId = null;
      state.action.campaignAccountId = campaignAccountId;
      const { definition, assertConnectedAccountSendable } = buildDefinition({
        state,
      });
      const proposal = await propose(definition);
      const transportCallsBeforeMutation =
        assertConnectedAccountSendable.mock.calls.length;
      state.campaignCreator.assignedManagedMailboxId =
        assignedManagedMailboxId as never;

      await expect(
        definition.rebuildExecutionAuthority({
          workspaceId,
          binding: proposal.expectedActionBinding,
        }),
      ).rejects.toThrow('Outreach email source graph is unavailable');
      expect(assertConnectedAccountSendable).toHaveBeenCalledTimes(
        transportCallsBeforeMutation,
      );
    },
  );

  it.each<[string, (state: FixtureState) => void]>([
    [
      'malformed managed mailbox ID',
      (state) => (state.campaignCreator.assignedManagedMailboxId = 'malformed'),
    ],
    [
      'missing linked account ID',
      (state) => {
        state.campaignCreator.assignedManagedMailboxId = null;
        state.action.campaignAccountId = null;
      },
    ],
    [
      'malformed linked account ID',
      (state) => {
        state.campaignCreator.assignedManagedMailboxId = null;
        state.action.campaignAccountId = 'malformed';
      },
    ],
  ])('fails closed for %s', async (_label, mutate) => {
    const state = createFixtureState();
    mutate(state);
    const { definition } = buildDefinition({ state });

    await expect(propose(definition)).rejects.toThrow(
      'Outreach email source graph is unavailable',
    );
  });

  it('adds exact parent Message evidence and thread context only for replies', async () => {
    const state = createFixtureState(true);
    const { definition, repositories } = buildDefinition({ state });
    const proposal = await propose(definition);

    expect(proposal.expectedActionBinding).toMatchObject({
      actionContextFingerprint: computeActionContentDigest(
        JSON.stringify([
          'provider-draft-id',
          '<parent@example.com>',
          messageThreadId,
          'provider-thread-id',
        ]),
      ),
      evidenceLinks: expect.arrayContaining([
        {
          objectMetadataId: metadataIds.message,
          recordId: parentMessageId,
          role: 'thread_parent',
        },
      ]),
    });
    expect(proposal.expectedActionBinding.evidenceLinks).toHaveLength(5);
    expect(repositories.message.find).toHaveBeenCalledWith({
      where: {
        headerMessageId: '<parent@example.com>',
        messageThreadId,
      },
      take: 2,
    });
    expect(
      repositories.messageChannelMessageAssociation.find,
    ).toHaveBeenCalledWith({
      where: {
        messageId: parentMessageId,
        messageChannelId,
        messageThreadExternalId: 'provider-thread-id',
      },
      take: 2,
    });
  });

  it('returns an exact preview only while the canonical graph matches', async () => {
    const { definition } = buildDefinition();
    const proposal = await propose(definition);
    const binding = {
      ...proposal.expectedActionBinding,
      state: 'PENDING',
      expiresAt: new Date('2026-07-27T10:30:00.000Z'),
      createdAt: new Date('2026-07-27T10:00:00.000Z'),
      decidedAt: null,
    };

    await expect(
      definition.getProposal({ workspaceId, binding: binding as never }),
    ).resolves.toEqual({
      action: 'send_outreach_email',
      actionVersion: 1,
      subject: 'Partnership opportunity',
      body: 'Would you like to collaborate?',
      recipientLabel: 'Creator Name',
      recipientEmail: 'creator@example.com',
      senderEmail: 'sender@example.com',
      state: 'PENDING',
      expiresAt: binding.expiresAt,
      occurredAt: binding.createdAt,
      evidenceLinks: binding.evidenceLinks,
    });

    await expect(
      definition.getProposal({
        workspaceId,
        binding: { ...binding, contentDigest: 'changed' } as never,
      }),
    ).rejects.toThrow('Outreach email source graph is unavailable');
  });

  it.each<[string, (state: FixtureState) => void]>([
    ['subject', (state) => (state.action.subject = 'Edited subject')],
    ['status', (state) => (state.action.status = 'DRAFT')],
    ['body', (state) => (state.action.body = 'Edited body')],
    [
      'recipient',
      (state) => (state.action.recipientEmail = 'other@example.com'),
    ],
    [
      'connected account',
      (state) => (state.action.connectedAccountId = otherWorkspaceId),
    ],
    [
      'message channel',
      (state) => (state.action.messageChannelId = otherWorkspaceId),
    ],
    ['sender', (state) => (state.action.senderEmail = 'other@example.com')],
    [
      'sender display name',
      (state) => (state.action.senderDisplayName = 'Changed Sender'),
    ],
    ['parent', (state) => (state.action.inReplyTo = '<other@example.com>')],
    [
      'workspace message thread',
      (state) => (state.action.messageThreadId = messageThreadId),
    ],
    [
      'provider thread',
      (state) => (state.action.providerThreadExternalId = 'other-thread-id'),
    ],
    [
      'provider draft',
      (state) => (state.action.providerDraftExternalId = 'other-draft-id'),
    ],
  ])('rejects rebuild when %s changes', async (_label, mutate) => {
    const { definition, state } = buildDefinition();
    const proposal = await propose(definition);

    mutate(state);

    await expect(
      definition.rebuildExecutionAuthority({
        workspaceId,
        binding: proposal.expectedActionBinding,
      }),
    ).rejects.toThrow('Outreach email source graph is unavailable');
  });

  it('rechecks the approved managed mailbox immediately before execution', async () => {
    const { definition, assertEligible } = buildDefinition();
    const proposal = await propose(definition);

    expect(assertEligible).not.toHaveBeenCalled();

    await expect(
      definition.rebuildExecutionAuthority({
        workspaceId,
        binding: proposal.expectedActionBinding,
      }),
    ).resolves.toBeDefined();
    expect(assertEligible).toHaveBeenCalledWith({
      workspaceId,
      managedMailboxId,
      connectedAccountId,
      messageChannelId,
      isFollowUp: false,
    });

    assertEligible.mockRejectedValueOnce(
      new Error('Managed mailbox is not eligible for campaign sending'),
    );

    await expect(
      definition.rebuildExecutionAuthority({
        workspaceId,
        binding: proposal.expectedActionBinding,
      }),
    ).rejects.toThrow('Managed mailbox is not eligible for campaign sending');
  });

  it.each<[string, (state: FixtureState) => void]>([
    [
      'connected account',
      (state) => (state.connectedAccount.id = otherWorkspaceId),
    ],
    [
      'message channel',
      (state) => (state.messageChannel.id = otherWorkspaceId),
    ],
    [
      'sender',
      (state) => (state.connectedAccount.handle = 'other@example.com'),
    ],
    [
      'sender display name',
      (state) => (state.connectedAccount.name = 'Changed Sender'),
    ],
    [
      'parent Message',
      (state) => (state.parentMessage.headerMessageId = '<other@example.com>'),
    ],
  ])(
    'rejects an existing thread with a different %s',
    async (_label, mutate) => {
      const state = createFixtureState(true);
      const { definition } = buildDefinition({ state });
      const proposal = await propose(definition);

      mutate(state);

      await expect(
        definition.rebuildExecutionAuthority({
          workspaceId,
          binding: proposal.expectedActionBinding,
        }),
      ).rejects.toThrow('Outreach email source graph is unavailable');
    },
  );

  it('records the approval binding on the unchanged PENDING action', async () => {
    const { definition, repositories } = buildDefinition();
    const proposal = await propose(definition);
    const approvalBindingId = '00000000-0000-4000-8000-000000000013';

    await expect(
      definition.recordApprovalBinding({
        expectedActionBinding: proposal.expectedActionBinding,
        approvalBindingId,
      }),
    ).resolves.toBeUndefined();
    expect(repositories.outreachAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: outreachActionId,
        status: 'PENDING',
        contentDigest: proposal.expectedActionBinding.contentDigest,
        connectedAccountId,
        messageChannelId,
        senderEmail: 'sender@example.com',
      }),
      { approvalBindingId },
    );
  });

  it('rejects approval binding projection when the action changed', async () => {
    const { definition } = buildDefinition({ updateAffected: 0 });
    const proposal = await propose(definition);

    await expect(
      definition.recordApprovalBinding({
        expectedActionBinding: proposal.expectedActionBinding,
        approvalBindingId: '00000000-0000-4000-8000-000000000013',
      }),
    ).rejects.toThrow('Outreach email source graph is unavailable');
  });

  it('rejects metadata from another workspace', async () => {
    const { definition } = buildDefinition({
      metadataWorkspaceId: otherWorkspaceId,
    });

    await expect(propose(definition)).rejects.toThrow(
      'Outreach email source graph is unavailable',
    );
  });
});
