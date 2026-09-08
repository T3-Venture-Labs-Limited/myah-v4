import { ForbiddenException, Injectable } from '@nestjs/common';
import { isDefined } from 'twenty-shared/utils';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';

import { type CustomWorkspaceEntity } from 'src/engine/twenty-orm/custom.workspace-entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import {
  WorkflowVersionStatus,
  type WorkflowVersionWorkspaceEntity,
} from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { CampaignSequenceService } from 'src/modules/myah-outreach/services/campaign-sequence.service';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import {
  createListWorkflowRunsTool,
  type ListWorkflowRunsInput,
} from 'src/modules/workflow/workflow-tools/tools/list-workflow-runs.tool';

export type CampaignOutreachWorkflow = {
  campaignId: string;
  currentVersionId: string | null;
  name: string | null;
  workflowId: string;
};

type CampaignOutreachWorkflowArgs = {
  authContext?: WorkspaceAuthContext;
  campaignId: string;
  workspaceId: string;
};

type CampaignOutreachWorkflowRunsArgs = CampaignOutreachWorkflowArgs &
  Pick<ListWorkflowRunsInput, 'limit' | 'status'> & {
    rolePermissionConfig: RolePermissionConfig;
  };

@Injectable()
export class CampaignOutreachWorkflowService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly campaignSequenceService: CampaignSequenceService,
  ) {}

  async find({
    authContext,
    workspaceId,
    campaignId,
  }: CampaignOutreachWorkflowArgs): Promise<CampaignOutreachWorkflow | null> {
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        await this.assertCampaignIsAccessible({ workspaceId, campaignId });

        return this.findExistingOutreachWorkflow({ workspaceId, campaignId });
      },
      authContext,
    );
  }

  async listRuns({
    authContext,
    campaignId,
    limit,
    rolePermissionConfig,
    status,
    workspaceId,
  }: CampaignOutreachWorkflowRunsArgs) {
    const workflow = await this.find({ authContext, campaignId, workspaceId });

    if (!workflow) {
      return { success: true, workflowRuns: [] };
    }

    return createListWorkflowRunsTool(
      { globalWorkspaceOrmManager: this.globalWorkspaceOrmManager },
      { rolePermissionConfig, workspaceId },
      { outreachCampaignId: campaignId, workflowId: workflow.workflowId },
    ).execute({ limit, status });
  }

  async createOrGet({
    authContext,
    workspaceId,
    campaignId,
  }: CampaignOutreachWorkflowArgs): Promise<CampaignOutreachWorkflow> {
    if (!authContext) {
      throw new ForbiddenException(
        'Authenticated workspace context is required',
      );
    }

    const snapshot = await this.campaignSequenceService.createInitial({
      authContext,
      workspaceId,
      campaignId,
    });

    return {
      campaignId: snapshot.campaignId,
      currentVersionId: snapshot.versionId,
      name: 'Campaign Outreach',
      workflowId: snapshot.workflowId,
    };
  }

  private async assertCampaignIsAccessible({
    workspaceId,
    campaignId,
  }: CampaignOutreachWorkflowArgs): Promise<void> {
    const workspaceContext = getWorkspaceContext();
    const rolePermissionConfig = resolveRolePermissionConfig({
      authContext: workspaceContext.authContext,
      apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
      userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
    });

    const campaignRepository =
      await this.globalWorkspaceOrmManager.getRepository<CustomWorkspaceEntity>(
        workspaceId,
        'campaign',
        rolePermissionConfig ?? undefined,
      );
    const campaign = await campaignRepository.findOne({
      where: { id: campaignId },
    });

    if (!isDefined(campaign)) {
      throw new ForbiddenException('Campaign not found or inaccessible');
    }
  }

  private async findExistingOutreachWorkflow({
    workspaceId,
    campaignId,
  }: CampaignOutreachWorkflowArgs): Promise<CampaignOutreachWorkflow | null> {
    const workflowRepository = await this.getWorkflowRepository(workspaceId);
    const workflow = await workflowRepository.findOne({
      where: { outreachCampaignId: campaignId },
    });

    if (!isDefined(workflow)) {
      return null;
    }

    return this.toCampaignOutreachWorkflow({ workspaceId, workflow });
  }

  private async getWorkflowRepository(workspaceId: string) {
    return this.globalWorkspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
      workspaceId,
      'workflow',
      { shouldBypassPermissionChecks: true },
    );
  }

  private async getWorkflowVersionRepository(workspaceId: string) {
    return this.globalWorkspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
      workspaceId,
      'workflowVersion',
      { shouldBypassPermissionChecks: true },
    );
  }

  private async toCampaignOutreachWorkflow({
    workspaceId,
    workflow,
  }: {
    workspaceId: string;
    workflow: WorkflowWorkspaceEntity;
  }): Promise<CampaignOutreachWorkflow> {
    const workflowVersionRepository =
      await this.getWorkflowVersionRepository(workspaceId);
    const workflowVersions = await workflowVersionRepository.find({
      where: [
        { workflowId: workflow.id, status: WorkflowVersionStatus.DRAFT },
        { workflowId: workflow.id, status: WorkflowVersionStatus.ACTIVE },
      ],
    });
    const currentVersion =
      workflowVersions.find(
        (workflowVersion) =>
          workflowVersion.status === WorkflowVersionStatus.DRAFT,
      ) ??
      workflowVersions.find(
        (workflowVersion) =>
          workflowVersion.status === WorkflowVersionStatus.ACTIVE,
      );

    return {
      campaignId: workflow.outreachCampaignId ?? '',
      currentVersionId: currentVersion?.id ?? null,
      name: workflow.name,
      workflowId: workflow.id,
    };
  }
}
