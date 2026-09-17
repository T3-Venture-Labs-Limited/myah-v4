import { Logger, Scope } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { In, Repository } from 'typeorm';

import { MessageChannelSyncStage } from 'twenty-shared/types';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { MessageChannelSyncLockService } from 'src/modules/messaging/common/services/message-channel-sync-lock.service';
import { MessageChannelSyncStatusService } from 'src/modules/messaging/common/services/message-channel-sync-status.service';
import { isSyncStale } from 'src/modules/messaging/message-import-manager/utils/is-sync-stale.util';
import { toIsoStringOrNull } from 'src/utils/date/toIsoStringOrNull';

export type MessagingOngoingStaleJobData = {
  workspaceId: string;
};

@Processor({
  queueName: MessageQueue.messagingQueue,
  scope: Scope.REQUEST,
})
export class MessagingOngoingStaleJob {
  private readonly logger = new Logger(MessagingOngoingStaleJob.name);
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    @InjectRepository(MessageChannelEntity)
    private readonly messageChannelRepository: Repository<MessageChannelEntity>,
    private readonly messageChannelSyncLockService: MessageChannelSyncLockService,
    private readonly messageChannelSyncStatusService: MessageChannelSyncStatusService,
  ) {}

  @Process(MessagingOngoingStaleJob.name)
  async handle(data: MessagingOngoingStaleJobData): Promise<void> {
    const { workspaceId } = data;

    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const messageChannels = await this.messageChannelRepository.find({
          where: {
            syncStage: In([
              MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
              MessageChannelSyncStage.MESSAGE_LIST_FETCH_ONGOING,
              MessageChannelSyncStage.MESSAGES_IMPORT_SCHEDULED,
              MessageChannelSyncStage.MESSAGE_LIST_FETCH_SCHEDULED,
            ]),
            workspaceId,
          },
        });

        for (const messageChannel of messageChannels) {
          if (
            !isSyncStale(toIsoStringOrNull(messageChannel.syncStageStartedAt))
          ) {
            continue;
          }

          await this.messageChannelSyncLockService.withLock(
            { messageChannelId: messageChannel.id, workspaceId },
            async () => {
              const freshMessageChannel =
                await this.messageChannelRepository.findOne({
                  where: { id: messageChannel.id, workspaceId },
                });

              if (
                !freshMessageChannel ||
                ![
                  MessageChannelSyncStage.MESSAGE_LIST_FETCH_ONGOING,
                  MessageChannelSyncStage.MESSAGE_LIST_FETCH_SCHEDULED,
                  MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING,
                  MessageChannelSyncStage.MESSAGES_IMPORT_SCHEDULED,
                ].includes(freshMessageChannel.syncStage) ||
                !isSyncStale(
                  toIsoStringOrNull(freshMessageChannel.syncStageStartedAt),
                )
              ) {
                return;
              }

              switch (freshMessageChannel.syncStage) {
                case MessageChannelSyncStage.MESSAGE_LIST_FETCH_ONGOING:
                case MessageChannelSyncStage.MESSAGE_LIST_FETCH_SCHEDULED:
                  this.logger.log(
                    `Sync for message channel ${freshMessageChannel.id} and workspace ${workspaceId} is stale. Setting sync stage to MESSAGE_LIST_FETCH_PENDING`,
                  );
                  await this.messageChannelSyncStatusService.markAsMessagesListFetchPending(
                    [freshMessageChannel.id],
                    workspaceId,
                  );
                  break;
                case MessageChannelSyncStage.MESSAGES_IMPORT_ONGOING:
                case MessageChannelSyncStage.MESSAGES_IMPORT_SCHEDULED:
                  this.logger.log(
                    `Sync for message channel ${freshMessageChannel.id} and workspace ${workspaceId} is stale. Setting sync stage to MESSAGES_IMPORT_PENDING`,
                  );
                  await this.messageChannelSyncStatusService.markAsMessagesImportPending(
                    [freshMessageChannel.id],
                    workspaceId,
                  );
                  break;
                default:
                  break;
              }
            },
          );
        }
      },
      authContext,
      { lite: true },
    );
  }
}
