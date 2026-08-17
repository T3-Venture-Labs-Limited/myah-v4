import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowFindOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-find-one.post-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

describe('WorkflowFindOnePostQueryHook', () => {
  it('authorizes the owning Campaign before returning an Outreach workflow', async () => {
    const workflowOutreachAccessGuardService = {
      assertWorkflowIsAccessible: jest.fn(),
    } as unknown as WorkflowOutreachAccessGuardService;
    const hook = new WorkflowFindOnePostQueryHook(
      workflowOutreachAccessGuardService,
    );

    await hook.execute(authContext, 'workflow', [
      { id: 'workflow-a' },
    ] as never);

    expect(
      workflowOutreachAccessGuardService.assertWorkflowIsAccessible,
    ).toHaveBeenCalledWith({
      authContext,
      workflowId: 'workflow-a',
      workspaceId: 'workspace-a',
    });
  });
});
