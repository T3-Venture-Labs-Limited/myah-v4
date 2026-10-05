import { Injectable } from '@nestjs/common';

import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { UnipileInstagramWebhookJob } from 'src/modules/myah-unipile/jobs/unipile-instagram-webhook.job';

@Injectable()
export class UnipileInstagramWebhookQueue {
  constructor(
    @InjectMessageQueue(MessageQueue.myahCreatorMessageQueue)
    private readonly creatorMessageQueue: MessageQueueService,
  ) {}

  async enqueue(eventId: string): Promise<void> {
    await this.creatorMessageQueue.add(UnipileInstagramWebhookJob.name, {
      eventId,
    });
  }
}
