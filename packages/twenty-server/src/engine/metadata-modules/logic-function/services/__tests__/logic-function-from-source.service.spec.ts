import { RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { LogicFunctionExceptionCode } from 'src/engine/metadata-modules/logic-function/logic-function.exception';
import { LogicFunctionFromSourceService } from 'src/engine/metadata-modules/logic-function/services/logic-function-from-source.service';

describe('LogicFunctionFromSourceService', () => {
  it('rejects authoring and execution for retired application functions before effects', async () => {
    const logicFunctionExecutorService = {
      execute: jest.fn(),
      transpile: jest.fn(),
    };
    const logicFunctionResourceService = {
      copyResources: jest.fn(),
      uploadSourceFile: jest.fn(),
      getSourceFile: jest.fn(),
      uploadBuiltFile: jest.fn(),
    };
    const helperService = {
      findLogicFunctionAndApplicationOrThrow: jest.fn().mockResolvedValue({
        flatLogicFunction: {
          id: 'brand-brain-function',
          isBuildUpToDate: false,
          sourceHandlerPath: 'src/index.ts',
          builtHandlerPath: 'dist/index.mjs',
        },
        ownerFlatApplication: {
          universalIdentifier:
            RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        },
      }),
      createOneFromMetadata: jest.fn(),
      updateOneFromMetadata: jest.fn(),
    };
    const workspaceMigrationService = {
      validateBuildAndRunWorkspaceMigration: jest.fn(),
    };
    const service = new LogicFunctionFromSourceService(
      logicFunctionExecutorService as never,
      logicFunctionResourceService as never,
      {} as never,
      helperService as never,
      {} as never,
      workspaceMigrationService as never,
    );

    const operations = [
      () =>
        service.duplicateOneWithSource({
          existingLogicFunctionId: 'brand-brain-function',
          workspaceId: 'workspace-id',
        }),
      () =>
        service.updateOneFromSource({
          updateLogicFunctionFromSourceInput: {
            id: 'brand-brain-function',
            update: { sourceHandlerCode: 'export default {}' },
          } as never,
          workspaceId: 'workspace-id',
        }),
      () =>
        service.deleteOneWithSource({
          id: 'brand-brain-function',
          workspaceId: 'workspace-id',
        }),
      () =>
        service.buildOneFromSource({
          id: 'brand-brain-function',
          workspaceId: 'workspace-id',
        }),
      () =>
        service.executeOneFromSource({
          id: 'brand-brain-function',
          payload: {},
          workspaceId: 'workspace-id',
        }),
      () =>
        service.getSourceCode({
          id: 'brand-brain-function',
          workspaceId: 'workspace-id',
        }),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({
        code: LogicFunctionExceptionCode.LOGIC_FUNCTION_NOT_FOUND,
      });
    }

    expect(logicFunctionResourceService.copyResources).not.toHaveBeenCalled();
    expect(
      logicFunctionResourceService.uploadSourceFile,
    ).not.toHaveBeenCalled();
    expect(logicFunctionResourceService.getSourceFile).not.toHaveBeenCalled();
    expect(logicFunctionResourceService.uploadBuiltFile).not.toHaveBeenCalled();
    expect(helperService.createOneFromMetadata).not.toHaveBeenCalled();
    expect(helperService.updateOneFromMetadata).not.toHaveBeenCalled();
    expect(
      workspaceMigrationService.validateBuildAndRunWorkspaceMigration,
    ).not.toHaveBeenCalled();
    expect(logicFunctionExecutorService.transpile).not.toHaveBeenCalled();
    expect(logicFunctionExecutorService.execute).not.toHaveBeenCalled();
  });

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
