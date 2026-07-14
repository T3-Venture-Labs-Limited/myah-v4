import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, type FindOptionsWhere, Repository } from 'typeorm';
import { FeatureFlagKey } from 'twenty-shared/types';

import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import {
  MyahPlatformOperationEntity,
  MyahPlatformOperationStatus,
} from 'src/modules/myah-platform-admin/entities/myah-platform-operation.entity';
import { MyahPlatformOperationService } from 'src/modules/myah-platform-admin/services/myah-platform-operation.service';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MyahPlatformWorkspaceSummary = {
  id: string;
  displayName: string | null;
  subdomain: string;
  customDomain: string | null;
  activationStatus: string;
};

@Injectable()
export class MyahPlatformWorkspaceService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
    private readonly featureFlagService: FeatureFlagService,
    private readonly operationService: MyahPlatformOperationService,
  ) {}

  async listWorkspaces({
    limit,
    offset,
    search,
  }: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ workspaces: MyahPlatformWorkspaceSummary[]; total: number }> {
    const where = this.buildSearch(search?.trim());
    const [workspaces, total] = await this.workspaceRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: Math.max(offset, 0),
      take: Math.min(Math.max(limit, 1), 100),
      where,
    });
    return {
      total,
      workspaces: workspaces.map((workspace) => ({
        id: workspace.id,
        displayName: workspace.displayName ?? null,
        subdomain: workspace.subdomain,
        customDomain: workspace.customDomain ?? null,
        activationStatus: workspace.activationStatus,
      })),
    };
  }

  async getFeatureFlags(workspaceId: string) {
    await this.assertWorkspace(workspaceId);
    return this.featureFlagService.getWorkspaceFeatureFlags(workspaceId);
  }

  async setFeatureFlag(input: {
    enabled: boolean;
    featureFlag: FeatureFlagKey;
    idempotencyKey: string;
    operatorId: string;
    workspaceId: string;
  }): Promise<MyahPlatformOperationEntity> {
    if (!IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey))
      throw new BadRequestException(
        'Idempotency-Key must be 8-200 URL-safe characters',
      );
    await this.assertWorkspace(input.workspaceId);
    const { operation, replayed } = await this.operationService.beginOperation({
      action: 'workspace-feature-flag.update',
      idempotencyKey: input.idempotencyKey,
      operatorId: input.operatorId,
      requestBody: {
        enabled: input.enabled,
        featureFlag: input.featureFlag,
        workspaceId: input.workspaceId,
      },
      resourceId: `${input.workspaceId}:${input.featureFlag}`,
      resourceType: 'workspace-feature-flag',
    });
    if (
      replayed &&
      (operation.status === MyahPlatformOperationStatus.SUCCEEDED ||
        operation.status === MyahPlatformOperationStatus.FAILED)
    )
      return operation;
    try {
      await this.operationService.markRunning(operation.id);
      const before = await this.featureFlagService.isFeatureEnabled(
        input.featureFlag,
        input.workspaceId,
      );
      await this.featureFlagService.upsertWorkspaceFeatureFlag({
        featureFlag: input.featureFlag,
        value: input.enabled,
        workspaceId: input.workspaceId,
      });
      return await this.operationService.markSucceeded(operation.id, {
        workspaceId: input.workspaceId,
        featureFlag: input.featureFlag,
        before,
        after: input.enabled,
      });
    } catch (error) {
      await this.operationService.markFailed(operation.id, {
        code: 'WORKSPACE_FEATURE_FLAG_UPDATE_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Workspace feature flag update failed',
      });
      throw error;
    }
  }

  private async assertWorkspace(id: string): Promise<void> {
    if ((await this.workspaceRepository.findOneBy({ id })) === null)
      throw new NotFoundException('Workspace not found');
  }
  private buildSearch(
    search: string | undefined,
  ): FindOptionsWhere<WorkspaceEntity> | FindOptionsWhere<WorkspaceEntity>[] {
    if (search === undefined || search === '') return {};
    const match = ILike(`%${search}%`);
    const conditions: FindOptionsWhere<WorkspaceEntity>[] = [
      { displayName: match },
      { subdomain: match },
      { customDomain: match },
    ];
    if (UUID_PATTERN.test(search)) conditions.push({ id: search });
    return conditions;
  }
}
