import { MessageChannelSyncStage } from 'twenty-shared/types';

import { MessagingOngoingStaleJob } from 'src/modules/messaging/message-import-manager/jobs/messaging-ongoing-stale.job';

const workspaceId = 'workspace-id';
const messageChannelId = 'message-channel-id';
const staleStartedAt = new Date(Date.now() - 31 * 60 * 1000);

describe('MessagingOngoingStaleJob', () => {
  it('re-reads the channel under its lock before recovering stale work', async () => {
    const staleSnapshot = {
      id: messageChannelId,
      syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
      syncStageStartedAt: staleStartedAt,
    };
    const freshSnapshot = {
      ...staleSnapshot,
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      syncStageStartedAt: null,
    };
    const repository = {
      find: jest.fn().mockResolvedValue([staleSnapshot]),
      findOne: jest.fn().mockResolvedValue(freshSnapshot),
    };
    const withLock = jest
      .fn()
      .mockImplementation(
        async (_scope: unknown, operation: () => Promise<void>) => operation(),
      );
    const syncStatus = {
      markAsMessagesImportPending: jest.fn(),
      markAsMessagesListFetchPending: jest.fn(),
      resetSyncStageStartedAt: jest.fn(),
    };
    const service = new MessagingOngoingStaleJob(
      {
        executeInWorkspaceContext: jest
          .fn()
          .mockImplementation((operation: () => Promise<void>) => operation()),
      } as never,
      repository as never,
      { withLock } as never,
      syncStatus as never,
    );

    await service.handle({ workspaceId });

    expect(withLock).toHaveBeenCalledWith(
      { messageChannelId, workspaceId },
      expect.any(Function),
    );
    expect(repository.findOne).toHaveBeenCalledTimes(1);
    expect(syncStatus.resetSyncStageStartedAt).not.toHaveBeenCalled();
    expect(syncStatus.markAsMessagesImportPending).not.toHaveBeenCalled();
    expect(syncStatus.markAsMessagesListFetchPending).not.toHaveBeenCalled();
  });

  it('returns a still-stale import to pending only after lock acquisition', async () => {
    const messageChannel = {
      id: messageChannelId,
      syncStage: MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
      syncStageStartedAt: staleStartedAt,
    };
    const repository = {
      find: jest.fn().mockResolvedValue([messageChannel]),
      findOne: jest.fn().mockResolvedValue(messageChannel),
    };
    const events: string[] = [];
    const withLock = jest
      .fn()
      .mockImplementation(
        async (_scope: unknown, operation: () => Promise<void>) => {
          events.push('lock');
          return operation();
        },
      );
    const syncStatus = {
      markAsMessagesImportPending: jest.fn().mockImplementation(async () => {
        events.push('pending');
      }),
      markAsMessagesListFetchPending: jest.fn(),
      resetSyncStageStartedAt: jest.fn().mockImplementation(async () => {
        events.push('reset');
      }),
    };
    const service = new MessagingOngoingStaleJob(
      {
        executeInWorkspaceContext: jest
          .fn()
          .mockImplementation((operation: () => Promise<void>) => operation()),
      } as never,
      repository as never,
      { withLock } as never,
      syncStatus as never,
    );

    await service.handle({ workspaceId });

    expect(syncStatus.markAsMessagesImportPending).toHaveBeenCalledWith(
      [messageChannelId],
      workspaceId,
    );
    expect(syncStatus.resetSyncStageStartedAt).not.toHaveBeenCalled();
    expect(events).toEqual(['lock', 'pending']);
  });
});
