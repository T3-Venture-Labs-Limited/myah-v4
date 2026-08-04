import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { MessageChannelVisibility } from 'twenty-shared/types';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type MessageWorkspaceEntity } from 'src/modules/messaging/common/standard-objects/message.workspace-entity';

import {
  MessageVisibilityAccess,
  MessageVisibilityPolicyService,
} from './message-visibility-policy.service';

const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const userWorkspaceId = '20202020-1234-5678-9012-345678901234';

const authContext = {
  type: 'user',
  workspace: { id: workspaceId },
  userWorkspaceId,
  user: { id: 'user-id' },
  workspaceMemberId: 'workspace-member-id',
  workspaceMember: { id: 'workspace-member-id' },
} as UserWorkspaceAuthContext;

const createMessage = (
  id: string,
  subject = `subject-${id}`,
  text = `body-${id}`,
): MessageWorkspaceEntity =>
  ({
    id,
    subject,
    text,
    receivedAt: new Date('2026-07-21T10:00:00.000Z'),
  }) as MessageWorkspaceEntity;

type AssociationFixture = {
  messageId: string;
  messageChannelId: string;
  deletedAt?: string | null;
};

type ChannelFixture = {
  id: string;
  workspaceId: string;
  connectedAccountId: string;
  visibility?: MessageChannelVisibility;
};

type AccountFixture = {
  id: string;
  workspaceId: string;
  userWorkspaceId: string;
};

const createService = ({
  associations = [],
  channels = [],
  accounts = [],
}: {
  associations?: AssociationFixture[];
  channels?: ChannelFixture[];
  accounts?: AccountFixture[];
}) => {
  const associationRepository = {
    find: jest.fn().mockResolvedValue(associations),
  };
  const messageChannelRepository = {
    find: jest.fn().mockResolvedValue(channels),
  };
  const connectedAccountRepository = {
    find: jest.fn().mockResolvedValue(accounts),
  };
  const globalWorkspaceOrmManager = {
    getRepository: jest.fn().mockResolvedValue(associationRepository),
    executeInWorkspaceContext: jest
      .fn()
      .mockImplementation((run: () => unknown) => run()),
  };

  return {
    service: new MessageVisibilityPolicyService(
      globalWorkspaceOrmManager as never,
      connectedAccountRepository as never,
      messageChannelRepository as never,
    ),
    associationRepository,
    messageChannelRepository,
    connectedAccountRepository,
    globalWorkspaceOrmManager,
  };
};

describe('MessageVisibilityPolicyService', () => {
  it('applies native owner and channel-visibility precedence in one batch', async () => {
    const messages = [
      createMessage('owner'),
      createMessage('shared'),
      createMessage('subject'),
      createMessage('metadata'),
      createMessage('mixed'),
      createMessage('unknown'),
      createMessage('none'),
    ];
    const { service, connectedAccountRepository } = createService({
      associations: [
        { messageId: 'owner', messageChannelId: 'owner-channel' },
        { messageId: 'shared', messageChannelId: 'shared-channel' },
        { messageId: 'subject', messageChannelId: 'subject-channel' },
        { messageId: 'metadata', messageChannelId: 'metadata-channel' },
        { messageId: 'mixed', messageChannelId: 'metadata-channel' },
        { messageId: 'mixed', messageChannelId: 'subject-channel' },
        { messageId: 'unknown', messageChannelId: 'unknown-channel' },
      ],
      channels: [
        {
          id: 'owner-channel',
          workspaceId,
          connectedAccountId: 'owned-account',
          visibility: MessageChannelVisibility.METADATA,
        },
        {
          id: 'shared-channel',
          workspaceId,
          connectedAccountId: 'other-account',
          visibility: MessageChannelVisibility.SHARE_EVERYTHING,
        },
        {
          id: 'subject-channel',
          workspaceId,
          connectedAccountId: 'other-account',
          visibility: MessageChannelVisibility.SUBJECT,
        },
        {
          id: 'metadata-channel',
          workspaceId,
          connectedAccountId: 'other-account',
          visibility: MessageChannelVisibility.METADATA,
        },
        {
          id: 'unknown-channel',
          workspaceId,
          connectedAccountId: 'other-account',
        },
      ],
      accounts: [{ id: 'owned-account', workspaceId, userWorkspaceId }],
    });

    await expect(
      service.applyMessagesVisibility(messages, authContext),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'owner',
        subject: 'subject-owner',
        text: 'body-owner',
      }),
      expect.objectContaining({
        id: 'shared',
        subject: 'subject-shared',
        text: 'body-shared',
      }),
      expect.objectContaining({
        id: 'subject',
        subject: 'subject-subject',
        text: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      }),
      expect.objectContaining({
        id: 'metadata',
        subject: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
        text: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      }),
      expect.objectContaining({
        id: 'mixed',
        subject: 'subject-mixed',
        text: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      }),
    ]);
    expect(connectedAccountRepository.find).toHaveBeenCalledTimes(1);
  });

  it('does not let soft-deleted associations or foreign-workspace channels and accounts grant access', async () => {
    const messages = [
      createMessage('deleted-association'),
      createMessage('foreign-channel'),
      createMessage('foreign-account'),
    ];
    const { service } = createService({
      associations: [
        {
          messageId: 'deleted-association',
          messageChannelId: 'shared-channel',
          deletedAt: '2026-07-21T11:00:00.000Z',
        },
        {
          messageId: 'foreign-channel',
          messageChannelId: 'foreign-channel',
        },
        {
          messageId: 'foreign-account',
          messageChannelId: 'metadata-channel',
        },
      ],
      channels: [
        {
          id: 'shared-channel',
          workspaceId,
          connectedAccountId: 'other-account',
          visibility: MessageChannelVisibility.SHARE_EVERYTHING,
        },
        {
          id: 'foreign-channel',
          workspaceId: 'foreign-workspace-id',
          connectedAccountId: 'foreign-account',
          visibility: MessageChannelVisibility.SHARE_EVERYTHING,
        },
        {
          id: 'metadata-channel',
          workspaceId,
          connectedAccountId: 'foreign-account',
          visibility: MessageChannelVisibility.METADATA,
        },
      ],
      accounts: [
        {
          id: 'foreign-account',
          workspaceId: 'foreign-workspace-id',
          userWorkspaceId,
        },
      ],
    });

    await expect(
      service.applyMessagesVisibility(messages, authContext),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'foreign-account',
        subject: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
        text: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      }),
    ]);
  });

  it('generates the pre-pagination SQL classification from the same access levels', () => {
    const { service } = createService({});

    const projection = service.buildSqlVisibilityProjection({
      workspaceId,
      userWorkspaceId,
      messageIdExpression: 'candidateMessage.id',
    });

    expect(projection.parameters).toMatchObject({
      messageVisibilityWorkspaceId: workspaceId,
      messageVisibilityUserWorkspaceId: userWorkspaceId,
      messageVisibilityFull: MessageVisibilityAccess.FULL,
      messageVisibilitySubject: MessageVisibilityAccess.SUBJECT,
      messageVisibilityMetadata: MessageVisibilityAccess.METADATA,
      messageVisibilityHidden: MessageVisibilityAccess.HIDDEN,
    });
    expect(projection.expression).toContain(
      '"messageChannelMessageAssociation"',
    );
    expect(projection.expression).toContain('association."deletedAt" IS NULL');
    expect(projection.expression).toContain('core."messageChannel"');
    expect(projection.expression).toContain(
      'channel."workspaceId" = :messageVisibilityWorkspaceId',
    );
    expect(projection.expression).toContain('core."connectedAccount"');
    expect(projection.expression).toContain(
      'connectedAccount."workspaceId" = :messageVisibilityWorkspaceId',
    );
    expect(projection.expression).toContain(
      'connectedAccount."userWorkspaceId" = :messageVisibilityUserWorkspaceId',
    );
    expect(
      projection.expression.indexOf(':messageVisibilityFull'),
    ).toBeLessThan(projection.expression.indexOf(':messageVisibilitySubject'));
    expect(
      projection.expression.indexOf(':messageVisibilitySubject'),
    ).toBeLessThan(projection.expression.indexOf(':messageVisibilityMetadata'));
  });
});
