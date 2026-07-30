import { Injectable } from '@nestjs/common';

import { MyahWorkspaceInstallationEntity } from 'src/engine/core-modules/customer-account/entities/myah-workspace-installation.entity';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';
import { type ManagedProviderBillingStatusDTO } from '../types/managed-provider-billing-status.dto';

import { MetronomeClientService } from './metronome-client.service';

@Injectable()
export class ManagedProviderBillingStatusService {
  constructor(
    @InjectWorkspaceScopedRepository(MyahWorkspaceInstallationEntity)
    private readonly installationRepository: WorkspaceScopedRepository<MyahWorkspaceInstallationEntity>,
    @InjectWorkspaceScopedRepository(ManagedProviderOperationEntity)
    private readonly operationRepository: WorkspaceScopedRepository<ManagedProviderOperationEntity>,
    private readonly metronomeClientService: MetronomeClientService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async getStatus(
    workspaceId: string,
  ): Promise<ManagedProviderBillingStatusDTO> {
    const [pendingOperationCount, reconciliationRequiredOperationCount] =
      await Promise.all([
        this.operationRepository.count(workspaceId, {
          where: {
            state: ManagedProviderOperationState.USAGE_PENDING,
          },
        }),
        this.operationRepository.count(workspaceId, {
          where: {
            state: ManagedProviderOperationState.RECONCILIATION_REQUIRED,
          },
        }),
      ]);
    const available =
      this.twentyConfigService.get('MANAGED_OPENROUTER_ENABLED') &&
      this.twentyConfigService.get('METRONOME_ENABLED');

    if (!available) {
      return {
        available,
        pendingOperationCount,
        prepaidBalanceCents: null,
        reconciliationRequiredOperationCount,
      };
    }

    const installation = await this.installationRepository.findOneBy(
      workspaceId,
      {},
    );
    const prepaidBalance = installation?.metronomeCustomerId
      ? await this.metronomeClientService.getPrepaidBalance(
          installation.metronomeCustomerId,
        )
      : null;

    return {
      available,
      pendingOperationCount,
      prepaidBalanceCents: prepaidBalance?.balance.toString() ?? null,
      reconciliationRequiredOperationCount,
    };
  }
}
