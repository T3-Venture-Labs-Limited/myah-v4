import { WorkflowVersionStepResolver } from 'src/engine/core-modules/workflow/resolvers/workflow-version-step.resolver';

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
