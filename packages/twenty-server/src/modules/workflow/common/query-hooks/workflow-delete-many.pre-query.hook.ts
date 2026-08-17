import { assertIsDefinedOrThrow } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type DeleteManyResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import {
  WorkflowQueryValidationException,
  WorkflowQueryValidationExceptionCode,
} from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

type WorkflowIdFilter = {
  id?: {
    in?: unknown;
  };
};

const getWorkflowIds = (filter: WorkflowIdFilter): string[] => {
  const workflowIds = filter.id?.in;

  if (
    !Array.isArray(workflowIds) ||
    workflowIds.length === 0 ||
    !workflowIds.every((workflowId) => typeof workflowId === 'string')
  ) {
    throw new WorkflowQueryValidationException(
      'Bulk workflow deletion requires explicit workflow IDs.',
      WorkflowQueryValidationExceptionCode.FORBIDDEN,
    );
  }

  return workflowIds;
};

@WorkspaceQueryHook('workflow.deleteMany')
export class WorkflowDeleteManyPreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: DeleteManyResolverArgs<WorkflowIdFilter>,
  ): Promise<DeleteManyResolverArgs<WorkflowIdFilter>> {
    const workspace = authContext.workspace;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    for (const workflowId of getWorkflowIds(payload.filter)) {
      await this.workflowOutreachAccessGuardService.assertWorkflowIsAccessible({
        authContext,
        workflowId,
        workspaceId: workspace.id,
      });
    }

    return payload;
  }
}
