import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type WorkflowWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow.workspace-entity';
import { WorkflowOutreachAssociationGuardService } from 'src/modules/workflow/common/services/workflow-outreach-association-guard.service';

@WorkspaceQueryHook(`workflow.createMany`)
export class WorkflowCreateManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workflowOutreachAssociationGuardService: WorkflowOutreachAssociationGuardService,
  ) {}
  async execute(
    _authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateManyResolverArgs<WorkflowWorkspaceEntity>,
  ): Promise<CreateManyResolverArgs<WorkflowWorkspaceEntity>> {
    for (const workflow of payload.data) {
      await this.workflowOutreachAssociationGuardService.assertNoOutreachAssociation(
        workflow,
      );
    }

    return {
      ...payload,
      data: payload.data.map((workflow) => {
        const { statuses: _statuses, ...workflowWithoutStatuses } = workflow;

        return workflowWithoutStatuses as WorkflowWorkspaceEntity;
      }),
    };
  }
}
