import { ForbiddenException, Injectable } from '@nestjs/common';

import { WorkflowActionType } from 'twenty-shared/workflow';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type CustomWorkspaceEntity } from 'src/engine/twenty-orm/custom.workspace-entity';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { getWorkspaceContext } from 'src/engine/twenty-orm/storage/orm-workspace-context.storage';
import { resolveRolePermissionConfig } from 'src/engine/twenty-orm/utils/resolve-role-permission-config.util';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type FlatLogicFunction } from 'src/engine/metadata-modules/logic-function/types/flat-logic-function.type';
import { type WorkflowRunWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import { type WorkflowVersionWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';

export type CampaignOutreachTarget =
  | { type: 'workflow'; id: string }
  | { type: 'workflowVersion'; id: string }
  | { type: 'workflowRun'; id: string }
  | { type: 'agent'; id: string }
  | { type: 'logicFunction'; id: string };

export type CampaignOutreachGuardAction =
  | 'createWorkflowVersionStep'
  | 'updateWorkflowVersionStep'
  | 'updateLogicFunctionSource'
  | 'ownedResource';

const getStepResourceId = ({
  resourceProperty,
  stepInput,
}: {
  resourceProperty: 'agentId' | 'logicFunctionId';
  stepInput: unknown;
}) => {
  if (typeof stepInput !== 'object' || stepInput === null) return undefined;

  const resourceId = (stepInput as Record<string, unknown>)[resourceProperty];

  return typeof resourceId === 'string' ? resourceId : undefined;
};

@Injectable()
export class CampaignOutreachToolAccessGuardService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {}

  async assertTargetBelongsToCampaign({
    action,
    authContext,
    campaignId,
    target,
  }: {
    action?: CampaignOutreachGuardAction;
    authContext: UserWorkspaceAuthContext;
    campaignId: string;
    target: CampaignOutreachTarget;
  }): Promise<void> {
    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const workspaceContext = getWorkspaceContext();
      const rolePermissionConfig = resolveRolePermissionConfig({
        authContext,
        apiKeyRoleMap: workspaceContext.apiKeyRoleMap,
        userWorkspaceRoleMap: workspaceContext.userWorkspaceRoleMap,
      });
      const campaignRepository =
        await this.globalWorkspaceOrmManager.getRepository<CustomWorkspaceEntity>(
          authContext.workspace.id,
          'campaign',
          rolePermissionConfig ?? undefined,
        );
      const campaign = await campaignRepository.findOne({
        where: { id: campaignId },
      });

      if (!campaign) {
        throw new ForbiddenException('Campaign not found or inaccessible');
      }

      const workflowIds = await this.getOwningWorkflowIds({
        target,
        workspaceId: authContext.workspace.id,
      });

      if (
        target.type === 'logicFunction' &&
        (action === 'createWorkflowVersionStep' ||
          action === 'updateWorkflowVersionStep') &&
        workflowIds.length === 0
      ) {
        await this.assertLogicFunctionIsReusable({
          target,
          workspaceId: authContext.workspace.id,
        });

        return;
      }
      if (workflowIds.length === 0) {
        throw new ForbiddenException(
          'Campaign Outreach target not found or inaccessible',
        );
      }

      const workflowRepository =
        await this.globalWorkspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
          authContext.workspace.id,
          'workflow',
          { shouldBypassPermissionChecks: true },
        );
      const workflows = await Promise.all(
        workflowIds.map((id) => workflowRepository.findOne({ where: { id } })),
      );

      if (
        workflows.some(
          (workflow) => workflow?.outreachCampaignId !== campaignId,
        )
      ) {
        throw new ForbiddenException(
          'Campaign Outreach target not found or inaccessible',
        );
      }
    }, authContext);
  }

  private async getOwningWorkflowIds({
    target,
    workspaceId,
  }: {
    target: CampaignOutreachTarget;
    workspaceId: string;
  }): Promise<string[]> {
    if (target.type === 'workflow') return [target.id];

    if (target.type === 'workflowVersion') {
      const repository =
        await this.globalWorkspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
          workspaceId,
          'workflowVersion',
          { shouldBypassPermissionChecks: true },
        );
      const version = await repository.findOne({ where: { id: target.id } });

      return version ? [version.workflowId] : [];
    }

    if (target.type === 'workflowRun') {
      const repository =
        await this.globalWorkspaceOrmManager.getRepository<WorkflowRunWorkspaceEntity>(
          workspaceId,
          'workflowRun',
          { shouldBypassPermissionChecks: true },
        );
      const run = await repository.findOne({ where: { id: target.id } });

      return run ? [run.workflowId] : [];
    }

    const repository =
      await this.globalWorkspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
        workspaceId,
        'workflowVersion',
        { shouldBypassPermissionChecks: true },
      );
    const resourceProperty =
      target.type === 'agent' ? 'agentId' : 'logicFunctionId';
    const workflowIds = new Set<string>();

    for (const version of await repository.find()) {
      if (
        version.steps?.some((step) => {
          const resourceId = getStepResourceId({
            resourceProperty,
            stepInput: step.settings?.input,
          });

          return (
            resourceId === target.id &&
            (target.type !== 'logicFunction' ||
              step.type === WorkflowActionType.CODE)
          );
        })
      ) {
        workflowIds.add(version.workflowId);
      }
    }

    return [...workflowIds];
  }
  private async assertLogicFunctionIsReusable({
    target,
    workspaceId,
  }: {
    target: Extract<CampaignOutreachTarget, { type: 'logicFunction' }>;
    workspaceId: string;
  }): Promise<void> {
    const { flatLogicFunctionMaps } =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        {
          workspaceId,
          flatMapsKeys: ['flatLogicFunctionMaps'],
        },
      );
    const logicFunction = Object.values(
      flatLogicFunctionMaps.byUniversalIdentifier,
    ).find(
      (candidate): candidate is FlatLogicFunction =>
        candidate?.id === target.id,
    );

    if (
      !logicFunction ||
      logicFunction.deletedAt !== null ||
      !logicFunction.workflowActionTriggerSettings
    ) {
      throw new ForbiddenException(
        'Campaign Outreach target not found or inaccessible',
      );
    }
  }
}
