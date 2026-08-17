import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowRestoreOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-restore-one.pre-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

type WorkflowRestoreOnePreQueryHookConstructor = new (
  workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
) => WorkflowRestoreOnePreQueryHook;

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

describe('WorkflowRestoreOnePreQueryHook', () => {
  it('authorizes the owning Campaign before restoring an Outreach workflow', async () => {
    const workflowOutreachAccessGuardService = {
      assertWorkflowIsAccessible: jest.fn(),
    } as unknown as WorkflowOutreachAccessGuardService;
    const hook =
      new (WorkflowRestoreOnePreQueryHook as unknown as WorkflowRestoreOnePreQueryHookConstructor)(
        workflowOutreachAccessGuardService,
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
