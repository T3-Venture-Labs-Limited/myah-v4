import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { InjectMessageQueue } from 'src/engine/core-modules/message-queue/decorators/message-queue.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';

import { ManagedEmailMailboxActivationService } from '../services/managed-email-mailbox-activation.service';
import { EvaluateManagedEmailReadinessJob } from './evaluate-managed-email-readiness.job';

export type ActivateManagedEmailMailboxJobData = Readonly<{
  mailboxId: string;
  workspaceId: string;
}>;

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class ActivateManagedEmailMailboxJob {
  constructor(
    private readonly activationService: ManagedEmailMailboxActivationService,
    @InjectMessageQueue(MessageQueue.workspaceQueue)
    private readonly messageQueueService: MessageQueueService,
  ) {}

  @Process(ActivateManagedEmailMailboxJob.name)
  async handle(data: ActivateManagedEmailMailboxJobData): Promise<unknown> {
    const result = await this.activationService.activateMailbox(data);

    if (
      typeof result === 'object' &&
      result !== null &&
      'state' in result &&
      result.state === 'ACTIVE'
    ) {
      await this.messageQueueService.add(
        EvaluateManagedEmailReadinessJob.name,
        data,
        {
          id: `managed-email-readiness:${data.mailboxId}`,
          retryLimit: 3,
        },
      );
    }

    return result;
  }
}
