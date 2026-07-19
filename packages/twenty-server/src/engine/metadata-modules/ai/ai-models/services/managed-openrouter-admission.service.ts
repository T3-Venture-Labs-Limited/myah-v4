import { createHash } from 'node:crypto';

import { Injectable, type OnModuleInit } from '@nestjs/common';

import { ManagedProviderPoolService } from 'src/engine/core-modules/managed-provider-billing/services/managed-provider-pool.service';
import { MANAGED_OPENROUTER_POOL_DESIRED_MANIFEST } from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';

@Injectable()
export class ManagedOpenRouterAdmissionService implements OnModuleInit {
  constructor(
    private readonly managedProviderPoolService: ManagedProviderPoolService,
  ) {}

  async onModuleInit(): Promise<void> {
    const manifest = MANAGED_OPENROUTER_POOL_DESIRED_MANIFEST;
    const digest = createHash('sha256')
      .update(JSON.stringify(manifest))
      .digest('hex');

    await this.managedProviderPoolService.reconcileDesiredState({
      ...manifest,
      digest,
    });
  }
}
