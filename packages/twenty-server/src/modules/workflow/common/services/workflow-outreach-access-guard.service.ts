import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type CustomWorkspaceEntity } from 'src/engine/twenty-orm/custom.workspace-entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import { type WorkflowVersionWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { type WorkflowRunWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';

@Injectable()
export class WorkflowOutreachAccessGuardService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async assertWorkflowIsAccessible({
    authContext,
    workflowId,
    workspaceId,
  }: {
    authContext?: WorkspaceAuthContext;
    workflowId: string;
    workspaceId: string;
  }): Promise<void> {
    const workflowRepository =
      await this.globalWorkspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
        workspaceId,
        'workflow',
        { shouldBypassPermissionChecks: true },
      );
    const workflow = await workflowRepository.findOne({
      where: { id: workflowId },
      select: { id: true, outreachCampaignId: true },
      withDeleted: true,
    });

    if (!isDefined(workflow?.outreachCampaignId)) {
      return;
    }

    const outreachCampaignId = workflow.outreachCampaignId;

    const assertCampaignIsAccessible = async (): Promise<void> => {
      const workspaceContext = getWorkspaceContext();
      const rolePermissionConfig = resolveRolePermissionConfig({
        apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
        authContext: workspaceContext.authContext,
        userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      });
      const campaignRepository =
        await this.globalWorkspaceOrmManager.getRepository<CustomWorkspaceEntity>(
          workspaceId,
          'campaign',
          rolePermissionConfig ?? undefined,
        );
      const campaign = await campaignRepository.findOne({
        where: { id: outreachCampaignId },
        select: { id: true },
      });

      if (!isDefined(campaign)) {
        throw new WorkflowQueryValidationException(
          'Campaign Outreach workflow is not accessible',
          WorkflowQueryValidationExceptionCode.FORBIDDEN,
        );
      }
    };

    const effectiveAuthContext = authContext ?? getWorkspaceAuthContext();

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      assertCampaignIsAccessible,
      effectiveAuthContext,
    );
  }

  async assertWorkflowVersionIsAccessible({
    authContext,
    workflowVersionId,
    workspaceId,
  }: {
    authContext?: WorkspaceAuthContext;
    workflowVersionId: string;
    workspaceId: string;
  }): Promise<void> {
    const workflowVersionRepository =
      await this.globalWorkspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
        workspaceId,
        'workflowVersion',
        { shouldBypassPermissionChecks: true },
      );
    const workflowVersion = await workflowVersionRepository.findOne({
      where: { id: workflowVersionId },
      select: { workflowId: true },
      withDeleted: true,
    });

    if (!isDefined(workflowVersion)) {
      return;
    }

    await this.assertWorkflowIsAccessible({
      authContext,
      workflowId: workflowVersion.workflowId,
      workspaceId,
    });
  }

  async assertWorkflowRunIsAccessible({
    authContext,
    workflowRunId,
    workspaceId,
  }: {
    authContext?: WorkspaceAuthContext;
    workflowRunId: string;
    workspaceId: string;
  }): Promise<void> {
    const workflowRunRepository =
      await this.globalWorkspaceOrmManager.getRepository<WorkflowRunWorkspaceEntity>(
        workspaceId,
        'workflowRun',
        { shouldBypassPermissionChecks: true },
      );
    const workflowRun = await workflowRunRepository.findOne({
      where: { id: workflowRunId },
      select: { workflowId: true },
      withDeleted: true,
    });

    if (!isDefined(workflowRun)) {
      return;
    }

    await this.assertWorkflowIsAccessible({
      authContext,
      workflowId: workflowRun.workflowId,
      workspaceId,
    });
  }
}
