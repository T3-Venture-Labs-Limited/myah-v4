import { getWorkflowToolOutreachAccessGuardTargets } from 'src/modules/workflow/workflow-tools/services/get-workflow-tool-outreach-access-guard-targets.util';

describe('getWorkflowToolOutreachAccessGuardTargets', () => {
  it('collects both workflow and version targets for a draft-copy request', () => {
    expect(
      getWorkflowToolOutreachAccessGuardTargets({
        workflowId: 'workflow-a',
        workflowVersionIdToCopy: 'version-a',
      }),
    ).toEqual([
      { id: 'workflow-a', type: 'workflow' },
      { id: 'version-a', type: 'workflowVersion' },
    ]);
  });

  it('collects resource IDs nested in workflow step inputs', () => {
    expect(
      getWorkflowToolOutreachAccessGuardTargets({
        steps: [
          { settings: { input: { agentId: 'agent-a' } } },
          { settings: { input: { logicFunctionId: 'logic-function-a' } } },
        ],
      }),
    ).toEqual([
      { id: 'agent-a', type: 'agent' },
      { id: 'logic-function-a', type: 'logicFunction' },
    ]);
  });

  it('ignores parameters that are not workflow-owned resources', () => {
    expect(
      getWorkflowToolOutreachAccessGuardTargets({ limit: 10, offset: 0 }),
    ).toEqual([]);
  });
});
