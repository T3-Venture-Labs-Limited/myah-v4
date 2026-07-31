import { LogicFunctionFromSourceService } from 'src/engine/metadata-modules/logic-function/services/logic-function-from-source.service';

describe('LogicFunctionFromSourceService', () => {
  it('removes copied resources when creating duplicated metadata fails', async () => {
    const logicFunctionResourceService = {
      copyResources: jest.fn(),
      deleteCopiedResources: jest.fn(),
    };
    const helperService = {
      findLogicFunctionAndApplicationOrThrow: jest.fn().mockResolvedValue({
        flatLogicFunction: {
          id: 'source-logic-function',
          name: 'Source logic function',
          description: null,
          timeoutSeconds: 30,
          isBuildUpToDate: true,
          checksum: 'checksum',
          handlerName: 'main',
          sourceHandlerPath: 'source-logic-function/src/index.ts',
          builtHandlerPath: 'source-logic-function/dist/index.mjs',
        },
        ownerFlatApplication: {
          universalIdentifier: 'application-id',
        },
      }),
      createOneFromMetadata: jest
        .fn()
        .mockRejectedValue(new Error('metadata creation failed')),
    };
    const service = new LogicFunctionFromSourceService(
      {} as never,
      logicFunctionResourceService as never,
      {} as never,
      helperService as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.duplicateOneWithSource({
        existingLogicFunctionId: 'source-logic-function',
        workspaceId: 'workspace-a',
      }),
    ).rejects.toThrow('metadata creation failed');

    expect(logicFunctionResourceService.copyResources).toHaveBeenCalledTimes(1);
    expect(
      logicFunctionResourceService.deleteCopiedResources,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        applicationUniversalIdentifier: 'application-id',
        sourceHandlerPath: expect.stringMatching(/src\/index\.ts$/),
        builtHandlerPath: expect.stringMatching(/dist\/index\.mjs$/),
      }),
    );
  });
});
