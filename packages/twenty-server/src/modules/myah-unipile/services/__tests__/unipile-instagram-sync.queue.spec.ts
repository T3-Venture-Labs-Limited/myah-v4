import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

type UnipileInstagramSyncQueue = {
  enqueue(bindingId: string): Promise<void>;
};

type UnipileInstagramSyncQueueModule = {
  UnipileInstagramSyncQueue: new (syncQueue: {
    add: jest.Mock;
  }) => UnipileInstagramSyncQueue;
};

const loadSyncQueueModule = (): UnipileInstagramSyncQueueModule | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-instagram-sync.queue') as UnipileInstagramSyncQueueModule;
  } catch {
    return undefined;
  }
};

describe('UnipileInstagramSyncQueue', () => {
  it('enqueues only the binding id on the dedicated Instagram synchronization queue', async () => {
    const queueModule = loadSyncQueueModule();

    expect(queueModule).toBeDefined();

    if (!queueModule) {
      return;
    }

    const syncQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const queue = new queueModule.UnipileInstagramSyncQueue(syncQueue);

    await expect(queue.enqueue('binding-id')).resolves.toBeUndefined();

    expect(syncQueue.add).toHaveBeenCalledWith('UnipileInstagramSyncJob', {
      bindingId: 'binding-id',
    });
    expect(syncQueue.add.mock.calls[0][1]).toEqual({ bindingId: 'binding-id' });
    expect(Object.keys(syncQueue.add.mock.calls[0][1])).toEqual(['bindingId']);
  });

  it('has only the dedicated synchronization queue dependency', () => {
    const queueModule = loadSyncQueueModule();

    expect(queueModule).toBeDefined();

    if (!queueModule) {
      return;
    }

    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        queueModule.UnipileInstagramSyncQueue,
      ),
    ).toHaveLength(1);
    expect(MessageQueue.unipileInstagramSyncQueue).toBe(
      'unipile-instagram-sync-queue',
    );
  });
});
