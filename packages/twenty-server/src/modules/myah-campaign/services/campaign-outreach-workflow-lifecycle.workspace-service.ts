import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { isNonEmptyArray } from 'twenty-shared/utils';

import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';

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
    private readonly workflowCommonWorkspaceService: WorkflowCommonWorkspaceService,
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

  async handleCampaignDeletion({
    authContext,
    campaignIds,
    operation,
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
        withDeleted: operation === 'destroy',
      });

      if (!isNonEmptyArray(workflows)) {
        return;
      }

      const workflowIds = workflows.map(({ id }) => id);

      await this.workflowCommonWorkspaceService.handleWorkflowSubEntities({
        operation,
        workflowIds,
        workspaceId,
      });

      if (operation === 'delete') {
        await workflowRepository.softDelete(workflowIds);

        return;
      }

      await workflowRepository.delete(workflowIds);
    }, authContext);
  }
}
