import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowDeleteManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-delete-many.pre-query.hook';
import { WorkflowRestoreManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-restore-many.pre-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

type WorkflowBulkAccessHook = {
  execute: (
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: { filter: { id: { in: string[] } } },
  ) => Promise<unknown>;
};

describe.each([
  ['workflow.deleteMany', WorkflowDeleteManyPreQueryHook],
  ['workflow.restoreMany', WorkflowRestoreManyPreQueryHook],
])('%s', (_operation, Hook) => {
  it('authorizes every workflow before applying the bulk mutation', async () => {
    const workflowOutreachAccessGuardService = {
      assertWorkflowIsAccessible: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkflowOutreachAccessGuardService;
    const hook = new (Hook as new (
      guard: WorkflowOutreachAccessGuardService,
    ) => WorkflowBulkAccessHook)(workflowOutreachAccessGuardService);
    const payload = { filter: { id: { in: ['workflow-a', 'workflow-b'] } } };

    await expect(hook.execute(authContext, 'workflow', payload)).resolves.toBe(
      payload,
    );

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
