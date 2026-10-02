import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  WorkspaceMetadataVersionException,
  WorkspaceMetadataVersionExceptionCode,
} from 'src/engine/metadata-modules/workspace-metadata-version/exceptions/workspace-metadata-version.exception';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import type { UpgradeWorkspaceTransaction } from 'src/engine/workspace-manager/workspace-migration/types/upgrade-workspace-transaction.type';

@Injectable()
export class WorkspaceMetadataVersionService {
  logger = new Logger(WorkspaceMetadataVersionService.name);

  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly workspaceCacheStorageService: WorkspaceCacheStorageService,
    private readonly coreEntityCacheService: CoreEntityCacheService,
  ) {}

  // Reconcile only committed PostgreSQL state on a fresh pooled read. Repeated
  // publication after a lost COMMIT response is idempotent.
  async publishCommittedMetadataVersion(workspaceId: string): Promise<void> {
    const workspace = await this.workspaceRepository.findOne({
      select: ['id', 'metadataVersion'],
      where: { id: workspaceId },
      withDeleted: true,
    });
    if (!isDefined(workspace?.metadataVersion)) {
      throw new WorkspaceMetadataVersionException(
        'Metadata version not found',
        WorkspaceMetadataVersionExceptionCode.METADATA_VERSION_NOT_FOUND,
      );
    }
    await this.workspaceCacheStorageService.setMetadataVersion(
      workspaceId,
      workspace.metadataVersion,
    );
    await this.coreEntityCacheService.invalidate(
      'workspaceEntity',
      workspaceId,
    );
  }

  async incrementMetadataVersion(
    workspaceId: string,
    upgradeTransaction?: UpgradeWorkspaceTransaction,
  ): Promise<void> {
    const repository = upgradeTransaction
      ? upgradeTransaction.queryRunner.manager.getRepository(WorkspaceEntity)
      : this.workspaceRepository;
    const workspace = await repository.findOne({
      select: ['id', 'metadataVersion'],
      where: { id: workspaceId },
      withDeleted: true,
    });

    const metadataVersion = workspace?.metadataVersion;

    if (!isDefined(metadataVersion)) {
      throw new WorkspaceMetadataVersionException(
        'Metadata version not found',
        WorkspaceMetadataVersionExceptionCode.METADATA_VERSION_NOT_FOUND,
      );
    }

    const newMetadataVersion = metadataVersion + 1;

    await repository.update(
      { id: workspaceId },
      { metadataVersion: newMetadataVersion },
    );

    const publish = async () => {
      await this.workspaceCacheStorageService.setMetadataVersion(
        workspaceId,
        newMetadataVersion,
      );
      await this.coreEntityCacheService.invalidate(
        'workspaceEntity',
        workspaceId,
      );
    };
    if (upgradeTransaction) upgradeTransaction.afterCommit(publish);
    else await publish();
  }
}
