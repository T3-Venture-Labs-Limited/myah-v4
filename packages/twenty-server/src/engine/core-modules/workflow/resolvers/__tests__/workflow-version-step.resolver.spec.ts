import { WorkflowVersionStepResolver } from 'src/engine/core-modules/workflow/resolvers/workflow-version-step.resolver';
import { ExternalWritePolicyService } from 'src/engine/core-modules/tool-provider/services/external-write-policy.service';

describe('WorkflowVersionStepResolver', () => {
  it('denies testHttpRequest before HttpTool.execute', async () => {
    const httpTool = {
      execute: jest.fn().mockResolvedValue({ result: { status: 200 } }),
    };
    const externalWritePolicyService = new ExternalWritePolicyService({
      hasToolPermission: jest.fn().mockResolvedValue(true),
    } as never);
    const resolver = new WorkflowVersionStepResolver(
      {} as never,
      {} as never,
      {} as never,
      httpTool as never,
      externalWritePolicyService,
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
  });
});
