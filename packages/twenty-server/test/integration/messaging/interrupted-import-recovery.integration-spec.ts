import { createClient, type RedisClientType } from 'redis';

import { MessageChannelSyncLockService } from 'src/modules/messaging/common/services/message-channel-sync-lock.service';
import { MessagingPendingSyncCursorService } from 'src/modules/messaging/message-import-manager/services/messaging-pending-sync-cursor.service';
import {
  getAcknowledgedMessageSyncIdsCacheKey,
  getMessagesToImportCacheKey,
  getPendingMessageSyncCursorsCacheKey,
  getPendingMessageSyncGenerationCacheKey,
} from 'src/modules/messaging/message-import-manager/utils/get-message-sync-cache-keys.util';

const workspaceId = '00000000-0000-4000-8000-000000000387';
const messageChannelId = '00000000-0000-4000-8000-000000000388';
const generationId = 'worker-replacement-generation';

describe('interrupted mailbox import recovery', () => {
  let redis: RedisClientType;
  const keys = {
    acknowledged: getAcknowledgedMessageSyncIdsCacheKey({
      generationId,
      messageChannelId,
      workspaceId,
    }),
    generation: getPendingMessageSyncGenerationCacheKey({
      messageChannelId,
      workspaceId,
    }),
    pending: getPendingMessageSyncCursorsCacheKey({
      generationId,
      messageChannelId,
      workspaceId,
    }),
    toImport: getMessagesToImportCacheKey({
      messageChannelId,
      workspaceId,
    }),
  };

  beforeAll(async () => {
    redis = createClient({
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    });
    await redis.connect();
  });

  afterEach(async () => {
    await redis.del(Object.values(keys));
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('serializes worker replacement with PostgreSQL and rebuilds Redis pending membership without submitting email', async () => {
    const firstLock = new MessageChannelSyncLockService(global.testDataSource);
    const replacementLock = new MessageChannelSyncLockService(
      global.testDataSource,
    );
    let releaseFirstWorker!: () => void;
    let firstWorkerHasLock!: () => void;
    const firstWorkerLocked = new Promise<void>((resolve) => {
      firstWorkerHasLock = resolve;
    });
    const releaseFirstWorkerPromise = new Promise<void>((resolve) => {
      releaseFirstWorker = resolve;
    });
    let replacementEntered = false;

    const firstWorker = firstLock.withLock(
      { messageChannelId, workspaceId },
      async () => {
        firstWorkerHasLock();
        await releaseFirstWorkerPromise;
      },
    );

    await firstWorkerLocked;

    const replacementWorker = replacementLock.withLock(
      { messageChannelId, workspaceId },
      async () => {
        replacementEntered = true;
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(replacementEntered).toBe(false);

    releaseFirstWorker();
    await Promise.all([firstWorker, replacementWorker]);
    expect(replacementEntered).toBe(true);

    const cache = {
      get: async <T>(key: string): Promise<T | undefined> => {
        const value = await redis.get(key);

        return value === null ? undefined : (JSON.parse(value) as T);
      },
      mdel: async (keysToDelete: string[]) => {
        if (keysToDelete.length > 0) await redis.del(keysToDelete);
      },
      setAdd: async (key: string, values: string[]) => {
        if (values.length > 0) await redis.sAdd(key, values);
      },
      setMembers: (key: string) => redis.sMembers(key),
    };
    const pendingCursorService = new MessagingPendingSyncCursorService(
      cache as never,
      {} as never,
    );

    await redis.set(keys.generation, JSON.stringify(generationId));
    await redis.set(
      keys.pending,
      JSON.stringify({
        cursors: [],
        expectedMessageExternalIds: ['saved-id', 'popped-before-death-id'],
        generationId,
      }),
    );
    await redis.sAdd(keys.acknowledged, 'saved-id');
    await redis.sAdd(keys.toImport, ['stale-id']);

    await expect(
      pendingCursorService.restorePendingMessageExternalIds({
        messageChannelId,
        workspaceId,
      }),
    ).resolves.toBe(true);
    await expect(redis.sMembers(keys.toImport)).resolves.toEqual([
      'popped-before-death-id',
    ]);

    await pendingCursorService.restorePendingMessageExternalIds({
      messageChannelId,
      workspaceId,
    });
    await expect(redis.sMembers(keys.toImport)).resolves.toEqual([
      'popped-before-death-id',
    ]);
  });
});
