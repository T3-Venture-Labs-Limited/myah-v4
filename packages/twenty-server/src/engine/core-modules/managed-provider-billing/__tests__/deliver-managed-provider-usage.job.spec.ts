import { ManagedProviderUsageDeliveryService } from '../services/managed-provider-usage-delivery.service';
import { DeliverManagedProviderUsageJob } from '../jobs/deliver-managed-provider-usage.job';

describe('DeliverManagedProviderUsageJob', () => {
  it('delivers the operation identified by its queue payload', async () => {
    const deliveryService = {
      deliverUsage: jest.fn().mockResolvedValue(undefined),
    } as Pick<ManagedProviderUsageDeliveryService, 'deliverUsage'>;
    const job = new DeliverManagedProviderUsageJob(
      deliveryService as ManagedProviderUsageDeliveryService,
    );

    await job.handle({ operationId: 'operation-id' });

    expect(deliveryService.deliverUsage).toHaveBeenCalledWith('operation-id');
  });
});
