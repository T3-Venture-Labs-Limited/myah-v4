import {
  ConnectedAccountProvider,
  MessageParticipantRole,
} from 'twenty-shared/types';

import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { MessageDirection } from 'src/modules/messaging/common/enums/message-direction.enum';

import { MessagingMessageService } from 'src/modules/messaging/message-import-manager/services/messaging-message.service';

describe('MessagingMessageService Campaign evidence', () => {
  const expectedId = '00000000-0000-4000-8000-000000000010';
  const otherId = '00000000-0000-4000-8000-000000000011';
  const workspaceId = '00000000-0000-4000-8000-000000000001';
  const channelId = '00000000-0000-4000-8000-000000000003';
  const receivedAt = new Date('2026-09-11T10:00:00.000Z');
  const message = {
    expectedMessageId: expectedId,
    externalId: 'provider-external',
    headerMessageId: '<accepted@example.com>',
    messageThreadExternalId: 'provider-thread',
    direction: MessageDirection.OUTGOING,
    subject: 'Subject',
    text: 'Body',
    isDraft: false,
    receivedAt,
    participants: [
      {
        role: MessageParticipantRole.FROM,
        handle: 'sender@example.com',
        displayName: 'Sender',
      },
    ],
  };

  const saveHarness = (input: {
    messagesByHeader: unknown[];
    messagesByExpectedId: unknown[];
    associations?: unknown[];
    threadAssociations?: unknown[];
    participants?: unknown[];
  }) => {
    const messageRepository = {
      find: jest.fn(async ({ where }: any) =>
        where.headerMessageId
          ? input.messagesByHeader
          : input.messagesByExpectedId,
      ),
      insert: jest.fn(),
    };
    const associationRepository = {
      find: jest.fn(async ({ relations }: any) =>
        relations
          ? (input.threadAssociations ?? [])
          : (input.associations ?? []),
      ),
      insert: jest.fn(),
    };
    const participantRepository = {
      find: jest.fn().mockResolvedValue(input.participants ?? []),
    };
    const threadRepository = { insert: jest.fn(), upsert: jest.fn() };
    const repositories = {
      message: messageRepository,
      messageChannelMessageAssociation: associationRepository,
      messageParticipant: participantRepository,
      messageThread: threadRepository,
    };
    const globalManager = {
      executeInWorkspaceContext: jest.fn(async (work) => work()),
      getRepository: jest.fn(
        async (_workspaceId: string, objectName: string) =>
          repositories[objectName as keyof typeof repositories],
      ),
    };

    return {
      associationRepository,
      messageRepository,
      service: new MessagingMessageService(globalManager as never),
      threadRepository,
    };
  };

  it('rejects a header-owned different Message when the expected row is absent before writes', async () => {
    const harness = saveHarness({
      messagesByExpectedId: [],
      messagesByHeader: [
        {
          id: otherId,
          headerMessageId: message.headerMessageId,
          messageThreadId: 'thread-id',
        },
      ],
    });

    await expect(
      harness.service.saveMessagesWithinTransaction(
        [message] as never,
        channelId,
        {} as WorkspaceEntityManager,
        workspaceId,
      ),
    ).rejects.toThrow(
      'Expected Message identity conflicts with header identity',
    );
    expect(harness.messageRepository.insert).not.toHaveBeenCalled();
    expect(harness.associationRepository.insert).not.toHaveBeenCalled();
    expect(harness.threadRepository.insert).not.toHaveBeenCalled();
  });

  it('accepts only an exact deterministic replay with channel, thread, content, and participants', async () => {
    const persisted = {
      id: expectedId,
      headerMessageId: message.headerMessageId,
      messageThreadId: 'thread-id',
      subject: message.subject,
      text: message.text,
      isDraft: message.isDraft,
      receivedAt,
    };
    const association = {
      id: 'association-id',
      messageId: expectedId,
      messageChannelId: channelId,
      messageExternalId: message.externalId,
      messageThreadExternalId: message.messageThreadExternalId,
      direction: message.direction,
    };
    const harness = saveHarness({
      messagesByExpectedId: [persisted],
      messagesByHeader: [persisted],
      associations: [association],
      threadAssociations: [{ ...association, message: persisted }],
      participants: [
        {
          ...message.participants[0],
          messageId: expectedId,
        },
      ],
    });

    await expect(
      harness.service.saveMessagesWithinTransaction(
        [message] as never,
        channelId,
        {} as WorkspaceEntityManager,
        workspaceId,
      ),
    ).resolves.toMatchObject({
      messageExternalIdsAndIdsMap: new Map([[message.externalId, expectedId]]),
      messageExternalIdToMessageThreadIdMap: new Map([
        [message.externalId, 'thread-id'],
      ]),
    });
  });

  it('rejects non-exact deterministic replay participant evidence before writes', async () => {
    const persisted = {
      id: expectedId,
      headerMessageId: message.headerMessageId,
      messageThreadId: 'thread-id',
      subject: message.subject,
      text: message.text,
      isDraft: message.isDraft,
      receivedAt,
    };
    const association = {
      id: 'association-id',
      messageId: expectedId,
      messageChannelId: channelId,
      messageExternalId: message.externalId,
      messageThreadExternalId: message.messageThreadExternalId,
      direction: message.direction,
    };
    const harness = saveHarness({
      messagesByExpectedId: [persisted],
      messagesByHeader: [persisted],
      associations: [association],
      threadAssociations: [
        {
          ...association,
          message: persisted,
        },
      ],
      participants: [],
    });

    await expect(
      harness.service.saveMessagesWithinTransaction(
        [message] as never,
        channelId,
        {} as WorkspaceEntityManager,
        workspaceId,
      ),
    ).rejects.toThrow('Expected Message participant evidence conflicts');
    expect(harness.messageRepository.insert).not.toHaveBeenCalled();
    expect(harness.associationRepository.insert).not.toHaveBeenCalled();
    expect(harness.threadRepository.insert).not.toHaveBeenCalled();
  });

  it('monotonically enriches a projected Microsoft Message using the exact account/channel/external key', async () => {
    const projectedMessageId = '00000000-0000-4000-8000-000000000010';
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          attemptId: 'attempt-id',
          projectedMessageId,
          providerHeaderMessageId: null,
          reconciledProviderHeaderMessageId: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'association-id',
          messageId: projectedMessageId,
          messageChannelId: '00000000-0000-4000-8000-000000000003',
          messageExternalId: 'external-id',
        },
      ])
      .mockResolvedValueOnce([
        { id: projectedMessageId, headerMessageId: null },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: projectedMessageId }])
      .mockResolvedValueOnce([{ attemptId: 'attempt-id' }]);
    const queryRunner = {
      isTransactionActive: true,
      manager: undefined as unknown as WorkspaceEntityManager,
      query,
    };
    const manager = { queryRunner } as unknown as WorkspaceEntityManager;

    queryRunner.manager = manager;
    const service = new MessagingMessageService({} as never);

    await expect(
      service.reconcileMicrosoftCampaignHeaderInTransaction(
        {
          workspaceId: '00000000-0000-4000-8000-000000000001',
          connectedAccountId: '00000000-0000-4000-8000-000000000002',
          messageChannelId: '00000000-0000-4000-8000-000000000003',
          providerMessageExternalId: 'external-id',
          trustedHeaderMessageId: '<trusted@example.com>',
        },
        manager,
      ),
    ).resolves.toBe('UPDATED');
    expect(query.mock.calls[0][1]).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
      ConnectedAccountProvider.MICROSOFT,
      'external-id',
    ]);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ORDER BY id FOR UPDATE'),
        expect.stringContaining('btrim("headerMessageId")'),
        expect.stringContaining('btrim("reconciledProviderHeaderMessageId")'),
      ]),
    );
  });
});
