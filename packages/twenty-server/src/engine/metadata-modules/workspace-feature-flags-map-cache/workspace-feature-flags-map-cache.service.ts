import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { type EntityManager, type Repository } from 'typeorm';

import { WorkspaceCacheProvider } from 'src/engine/workspace-cache/interfaces/workspace-cache-provider.service';
import { type FeatureFlagMap } from 'src/engine/core-modules/feature-flag/interfaces/feature-flag-map.interface';

import { FeatureFlagEntity } from 'src/engine/core-modules/feature-flag/feature-flag.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';
import { WorkspaceCache } from 'src/engine/workspace-cache/decorators/workspace-cache.decorator';

@Injectable()
@WorkspaceCache('featureFlagsMap')
export class WorkspaceFeatureFlagsMapCacheService extends WorkspaceCacheProvider<FeatureFlagMap> {
  constructor(
    @InjectWorkspaceScopedRepository(FeatureFlagEntity)
    private readonly featureFlagRepository: WorkspaceScopedRepository<FeatureFlagEntity>,
    // Manager access only; all reads still use the workspace-scoped wrapper.
    // eslint-disable-next-line twenty/prefer-workspace-scoped-repository
    @InjectRepository(FeatureFlagEntity)
    private readonly directFeatureFlagRepository: Repository<FeatureFlagEntity>,
  ) {
    super();
  }

  async computeForCache(workspaceId: string): Promise<FeatureFlagMap> {
    return this.computeFromManager(
      workspaceId,
      this.directFeatureFlagRepository.manager,
    );
  }

  async computeFromManager(
    workspaceId: string,
    manager: EntityManager,
  ): Promise<FeatureFlagMap> {
    if (
      workspaceId === undefined ||
      workspaceId === null ||
      workspaceId === ''
    ) {
      throw new Error(
        'WorkspaceFeatureFlagsMapCacheService: workspaceId must be a non-empty string.',
      );
    }

    const workspaceFeatureFlags = await this.featureFlagRepository
      .withManager(manager)
      .find(workspaceId);

    return workspaceFeatureFlags.reduce((result, currentFeatureFlag) => {
      result[currentFeatureFlag.key] = currentFeatureFlag.value;

      return result;
    }, {} as FeatureFlagMap);
  }
}
