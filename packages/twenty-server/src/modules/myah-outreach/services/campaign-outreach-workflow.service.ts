import { ForbiddenException, Injectable } from '@nestjs/common';
import { isDefined } from 'twenty-shared/utils';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';

import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { type WorkspaceQueryRunner } from 'src/engine/twenty-orm/query-runner/workspace-query-runner';

import { RecordPositionService } from 'src/engine/core-modules/record-position/services/record-position.service';
import { type CustomWorkspaceEntity } from 'src/engine/twenty-orm/custom.workspace-entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import {
  WorkflowVersionStatus,
  type WorkflowVersionWorkspaceEntity,
} from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
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

type PostgresError = {
  code?: string;
};

const isPostgresUniqueViolation = (error: unknown): error is PostgresError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
};

@Injectable()
export class CampaignOutreachWorkflowService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly recordPositionService: RecordPositionService,
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
    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        await this.assertCampaignIsAccessible({ workspaceId, campaignId });

        const workspaceDataSource =
          await this.globalWorkspaceOrmManager.getGlobalWorkspaceDataSource();
        const queryRunner = workspaceDataSource.createQueryRunner();
        let workflowWasInserted = false;

        try {
          await queryRunner.connect();
          await queryRunner.startTransaction();

          const workflowRepository =
            await this.getWorkflowRepository(workspaceId);
          const existingWorkflow = await workflowRepository.findOne(
            {
              where: { outreachCampaignId: campaignId },
              lock: { mode: 'pessimistic_write' },
            },
            queryRunner.manager,
          );

          if (isDefined(existingWorkflow)) {
            await queryRunner.commitTransaction();

            return this.toCampaignOutreachWorkflow({
              workspaceId,
              workflow: existingWorkflow,
              queryRunner,
            });
          }

          const workflowPosition =
            await this.recordPositionService.buildRecordPosition({
              value: 'first',
              objectMetadata: {
                isCustom: false,
                nameSingular: 'workflow',
              },
              workspaceId,
            });
          const workflowInsertResult = await workflowRepository.insert(
            {
              name: 'Campaign Outreach',
              outreachCampaignId: campaignId,
              position: workflowPosition,
            },
            queryRunner.manager,
          );
          workflowWasInserted = true;

          const workflowId = (
            workflowInsertResult.generatedMaps[0] as { id?: string } | undefined
          )?.id;

          if (!isDefined(workflowId)) {
            throw new Error(
              'Campaign Outreach workflow creation returned no ID',
            );
          }

          const workflowVersionPosition =
            await this.recordPositionService.buildRecordPosition({
              value: 'first',
              objectMetadata: {
                isCustom: false,
                nameSingular: 'workflowVersion',
              },
              workspaceId,
            });
          const workflowVersionRepository =
            await this.getWorkflowVersionRepository(workspaceId);
          const workflowVersionInsertResult =
            await workflowVersionRepository.insert(
              {
                name: 'v1',
                position: workflowVersionPosition,
                status: WorkflowVersionStatus.DRAFT,
                workflowId,
              },
              queryRunner.manager,
            );
          const currentVersionId = (
            workflowVersionInsertResult.generatedMaps[0] as
              | { id?: string }
              | undefined
          )?.id;

          if (!isDefined(currentVersionId)) {
            throw new Error(
              'Campaign Outreach workflow draft creation returned no ID',
            );
          }

          await queryRunner.commitTransaction();

          return {
            campaignId,
            currentVersionId,
            name: 'Campaign Outreach',
            workflowId,
          };
        } catch (error) {
          if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
          }

          if (!workflowWasInserted && isPostgresUniqueViolation(error)) {
            const workflow = await this.findExistingOutreachWorkflow({
              workspaceId,
              campaignId,
            });

            if (isDefined(workflow)) {
              return workflow;
            }
          }

          throw error;
        } finally {
          await queryRunner.release();
        }
      },
      authContext,
    );
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
    queryRunner,
  }: {
    workspaceId: string;
    workflow: WorkflowWorkspaceEntity;
    queryRunner?: WorkspaceQueryRunner;
  }): Promise<CampaignOutreachWorkflow> {
    const workflowVersionRepository =
      await this.getWorkflowVersionRepository(workspaceId);
    const workflowVersions = await workflowVersionRepository.find(
      {
        where: [
          { workflowId: workflow.id, status: WorkflowVersionStatus.DRAFT },
          { workflowId: workflow.id, status: WorkflowVersionStatus.ACTIVE },
        ],
      },
      queryRunner?.manager,
    );
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
