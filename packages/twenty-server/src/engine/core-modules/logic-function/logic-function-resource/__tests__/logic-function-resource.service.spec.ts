import { FileFolder } from 'twenty-shared/types';

import { LogicFunctionResourceService } from 'src/engine/core-modules/logic-function/logic-function-resource/logic-function-resource.service';

describe('LogicFunctionResourceService', () => {
  it('removes the copied source file when copying the built file fails', async () => {
    const copyError = new Error('built file copy failed');
    const fileStorageService = {
      copy: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(copyError),
      checkFileExists: jest.fn(
        async ({ fileFolder, resourcePath }) =>
          (fileFolder === FileFolder.BuiltLogicFunction &&
            resourcePath === 'source/dist/index.mjs') ||
          (fileFolder === FileFolder.Source &&
            resourcePath === 'copy/src/index.ts'),
      ),
      deleteFile: jest.fn(),
    };
    const service = new LogicFunctionResourceService(
      fileStorageService as never,
    );

    await expect(
      service.copyResources({
        workspaceId: 'workspace-a',
        applicationUniversalIdentifier: 'application-id',
        fromSourceHandlerPath: 'source/src/index.ts',
        toSourceHandlerPath: 'copy/src/index.ts',
        fromBuiltHandlerPath: 'source/dist/index.mjs',
        toBuiltHandlerPath: 'copy/dist/index.mjs',
      }),
    ).rejects.toThrow(copyError);

    expect(fileStorageService.deleteFile).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      applicationUniversalIdentifier: 'application-id',
      fileFolder: FileFolder.Source,
      resourcePath: 'copy/src/index.ts',
    });
    expect(fileStorageService.deleteFile).toHaveBeenCalledTimes(1);
  });
});
