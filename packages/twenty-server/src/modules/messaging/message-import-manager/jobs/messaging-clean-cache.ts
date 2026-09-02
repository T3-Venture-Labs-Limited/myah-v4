import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import {
  getAcknowledgedMessageSyncIdsCacheKey,
  getMessagesToImportCacheKey,
  getPendingMessageSyncCursorsCacheKey,
  getPendingMessageSyncGenerationCacheKey,
} from 'src/modules/messaging/message-import-manager/utils/get-message-sync-cache-keys.util';

export type MessagingCleanCacheJobData = {
  workspaceId: string;
  messageChannelId: string;
};

@Processor(MessageQueue.messagingQueue)
export class MessagingCleanCacheJob {
  constructor(
    @InjectCacheStorage(CacheStorageNamespace.ModuleMessaging)
    private readonly cacheStorage: CacheStorageService,
  ) {}

  @Process(MessagingCleanCacheJob.name)
  async handle(data: MessagingCleanCacheJobData): Promise<void> {
    const generationKey = getPendingMessageSyncGenerationCacheKey({
      messageChannelId: data.messageChannelId,
      workspaceId: data.workspaceId,
    });
    const generationId = await this.cacheStorage.get<string>(generationKey);

    await this.cacheStorage.mdel([
      getMessagesToImportCacheKey({
        messageChannelId: data.messageChannelId,
        workspaceId: data.workspaceId,
      }),
      generationKey,
      ...(generationId
        ? [
            getPendingMessageSyncCursorsCacheKey({
              generationId,
              messageChannelId: data.messageChannelId,
              workspaceId: data.workspaceId,
            }),
            getAcknowledgedMessageSyncIdsCacheKey({
              generationId,
              messageChannelId: data.messageChannelId,
              workspaceId: data.workspaceId,
            }),
          ]
        : []),
    ]);
  }
}
