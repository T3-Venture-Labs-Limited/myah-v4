import { ManagedProviderPoolState } from 'src/engine/core-modules/managed-provider-billing/enums/managed-provider-pool-state.enum';
import { ManagedProviderPoolService } from 'src/engine/core-modules/managed-provider-billing/services/managed-provider-pool.service';
import {
  MANAGED_OPENROUTER_POOL_DESIRED_MANIFEST,
  MANAGED_OPENROUTER_TARIFF_MANIFEST,
  MANAGED_OPENROUTER_TARIFF_MANIFEST_IS_FUNDED,
} from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';

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

  it('durably reconciles the funded active tariff during startup', async () => {
    expect(MANAGED_OPENROUTER_TARIFF_MANIFEST_IS_FUNDED).toBe(true);
    expect(MANAGED_OPENROUTER_TARIFF_MANIFEST.acquisition).toEqual({
      cashPaidMicrousd: '100000000',
      usableCreditsReceivedMicrousd: '100000000',
      evidenceIdentity:
        'openrouter-credits-api-total-credits-usd-340-to-440-2026-07-20',
    });
    expect(MANAGED_OPENROUTER_POOL_DESIRED_MANIFEST).toMatchObject({
      epoch: '3',
      providerKey: 'openrouter',
      state: ManagedProviderPoolState.ACTIVE,
      tariffVersion: '2026-07-20-v3',
    });

    const poolService = {
      reconcileDesiredState: jest.fn().mockResolvedValue(undefined),
      isStorageAvailable: jest.fn().mockResolvedValue(true),
    } as unknown as ManagedProviderPoolService;
    const service = new ManagedOpenRouterAdmissionService(poolService);

    await service.onModuleInit();

    expect(poolService.reconcileDesiredState).toHaveBeenCalledWith({
      ...MANAGED_OPENROUTER_POOL_DESIRED_MANIFEST,
      digest: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });
});
