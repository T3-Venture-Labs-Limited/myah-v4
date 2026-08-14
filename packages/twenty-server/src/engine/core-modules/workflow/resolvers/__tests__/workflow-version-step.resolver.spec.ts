import { WorkflowVersionStepResolver } from 'src/engine/core-modules/workflow/resolvers/workflow-version-step.resolver';
import { WorkflowOutreachAccessGuardService } from 'src/modules/workflow/common/services/workflow-outreach-access-guard.service';

describe('WorkflowVersionStepResolver', () => {
  it('denies testHttpRequest before HttpTool.execute', async () => {
    const httpTool = {
      execute: jest.fn().mockResolvedValue({ result: { status: 200 } }),
    };
    const externalWritePolicyService = {
      assertExecutable: jest
        .fn()
        .mockRejectedValue(new Error('approval binding required')),
    };
    const resolver = new WorkflowVersionStepResolver(
      {} as never,
      {} as never,
      {} as never,
      httpTool as never,
      externalWritePolicyService as never,
      {} as never,
      {} as never,
    );

    await expect(
      resolver.testHttpRequest(
        { id: 'workspace-id' } as never,
        {
          url: 'https://example.com/webhook',
          method: 'POST',
          headers: [{ key: 'X-Token', value: 'secret' }],
          body: { event: 'created' },
        } as never,
      ),
    ).rejects.toThrow('approval binding');

    expect(httpTool.execute).not.toHaveBeenCalled();

    expect(externalWritePolicyService.assertExecutable).toHaveBeenCalledWith({
      toolName: 'http_request',
      context: {
        workspaceId: 'workspace-id',
        roleId: '',
        rolePermissionConfig: { shouldBypassPermissionChecks: true },
      },
    });
  });
});

it('authorizes Campaign-owned workflow versions and runs before mutating them', async () => {
  const workflowVersionStepWorkspaceService = {
    createWorkflowVersionStep: jest.fn().mockResolvedValue({}),
    deleteWorkflowVersionStep: jest.fn().mockResolvedValue({}),
    duplicateWorkflowVersionStep: jest.fn().mockResolvedValue({}),
    updateWorkflowVersionStep: jest.fn().mockResolvedValue({}),
  };
  const workflowRunnerWorkspaceService = {
    submitFormStep: jest.fn().mockResolvedValue(undefined),
  };
  const workflowRunWorkspaceService = {
    updateWorkflowRunStep: jest.fn().mockResolvedValue(undefined),
  };
  const workflowOutreachAccessGuardService = {
    assertWorkflowRunIsAccessible: jest.fn().mockResolvedValue(undefined),
    assertWorkflowVersionIsAccessible: jest.fn().mockResolvedValue(undefined),
  } as unknown as WorkflowOutreachAccessGuardService;
  const resolver = new WorkflowVersionStepResolver(
    workflowVersionStepWorkspaceService as never,
    workflowRunnerWorkspaceService as never,
    workflowRunWorkspaceService as never,
    {} as never,
    {} as never,
    {} as never,
    workflowOutreachAccessGuardService,
  );
  const workspace = { id: 'workspace-a' } as never;

  await resolver.createWorkflowVersionStep(workspace, {
    workflowVersionId: 'workflow-version-a',
  } as never);
  await resolver.updateWorkflowVersionStep(workspace, {
    workflowVersionId: 'workflow-version-a',
    step: {},
  } as never);
  await resolver.deleteWorkflowVersionStep(workspace, {
    workflowVersionId: 'workflow-version-a',
    stepId: 'step-a',
  } as never);
  await resolver.duplicateWorkflowVersionStep(workspace, {
    workflowVersionId: 'workflow-version-a',
    stepId: 'step-a',
  } as never);
  await resolver.submitFormStep(workspace, {
    workflowRunId: 'workflow-run-a',
    stepId: 'step-a',
    response: {},
  } as never);
  await resolver.updateWorkflowRunStep(workspace, {
    workflowRunId: 'workflow-run-a',
    step: {},
  } as never);

  expect(
    workflowOutreachAccessGuardService.assertWorkflowVersionIsAccessible,
  ).toHaveBeenCalledTimes(4);
  expect(
    workflowOutreachAccessGuardService.assertWorkflowVersionIsAccessible,
  ).toHaveBeenCalledWith({
    workflowVersionId: 'workflow-version-a',
    workspaceId: 'workspace-a',
  });
  expect(
    workflowOutreachAccessGuardService.assertWorkflowRunIsAccessible,
  ).toHaveBeenCalledTimes(2);
  expect(
    workflowOutreachAccessGuardService.assertWorkflowRunIsAccessible,
  ).toHaveBeenCalledWith({
    workflowRunId: 'workflow-run-a',
    workspaceId: 'workspace-a',
  });
});
