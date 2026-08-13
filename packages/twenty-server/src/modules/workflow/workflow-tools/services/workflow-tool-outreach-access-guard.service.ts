import { Injectable } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import { WorkflowActionType } from 'twenty-shared/workflow';
import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { type WorkflowRunWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-run.workspace-entity';
import { type WorkflowVersionWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import { type WorkflowToolOutreachAccessGuardTarget } from 'src/modules/workflow/workflow-tools/services/get-workflow-tool-outreach-access-guard-targets.util';

const getStepResourceId = ({
  resourceProperty,
  stepInput,
}: {
  resourceProperty: 'agentId' | 'logicFunctionId';
  stepInput: unknown;
}) => {
  if (typeof stepInput !== 'object' || stepInput === null) {
    return undefined;
  }

  const resourceId = (stepInput as Record<string, unknown>)[resourceProperty];

  return typeof resourceId === 'string' ? resourceId : undefined;
};

const hasStepResource = ({
  resourceId,
  resourceProperty,
  stepInput,
  stepType,
}: {
  resourceId: string;
  resourceProperty: 'agentId' | 'logicFunctionId';
  stepInput: unknown;
  stepType: unknown;
}) =>
  (resourceProperty !== 'logicFunctionId' ||
    stepType === WorkflowActionType.CODE) &&
  getStepResourceId({ resourceProperty, stepInput }) === resourceId;

@Injectable()
export class WorkflowToolOutreachAccessGuardService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async assertWorkflowIsGeneralAutomation({
    workspaceId,
    workflowId,
  }: {
    workspaceId: string;
    workflowId: string;
  }): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.assertWorkflowIsGeneralAutomationInWorkspace({
          workspaceId,
          workflowId,
        }),
      authContext,
    );
  }

  async getCampaignOutreachLogicFunctionIds({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<Set<string>> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const workflowRepository =
          await this.globalWorkspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
            workspaceId,
            'workflow',
            { shouldBypassPermissionChecks: true },
          );
        const campaignWorkflowIds = new Set(
          (
            await workflowRepository.find({
              where: { outreachCampaignId: Not(IsNull()) },
            })
          ).map((workflow) => workflow.id),
        );
        const workflowVersionRepository =
          await this.globalWorkspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
            workspaceId,
            'workflowVersion',
            { shouldBypassPermissionChecks: true },
          );
        const workflowVersions = await workflowVersionRepository.find();
        const logicFunctionIds = new Set<string>();

        for (const workflowVersion of workflowVersions) {
          if (!campaignWorkflowIds.has(workflowVersion.workflowId)) {
            continue;
          }

          for (const step of workflowVersion.steps ?? []) {
            if (step.type !== WorkflowActionType.CODE) {
              continue;
            }

            const logicFunctionId = getStepResourceId({
              resourceProperty: 'logicFunctionId',
              stepInput: step.settings?.input,
            });

            if (isDefined(logicFunctionId)) {
              logicFunctionIds.add(logicFunctionId);
            }
          }
        }

        return logicFunctionIds;
      },
      authContext,
    );
  }

  async assertWorkflowVersionIsGeneralAutomation({
    workspaceId,
    workflowVersionId,
  }: {
    workspaceId: string;
    workflowVersionId: string;
  }): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowVersionRepository =
        await this.globalWorkspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
          workspaceId,
          'workflowVersion',
          { shouldBypassPermissionChecks: true },
        );
      const workflowVersion = await workflowVersionRepository.findOne({
        where: { id: workflowVersionId },
      });

      if (isDefined(workflowVersion)) {
        await this.assertWorkflowIsGeneralAutomationInWorkspace({
          workspaceId,
          workflowId: workflowVersion.workflowId,
        });
      }
    }, authContext);
  }

  async assertTargetIsGeneralAutomation({
    target,
    workspaceId,
  }: {
    target: WorkflowToolOutreachAccessGuardTarget;
    workspaceId: string;
  }): Promise<void> {
    switch (target.type) {
      case 'workflow':
        return this.assertWorkflowIsGeneralAutomation({
          workspaceId,
          workflowId: target.id,
        });
      case 'workflowVersion':
        return this.assertWorkflowVersionIsGeneralAutomation({
          workspaceId,
          workflowVersionId: target.id,
        });
      case 'workflowRun':
        return this.assertWorkflowRunIsGeneralAutomation({
          workspaceId,
          workflowRunId: target.id,
        });
      case 'agent':
      case 'logicFunction':
        return this.assertStepResourceIsGeneralAutomation({
          resourceId: target.id,
          resourceType: target.type,
          workspaceId,
        });
    }
  }

  private async assertWorkflowRunIsGeneralAutomation({
    workspaceId,
    workflowRunId,
  }: {
    workspaceId: string;
    workflowRunId: string;
  }): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowRunRepository =
        await this.globalWorkspaceOrmManager.getRepository<WorkflowRunWorkspaceEntity>(
          workspaceId,
          'workflowRun',
          { shouldBypassPermissionChecks: true },
        );
      const workflowRun = await workflowRunRepository.findOne({
        where: { id: workflowRunId },
      });

      if (isDefined(workflowRun)) {
        await this.assertWorkflowIsGeneralAutomationInWorkspace({
          workspaceId,
          workflowId: workflowRun.workflowId,
        });
      }
    }, authContext);
  }

  private async assertStepResourceIsGeneralAutomation({
    resourceId,
    resourceType,
    workspaceId,
  }: {
    resourceId: string;
    resourceType: 'agent' | 'logicFunction';
    workspaceId: string;
  }): Promise<void> {
    const authContext = buildSystemAuthContext(workspaceId);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(async () => {
      const workflowVersionRepository =
        await this.globalWorkspaceOrmManager.getRepository<WorkflowVersionWorkspaceEntity>(
          workspaceId,
          'workflowVersion',
          { shouldBypassPermissionChecks: true },
        );
      const workflowVersions = await workflowVersionRepository.find();
      const resourceProperty =
        resourceType === 'agent' ? 'agentId' : 'logicFunctionId';
      const workflowVersionsWithResource = workflowVersions.filter((version) =>
        version.steps?.some((step) =>
          hasStepResource({
            resourceId,
            resourceProperty,
            stepInput: step.settings?.input,
            stepType: step.type,
          }),
        ),
      );

      for (const workflowVersion of workflowVersionsWithResource) {
        await this.assertWorkflowIsGeneralAutomationInWorkspace({
          workspaceId,
          workflowId: workflowVersion.workflowId,
        });
      }
    }, authContext);
  }

  private async assertWorkflowIsGeneralAutomationInWorkspace({
    workspaceId,
    workflowId,
  }: {
    workspaceId: string;
    workflowId: string;
  }): Promise<void> {
    const workflowRepository =
      await this.globalWorkspaceOrmManager.getRepository<WorkflowWorkspaceEntity>(
        workspaceId,
        'workflow',
        { shouldBypassPermissionChecks: true },
      );
    const workflow = await workflowRepository.findOne({
      where: { id: workflowId },
    });

    if (isDefined(workflow?.outreachCampaignId)) {
      throw new WorkflowQueryValidationException(
        'Campaign Outreach workflows can only be accessed through Campaign Outreach',
        WorkflowQueryValidationExceptionCode.FORBIDDEN,
      );
    }
  }
}
