import { Test, type TestingModule } from '@nestjs/testing';

import { CacheStorageNamespace } from 'src/engine/core-modules/cache-storage/types/cache-storage-namespace.enum';
import { MessagingCleanCacheJob } from 'src/modules/messaging/message-import-manager/jobs/messaging-clean-cache';
import {
  getAcknowledgedMessageSyncIdsCacheKey,
  getMessagesToImportCacheKey,
  getPendingMessageSyncCursorsCacheKey,
  getPendingMessageSyncGenerationCacheKey,
} from 'src/modules/messaging/message-import-manager/utils/get-message-sync-cache-keys.util';

const workspaceId = 'workspace-id';
const messageChannelId = 'message-channel-id';

describe('MessagingCleanCacheJob', () => {
  it('clears work and current-generation cursor state for one channel', async () => {
    const cache = {
      get: jest.fn().mockResolvedValue('generation-1'),
      mdel: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingCleanCacheJob,
        {
          provide: CacheStorageNamespace.ModuleMessaging,
          useValue: cache,
        },
      ],
    }).compile();

    await module.get(MessagingCleanCacheJob).handle({
      messageChannelId,
      workspaceId,
    });

    expect(cache.mdel).toHaveBeenCalledWith([
      getMessagesToImportCacheKey({ messageChannelId, workspaceId }),
      getPendingMessageSyncGenerationCacheKey({
        messageChannelId,
        workspaceId,
      }),
      getPendingMessageSyncCursorsCacheKey({
        generationId: 'generation-1',
        messageChannelId,
        workspaceId,
      }),
      getAcknowledgedMessageSyncIdsCacheKey({
        generationId: 'generation-1',
        messageChannelId,
        workspaceId,
      }),
    ]);
  });
});
