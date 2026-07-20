import { ManagedProviderPoolState } from 'src/engine/core-modules/managed-provider-billing/enums/managed-provider-pool-state.enum';
import { ManagedProviderPoolService } from 'src/engine/core-modules/managed-provider-billing/services/managed-provider-pool.service';

import { ManagedOpenRouterAdmissionService } from '../managed-openrouter-admission.service';

describe('ManagedOpenRouterAdmissionService', () => {
  it('skips startup reconciliation until the pool table exists', async () => {
    const poolService = {
      isStorageAvailable: jest.fn().mockResolvedValue(false),
      reconcileDesiredState: jest.fn(),
    } as unknown as ManagedProviderPoolService;
    const service = new ManagedOpenRouterAdmissionService(poolService);

    await service.onModuleInit();

    expect(poolService.reconcileDesiredState).not.toHaveBeenCalled();
  });

  it('durably reconciles the source-controlled draining fence during startup', async () => {
    const poolService = {
      reconcileDesiredState: jest.fn().mockResolvedValue(undefined),
      isStorageAvailable: jest.fn().mockResolvedValue(true),
    } as unknown as ManagedProviderPoolService;
    const service = new ManagedOpenRouterAdmissionService(poolService);

    await service.onModuleInit();

    expect(poolService.reconcileDesiredState).toHaveBeenCalledWith({
      configurationDigest:
        '91920e85fef98a8729b7e33e800d4602f0b80da60cc579f7bf3ef9081b4a8a13',
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      epoch: '2',
      providerKey: 'openrouter',
      state: ManagedProviderPoolState.DRAINING,
      tariffVersion: null,
    });
  });
});
