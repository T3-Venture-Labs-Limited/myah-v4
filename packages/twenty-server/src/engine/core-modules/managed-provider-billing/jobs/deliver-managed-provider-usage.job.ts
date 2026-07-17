import { Process } from 'src/engine/core-modules/message-queue/decorators/process.decorator';
import { Processor } from 'src/engine/core-modules/message-queue/decorators/processor.decorator';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';

import { ManagedProviderUsageDeliveryService } from '../services/managed-provider-usage-delivery.service';
import { type DeliverManagedProviderUsageJobData } from '../types/deliver-managed-provider-usage-job-data.type';

@Processor(MessageQueue.workspaceQueue)
export class DeliverManagedProviderUsageJob {
  constructor(
    private readonly managedProviderUsageDeliveryService: ManagedProviderUsageDeliveryService,
  ) {}

  @Process(DeliverManagedProviderUsageJob.name)
  async handle(data: DeliverManagedProviderUsageJobData): Promise<void> {
    await this.managedProviderUsageDeliveryService.deliverUsage(
      data.operationId,
    );
  }
}
