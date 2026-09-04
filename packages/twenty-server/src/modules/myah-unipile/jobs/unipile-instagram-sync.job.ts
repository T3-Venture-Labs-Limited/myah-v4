import { Scope } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { UnipileInstagramSyncService } from 'src/modules/myah-unipile/services/unipile-instagram-sync.service';

export type UnipileInstagramSyncJobData = {
  bindingId: string;
};

@Processor({
  queueName: MessageQueue.unipileInstagramSyncQueue,
  scope: Scope.REQUEST,
})
export class UnipileInstagramSyncJob {
  constructor(private readonly syncService: UnipileInstagramSyncService) {}

  @Process(UnipileInstagramSyncJob.name)
  async handle(data: UnipileInstagramSyncJobData): Promise<void> {
    await this.syncService.synchronizeBinding(data.bindingId);
  }
}
