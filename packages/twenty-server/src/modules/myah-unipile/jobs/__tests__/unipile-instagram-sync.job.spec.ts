import { Scope } from '@nestjs/common';

import {
  MessageQueue,
  PROCESSOR_METADATA,
  PROCESS_METADATA,
} from 'src/engine/core-modules/message-queue/message-queue.constants';

type UnipileInstagramSyncJob = {
  handle(data: { bindingId: string }): Promise<void>;
};

type UnipileInstagramSyncJobModule = {
  UnipileInstagramSyncJob: new (syncService: {
    synchronizeBinding: jest.Mock;
  }) => UnipileInstagramSyncJob;
};

const loadSyncJobModule = (): UnipileInstagramSyncJobModule | undefined => {
  try {
    return require('src/modules/myah-unipile/jobs/unipile-instagram-sync.job') as UnipileInstagramSyncJobModule;
  } catch {
    return undefined;
  }
};

describe('UnipileInstagramSyncJob', () => {
  it('synchronizes exactly the binding carried by its queue job', async () => {
    const jobModule = loadSyncJobModule();

    expect(jobModule).toBeDefined();

    if (!jobModule) {
      return;
    }

    const syncService = {
      synchronizeBinding: jest.fn().mockResolvedValue(undefined),
    };
    const job = new jobModule.UnipileInstagramSyncJob(syncService);

    await expect(
      job.handle({ bindingId: 'binding-id' }),
    ).resolves.toBeUndefined();

    expect(syncService.synchronizeBinding).toHaveBeenCalledTimes(1);
    expect(syncService.synchronizeBinding).toHaveBeenCalledWith('binding-id');
  });

  it('is a request-scoped processor on the dedicated synchronization queue', () => {
    const jobModule = loadSyncJobModule();

    expect(jobModule).toBeDefined();

    if (!jobModule) {
      return;
    }

    const Job = jobModule.UnipileInstagramSyncJob;

    expect(Reflect.getMetadata(PROCESSOR_METADATA, Job)).toEqual({
      queueName: MessageQueue.unipileInstagramSyncQueue,
      scope: Scope.REQUEST,
    });
    expect(Reflect.getMetadata(PROCESS_METADATA, Job.prototype.handle)).toEqual(
      {
        jobName: Job.name,
      },
    );
  });
});
