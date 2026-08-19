import { EntityPropertyNotFoundError } from 'typeorm/error/EntityPropertyNotFoundError';
import { MessageParticipantRole } from 'twenty-shared/types';

import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/metadata-modules/permissions/permissions.exception';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { MyahInboxReplyBriefingService } from 'src/engine/core-modules/myah-inbox/services/myah-inbox-reply-briefing.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const workspaceMemberId = '20202020-0b5c-4178-bed7-d371f6411eaa';
const userWorkspaceId = '20202020-1234-5678-9012-345678901234';
const threadId = '20202020-0b5c-4178-bed7-d371f6411ea1';
const campaignId = '20202020-0b5c-4178-bed7-d371f6411ea2';
const creatorId = '20202020-0b5c-4178-bed7-d371f6411ea3';
const rolePermissionConfig = { unionOf: ['role-id'] };
const workspace = { id: workspaceId } as WorkspaceEntity;
const userAuthContext = {
  type: 'user',
  workspace,
  userWorkspaceId,
  user: { id: 'user-id' },
  workspaceMemberId,
  workspaceMember: { id: workspaceMemberId },
} as unknown as UserWorkspaceAuthContext;

jest.mock(
  'src/engine/twenty-orm/storage/orm-workspace-context.storage',
  () => ({
    getWorkspaceContext: jest.fn(() => ({
      authContext: userAuthContext,
      userWorkspaceRoleMap: new Map(),
      apiKeyRoleMap: new Map(),
    })),
  }),
);

jest.mock(
  'src/engine/twenty-orm/utils/resolve-role-permission-config.util',
  () => ({
    resolveRolePermissionConfig: jest.fn(() => rolePermissionConfig),
  }),
);

const listInput = () => ({
  authContext: userAuthContext,
  user: userAuthContext.user,
  workspace,
  workspaceMemberId,
});

const linkedThread = {
  id: threadId,
  lastActivityAt: '2026-07-21T09:00:00.000Z',
  subject: 'Partnership',
  creator: { id: creatorId, name: 'Amina Skincare' },
  campaign: { id: campaignId, name: 'Winter launch' },
};

const allowedCampaign = {
  id: campaignId,
  objective: 'Recruit trusted skincare reviewers',
  icpGoal: 'Reach dry-skin shoppers',
  campaignBrief: { markdown: 'Introduce the winter launch.', blocknote: null },
  communicationGuidelines: {
    markdown: 'Warm and evidence-led.',
    blocknote: null,
  },
  replyRules: {
    markdown: 'Never promise a paid deal before approval.',
    blocknote: null,
  },
  escalationBoundaries: {
    markdown: 'Escalate exclusivity requests.',
    blocknote: null,
  },
  additionalNotes: {
    markdown: 'Use the approved product name.',
    blocknote: null,
  },
  status: 'PRIVATE_CAMPAIGN_STATUS_MUST_NOT_LEAK',
};

const allowedCreator = {
  id: creatorId,
  name: 'Amina Skincare',
  language: 'English',
  location: 'London',
  categories: 'Beauty, Skincare',
  niches: 'Dry skin, Sensitive skin',
  email: 'PRIVATE_EMAIL_MUST_NOT_LEAK',
  phone: 'PRIVATE_PHONE_MUST_NOT_LEAK',
  notes: 'PRIVATE_NOTES_MUST_NOT_LEAK',
  instagramBio: 'PRIVATE_INSTAGRAM_BIO_MUST_NOT_LEAK',
  instagramFollowerCount: 999999,
};

const allowedCampaignCreator = {
  stage: 'NEGOTIATING',
  selectedContactMethod: 'EMAIL',
  nextActionAt: new Date('2026-08-30T12:00:00.000Z'),
  selectionReason: 'Strong winter skincare fit.',
  dealSummary: 'Awaiting approval for paid scope.',
  outcomeSummary: 'PRIVATE_OUTCOME_MUST_NOT_LEAK',
};
const unrelatedCampaignCreator = {
  campaignId,
  creatorId: '20202020-0b5c-4178-bed7-d371f6411ea4',
  stage: 'PRIVATE_UNRELATED_CAMPAIGN_CREATOR_MUST_NOT_LEAK',
  selectedContactMethod: 'PRIVATE_UNRELATED_CONTACT_METHOD_MUST_NOT_LEAK',
  nextActionAt: new Date('2026-09-01T12:00:00.000Z'),
  selectionReason: 'PRIVATE_UNRELATED_SELECTION_REASON_MUST_NOT_LEAK',
  dealSummary: 'PRIVATE_UNRELATED_DEAL_SUMMARY_MUST_NOT_LEAK',
};

const historyMessageId = '20202020-0b5c-4178-bed7-d371f6411ea5';

type SenderParticipant = {
  id: string;
  messageId: string;
  personId: string | null;
  displayName: string | null;
  handle: string | null;
};

const senderParticipant: SenderParticipant = {
  id: '20202020-0b5c-4178-bed7-d371f6411ea9',
  messageId: historyMessageId,
  personId: '20202020-0b5c-4178-bed7-d371f6411eab',
  displayName: 'Person 211',
  handle: 'person211@example.com',
};

type SenderPerson = {
  id: string;
  nameFirstName: string | null;
  nameLastName: string | null;
};

const senderPerson: SenderPerson = {
  id: '20202020-0b5c-4178-bed7-d371f6411eab',
  nameFirstName: 'Matthew',
  nameLastName: 'Matthews',
};

const createHistoryQueryBuilder = (
  rows = [
    {
      id: historyMessageId,
      receivedAt: '2026-07-21T09:00:00.000Z',
      direction: 'INCOMING',
      sender: 'creator@example.com',
      subject: 'Partnership',
      text: 'Can we launch Tuesday?',
    },
  ],
) => {
  const historyQueryBuilder = {
    select: jest.fn(),
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    setParameters: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    limit: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };

  for (const method of [
    historyQueryBuilder.select,
    historyQueryBuilder.addSelect,
    historyQueryBuilder.where,
    historyQueryBuilder.andWhere,
    historyQueryBuilder.setParameters,
    historyQueryBuilder.orderBy,
    historyQueryBuilder.addOrderBy,
    historyQueryBuilder.limit,
  ]) {
    method.mockReturnValue(historyQueryBuilder);
  }

  return historyQueryBuilder;
};

const createService = ({
  thread = linkedThread,
  campaign = allowedCampaign,
  creator = allowedCreator,
  campaignCreator = allowedCampaignCreator,
  historyRows,
  senderParticipants = [
    senderParticipant,
    {
      ...senderParticipant,
      id: '20202020-0b5c-4178-bed7-d371f6411eac',
      displayName: 'Later From participant',
    },
  ],
  personRecords = [senderPerson],
  personFindError,
}: {
  thread?: typeof linkedThread;
  campaign?: typeof allowedCampaign | null;
  creator?: typeof allowedCreator | null;
  campaignCreator?: typeof allowedCampaignCreator | null;
  historyRows?: {
    id: string;
    receivedAt: string;
    direction: 'INCOMING' | 'OUTGOING';
    sender: string;
    subject: string;
    text: string;
  }[];
  senderParticipants?: SenderParticipant[];
  personRecords?: SenderPerson[];
  personFindError?: Error;
} = {}) => {
  const historyQueryBuilder = createHistoryQueryBuilder(historyRows);
  const repositories = {
    person: {
      find: personFindError
        ? jest.fn().mockRejectedValue(personFindError)
        : jest.fn().mockResolvedValue(personRecords),
    },
    creator: { findOne: jest.fn().mockResolvedValue(creator) },
    campaign: { findOne: jest.fn().mockResolvedValue(campaign) },
    campaignCreator: {
      findOne: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { campaignId?: string; creatorId?: string } }) =>
            Promise.resolve(
              where.campaignId === campaignId && where.creatorId === creatorId
                ? campaignCreator
                : unrelatedCampaignCreator,
            ),
        ),
    },
    messageParticipant: {
      find: jest.fn().mockResolvedValue(senderParticipants),
    },
    message: {
      createQueryBuilder: jest.fn().mockReturnValue(historyQueryBuilder),
    },
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation((run: () => unknown) => run()),
    getRepository: jest.fn(
      async (_workspaceId: string, objectName: keyof typeof repositories) =>
        repositories[objectName],
    ),
  };
  const service = new MyahInboxReplyBriefingService(
    {
      getThreadSummary: jest.fn().mockResolvedValue(thread),
    } as never,
    globalWorkspaceOrmManager as never,
    {
      buildSqlVisibilityProjection: jest.fn().mockReturnValue({
        expression: 'policy_visibility(message.id)',
        parameters: { messageVisibilityFull: 'FULL' },
      }),
    } as never,
  );

  return {
    globalWorkspaceOrmManager,
    historyQueryBuilder,
    repositories,
    service,
  };
};

describe('MyahInboxReplyBriefingService', () => {
  it('loads only the allowed Campaign, CampaignCreator, and Creator fields', async () => {
    const {
      globalWorkspaceOrmManager,
      historyQueryBuilder,
      repositories,
      service,
    } = createService();

    const briefing = await service.loadReplyBriefing({
      ...listInput(),
      threadId,
    });

    expect(briefing).toEqual({
      thread: {
        ...linkedThread,
        lastMessageSender: 'Matthew Matthews',
      },
      history: [
        {
          receivedAt: '2026-07-21T09:00:00.000Z',
          direction: 'INCOMING',
          sender: 'Matthew Matthews',
          subject: 'Partnership',
          text: 'Can we launch Tuesday?',
        },
      ],
      campaign: {
        objective: 'Recruit trusted skincare reviewers',
        icpGoal: 'Reach dry-skin shoppers',
        agent: {
          campaignBrief: 'Introduce the winter launch.',
          communicationGuidelines: 'Warm and evidence-led.',
          replyRules: 'Never promise a paid deal before approval.',
          escalationBoundaries: 'Escalate exclusivity requests.',
          additionalNotes: 'Use the approved product name.',
        },
      },
      campaignCreator: {
        stage: 'NEGOTIATING',
        selectedContactMethod: 'EMAIL',
        nextActionAt: '2026-08-30T12:00:00.000Z',
        selectionReason: 'Strong winter skincare fit.',
        dealSummary: 'Awaiting approval for paid scope.',
      },
      creator: {
        name: 'Amina Skincare',
        language: 'English',
        location: 'London',
        categories: ['Beauty, Skincare'],
        niches: ['Dry skin, Sensitive skin'],
      },
      replyRecipient: 'Matthew Matthews',
    });
    expect(JSON.stringify(briefing)).not.toContain(
      'PRIVATE_UNRELATED_CAMPAIGN_CREATOR_MUST_NOT_LEAK',
    );
    expect(JSON.stringify(briefing)).not.toContain(
      'PRIVATE_EMAIL_MUST_NOT_LEAK',
    );
    expect(JSON.stringify(briefing)).not.toContain(
      'PRIVATE_CAMPAIGN_STATUS_MUST_NOT_LEAK',
    );
    expect(JSON.stringify(briefing)).not.toContain(
      'PRIVATE_OUTCOME_MUST_NOT_LEAK',
    );
    expect(historyQueryBuilder.andWhere).toHaveBeenCalledWith(
      'policy_visibility(message.id) = :messageVisibilityFull',
    );
    expect(historyQueryBuilder.addSelect).toHaveBeenCalledWith(
      expect.stringContaining(
        'inboxDirectionChannel."visibility" = :messageVisibilityShareEverything',
      ),
      'direction',
    );
    expect(historyQueryBuilder.addSelect).toHaveBeenCalledWith(
      expect.stringContaining(
        '(inboxDirectionConnectedAccount."userWorkspaceId" = :messageVisibilityUserWorkspaceId) DESC',
      ),
      'direction',
    );
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'messageParticipant',
      rolePermissionConfig,
    );
    expect(repositories.messageParticipant.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: MessageParticipantRole.FROM,
        }),
        select: {
          id: true,
          messageId: true,
          personId: true,
          displayName: true,
          handle: true,
        },
        order: { id: 'ASC' },
      }),
    );
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'person',
      rolePermissionConfig,
    );
    expect(repositories.person.find).toHaveBeenCalledWith({
      where: expect.anything(),
      select: { id: true, nameFirstName: true, nameLastName: true },
    });
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'creator',
      rolePermissionConfig,
    );
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'campaign',
      rolePermissionConfig,
    );
    expect(globalWorkspaceOrmManager.getRepository).toHaveBeenCalledWith(
      workspaceId,
      'campaignCreator',
      rolePermissionConfig,
    );
    expect(repositories.campaign.findOne).toHaveBeenCalledWith({
      where: { id: campaignId },
      select: {
        objective: true,
        icpGoal: true,
        campaignBrief: true,
        communicationGuidelines: true,
        replyRules: true,
        escalationBoundaries: true,
        additionalNotes: true,
      },
    });
    expect(repositories.creator.findOne).toHaveBeenCalledWith({
      where: { id: creatorId },
      select: {
        name: true,
        language: true,
        location: true,
        categories: true,
        niches: true,
      },
    });
    expect(repositories.campaignCreator.findOne).toHaveBeenCalledWith({
      where: { campaignId, creatorId },
      select: {
        stage: true,
        selectedContactMethod: true,
        nextActionAt: true,
        selectionReason: true,
        dealSummary: true,
      },
    });
  });

  it('keeps available Campaign context when instructions fields are not provisioned', async () => {
    const { repositories, service } = createService();
    const unavailableInstructionsField = new EntityPropertyNotFoundError(
      'campaignBrief',
      { targetName: 'campaign' } as never,
    );

    repositories.campaign.findOne.mockImplementation(
      ({ select }: { select: Record<string, boolean> }) => {
        const fields = Object.keys(select);
        const hasInstructionsField = fields.some((field) =>
          [
            'campaignBrief',
            'communicationGuidelines',
            'replyRules',
            'escalationBoundaries',
            'additionalNotes',
          ].includes(field),
        );

        if (hasInstructionsField) {
          return Promise.reject(unavailableInstructionsField);
        }

        return Promise.resolve(
          Object.fromEntries(
            fields.map((field) => [
              field,
              allowedCampaign[field as keyof typeof allowedCampaign],
            ]),
          ),
        );
      },
    );

    await expect(
      service.loadReplyBriefing({ ...listInput(), threadId }),
    ).resolves.toMatchObject({
      campaign: {
        objective: allowedCampaign.objective,
        icpGoal: allowedCampaign.icpGoal,
        agent: {
          campaignBrief: null,
          communicationGuidelines: null,
          replyRules: null,
          escalationBoundaries: null,
          additionalNotes: null,
        },
      },
    });
  });

  it('falls back to the participant display name when the linked Person name is blank', async () => {
    const { service } = createService({
      senderParticipants: [
        {
          ...senderParticipant,
          displayName: 'Creator display name',
        },
      ],
      personRecords: [
        {
          ...senderPerson,
          nameFirstName: ' ',
          nameLastName: null,
        },
      ],
    });

    const briefing = await service.loadReplyBriefing({
      ...listInput(),
      threadId,
    });

    expect(briefing.history).toEqual([
      {
        receivedAt: '2026-07-21T09:00:00.000Z',
        direction: 'INCOMING',
        sender: 'Creator display name',
        subject: 'Partnership',
        text: 'Can we launch Tuesday?',
      },
    ]);
  });

  it('falls back to the participant display name when the linked Person is unreadable', async () => {
    const { service } = createService({
      senderParticipants: [
        {
          ...senderParticipant,
          displayName: 'Creator display name',
        },
      ],
      personFindError: new PermissionsException(
        'Person is unreadable',
        PermissionsExceptionCode.PERMISSION_DENIED,
      ),
    });

    const briefing = await service.loadReplyBriefing({
      ...listInput(),
      threadId,
    });
    expect(briefing.history[0]?.sender).toBe('Creator display name');
  });

  it('keeps readable native Person name components when another component is denied', async () => {
    const { repositories, service } = createService();
    const fieldPermissionDenied = new PermissionsException(
      'Person last name is unreadable',
      PermissionsExceptionCode.PERMISSION_DENIED,
    );

    repositories.person.find.mockImplementation(
      ({ select }: { select: Record<string, boolean> }) => {
        const fields = Object.keys(select);

        if (fields.includes('nameLastName')) {
          return Promise.reject(fieldPermissionDenied);
        }

        return Promise.resolve([
          {
            id: senderPerson.id,
            nameFirstName: senderPerson.nameFirstName,
          },
        ]);
      },
    );

    const briefing = await service.loadReplyBriefing({
      ...listInput(),
      threadId,
    });

    expect(briefing.history[0]?.sender).toBe('Matthew');
  });

  it('keeps a readable participant handle when other sender fields are denied', async () => {
    const { repositories, service } = createService();
    const fieldPermissionDenied = new PermissionsException(
      'Message participant field is unreadable',
      PermissionsExceptionCode.PERMISSION_DENIED,
    );

    repositories.messageParticipant.find.mockImplementation(
      ({ select }: { select: Record<string, boolean> }) => {
        const fields = Object.keys(select);

        if (fields.includes('personId') || fields.includes('displayName')) {
          return Promise.reject(fieldPermissionDenied);
        }

        return Promise.resolve([
          {
            id: senderParticipant.id,
            messageId: senderParticipant.messageId,
            ...(fields.includes('handle')
              ? { handle: senderParticipant.handle }
              : {}),
          },
        ]);
      },
    );

    const briefing = await service.loadReplyBriefing({
      ...listInput(),
      threadId,
    });

    expect(briefing.history[0]?.sender).toBe('person211@example.com');
  });

  it.each([
    [
      'unlinked Creator',
      { ...linkedThread, creator: null },
      null,
      allowedCampaign,
      allowedCampaignCreator,
      { creator: null, campaignCreator: null },
    ],
    [
      'unlinked Campaign',
      { ...linkedThread, campaign: null },
      allowedCreator,
      null,
      allowedCampaignCreator,
      { campaign: null, campaignCreator: null },
    ],
    [
      'no matching CampaignCreator',
      linkedThread,
      allowedCreator,
      allowedCampaign,
      null,
      { campaignCreator: null },
    ],
    [
      'deleted related record',
      linkedThread,
      null,
      allowedCampaign,
      allowedCampaignCreator,
      { creator: null, campaignCreator: null },
    ],
  ])(
    'returns null related sections for %s',
    async (_caseName, thread, creator, campaign, campaignCreator, expected) => {
      const { service } = createService({
        thread: thread as typeof linkedThread,
        creator: creator as typeof allowedCreator | null,
        campaign: campaign as typeof allowedCampaign | null,
        campaignCreator: campaignCreator as
          | typeof allowedCampaignCreator
          | null,
      });

      await expect(
        service.loadReplyBriefing({ ...listInput(), threadId }),
      ).resolves.toMatchObject(expected);
    },
  );

  it('does not distinguish a readable thread with a missing or unreadable Creator', async () => {
    const missingCreator = createService({ creator: null });
    const unreadableCreator = createService();
    unreadableCreator.repositories.creator.findOne.mockRejectedValue(
      new PermissionsException(
        'Creator is unreadable',
        PermissionsExceptionCode.PERMISSION_DENIED,
      ),
    );

    const [missingBriefing, unreadableBriefing] = await Promise.all([
      missingCreator.service.loadReplyBriefing({ ...listInput(), threadId }),
      unreadableCreator.service.loadReplyBriefing({ ...listInput(), threadId }),
    ]);

    expect(unreadableBriefing.creator).toEqual(missingBriefing.creator);
    expect(unreadableBriefing.campaignCreator).toEqual(
      missingBriefing.campaignCreator,
    );
  });

  it('retains every readable selected-thread message in chronological order', async () => {
    const historyRows = Array.from({ length: 101 }, (_, index) => ({
      id: `20202020-0b5c-4178-bed7-d371f641${index
        .toString()
        .padStart(4, '0')}`,
      receivedAt: new Date(Date.UTC(2026, 6, 1, 0, index, 0)).toISOString(),
      direction: 'INCOMING' as const,
      sender: 'creator@example.com',
      subject: 'Partnership',
      text: `Message ${index}`,
    }));
    const { historyQueryBuilder, service } = createService({ historyRows });

    const briefing = await service.loadReplyBriefing({
      ...listInput(),
      threadId,
    });

    expect(briefing.history).toHaveLength(101);
    expect(briefing.history[0]?.text).toBe('Message 0');
    expect(briefing.history[briefing.history.length - 1]?.text).toBe(
      'Message 100',
    );
    expect(historyQueryBuilder.orderBy).toHaveBeenCalledWith(
      'message."receivedAt"',
      'ASC',
    );
    expect(historyQueryBuilder.addOrderBy).toHaveBeenCalledWith(
      'message.id',
      'ASC',
    );
    expect(historyQueryBuilder.limit).not.toHaveBeenCalled();
  });

  it('uses the latest incoming sender as the explicit reply recipient', async () => {
    const incomingMessageId = '20202020-0b5c-4178-bed7-d371f6411eaf';
    const outgoingMessageId = '20202020-0b5c-4178-bed7-d371f6411eb0';
    const { service } = createService({
      historyRows: [
        {
          id: incomingMessageId,
          receivedAt: '2026-07-21T09:00:00.000Z',
          direction: 'INCOMING',
          sender: 'external@example.com',
          subject: 'Partnership',
          text: 'Can we launch Tuesday?',
        },
        {
          id: outgoingMessageId,
          receivedAt: '2026-07-22T09:00:00.000Z',
          direction: 'OUTGOING',
          sender: 'operator@example.com',
          subject: 'Re: Partnership',
          text: 'Thanks for reaching out.',
        },
      ],
      senderParticipants: [
        {
          ...senderParticipant,
          messageId: incomingMessageId,
          personId: null,
          displayName: 'External sender',
        },
        {
          ...senderParticipant,
          id: '20202020-0b5c-4178-bed7-d371f6411eb1',
          messageId: outgoingMessageId,
          personId: null,
          displayName: 'Operator sender',
        },
      ],
      personRecords: [],
    });

    const briefing = await service.loadReplyBriefing({
      ...listInput(),
      threadId,
    });

    expect(briefing.replyRecipient).toBe('External sender');
    expect(briefing.history).toEqual([
      expect.objectContaining({
        direction: 'INCOMING',
        sender: 'External sender',
      }),
      expect.objectContaining({
        direction: 'OUTGOING',
        sender: 'Operator sender',
      }),
    ]);
  });

  it('keeps readable Creator fields when another allowlisted field is denied', async () => {
    const { repositories, service } = createService();
    const fieldPermissionDenied = new PermissionsException(
      'Creator categories are unreadable',
      PermissionsExceptionCode.PERMISSION_DENIED,
    );

    repositories.creator.findOne.mockImplementation(
      ({ select }: { select: Record<string, boolean> }) => {
        const fields = Object.keys(select);

        if (fields.includes('categories')) {
          return Promise.reject(fieldPermissionDenied);
        }

        return Promise.resolve({
          id: creatorId,
          ...Object.fromEntries(
            fields
              .filter((field) => field !== 'id')
              .map((field) => [
                field,
                allowedCreator[field as keyof typeof allowedCreator],
              ]),
          ),
        });
      },
    );

    const briefing = await service.loadReplyBriefing({
      ...listInput(),
      threadId,
    });

    expect(briefing.creator).toEqual({
      name: 'Amina Skincare',
      language: 'English',
      location: 'London',
      categories: [],
      niches: ['Dry skin, Sensitive skin'],
    });
    expect(repositories.creator.findOne).toHaveBeenCalledWith({
      where: { id: creatorId },
      select: { categories: true },
    });
  });

  it('truncates oversized Agent fields and Creator text deterministically', async () => {
    const oversizedCampaignBrief = 'A'.repeat(10_000);
    const oversizedCreatorCategories = 'B'.repeat(10_000);
    const oversizedCampaign = {
      ...allowedCampaign,
      campaignBrief: {
        markdown: oversizedCampaignBrief,
        blocknote: null,
      },
    };
    const oversizedCreator = {
      ...allowedCreator,
      categories: oversizedCreatorCategories,
    };
    const { service } = createService({
      campaign: oversizedCampaign,
      creator: oversizedCreator,
    });

    const first = await service.loadReplyBriefing({ ...listInput(), threadId });
    const second = await service.loadReplyBriefing({
      ...listInput(),
      threadId,
    });
    const expectedCampaignBriefPrefix = oversizedCampaignBrief.slice(
      0,
      2_000 - '[…truncated]'.length,
    );
    const expectedCampaignBrief = `${expectedCampaignBriefPrefix}[…truncated]`;
    const expectedCreatorCategories = `${oversizedCreatorCategories.slice(
      0,
      1_000 - '[…truncated]'.length,
    )}[…truncated]`;

    expect(first.campaign?.agent.campaignBrief).toBe(expectedCampaignBrief);
    expect(first.campaign?.agent.campaignBrief).toHaveLength(2_000);
    expect(
      first.campaign?.agent.campaignBrief?.startsWith(
        expectedCampaignBriefPrefix,
      ),
    ).toBe(true);
    expect(first.campaign?.agent.campaignBrief?.endsWith('[…truncated]')).toBe(
      true,
    );
    expect(second.campaign?.agent.campaignBrief).toBe(
      first.campaign?.agent.campaignBrief,
    );
    expect(first.creator?.categories).toEqual([expectedCreatorCategories]);
    expect(first.creator?.categories[0]).toHaveLength(1_000);
    expect(second.creator?.categories).toEqual(first.creator?.categories);
  });
});
