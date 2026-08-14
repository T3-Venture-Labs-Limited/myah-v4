import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowRunUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-update-one.pre-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

type WorkflowRunUpdateOnePreQueryHookConstructor = new (
  workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
) => WorkflowRunUpdateOnePreQueryHook;

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

describe('WorkflowRunUpdateOnePreQueryHook', () => {
  it('authorizes the owning Campaign before renaming a Workflow run', async () => {
    const workflowOutreachAccessGuardService = {
      assertWorkflowRunIsAccessible: jest.fn(),
    } as unknown as WorkflowOutreachAccessGuardService;
    const hook =
      new (WorkflowRunUpdateOnePreQueryHook as unknown as WorkflowRunUpdateOnePreQueryHookConstructor)(
        workflowOutreachAccessGuardService,
      );
    const payload = { id: 'workflow-run-a', data: { name: 'Retry' } };

    await hook.execute(authContext, 'workflowRun', payload as never);

    expect(
      workflowOutreachAccessGuardService.assertWorkflowRunIsAccessible,
    ).toHaveBeenCalledWith({
      workflowRunId: 'workflow-run-a',
      workspaceId: 'workspace-a',
    });
  });
});
