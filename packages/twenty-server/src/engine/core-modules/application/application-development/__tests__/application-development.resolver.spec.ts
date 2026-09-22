import { FileFolder } from 'twenty-shared/types';

import { ApplicationDevelopmentResolver } from 'src/engine/core-modules/application/application-development/application-development.resolver';
import { RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { ApplicationExceptionCode } from 'src/engine/core-modules/application/application.exception';

const workspace = { id: 'workspace-id' } as never;

describe('ApplicationDevelopmentResolver retired applications', () => {
  const applicationService = {
    create: jest.fn(),
    findByUniversalIdentifier: jest.fn(),
  };
  const applicationSyncService = { synchronizeFromManifest: jest.fn() };
  const applicationRegistrationService = {
    findOneByUniversalIdentifier: jest.fn(),
    updateFromManifest: jest.fn(),
  };
  const applicationRegistrationVariableService = {
    syncVariableSchemas: jest.fn(),
  };
  const fileStorageService = { writeFile: jest.fn() };
  const sdkClientGenerationService = {
    generateSdkClientForApplication: jest.fn(),
  };
  const twentyConfigService = { get: jest.fn() };
  const throttlerService = { tokenBucketThrottleOrThrow: jest.fn() };
  const cacheLockService = { withLock: jest.fn() };

  const resolver = new ApplicationDevelopmentResolver(
    applicationService as never,
    applicationSyncService as never,
    applicationRegistrationService as never,
    applicationRegistrationVariableService as never,
    fileStorageService as never,
    sdkClientGenerationService as never,
    twentyConfigService as never,
    throttlerService as never,
    cacheLockService as never,
  );

  beforeEach(() => jest.clearAllMocks());

  const expectUnavailable = async (operation: Promise<unknown>) => {
    await expect(operation).rejects.toMatchObject({
      code: ApplicationExceptionCode.APPLICATION_NOT_FOUND,
    });
    expect(throttlerService.tokenBucketThrottleOrThrow).not.toHaveBeenCalled();
    expect(
      applicationRegistrationService.findOneByUniversalIdentifier,
    ).not.toHaveBeenCalled();
    expect(applicationService.findByUniversalIdentifier).not.toHaveBeenCalled();
    expect(applicationService.create).not.toHaveBeenCalled();
    expect(
      applicationSyncService.synchronizeFromManifest,
    ).not.toHaveBeenCalled();
    expect(cacheLockService.withLock).not.toHaveBeenCalled();
    expect(fileStorageService.writeFile).not.toHaveBeenCalled();
  };

  it('rejects creating the retired application before persistence', async () => {
    await expectUnavailable(
      resolver.createDevelopmentApplication(
        {
          universalIdentifier:
            RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
          name: 'Brand Brain',
        },
        workspace,
      ),
    );
  });

  it('rejects dry-run and applied manifest synchronization', async () => {
    for (const dryRun of [true, false]) {
      await expectUnavailable(
        resolver.syncApplication(
          {
            dryRun,
            manifest: {
              application: {
                universalIdentifier:
                  RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
              },
            },
          } as never,
          workspace,
        ),
      );
    }
  });

  it('rejects uploads before reading or writing the file', async () => {
    const createReadStream = jest.fn();

    await expectUnavailable(
      resolver.uploadApplicationFile(workspace, { createReadStream } as never, {
        applicationUniversalIdentifier:
          RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        fileFolder: FileFolder.PublicAsset,
        filePath: 'brand-brain.svg',
      }),
    );
    expect(createReadStream).not.toHaveBeenCalled();
  });
});
