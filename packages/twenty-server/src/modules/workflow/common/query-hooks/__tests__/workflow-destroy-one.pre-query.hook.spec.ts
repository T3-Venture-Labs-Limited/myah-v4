import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowDestroyOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-destroy-one.pre-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkflowCommonWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-common.workspace-service';

type WorkflowDestroyOnePreQueryHookConstructor = new (
  workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
  workflowCommonWorkspaceService: WorkflowCommonWorkspaceService,
) => WorkflowDestroyOnePreQueryHook;

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

describe('WorkflowDestroyOnePreQueryHook', () => {
  it('authorizes the owning Campaign before destroying an Outreach workflow', async () => {
    const workflowOutreachAccessGuardService = {
      assertWorkflowIsAccessible: jest.fn(),
      handleWorkflowSubEntities: jest.fn(),
    } as unknown as WorkflowOutreachAccessGuardService;
    const workflowCommonWorkspaceService = {
      handleWorkflowSubEntities: jest.fn(),
    } as unknown as WorkflowCommonWorkspaceService;
    const hook =
      new (WorkflowDestroyOnePreQueryHook as unknown as WorkflowDestroyOnePreQueryHookConstructor)(
        workflowOutreachAccessGuardService,
        workflowCommonWorkspaceService,
      );

    await hook.execute(authContext, 'workflow', { id: 'workflow-a' });

    expect(
      workflowOutreachAccessGuardService.assertWorkflowIsAccessible,
    ).toHaveBeenCalledWith({
      authContext,
      workflowId: 'workflow-a',
      workspaceId: 'workspace-a',
    });
  });
});
