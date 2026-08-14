import { assertIsDefinedOrThrow } from 'twenty-shared/utils';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type RestoreOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

@WorkspaceQueryHook('workflowVersion.restoreOne')
export class WorkflowVersionRestoreOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: RestoreOneResolverArgs,
  ): Promise<RestoreOneResolverArgs> {
    const workspace = authContext.workspace;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);
    await this.workflowOutreachAccessGuardService.assertWorkflowVersionIsAccessible(
      { authContext, workflowVersionId: payload.id, workspaceId: workspace.id },
    );

    return payload;
  }
}
