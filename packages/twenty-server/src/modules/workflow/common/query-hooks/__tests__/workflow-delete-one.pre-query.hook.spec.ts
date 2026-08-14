import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowDeleteOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-delete-one.pre-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

type WorkflowDeleteOnePreQueryHookConstructor = new (
  workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
) => WorkflowDeleteOnePreQueryHook;

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

describe('WorkflowDeleteOnePreQueryHook', () => {
  it('authorizes the owning Campaign before deleting an Outreach workflow', async () => {
    const workflowOutreachAccessGuardService = {
      assertWorkflowIsAccessible: jest.fn(),
    } as unknown as WorkflowOutreachAccessGuardService;
    const hook =
      new (WorkflowDeleteOnePreQueryHook as unknown as WorkflowDeleteOnePreQueryHookConstructor)(
        workflowOutreachAccessGuardService,
      );

    await hook.execute(authContext, 'workflow', { id: 'workflow-a' });

    expect(
      workflowOutreachAccessGuardService.assertWorkflowIsAccessible,
    ).toHaveBeenCalledWith({
      workflowId: 'workflow-a',
      workspaceId: 'workspace-a',
    });
  });
});
