import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

import { ManagedEmailLifecycleService } from '../services/managed-email-lifecycle.service';

export type ApplyManagedEmailPeriodBoundaryJobData = Readonly<{
  resourceId: string;
  resourceType: 'domain' | 'mailbox';
  workspaceId: string;
}>;

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class ApplyManagedEmailPeriodBoundaryJob {
  constructor(
    private readonly lifecycleService: ManagedEmailLifecycleService,
  ) {}

  @Process(ApplyManagedEmailPeriodBoundaryJob.name)
  async handle(data: ApplyManagedEmailPeriodBoundaryJobData): Promise<void> {
    await this.lifecycleService.applyPeriodBoundary(data);
  }
}
