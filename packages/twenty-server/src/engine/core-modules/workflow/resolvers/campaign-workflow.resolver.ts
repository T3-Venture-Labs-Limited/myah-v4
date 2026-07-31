import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { CoreResolver } from 'src/engine/api/graphql/graphql-config/decorators/core-resolver.decorator';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { CopyGeneralAutomationToCampaignInput } from 'src/engine/core-modules/workflow/dtos/copy-general-automation-to-campaign.input';
import { WorkflowVersionDTO } from 'src/engine/core-modules/workflow/dtos/workflow-version.dto';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/metadata-modules/permissions/utils/permissions-graphql-api-exception.filter';
import { WorkflowCampaignAssignmentService } from 'src/modules/workflow/common/services/workflow-campaign-assignment.service';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import { WorkflowVersionWorkspaceService } from 'src/modules/workflow/workflow-builder/workflow-version/workflow-version.workspace-service';

@CoreResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(
  PermissionsGraphqlApiExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
)
export class CampaignWorkflowResolver {
  constructor(
    private readonly workflowCampaignAssignmentService: WorkflowCampaignAssignmentService,
    private readonly workflowVersionWorkspaceService: WorkflowVersionWorkspaceService,
  ) {}

  @UseGuards(WorkspaceAuthGuard, UserAuthGuard)
  @Mutation(() => WorkflowVersionDTO)
  async copyGeneralAutomationToCampaign(
    @AuthWorkspace() { id: workspaceId }: WorkspaceEntity,
    @Args('input') {
      campaignId,
      sourceWorkflowId,
      sourceWorkflowVersionId,
    }: CopyGeneralAutomationToCampaignInput,
  ): Promise<WorkflowVersionDTO> {
    const authContext = getWorkspaceAuthContext();
    const workflowAssignment = {
      campaignId,
      sourceWorkflowId,
    } satisfies Partial<WorkflowWorkspaceEntity>;

    await this.workflowCampaignAssignmentService.prepareCreateOne(
      authContext,
      'workflow',
      { data: workflowAssignment },
    );

    return this.workflowVersionWorkspaceService.duplicateWorkflow({
      workspaceId,
      workflowIdToDuplicate: sourceWorkflowId,
      workflowVersionIdToCopy: sourceWorkflowVersionId,
      workflowAssignment,
    });
  }
}
