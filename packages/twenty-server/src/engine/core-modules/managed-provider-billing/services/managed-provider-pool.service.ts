import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

import {
  MANAGED_OPENROUTER_TARIFF_MANIFEST,
  MANAGED_OPENROUTER_TARIFF_MANIFEST_DIGEST,
  MANAGED_OPENROUTER_TARIFF_MANIFEST_IS_FUNDED,
  MANAGED_OPENROUTER_TARIFF_VERSION,
} from 'src/engine/metadata-modules/ai/ai-models/constants/managed-openrouter.constants';

import { ManagedProviderPoolEntity } from '../entities/managed-provider-pool.entity';
import { ManagedProviderOperationEntity } from '../entities/managed-provider-operation.entity';
import { ManagedProviderPoolState } from '../enums/managed-provider-pool-state.enum';
import { ManagedProviderOperationState } from '../enums/managed-provider-operation-state.enum';

export type ManagedProviderPoolDesiredState = {
  providerKey: string;
  state: ManagedProviderPoolState;
  tariffVersion: string | null;
  configurationDigest: string | null;
  epoch: string;
  digest: string;
};

@Injectable()
export class ManagedProviderPoolService {
  constructor(
    // This provider-wide fence intentionally has no workspaceId.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(ManagedProviderPoolEntity)
    private readonly poolRepository: Repository<ManagedProviderPoolEntity>,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  isManagedWorkspace(providerKey: string, workspaceId: string): boolean {
    return (
      providerKey === 'openrouter' &&
      MANAGED_OPENROUTER_TARIFF_MANIFEST_IS_FUNDED &&
      this.twentyConfigService.get('MANAGED_OPENROUTER_ENABLED') &&
      this.twentyConfigService
        .get('MANAGED_OPENROUTER_FUNDING_WORKSPACE_IDS')
        .includes(workspaceId)
    );
  }

  async assertReservationAllowed(
    repository: Repository<ManagedProviderPoolEntity>,
    desired: {
      providerKey: string;
      tariffVersion: string;
      configurationDigest: string | null;
    },
  ): Promise<void> {
    const pool = await repository.findOne({
      lock: { mode: 'pessimistic_write' },
      where: { providerKey: desired.providerKey },
    });

    if (
      !pool ||
      pool.state !== ManagedProviderPoolState.ACTIVE ||
      pool.activeTariffVersion !== desired.tariffVersion ||
      pool.activeConfigurationDigest !== desired.configurationDigest
    ) {
      throw new Error('Managed provider pool admission is not active');
    }
  }

  async reconcileDesiredState(
    desired: ManagedProviderPoolDesiredState,
  ): Promise<ManagedProviderPoolEntity> {
    return this.poolRepository.manager.transaction(async (manager) => {
      if (desired.providerKey === 'openrouter') {
        const manifestDigest = createHash('sha256')
          .update(JSON.stringify(MANAGED_OPENROUTER_TARIFF_MANIFEST))
          .digest('hex');
        if (manifestDigest !== MANAGED_OPENROUTER_TARIFF_MANIFEST_DIGEST) {
          throw new Error('Managed OpenRouter tariff manifest digest mismatch');
        }
      }
      // A row-level lock cannot serialize the first reconciliation because
      // SELECT ... FOR UPDATE locks no rows when the provider is new.
      // Scope the lock to this provider and this transaction so all callers
      // observe the same serialized create-or-replay decision.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `myah:managed-provider-pool:${desired.providerKey}`,
      ]);
      const repository = manager.getRepository(ManagedProviderPoolEntity);
      const current = await repository.findOne({
        lock: { mode: 'pessimistic_write' },
        where: { providerKey: desired.providerKey },
      });
      const requestedEpoch = BigInt(desired.epoch);

      if (current) {
        const currentEpoch = BigInt(current.appliedDesiredStateEpoch);
        if (requestedEpoch < currentEpoch) return current;
        if (
          requestedEpoch === currentEpoch &&
          current.appliedDesiredStateDigest !== desired.digest
        ) {
          throw new Error('Managed provider pool desired state conflict');
        }
        if (requestedEpoch === currentEpoch) return current;
      }

      if (desired.state === ManagedProviderPoolState.ACTIVE) {
        if (
          desired.providerKey === 'openrouter' &&
          (desired.configurationDigest !==
            MANAGED_OPENROUTER_TARIFF_MANIFEST_DIGEST ||
            desired.tariffVersion !== MANAGED_OPENROUTER_TARIFF_VERSION ||
            !MANAGED_OPENROUTER_TARIFF_MANIFEST_IS_FUNDED)
        ) {
          throw new Error(
            'Managed OpenRouter tariff manifest is not funded or does not match the reviewed digest',
          );
        }
      }

      if (desired.state === ManagedProviderPoolState.ACTIVE) {
        if (!desired.tariffVersion || !desired.configurationDigest) {
          throw new Error(
            'Active managed provider pool requires tariff and evidence versions',
          );
        }

        const hasUnresolvedProviderOperations = await manager
          .getRepository(ManagedProviderOperationEntity)
          .createQueryBuilder('operation')
          .where('operation.providerKey = :providerKey', {
            providerKey: desired.providerKey,
          })
          .andWhere('operation.state IN (:...states)', {
            states: [
              ManagedProviderOperationState.RESERVED,
              ManagedProviderOperationState.RECONCILIATION_REQUIRED,
            ],
          })
          .getExists();

        if (hasUnresolvedProviderOperations) {
          throw new Error(
            'Managed provider pool cannot activate with unresolved operations',
          );
        }
      }

      return repository.save(
        repository.create({
          providerKey: desired.providerKey,
          state: desired.state,
          activeTariffVersion:
            desired.state === ManagedProviderPoolState.ACTIVE
              ? desired.tariffVersion
              : null,
          activeConfigurationDigest:
            desired.state === ManagedProviderPoolState.ACTIVE
              ? desired.configurationDigest
              : null,
          appliedDesiredStateEpoch: requestedEpoch.toString(),
          appliedDesiredStateDigest: desired.digest,
          rowVersion: (current?.rowVersion ?? 0) + 1,
        }),
      );
    });
  }
}
