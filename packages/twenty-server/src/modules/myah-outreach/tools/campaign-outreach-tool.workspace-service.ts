import { Inject, Injectable } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { z } from 'zod';

import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WORKFLOW_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/workflow-tool-service.token';
import { type RolePermissionConfig } from 'src/engine/twenty-orm/types/role-permission-config';
import { CampaignOutreachWorkflowService } from 'src/modules/myah-outreach/services/campaign-outreach-workflow.service';
import { campaignOutreachToolInputSchema } from 'src/modules/myah-outreach/tools/campaign-outreach-tool.schemas';
import { CampaignOutreachToolAccessGuardService } from 'src/modules/myah-outreach/tools/campaign-outreach-tool-access-guard.service';
import { getWorkflowToolOutreachAccessGuardTargets } from 'src/modules/workflow/workflow-tools/services/get-workflow-tool-outreach-access-guard-targets.util';
import { type WorkflowToolWorkspaceService } from 'src/modules/workflow/workflow-tools/services/workflow-tool.workspace-service';
import { type ListWorkflowRunsInput } from 'src/modules/workflow/workflow-tools/tools/list-workflow-runs.tool';

export type CampaignOutreachToolContext = {
  authContext: UserWorkspaceAuthContext;
  rolePermissionConfig: RolePermissionConfig;
};

const campaignToolNameByWorkflowToolName = {
  get_workflow_current_version:
    'get_campaign_outreach_workflow_current_version',
  create_draft_from_workflow_version: 'create_campaign_outreach_workflow_draft',
  create_workflow_version_step: 'create_campaign_outreach_workflow_step',
  update_workflow_version_step: 'update_campaign_outreach_workflow_step',
  delete_workflow_version_step: 'delete_campaign_outreach_workflow_step',
  create_workflow_version_edge: 'create_campaign_outreach_workflow_edge',
  delete_workflow_version_edge: 'delete_campaign_outreach_workflow_edge',
  update_workflow_version_trigger: 'update_campaign_outreach_workflow_trigger',
  update_workflow_version_positions:
    'update_campaign_outreach_workflow_positions',
  compute_step_output_schema: 'compute_campaign_outreach_step_output_schema',
  validate_workflow: 'validate_campaign_outreach_workflow',
  activate_workflow_version: 'activate_campaign_outreach_workflow',
  deactivate_workflow_version: 'deactivate_campaign_outreach_workflow',
  list_workflow_runs: 'list_campaign_outreach_workflow_runs',
  get_workflow_run: 'get_campaign_outreach_workflow_run',
  list_logic_function_tools: 'list_campaign_outreach_logic_function_tools',
  update_logic_function_source:
    'update_campaign_outreach_logic_function_source',
  update_agent: 'update_campaign_outreach_agent',
} as const;

const rewriteCampaignToolReferences = <T>(value: T): T => {
  if (typeof value === 'string') {
    return Object.entries(campaignToolNameByWorkflowToolName).reduce(
      (rewritten, [workflowToolName, campaignToolName]) =>
        rewritten.replace(new RegExp(workflowToolName, 'g'), campaignToolName),
      value,
    ) as T;
  }

  if (Array.isArray(value)) {
    return value.map(rewriteCampaignToolReferences) as T;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        rewriteCampaignToolReferences(nestedValue),
      ]),
    ) as T;
  }

  return value;
};

const rewriteCampaignNextStepInstructions = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(rewriteCampaignNextStepInstructions) as T;
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        key === 'nextStep' && typeof nestedValue === 'string'
          ? rewriteCampaignToolReferences(nestedValue)
          : rewriteCampaignNextStepInstructions(nestedValue),
      ]),
    ) as T;
  }

  return value;
};

@Injectable()
export class CampaignOutreachToolWorkspaceService {
  constructor(
    private readonly campaignOutreachWorkflowService: CampaignOutreachWorkflowService,
    @Inject(WORKFLOW_TOOL_SERVICE_TOKEN)
    private readonly workflowToolService: Pick<
      WorkflowToolWorkspaceService,
      'buildWorkflowToolSet'
    >,
    private readonly campaignOutreachToolAccessGuardService: CampaignOutreachToolAccessGuardService,
  ) {}

  generateCampaignOutreachTools(context: CampaignOutreachToolContext): ToolSet {
    const { authContext, rolePermissionConfig } = context;
    const workspaceId = authContext.workspace.id;
    const workflowTools = this.workflowToolService.buildWorkflowToolSet(
      workspaceId,
      rolePermissionConfig,
    );
    const guardedWorkflowTools = Object.entries(
      campaignToolNameByWorkflowToolName,
    ).flatMap(([workflowToolName, campaignToolName]) => {
      const tool = workflowTools[workflowToolName];

      if (
        !tool ||
        !('inputSchema' in tool) ||
        !(tool.inputSchema instanceof z.ZodType)
      ) {
        return [];
      }

      const execute = tool.execute;

      const action =
        workflowToolName === 'create_workflow_version_step'
          ? 'createWorkflowVersionStep'
          : workflowToolName === 'update_workflow_version_step'
            ? 'updateWorkflowVersionStep'
            : workflowToolName === 'update_logic_function_source'
              ? 'updateLogicFunctionSource'
              : 'ownedResource';

      const inputSchema = campaignOutreachToolInputSchema.and(tool.inputSchema);

      if (!execute) {
        return [[campaignToolName, { ...tool, inputSchema }]];
      }

      return [
        [
          campaignToolName,
          {
            ...tool,
            description:
              typeof tool.description === 'string'
                ? rewriteCampaignToolReferences(tool.description)
                : tool.description,
            inputSchema,
            execute: async (...args: Parameters<typeof execute>) => {
              const [parameters] = args;
              const { campaignId, ...workflowParameters } =
                parameters as Record<string, unknown>;

              if (typeof campaignId !== 'string') {
                throw new Error('campaignId is required');
              }

              if (workflowToolName === 'list_workflow_runs') {
                return this.campaignOutreachWorkflowService.listRuns({
                  authContext,
                  campaignId,
                  rolePermissionConfig,
                  workspaceId,
                  ...(workflowParameters as Pick<
                    ListWorkflowRunsInput,
                    'limit' | 'status'
                  >),
                });
              }

              const targets =
                getWorkflowToolOutreachAccessGuardTargets(workflowParameters);

              if (targets.length === 0) {
                await this.campaignOutreachWorkflowService.find({
                  authContext,
                  campaignId,
                  workspaceId,
                });
              }

              for (const target of targets) {
                await this.campaignOutreachToolAccessGuardService.assertTargetBelongsToCampaign(
                  {
                    action,
                    authContext,
                    campaignId,
                    target,
                  },
                );
              }

              args[0] = workflowParameters as never;

              return rewriteCampaignNextStepInstructions(
                await execute(...args),
              );
            },
          },
        ],
      ];
    });

    return {
      get_campaign_outreach_workflow: {
        name: 'get_campaign_outreach_workflow',
        description: 'Get the Campaign Outreach workflow for a Campaign.',
        inputSchema: campaignOutreachToolInputSchema,
        execute: ({ campaignId }) =>
          this.campaignOutreachWorkflowService.find({
            authContext,
            campaignId,
            workspaceId,
          }),
      },
      create_campaign_outreach_workflow: {
        name: 'create_campaign_outreach_workflow',
        description:
          'Create the Campaign Outreach workflow for a Campaign if needed.',
        inputSchema: campaignOutreachToolInputSchema,
        execute: ({ campaignId }) =>
          this.campaignOutreachWorkflowService.createOrGet({
            authContext,
            campaignId,
            workspaceId,
          }),
      },
      ...Object.fromEntries(guardedWorkflowTools),
    } as ToolSet;
  }
}
