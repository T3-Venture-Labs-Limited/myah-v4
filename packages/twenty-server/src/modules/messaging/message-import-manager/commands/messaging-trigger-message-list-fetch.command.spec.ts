import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { MessageChannelSyncStage } from 'twenty-shared/types';

import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';
import { MessagingTriggerMessageListFetchCommand } from 'src/modules/messaging/message-import-manager/commands/messaging-trigger-message-list-fetch.command';
import { MessagingMessageListFetchJob } from 'src/modules/messaging/message-import-manager/jobs/messaging-message-list-fetch.job';

const workspaceId = 'workspace-id';
const messageChannelId = 'message-channel-id';

describe('MessagingTriggerMessageListFetchCommand', () => {
  let command: MessagingTriggerMessageListFetchCommand;
  let find: jest.Mock;
  let update: jest.Mock;
  let add: jest.Mock;
  let claimAndResetSyncCursors: jest.Mock;
  let markAsMessagesListFetchPending: jest.Mock;

  beforeEach(async () => {
    find = jest.fn().mockResolvedValue([
      {
        id: messageChannelId,
        isSyncEnabled: true,
        syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      },
    ]);
    update = jest.fn().mockResolvedValue({ affected: 1 });
    add = jest.fn().mockResolvedValue(undefined);
    markAsMessagesListFetchPending = jest.fn().mockResolvedValue(undefined);
    claimAndResetSyncCursors = jest.fn().mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingTriggerMessageListFetchCommand,
        {
          provide: GlobalWorkspaceOrmManager,
          useValue: {
            executeInWorkspaceContext: jest
              .fn()
              .mockImplementation((callback: () => unknown) => callback()),
          },
        },
        {
          provide: getRepositoryToken(MessageChannelEntity),
          useValue: { find, update },
        },
        {
          provide: MessageChannelSyncStatusService,
          useValue: {
            claimAndResetSyncCursors,
            markAsMessagesListFetchPending,
          },
        },
        {
          provide: getQueueToken(MessageQueue.messagingQueue),
          useValue: { add },
        },
        { provide: MessageQueueService, useValue: { add } },
      ],
    }).compile();

    command = module.get(MessagingTriggerMessageListFetchCommand);
  });

  it('rejects reset without an exact channel ID', async () => {
    await expect(
      command.run([], { resetSync: true, workspaceId }),
    ).rejects.toThrow('--reset-sync requires --message-channel-id');

    expect(find).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('performs no mutation in dry-run mode', async () => {
    await command.run([], {
      dryRun: true,
      messageChannelId,
      resetSync: true,
      workspaceId,
    });

    expect(claimAndResetSyncCursors).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it.each([
    MessageChannelSyncStage.MESSAGE_LIST_FETCH_SCHEDULED,
    MessageChannelSyncStage.MESSAGE_LIST_FETCH_ONGOING,
    MessageChannelSyncStage.MESSAGES_IMPORT_SCHEDULED,
    MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
  ])('rejects reset while channel stage is %s', async (syncStage) => {
    find.mockResolvedValue([{ id: messageChannelId, syncStage }]);

    await expect(
      command.run([], {
        messageChannelId,
        resetSync: true,
        workspaceId,
      }),
    ).rejects.toThrow('Cannot reset an in-flight message channel');

    expect(claimAndResetSyncCursors).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('resets and schedules exactly one eligible channel', async () => {
    await command.run([], {
      messageChannelId,
      resetSync: true,
      workspaceId,
    });

    expect(claimAndResetSyncCursors).toHaveBeenCalledWith(
      messageChannelId,
      workspaceId,
    );
    expect(update).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(MessagingMessageListFetchJob.name, {
      messageChannelId,
      workspaceId,
    });
  });

  it('does not reset or enqueue when another scheduler wins the claim', async () => {
    claimAndResetSyncCursors.mockResolvedValueOnce(false);

    await command.run([], {
      messageChannelId,
      resetSync: true,
      workspaceId,
    });

    expect(claimAndResetSyncCursors).toHaveBeenCalledWith(
      messageChannelId,
      workspaceId,
    );
    expect(add).not.toHaveBeenCalled();
  });

  it('returns a claimed channel to pending when enqueue fails', async () => {
    add.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(
      command.run([], {
        messageChannelId,
        resetSync: true,
        workspaceId,
      }),
    ).rejects.toThrow('Redis unavailable');

    expect(claimAndResetSyncCursors).toHaveBeenCalledWith(
      messageChannelId,
      workspaceId,
    );
    expect(markAsMessagesListFetchPending).toHaveBeenCalledWith(
      [messageChannelId],
      workspaceId,
    );
  });

  it('preserves normal pending-channel behavior without recovery flags', async () => {
    await command.run([], { workspaceId });

    expect(find).toHaveBeenCalledWith({
      where: {
        isSyncEnabled: true,
        syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
        workspaceId,
      },
    });
    expect(claimAndResetSyncCursors).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledTimes(1);
  });
});
