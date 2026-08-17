import { assertIsDefinedOrThrow } from 'twenty-shared/utils';

import { type WorkspacePostQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { WorkspaceQueryHookType } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/types/workspace-query-hook.type';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { type WorkflowVersionWorkspaceEntity } from 'src/modules/workflow/common/standard-objects/workflow-version.workspace-entity';

@WorkspaceQueryHook({
  key: 'workflowVersion.findOne',
  type: WorkspaceQueryHookType.POST_HOOK,
})
export class WorkflowVersionFindOnePostQueryHook implements WorkspacePostQueryHookInstance {
  constructor(
    private readonly workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: WorkflowVersionWorkspaceEntity[],
  ): Promise<void> {
    const { workspace } = authContext;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    await Promise.all(
      payload.map(({ id }) =>
        this.workflowOutreachAccessGuardService.assertWorkflowVersionIsAccessible(
          { authContext, workflowVersionId: id, workspaceId: workspace.id },
        ),
      ),
    );
  }
}
