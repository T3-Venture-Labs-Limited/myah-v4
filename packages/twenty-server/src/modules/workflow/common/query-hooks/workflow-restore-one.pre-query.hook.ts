import { assertIsDefinedOrThrow } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type RestoreOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

@WorkspaceQueryHook('workflow.restoreOne')
export class WorkflowRestoreOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: RestoreOneResolverArgs,
  ): Promise<RestoreOneResolverArgs> {
    const { workspace } = authContext;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    await this.workflowOutreachAccessGuardService.assertWorkflowIsAccessible({
      authContext,
      workflowId: payload.id,
      workspaceId: workspace.id,
    });

    return payload;
  }
}
