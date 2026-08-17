import { WorkflowVersionEdgeResolver } from 'src/engine/core-modules/workflow/resolvers/workflow-version-edge.resolver';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

describe('WorkflowVersionEdgeResolver', () => {
  it('authorizes Campaign-owned workflow versions before edge mutations', async () => {
    const workflowVersionEdgeWorkspaceService = {
      createWorkflowVersionEdge: jest.fn().mockResolvedValue({}),
      deleteWorkflowVersionEdge: jest.fn().mockResolvedValue({}),
    };
    const workflowOutreachAccessGuardService = {
      assertWorkflowVersionIsAccessible: jest.fn().mockResolvedValue(undefined),
    } as unknown as WorkflowOutreachAccessGuardService;
    const resolver = new WorkflowVersionEdgeResolver(
      workflowVersionEdgeWorkspaceService as never,
      workflowOutreachAccessGuardService,
    );
    const workspace = { id: 'workspace-a' } as never;
    const input = {
      source: 'step-a',
      target: 'step-b',
      workflowVersionId: 'workflow-version-a',
    } as never;

    await resolver.createWorkflowVersionEdge(workspace, input);
    await resolver.deleteWorkflowVersionEdge(workspace, input);

    expect(
      workflowOutreachAccessGuardService.assertWorkflowVersionIsAccessible,
    ).toHaveBeenCalledTimes(2);
    expect(
      workflowOutreachAccessGuardService.assertWorkflowVersionIsAccessible,
    ).toHaveBeenCalledWith({
      workflowVersionId: 'workflow-version-a',
      workspaceId: 'workspace-a',
    });
  });
});
