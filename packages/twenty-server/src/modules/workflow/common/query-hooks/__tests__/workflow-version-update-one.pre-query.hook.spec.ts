import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowVersionUpdateOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-update-one.pre-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkflowVersionValidationWorkspaceService } from 'src/modules/workflow/common/workspace-services/workflow-version-validation.workspace-service';

type WorkflowVersionUpdateOnePreQueryHookConstructor = new (
  workflowOutreachAccessGuardService: WorkflowOutreachAccessGuardService,
  workflowVersionValidationWorkspaceService: WorkflowVersionValidationWorkspaceService,
) => WorkflowVersionUpdateOnePreQueryHook;

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

describe('WorkflowVersionUpdateOnePreQueryHook', () => {
  it('authorizes the owning Campaign before updating a Workflow version', async () => {
    const workflowVersionValidationWorkspaceService = {
      validateWorkflowVersionForUpdateOne: jest.fn(),
    } as unknown as WorkflowVersionValidationWorkspaceService;
    const workflowOutreachAccessGuardService = {
      assertWorkflowVersionIsAccessible: jest.fn(),
      validateWorkflowVersionForUpdateOne: jest.fn(),
    } as unknown as WorkflowOutreachAccessGuardService;
    const hook =
      new (WorkflowVersionUpdateOnePreQueryHook as unknown as WorkflowVersionUpdateOnePreQueryHookConstructor)(
        workflowOutreachAccessGuardService,
        workflowVersionValidationWorkspaceService,
      );
    const payload = { id: 'workflow-version-a', data: { name: 'Draft' } };

    await hook.execute(authContext, 'workflowVersion', payload as never);

    expect(
      workflowOutreachAccessGuardService.assertWorkflowVersionIsAccessible,
    ).toHaveBeenCalledWith({
      authContext,
      workflowVersionId: 'workflow-version-a',
      workspaceId: 'workspace-a',
    });
  });
});
