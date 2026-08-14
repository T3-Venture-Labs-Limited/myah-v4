import { MODULE_METADATA } from '@nestjs/common/constants';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkflowFindManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-find-many.post-query.hook';
import { WorkflowRunFindManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-find-many.post-query.hook';
import { WorkflowRunFindOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-run-find-one.post-query.hook';
import { WorkflowVersionFindManyPostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-find-many.post-query.hook';
import { WorkflowVersionFindOnePostQueryHook } from 'src/modules/workflow/common/query-hooks/workflow-version-find-one.post-query.hook';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';
import { WorkflowQueryHookModule } from 'src/modules/workflow/common/query-hooks/workflow-query-hook.module';

const authContext = {
  type: 'system',
  workspace: { id: 'workspace-a' },
} as WorkspaceAuthContext;

type PostQueryHook = {
  execute: (
    authContext: WorkspaceAuthContext,
    objectName: string,
    payload: unknown[],
  ) => Promise<void>;
};

describe.each([
  [
    'workflow.findMany',
    WorkflowFindManyPostQueryHook,
    [{ id: 'workflow-a' }],
    'assertWorkflowIsAccessible',
    { workflowId: 'workflow-a', workspaceId: 'workspace-a' },
  ],
  [
    'workflowVersion.findOne',
    WorkflowVersionFindOnePostQueryHook,
    [{ id: 'workflow-version-a' }],
    'assertWorkflowVersionIsAccessible',
    { workflowVersionId: 'workflow-version-a', workspaceId: 'workspace-a' },
  ],
  [
    'workflowVersion.findMany',
    WorkflowVersionFindManyPostQueryHook,
    [{ id: 'workflow-version-a' }],
    'assertWorkflowVersionIsAccessible',
    { workflowVersionId: 'workflow-version-a', workspaceId: 'workspace-a' },
  ],
  [
    'workflowRun.findOne',
    WorkflowRunFindOnePostQueryHook,
    [{ id: 'workflow-run-a' }],
    'assertWorkflowRunIsAccessible',
    { workflowRunId: 'workflow-run-a', workspaceId: 'workspace-a' },
  ],
  [
    'workflowRun.findMany',
    WorkflowRunFindManyPostQueryHook,
    [{ id: 'workflow-run-a' }],
    'assertWorkflowRunIsAccessible',
    { workflowRunId: 'workflow-run-a', workspaceId: 'workspace-a' },
  ],
])('%s', (_operation, Hook, payload, guardMethod, expectedArgs) => {
  it('authorizes every returned Outreach record', async () => {
    const workflowOutreachAccessGuardService = {
      assertWorkflowIsAccessible: jest.fn(),
      assertWorkflowVersionIsAccessible: jest.fn(),
      assertWorkflowRunIsAccessible: jest.fn(),
    } as unknown as WorkflowOutreachAccessGuardService;
    const hook = new (Hook as new (
      guard: WorkflowOutreachAccessGuardService,
    ) => PostQueryHook)(workflowOutreachAccessGuardService);

    await hook.execute(authContext, 'workflow', payload as unknown[]);

    expect(
      workflowOutreachAccessGuardService[
        guardMethod as keyof WorkflowOutreachAccessGuardService
      ],
    ).toHaveBeenCalledWith(expectedArgs);
  });
});

describe('WorkflowQueryHookModule', () => {
  it('registers access guards for bulk workflow delete and restore operations', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      WorkflowQueryHookModule,
    ) as { name: string }[];

    expect(providers.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'WorkflowDeleteManyPreQueryHook',
        'WorkflowRestoreManyPreQueryHook',
      ]),
    );
  });
});
