import { Injectable } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { UnipileInstagramSyncJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-sync.job';

@Injectable()
export class UnipileInstagramSyncQueue {
  constructor(
    @InjectMessageQueue(MessageQueue.unipileInstagramSyncQueue)
    private readonly syncQueue: MessageQueueService,
  ) {}

  async enqueue(bindingId: string): Promise<void> {
    await this.syncQueue.add(UnipileInstagramSyncJob.name, { bindingId });
  }
}
