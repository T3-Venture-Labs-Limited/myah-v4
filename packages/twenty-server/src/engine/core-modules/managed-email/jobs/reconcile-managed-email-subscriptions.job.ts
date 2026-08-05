import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

import { ManagedEmailLifecycleService } from '../services/managed-email-lifecycle.service';

export type ReconcileManagedEmailSubscriptionsJobData = Readonly<{
  operationId: string;
  workspaceId: string;
}>;

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class ReconcileManagedEmailSubscriptionsJob {
  constructor(
    private readonly lifecycleService: ManagedEmailLifecycleService,
  ) {}

  @Process(ReconcileManagedEmailSubscriptionsJob.name)
  async handle(data: ReconcileManagedEmailSubscriptionsJobData): Promise<void> {
    await this.lifecycleService.reconcileSubscriptions(data);
  }
}
