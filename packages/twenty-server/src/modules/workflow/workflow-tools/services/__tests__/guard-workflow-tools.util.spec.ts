import { guardWorkflowTools } from 'src/modules/workflow/workflow-tools/services/guard-workflow-tools.util';

describe('guardWorkflowTools', () => {
  it('checks a workflow version before executing a generic tool', async () => {
    const assertTargetIsGeneralAutomation = jest
      .fn()
      .mockResolvedValue(undefined);
    const execute = jest.fn().mockResolvedValue({ success: true });
    const tools = {
      update_workflow_version_step: {
        execute,
        inputSchema: {},
      },
    };

    const guardedTools = guardWorkflowTools({
      assertTargetIsGeneralAutomation,
      tools: tools as never,
      workspaceId: 'workspace-a',
    });

    const executeGuardedTool =
      guardedTools.update_workflow_version_step.execute;

    if (executeGuardedTool === undefined) {
      throw new Error('Expected the tool to be executable');
    }

    await executeGuardedTool(
      { workflowVersionId: 'version-a' } as never,
      {} as never,
    );

    expect(assertTargetIsGeneralAutomation).toHaveBeenCalledWith({
      target: { id: 'version-a', type: 'workflowVersion' },
      workspaceId: 'workspace-a',
    });
    expect(execute).toHaveBeenCalledWith(
      { workflowVersionId: 'version-a' },
      {},
    );
  });
});
