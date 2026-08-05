import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

import { ManagedEmailWarmupService } from '../services/managed-email-warmup.service';

export type EvaluateManagedEmailReadinessJobData = Readonly<{
  mailboxId: string;
  workspaceId: string;
}>;

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class EvaluateManagedEmailReadinessJob {
  constructor(private readonly warmupService: ManagedEmailWarmupService) {}

  @Process(EvaluateManagedEmailReadinessJob.name)
  async handle(data: EvaluateManagedEmailReadinessJobData): Promise<void> {
    await this.warmupService.evaluateMailbox(data);
  }
}
