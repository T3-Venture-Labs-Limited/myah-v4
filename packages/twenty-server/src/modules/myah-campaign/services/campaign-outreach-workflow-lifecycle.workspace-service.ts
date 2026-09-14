import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkspaceEntityManager } from 'src/engine/twenty-orm/entity-manager/workspace-entity-manager';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { getWorkspaceSchemaName } from 'src/engine/workspace-datasource/utils/get-workspace-schema-name.util';
import { escapeIdentifier } from 'src/engine/workspace-manager/workspace-migration/utils/remove-sql-injection.util';
import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';

type CampaignDeletionOperation = 'delete' | 'destroy';

type CampaignLifecycleArgs = {
  authContext: WorkspaceAuthContext;
  campaignIds: string[];
  operation: CampaignDeletionOperation;
  workspaceId: string;
};

@Injectable()
export class CampaignOutreachWorkflowLifecycleWorkspaceService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async assertCampaignsAreAccessible({
    authContext,
    campaignIds,
    workspaceId,
  }: Pick<
    CampaignLifecycleArgs,
    'authContext' | 'campaignIds' | 'workspaceId'
  >): Promise<void> {
    const uniqueCampaignIds = [...new Set(campaignIds)];

    if (!isNonEmptyArray(uniqueCampaignIds)) {
      return;
    }

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const workspaceContext = getWorkspaceContext();
      const rolePermissionConfig = resolveRolePermissionConfig({
        apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
        authContext: workspaceContext.authContext,
        userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      });
      const campaignRepository =
        await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'campaign',
          rolePermissionConfig ?? undefined,
        );
      const accessibleCampaigns = await campaignRepository.find({
        where: { id: In(uniqueCampaignIds) },
        select: { id: true },
        withDeleted: true,
      });

      if (accessibleCampaigns.length !== uniqueCampaignIds.length) {
        throw new WorkflowQueryValidationException(
          'Campaign is not accessible',
          WorkflowQueryValidationExceptionCode.FORBIDDEN,
        );
      }
    }, authContext);
  }

  async assertCampaignDeletionAllowedInTransaction({
    authContext,
    campaignIds,
    entityManager,
    workspaceId,
  }: Pick<
    CampaignLifecycleArgs,
    'authContext' | 'campaignIds' | 'workspaceId'
  > & {
    entityManager: WorkspaceEntityManager;
  }): Promise<void> {
    const uniqueCampaignIds = [...new Set(campaignIds)].sort();

    if (!isNonEmptyArray(uniqueCampaignIds)) {
      return;
    }

    const queryRunner = entityManager.queryRunner;

    if (!queryRunner?.isTransactionActive) {
      throw new WorkflowQueryValidationException(
        'Campaign deletion requires a transaction.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }

    const workspaceContext = getWorkspaceContext();
    const rolePermissionConfig = resolveRolePermissionConfig({
      apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
      authContext: workspaceContext.authContext,
      userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
    });
    const campaignRepository = entityManager.getRepository(
      'campaign',
      rolePermissionConfig ?? undefined,
      authContext,
    );
    const accessibleCampaigns = await campaignRepository.find({
      where: { id: In(uniqueCampaignIds) },
      select: { id: true },
      withDeleted: true,
    });

    if (accessibleCampaigns.length !== uniqueCampaignIds.length) {
      throw new WorkflowQueryValidationException(
        'Campaign is not accessible',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }

    for (const campaignId of uniqueCampaignIds) {
      await queryRunner.query(
        'SELECT pg_advisory_xact_lock(hashtext(($1::uuid)::text), hashtext(($2::uuid)::text))',
        [workspaceId, campaignId],
      );
    }

    const schemaName = getWorkspaceSchemaName(workspaceId);
    const campaignTable = `${escapeIdentifier(schemaName)}.${escapeIdentifier('campaign')}`;
    const workflowTable = `${escapeIdentifier(schemaName)}.${escapeIdentifier('workflow')}`;
    const lockedCampaigns = (await queryRunner.query(
      `SELECT "id"
         FROM ${campaignTable}
        WHERE "id" = ANY($1::uuid[])
        ORDER BY "id"
        FOR UPDATE`,
      [uniqueCampaignIds],
    )) as Array<{ id: string }>;

    if (lockedCampaigns.length !== uniqueCampaignIds.length) {
      throw new WorkflowQueryValidationException(
        'Campaign is not accessible',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }

    const retainedWorkflows = (await queryRunner.query(
      `SELECT "id"
         FROM ${workflowTable}
        WHERE "outreachCampaignId" = ANY($1::uuid[])
        LIMIT 1`,
      [uniqueCampaignIds],
    )) as Array<{ id: string }>;

    if (isNonEmptyArray(retainedWorkflows)) {
      throw new WorkflowQueryValidationException(
        'Campaigns with outreach definitions cannot be deleted.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
  }

  async assertCampaignDeletionAllowed({
    authContext,
    campaignIds,
    workspaceId,
  }: Pick<
    CampaignLifecycleArgs,
    'authContext' | 'campaignIds' | 'workspaceId'
  >): Promise<void> {
    if (!isNonEmptyArray(campaignIds)) {
      return;
    }

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowRepository =
        await this.globalWorkspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
          workspaceId,
          'workflow',
          { shouldBypassPermissionChecks: true },
        );
      const workflows = await workflowRepository.find({
        where: { outreachCampaignId: In(campaignIds) },
        withDeleted: true,
      });

      this.assertCampaignsHaveNoOutreachWorkflows(workflows);
    }, authContext);
  }

  async handleCampaignDeletion({
    authContext,
    campaignIds,
    workspaceId,
  }: CampaignLifecycleArgs): Promise<void> {
    if (!isNonEmptyArray(campaignIds)) {
      return;
    }

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowRepository =
        await this.globalWorkspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
          workspaceId,
          'workflow',
          { shouldBypassPermissionChecks: true },
        );
      const workflows = await workflowRepository.find({
        where: { outreachCampaignId: In(campaignIds) },
        withDeleted: true,
      });

      this.assertCampaignsHaveNoOutreachWorkflows(workflows);
    }, authContext);
  }

  private assertCampaignsHaveNoOutreachWorkflows(
    workflows: WorkflowWorkspaceEntity[],
  ): void {
    if (isNonEmptyArray(workflows)) {
      throw new WorkflowQueryValidationException(
        'Campaigns with outreach definitions cannot be deleted.',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
  }
}
