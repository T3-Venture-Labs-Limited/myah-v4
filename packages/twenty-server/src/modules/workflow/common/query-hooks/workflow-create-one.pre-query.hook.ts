import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import { WorkflowCampaignAssignmentService } from 'src/modules/workflow/common/services/workflow-campaign-assignment.service';

@WorkspaceQueryHook(`workflow.createOne`)
export class WorkflowCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workflowCampaignAssignmentService: WorkflowCampaignAssignmentService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateOneResolverArgs<WorkflowWorkspaceEntity>,
  ): Promise<CreateOneResolverArgs<WorkflowWorkspaceEntity>> {
    const { statuses: _statuses, ...dataWithoutStatuses } = payload.data;

    return this.workflowCampaignAssignmentService.prepareCreateOne(
      authContext,
      objectName,
      {
        ...payload,
        data: dataWithoutStatuses as WorkflowWorkspaceEntity,
      },
    );
  }
}
