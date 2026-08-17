import { WorkflowQueryHookModule } from 'src/modules/workflow/common/query-hooks/workflow-query-hook.module';
import { WorkflowCommonModule } from 'src/modules/workflow/common/workflow-common.module';

describe('WorkflowCommonModule', () => {
  it('re-exports the query-hook module that owns Campaign assignment', () => {
    const exportedModules = Reflect.getMetadata(
      'exports',
      WorkflowCommonModule,
    );

    expect(exportedModules).toContain(WorkflowQueryHookModule);
  });
});
