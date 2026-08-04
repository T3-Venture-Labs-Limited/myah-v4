import { Injectable } from '@nestjs/common';

import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

import { ManagedEmailAcquisitionService } from '../services/managed-email-acquisition.service';
import { ManagedEmailReconciliationService } from '../services/managed-email-reconciliation.service';

export type ReconcileManagedEmailAcquisitionJobData = Readonly<{
  operationId: string;
  workspaceId: string;
}>;

@Injectable()
@Processor(MessageQueue.workspaceQueue)
export class ReconcileManagedEmailAcquisitionJob {
  constructor(
    private readonly acquisitionService: ManagedEmailAcquisitionService,
    private readonly reconciliationService: ManagedEmailReconciliationService,
  ) {}

  @Process(ReconcileManagedEmailAcquisitionJob.name)
  async handle(data: ReconcileManagedEmailAcquisitionJobData): Promise<void> {
    const operation = await this.acquisitionService.continue(data);
    if (operation.state === 'RECONCILIATION_REQUIRED') {
      await this.reconciliationService.reconcile(data);
    }
  }
}
