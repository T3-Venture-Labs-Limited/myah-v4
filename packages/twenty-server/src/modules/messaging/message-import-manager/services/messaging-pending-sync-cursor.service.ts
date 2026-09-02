import { Injectable } from '@nestjs/common';

import { v4 } from 'uuid';

import { InjectCacheStorage } from 'src/engine/core-modules/cache-storage/decorators/cache-storage.decorator';
import { CacheStorageService } from 'src/engine/core-modules/cache-storage/services/cache-storage.service';
import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { MessageChannelEntity } from 'src/engine/metadata-modules/message-channel/entities/message-channel.entity';
import { MessagingCursorService } from 'src/modules/messaging/message-import-manager/services/messaging-cursor.service';
import { type GetMessageListsResponse } from 'src/modules/messaging/message-import-manager/types/get-message-lists-response.type';
import {
  getAcknowledgedMessageSyncIdsCacheKey,
  getMessagesToImportCacheKey,
  getPendingMessageSyncCursorsCacheKey,
  getPendingMessageSyncGenerationCacheKey,
} from 'src/modules/messaging/message-import-manager/utils/get-message-sync-cache-keys.util';

const PENDING_SYNC_CURSOR_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingMessageSyncCursorState = {
  cursors: Array<{
    folderId: string | undefined;
    nextSyncCursor: string;
  }>;
  expectedMessageExternalIds: string[];
  generationId: string;
};

type MessageChannelScope = {
  messageChannelId: string;
  workspaceId: string;
};

@Injectable()
export class MessagingPendingSyncCursorService {
  constructor(
    @InjectCacheStorage(CacheStorageNamespace.ModuleMessaging)
    private readonly cacheStorage: CacheStorageService,
    private readonly messagingCursorService: MessagingCursorService,
  ) {}

  async stage({
    messageChannelId,
    messageExternalIds,
    messageLists,
    workspaceId,
  }: MessageChannelScope & {
    messageExternalIds: string[];
    messageLists: GetMessageListsResponse;
  }): Promise<void> {
    const generationId = v4();

    await this.cacheStorage.set<PendingMessageSyncCursorState>(
      getPendingMessageSyncCursorsCacheKey({
        generationId,
        messageChannelId,
        workspaceId,
      }),
      {
        cursors: messageLists.map(({ folderId, nextSyncCursor }) => ({
          folderId,
          nextSyncCursor,
        })),
        expectedMessageExternalIds: [...new Set(messageExternalIds)],
        generationId,
      },
      PENDING_SYNC_CURSOR_TTL_MS,
    );
    await this.cacheStorage.set(
      getPendingMessageSyncGenerationCacheKey({
        messageChannelId,
        workspaceId,
      }),
      generationId,
      PENDING_SYNC_CURSOR_TTL_MS,
    );
  }

  async acknowledge({
    messageChannelId,
    processedMessageExternalIds,
    workspaceId,
  }: MessageChannelScope & {
    processedMessageExternalIds: string[];
  }): Promise<void> {
    const generationId = await this.cacheStorage.get<string>(
      getPendingMessageSyncGenerationCacheKey({
        messageChannelId,
        workspaceId,
      }),
    );

    if (!generationId) {
      return;
    }

    const state = await this.cacheStorage.get<PendingMessageSyncCursorState>(
      getPendingMessageSyncCursorsCacheKey({
        generationId,
        messageChannelId,
        workspaceId,
      }),
    );

    if (!state) {
      return;
    }

    const expectedIds = new Set(state.expectedMessageExternalIds);
    const acknowledgedIds = [
      ...new Set(
        processedMessageExternalIds.filter((id) => expectedIds.has(id)),
      ),
    ];

    await this.cacheStorage.setAdd(
      getAcknowledgedMessageSyncIdsCacheKey({
        generationId,
        messageChannelId,
        workspaceId,
      }),
      acknowledgedIds,
      PENDING_SYNC_CURSOR_TTL_MS,
    );
  }

  async clear({
    messageChannelId,
    workspaceId,
  }: MessageChannelScope): Promise<void> {
    const generationKey = getPendingMessageSyncGenerationCacheKey({
      messageChannelId,
      workspaceId,
    });
    const generationId = await this.cacheStorage.get<string>(generationKey);

    await this.cacheStorage.mdel([
      getMessagesToImportCacheKey({ messageChannelId, workspaceId }),
      generationKey,
      ...(generationId
        ? [
            getPendingMessageSyncCursorsCacheKey({
              generationId,
              messageChannelId,
              workspaceId,
            }),
            getAcknowledgedMessageSyncIdsCacheKey({
              generationId,
              messageChannelId,
              workspaceId,
            }),
          ]
        : []),
    ]);
  }

  async commit({
    messageChannel,
    workspaceId,
  }: {
    messageChannel: MessageChannelEntity;
    workspaceId: string;
  }): Promise<void> {
    const generationId = await this.cacheStorage.get<string>(
      getPendingMessageSyncGenerationCacheKey({
        messageChannelId: messageChannel.id,
        workspaceId,
      }),
    );

    if (!generationId) {
      throw new Error(
        `Cannot commit message sync cursors: pending cursor generation is missing for channel ${messageChannel.id}`,
      );
    }

    const pendingKey = getPendingMessageSyncCursorsCacheKey({
      generationId,
      messageChannelId: messageChannel.id,
      workspaceId,
    });
    const state =
      await this.cacheStorage.get<PendingMessageSyncCursorState>(pendingKey);

    if (!state) {
      throw new Error(
        `Cannot commit message sync cursors: pending cursor state is missing for channel ${messageChannel.id}`,
      );
    }

    const acknowledgedKey = getAcknowledgedMessageSyncIdsCacheKey({
      generationId,
      messageChannelId: messageChannel.id,
      workspaceId,
    });
    const acknowledgedCount =
      await this.cacheStorage.getSetLength(acknowledgedKey);

    if (acknowledgedCount < state.expectedMessageExternalIds.length) {
      throw new Error(
        `Cannot commit message sync cursors: pending message IDs are not fully acknowledged for channel ${messageChannel.id}`,
      );
    }

    for (const cursor of state.cursors) {
      await this.messagingCursorService.updateCursor(
        messageChannel,
        cursor.nextSyncCursor,
        workspaceId,
        cursor.folderId,
      );
    }

    await this.cacheStorage.mdel([pendingKey, acknowledgedKey]);
  }
}
