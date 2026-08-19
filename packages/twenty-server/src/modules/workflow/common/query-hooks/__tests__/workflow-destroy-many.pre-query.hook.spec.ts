import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowDestroyManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-destroy-many.pre-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';

type WorkflowDestroyManyPreQueryHookConstructor = new (
  workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
  workflowCommonWorkspaceService: WorkflowCommonWorkspaceService,
) => WorkflowDestroyManyPreQueryHook;

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

describe('WorkflowDestroyManyPreQueryHook', () => {
  it('authorizes every owning Campaign before destroying workflows', async () => {
    const workflowOutreachAccessGuardService = {
      assertWorkflowIsAccessible: jest.fn(),
    } as unknown as WorkflowOutreachAccessGuardService;
    const workflowCommonWorkspaceService = {
      handleWorkflowSubEntities: jest.fn(),
    } as unknown as WorkflowCommonWorkspaceService;
    const hook =
      new (WorkflowDestroyManyPreQueryHook as unknown as WorkflowDestroyManyPreQueryHookConstructor)(
        workflowOutreachAccessGuardService,
        workflowCommonWorkspaceService,
      );

    await hook.execute(authContext, 'workflow', {
      filter: { id: { in: ['workflow-a', 'workflow-b'] } },
    });

    expect(
      workflowOutreachAccessGuardService.assertWorkflowIsAccessible,
    ).toHaveBeenNthCalledWith(1, {
      authContext,
      workflowId: 'workflow-a',
      workspaceId: 'workspace-a',
    });
    expect(
      workflowOutreachAccessGuardService.assertWorkflowIsAccessible,
    ).toHaveBeenNthCalledWith(2, {
      authContext,
      workflowId: 'workflow-b',
      workspaceId: 'workspace-a',
    });
  });
});
