import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowCampaignAssignmentService } from 'src/modules/workflow/common/services/workflow-campaign-assignment.service';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';

@WorkspaceQueryHook(`workflow.createMany`)
export class WorkflowCreateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workflowCampaignAssignmentService: WorkflowCampaignAssignmentService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: CreateManyResolverArgs<WorkflowWorkspaceEntity>,
  ): Promise<CreateManyResolverArgs<WorkflowWorkspaceEntity>> {
    const sanitizedData = payload.data.map((workflow) => {
      const { statuses: _statuses, ...workflowWithoutStatuses } = workflow; // silent not to break creation from view with filter

      return workflowWithoutStatuses as WorkflowWorkspaceEntity;
    });
    const preparedPayloads = await Promise.all(
      sanitizedData.map((data) =>
        this.workflowCampaignAssignmentService.prepareCreateOne(
          authContext,
          objectName,
          { data, upsert: payload.upsert },
        ),
      ),
    );

    return {
      ...payload,
      data: preparedPayloads.map(({ data }) => data),
    };
  }
}
