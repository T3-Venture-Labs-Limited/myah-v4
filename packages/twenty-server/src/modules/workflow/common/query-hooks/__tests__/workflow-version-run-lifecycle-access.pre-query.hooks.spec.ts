import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowRunDestroyManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-destroy-many.pre-query.hook';
import { WorkflowRunDestroyOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-destroy-one.pre-query.hook';
import { WorkflowRunRestoreManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-restore-many.pre-query.hook';
import { WorkflowRunRestoreOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-restore-one.pre-query.hook';
import { WorkflowVersionDestroyManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-destroy-many.pre-query.hook';
import { WorkflowVersionDestroyOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-destroy-one.pre-query.hook';
import { WorkflowVersionRestoreManyPreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-restore-many.pre-query.hook';
import { WorkflowVersionRestoreOnePreQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-restore-one.pre-query.hook';
import { WorkflowQueryValidationExceptionCode } from 'src/modules/workflow/common/exceptions/workflow-query-validation.exception';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

type SingleRecordLifecycleHook = {
  execute: (
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: { id: string },
  ) => Promise<unknown>;
};

describe.each([
  [
    'workflowVersion.destroyOne',
    WorkflowVersionDestroyOnePreQueryHook,
    'workflowVersionId',
  ],
  [
    'workflowVersion.restoreOne',
    WorkflowVersionRestoreOnePreQueryHook,
    'workflowVersionId',
  ],
  [
    'workflowRun.destroyOne',
    WorkflowRunDestroyOnePreQueryHook,
    'workflowRunId',
  ],
  [
    'workflowRun.restoreOne',
    WorkflowRunRestoreOnePreQueryHook,
    'workflowRunId',
  ],
])('%s', (_operation, Hook, idKey) => {
  it('authorizes the owning Campaign before the lifecycle mutation', async () => {
    const guard = {
      assertWorkflowVersionIsAccessible: jest.fn().mockResolvedValue(undefined),
      assertWorkflowRunIsAccessible: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkflowOutreachAccessGuardService;
    const hook = new (Hook as new (
      guard: WorkflowOutreachAccessGuardService,
    ) => SingleRecordLifecycleHook)(guard);

    await hook.execute(authContext, 'workflowVersion', { id: 'record-a' });

    const authorization =
      idKey === 'workflowVersionId'
        ? guard.assertWorkflowVersionIsAccessible
        : guard.assertWorkflowRunIsAccessible;

    expect(authorization).toHaveBeenCalledWith({
      [idKey]: 'record-a',
      workspaceId: 'workspace-a',
    });
  });
});

describe.each([
  ['workflowVersion.destroyMany', WorkflowVersionDestroyManyPreQueryHook],
  ['workflowVersion.restoreMany', WorkflowVersionRestoreManyPreQueryHook],
  ['workflowRun.destroyMany', WorkflowRunDestroyManyPreQueryHook],
  ['workflowRun.restoreMany', WorkflowRunRestoreManyPreQueryHook],
])('%s', (_operation, Hook) => {
  it('forbids bulk lifecycle mutations', async () => {
    await expect(new Hook().execute()).rejects.toMatchObject({
      code: WorkflowQueryValidationExceptionCode.FORBIDDEN,
    });
  });
});
