import { MODULE_METADATA } from '@nestjs/common/constants';

import { WORKSPACE_QUERY_HOOK_METADATA } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/workspace-query-hook.constants';
import { WorkflowQueryHookModule } from 'src/modules/workflow/common/query-hooks/workflow-query-hook.module';

const lifecycleHookKeys = [
  'workflowVersion.destroyOne',
  'workflowVersion.destroyMany',
  'workflowVersion.restoreOne',
  'workflowVersion.restoreMany',
  'workflowRun.destroyOne',
  'workflowRun.destroyMany',
  'workflowRun.restoreOne',
  'workflowRun.restoreMany',
];

describe('WorkflowQueryHookModule', () => {
  it('registers ownership guards for destructive and restorative Workflow Version and Run mutations', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      WorkflowQueryHookModule,
    ) as Function[];
    const registeredHookKeys = providers
      .map((provider) =>
        Reflect.getMetadata(WORKSPACE_QUERY_HOOK_METADATA, provider),
      )
      .map((metadata) => metadata?.key)
      .filter((key): key is string => key !== undefined);

    expect(registeredHookKeys).toEqual(
      expect.arrayContaining(lifecycleHookKeys),
    );
  });
});
