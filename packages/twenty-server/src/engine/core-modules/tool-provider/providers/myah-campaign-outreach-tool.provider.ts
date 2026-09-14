import { Inject, Injectable, Optional } from '@nestjs/common';

import { type ToolSet } from 'ai';
import { ToolCategory } from 'twenty-shared/ai';
import { PermissionFlagType } from 'twenty-shared/constants';
import { MYAH_STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN } from 'src/engine/core-modules/tool-provider/constants/myah-campaign-outreach-tool-service.token';
import { type GenerateDescriptorOptions } from 'src/engine/core-modules/tool-provider/interfaces/generate-descriptor-options.type';
import { type ToolProvider } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider.interface';
import { type ToolProviderContext } from 'src/engine/core-modules/tool-provider/interfaces/tool-provider-context.type';
import { type ToolDescriptor } from 'src/engine/core-modules/tool-provider/types/tool-descriptor.type';
import { type ToolIndexEntry } from 'src/engine/core-modules/tool-provider/types/tool-index-entry.type';
import { executeMyahToolFromToolSet } from 'src/engine/core-modules/tool-provider/utils/execute-myah-tool-from-tool-set.util';
import { toolSetToDescriptors } from 'src/engine/core-modules/tool-provider/utils/tool-set-to-descriptors.util';
import { type ToolOutput } from 'src/engine/core-modules/tool/types/tool-output.type';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { type CampaignOutreachToolWorkspaceService } from 'src/modules/myah-outreach/tools/campaign-outreach-tool.workspace-service';

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

const cloneCampaignDescriptorSchema = (schema: object): object => {
  const clone = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(clone);
    }

    if (
      typeof value !== 'object' ||
      value === null ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        key === 'description' && typeof nestedValue === 'string'
          ? Object.entries(campaignToolNameByWorkflowToolName).reduce(
              (rewritten, [workflowToolName, campaignToolName]) =>
                rewritten.replace(
                  new RegExp(workflowToolName, 'g'),
                  campaignToolName,
                ),
              nestedValue,
            )
          : clone(nestedValue),
      ]),
    );
  };

  return clone(schema) as object;
};

@Injectable()
export class MyahCampaignOutreachToolProvider implements ToolProvider {
  readonly category = ToolCategory.MYAH_CAMPAIGN_OUTREACH;

  constructor(
    @Optional()
    @Inject(MYAH_CAMPAIGN_OUTREACH_TOOL_SERVICE_TOKEN)
    private readonly campaignOutreachToolService: CampaignOutreachToolWorkspaceService | null,
    private readonly permissionsService: PermissionsService,
    private readonly flatEntityMapsCacheService: WorkspaceManyOrAllFlatEntityMapsCacheService,
  ) {}

  async isAvailable(context: ToolProviderContext): Promise<boolean> {
    return (
      this.campaignOutreachToolService !== null &&
      this.getMatchingUserAuthContext(context) !== null &&
      (await this.hasActiveCampaignObject(context.workspaceId)) &&
      this.permissionsService.checkRolesPermissions(
        context.rolePermissionConfig,
        context.workspaceId,
        PermissionFlagType.WORKFLOWS,
      )
    );
  }

  async generateDescriptors(
    context: ToolProviderContext,
    options?: GenerateDescriptorOptions,
  ): Promise<(ToolIndexEntry | ToolDescriptor)[]> {
    const toolSet = await this.buildToolSet(context);

    if (!toolSet) {
      return [];
    }

    return toolSetToDescriptors(toolSet, this.category, {
      includeSchemas: options?.includeSchemas ?? true,
    }).map((descriptor) =>
      'inputSchema' in descriptor
        ? {
            ...descriptor,
            inputSchema: cloneCampaignDescriptorSchema(descriptor.inputSchema),
          }
        : descriptor,
    );
  }

  async executeStaticTool(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolProviderContext,
  ): Promise<ToolOutput> {
    const toolSet = await this.buildToolSet(context);

    if (!toolSet) {
      return {
        success: false,
        category: 'PERMISSION_DENIED',
        message: 'You do not have permission to perform this Myah action.',
        error: 'PERMISSION_DENIED',
      };
    }

    return executeMyahToolFromToolSet(toolSet, toolName, args, this.category);
  }

  private async buildToolSet(
    context: ToolProviderContext,
  ): Promise<ToolSet | null> {
    const authContext = this.getMatchingUserAuthContext(context);

    if (
      !authContext ||
      !this.campaignOutreachToolService ||
      !(await this.hasActiveCampaignObject(context.workspaceId)) ||
      !(await this.permissionsService.checkRolesPermissions(
        context.rolePermissionConfig,
        context.workspaceId,
        PermissionFlagType.WORKFLOWS,
      ))
    ) {
      return null;
    }

    return this.campaignOutreachToolService.generateCampaignOutreachTools({
      authContext,
      rolePermissionConfig: context.rolePermissionConfig,
    });
  }

  private async hasActiveCampaignObject(workspaceId: string): Promise<boolean> {
    const { flatObjectMetadataMaps } =
      await this.flatEntityMapsCacheService.getOrRecomputeManyOrAllFlatEntityMaps(
        {
          workspaceId,
          flatMapsKeys: ['flatObjectMetadataMaps'],
        },
      );

    return (
      flatObjectMetadataMaps.byUniversalIdentifier[
        MYAH_STANDARD_OBJECTS.campaign.universalIdentifier
      ]?.isActive === true
    );
  }

  private getMatchingUserAuthContext(
    context: ToolProviderContext,
  ): UserWorkspaceAuthContext | null {
    if (
      !context.authContext ||
      !isUserAuthContext(context.authContext) ||
      !context.authContext.user ||
      context.authContext.workspace.id !== context.workspaceId ||
      context.authContext.user.id !== context.userId ||
      context.authContext.userWorkspaceId !== context.userWorkspaceId ||
      context.authContext.workspaceMemberId !==
        context.actorContext?.workspaceMemberId
    ) {
      return null;
    }

    return context.authContext;
  }
}
