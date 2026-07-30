import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { type MetronomeClientService } from '../services/metronome-client.service';
import { ManagedProviderBillingStatusService } from '../services/managed-provider-billing-status.service';

describe('ManagedProviderBillingStatusService', () => {
  const createService = ({ enabled = true }: { enabled?: boolean } = {}) => {
    const installationRepository = {
      findOneBy: jest.fn().mockResolvedValue({
        metronomeCustomerId: 'customer-id',
      }),
    };
    const operationRepository = {
      count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1),
    };
    const metronomeClientService = {
      getPrepaidBalance: jest.fn().mockResolvedValue({ balance: 12_345 }),
    };
    const twentyConfigService = {
      get: jest.fn().mockReturnValue(enabled),
    };

    return {
      metronomeClientService,
      service: new ManagedProviderBillingStatusService(
        installationRepository as unknown as WorkspaceScopedRepository<MyahWorkspaceInstallationEntity>,
        operationRepository as unknown as WorkspaceScopedRepository<ManagedProviderOperationEntity>,
        metronomeClientService as unknown as MetronomeClientService,
        twentyConfigService as unknown as TwentyConfigService,
      ),
    };
  };

  it('reports the prepaid balance and operation backlog without credentials', async () => {
    const { service } = createService();

    await expect(service.getStatus('workspace-id')).resolves.toEqual({
      available: true,
      pendingOperationCount: 2,
      prepaidBalanceCents: '12345',
      reconciliationRequiredOperationCount: 1,
    });
  });

  it('does not contact Metronome when managed OpenRouter is unavailable', async () => {
    const { metronomeClientService, service } = createService({
      enabled: false,
    });

    await expect(service.getStatus('workspace-id')).resolves.toEqual({
      available: false,
      pendingOperationCount: 2,
      prepaidBalanceCents: null,
      reconciliationRequiredOperationCount: 1,
    });
    expect(metronomeClientService.getPrepaidBalance).not.toHaveBeenCalled();
  });
});
