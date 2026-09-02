import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Command, CommandRunner, Option } from 'nest-commander';
import { Repository } from 'typeorm';

import { MessageChannelSyncStage } from 'twenty-shared/types';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';
import {
  MessagingMessageListFetchJob,
  type MessagingMessageListFetchJobData,
} from 'src/modules/messaging/message-import-manager/jobs/messaging-message-list-fetch.job';

type MessagingTriggerMessageListFetchCommandOptions = {
  dryRun?: boolean;
  messageChannelId?: string;
  resetSync?: boolean;
  workspaceId: string;
};

@Command({
  name: 'messaging:trigger-message-list-fetch',
  description:
    'Trigger message list fetch immediately without waiting for cron',
})
export class MessagingTriggerMessageListFetchCommand extends CommandRunner {
  private readonly logger = new Logger(
    MessagingTriggerMessageListFetchCommand.name,
  );

  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    @InjectMessageQueue(MessageQueue.messagingQueue)
    private readonly messageQueueService: MessageQueueService,
    private readonly messageChannelSyncStatusService: MessageChannelSyncStatusService,
  ) {
    super();
  }

  async run(
    _passedParam: string[],
    options: MessagingTriggerMessageListFetchCommandOptions,
  ): Promise<void> {
    const { dryRun, messageChannelId, resetSync, workspaceId } = options;

    if (resetSync && !messageChannelId) {
      throw new Error('--reset-sync requires --message-channel-id');
    }

    this.logger.log(
      `Triggering message list fetch for workspace ${workspaceId}${messageChannelId ? ` and channel ${messageChannelId}` : ' (all pending channels)'}`,
    );

    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const messageChannels = await this.messageChannelRepository.find({
          where: {
            isSyncEnabled: true,
            ...(resetSync
              ? { id: messageChannelId }
              : {
                  syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
                  ...(messageChannelId ? { id: messageChannelId } : {}),
                }),
            workspaceId,
          },
        });

        if (messageChannels.length === 0) {
          this.logger.warn('No eligible message channels found');

          return;
        }

        this.logger.log(
          `Found ${messageChannels.length} message channel(s) to process`,
        );
        if (
          resetSync &&
          messageChannels.some((messageChannel) =>
            [
              MessageChannelSyncStage.MESSAGE_LIST_FETCH_SCHEDULED,
              MessageChannelSyncStage.MESSAGE_LIST_FETCH_ONGOING,
              MessageChannelSyncStage.MESSAGES_IMPORT_SCHEDULED,
              MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
            ].includes(messageChannel.syncStage),
          )
        ) {
          throw new Error('Cannot reset an in-flight message channel');
        }

        if (dryRun) {
          this.logger.log('Dry run complete; no message channel state changed');

          return;
        }

        for (const messageChannel of messageChannels) {
          const scheduledUpdate = {
            syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_SCHEDULED,
            syncStageStartedAt: new Date().toISOString(),
          };

          if (resetSync) {
            const claimed =
              await this.messageChannelSyncStatusService.claimAndResetSyncCursors(
                messageChannel.id,
                workspaceId,
              );

            if (!claimed) {
              this.logger.warn(
                `Message channel ${messageChannel.id} was claimed by another scheduler`,
              );
              continue;
            }
          } else {
            await this.messageChannelRepository.update(
              { id: messageChannel.id, workspaceId },
              scheduledUpdate,
            );
          }

          try {
            await this.messageQueueService.add<MessagingMessageListFetchJobData>(
              MessagingMessageListFetchJob.name,
              {
                messageChannelId: messageChannel.id,
                workspaceId,
              },
            );
          } catch (error) {
            if (resetSync) {
              await this.messageChannelSyncStatusService.markAsMessagesListFetchPending(
                [messageChannel.id],
                workspaceId,
              );
            }

            throw error;
          }

          this.logger.log(
            `Triggered fetch for message channel ${messageChannel.id}`,
          );
        }

        this.logger.log(
          `Successfully triggered ${messageChannels.length} message list fetch job(s)`,
        );
      },
      authContext,
      { lite: true },
    );
  }

  @Option({
    flags: '-w, --workspace-id <workspace_id>',
    description: 'Workspace ID',
    required: true,
  })
  parseWorkspaceId(value: string): string {
    return value;
  }

  @Option({
    flags: '-m, --message-channel-id [message_channel_id]',
    description:
      'Message Channel ID (optional - if not provided, triggers for all pending channels)',
    required: false,
  })
  parseMessageChannelId(value: string): string {
    return value;
  }
  @Option({
    flags: '--dry-run',
    description: 'Report eligible channels without changing state',
  })
  parseDryRun(): boolean {
    return true;
  }

  @Option({
    flags: '--reset-sync',
    description:
      'Reset cursors for one non-running channel before triggering fetch',
  })
  parseResetSync(): boolean {
    return true;
  }
}
