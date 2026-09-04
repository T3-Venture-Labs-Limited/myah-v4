import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

type UnipileInstagramWebhookQueue = {
  enqueue(eventId: string): Promise<void>;
};

type UnipileInstagramWebhookQueueModule = {
  UnipileInstagramWebhookQueue: new (messagingQueue: {
    add: jest.Mock;
  }) => UnipileInstagramWebhookQueue;
};

const loadWebhookQueueModule = ():
  | UnipileInstagramWebhookQueueModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/services/unipile-instagram-webhook.queue') as UnipileInstagramWebhookQueueModule;
  } catch {
    return undefined;
  }
};

describe('UnipileInstagramWebhookQueue', () => {
  it('enqueues only the claimed event id on the messaging queue', async () => {
    const queueModule = loadWebhookQueueModule();

    expect(queueModule).toBeDefined();

    if (!queueModule) {
      return;
    }

    const messagingQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const queue = new queueModule.UnipileInstagramWebhookQueue(messagingQueue);

    await expect(queue.enqueue('webhook-event-id')).resolves.toBeUndefined();
    expect(messagingQueue.add).toHaveBeenCalledWith(
      'UnipileInstagramWebhookJob',
      { eventId: 'webhook-event-id' },
    );
    expect(messagingQueue.add.mock.calls[0][1]).toEqual({
      eventId: 'webhook-event-id',
    });
    expect(Object.keys(messagingQueue.add.mock.calls[0][1])).toEqual([
      'eventId',
    ]);
  });

  it('declares the messaging queue as its only queue dependency', () => {
    const queueModule = loadWebhookQueueModule();

    expect(queueModule).toBeDefined();

    if (!queueModule) {
      return;
    }

    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        queueModule.UnipileInstagramWebhookQueue,
      ),
    ).toHaveLength(1);
    expect(MessageQueue.messagingQueue).toBe('messaging-queue');
  });
});
