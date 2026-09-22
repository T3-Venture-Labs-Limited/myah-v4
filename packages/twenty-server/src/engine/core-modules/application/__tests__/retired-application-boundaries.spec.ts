import { RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';
import { OAuthService } from 'src/engine/core-modules/application/application-oauth/oauth.service';
import { ApplicationRegistrationEntity } from 'src/engine/core-modules/application/application-registration/application-registration.entity';
import { ApplicationRegistrationExceptionCode } from 'src/engine/core-modules/application/application-registration/application-registration.exception';
import { ApplicationRegistrationService } from 'src/engine/core-modules/application/application-registration/application-registration.service';
import { ApplicationTarballService } from 'src/engine/core-modules/application/application-registration/application-tarball.service';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { ApplicationExceptionCode } from 'src/engine/core-modules/application/application.exception';
import { ApplicationSyncService } from 'src/engine/core-modules/application/application-manifest/application-sync.service';
import { extractTarballSecurely } from 'src/engine/core-modules/application/application-package/utils/extract-tarball-securely.util';
import { readJsonFile } from 'src/engine/core-modules/application/application-package/utils/read-json-file.util';
import { resolvePackageContentDir } from 'src/engine/core-modules/application/application-package/utils/tarball-utils';

jest.mock(
  'src/engine/core-modules/application/application-package/utils/extract-tarball-securely.util',
  () => ({ extractTarballSecurely: jest.fn() }),
);
jest.mock(
  'src/engine/core-modules/application/application-package/utils/read-json-file.util',
  () => ({ readJsonFile: jest.fn() }),
);
jest.mock(
  'src/engine/core-modules/application/application-package/utils/tarball-utils',
  () => ({ resolvePackageContentDir: jest.fn() }),
);

const retiredRegistration = {
  id: 'registration-id',
  universalIdentifier: RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
  oAuthClientId: 'retired-client-id',
  oAuthClientSecretHash: null,
  oAuthScopes: [],
} as unknown as ApplicationRegistrationEntity;

describe('retired application boundaries', () => {
  it('rejects direct application creation before persistence', async () => {
    const retiredApplication = {
      id: 'retired-application-id',
      universalIdentifier: RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
    };
    const activeApplication = {
      id: 'active-application-id',
      universalIdentifier: 'active-application-universal-identifier',
    };
    const applicationRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest
        .fn()
        .mockResolvedValue([retiredApplication, activeApplication]),
    };
    const applicationRegistrationRepository = { create: jest.fn() };
    const workspaceCacheService = {
      invalidateAndRecompute: jest.fn(),
      getOrRecompute: jest.fn().mockResolvedValue({
        flatApplicationMaps: {
          byId: {
            [retiredApplication.id]: retiredApplication,
            [activeApplication.id]: activeApplication,
          },
        },
      }),
    };
    const service = new ApplicationService(
      {} as never,
      applicationRepository as never,
      applicationRegistrationRepository as never,
      workspaceCacheService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create({
        universalIdentifier:
          RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        workspaceId: 'workspace-id',
      }),
    ).rejects.toMatchObject({
      code: ApplicationExceptionCode.APPLICATION_NOT_FOUND,
    });
    await expect(
      service.delete(
        RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        'workspace-id',
      ),
    ).rejects.toMatchObject({
      code: ApplicationExceptionCode.APPLICATION_NOT_FOUND,
    });
    await expect(
      service.createWorkspaceCustomApplicationRegistration({
        universalIdentifier:
          RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        workspaceId: 'workspace-id',
      }),
    ).rejects.toMatchObject({
      code: ApplicationExceptionCode.APPLICATION_NOT_FOUND,
    });
    await expect(service.findManyApplications('workspace-id')).resolves.toEqual(
      [activeApplication],
    );
    await expect(
      service.findManyInstalledFlatApplications('workspace-id'),
    ).resolves.toEqual([activeApplication]);
    await expect(
      service.findOneApplication({
        universalIdentifier:
          RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        workspaceId: 'workspace-id',
      }),
    ).resolves.toBeNull();
    expect(applicationRepository.create).not.toHaveBeenCalled();
    expect(applicationRepository.save).not.toHaveBeenCalled();
    expect(applicationRepository.findOne).not.toHaveBeenCalled();
    expect(applicationRegistrationRepository.create).not.toHaveBeenCalled();
    expect(workspaceCacheService.invalidateAndRecompute).not.toHaveBeenCalled();
  });

  it('rejects registration creation and manifest updates before persistence', async () => {
    const applicationRegistrationRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      findOneOrFail: jest.fn().mockResolvedValue(retiredRegistration),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };
    const cacheLockService = {
      withLock: jest.fn(async (operation: () => Promise<void>) => operation()),
    };
    const service = new ApplicationRegistrationService(
      applicationRegistrationRepository as never,
      {} as never,
      {} as never,
      {} as never,
      cacheLockService as never,
    );

    await expect(
      service.create(
        {
          name: 'Brand Brain',
          universalIdentifier:
            RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        },
        'workspace-id',
        'user-id',
      ),
    ).rejects.toMatchObject({
      code: ApplicationRegistrationExceptionCode.APPLICATION_REGISTRATION_NOT_FOUND,
    });

    await expect(
      service.updateFromManifest({
        applicationRegistrationId: retiredRegistration.id,
        manifest: {
          application: { displayName: 'Brand Brain' },
        } as never,
      }),
    ).rejects.toMatchObject({
      code: ApplicationRegistrationExceptionCode.APPLICATION_REGISTRATION_NOT_FOUND,
    });
    applicationRegistrationRepository.findOne.mockResolvedValue(
      retiredRegistration,
    );

    for (const operation of [
      service.update(
        { id: retiredRegistration.id, update: { name: 'Updated' } },
        'workspace-id',
      ),
      service.updateGlobal({
        id: retiredRegistration.id,
        update: { name: 'Updated' },
      }),
      service.delete(retiredRegistration.id, 'workspace-id'),
      service.rotateClientSecret(retiredRegistration.id, 'workspace-id'),
      service.transferOwnership({
        applicationRegistrationId: retiredRegistration.id,
        currentOwnerWorkspaceId: 'workspace-id',
        targetWorkspaceSubdomain: 'other',
      }),
      service.upsertFromCatalog({
        universalIdentifier:
          RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        name: 'Brand Brain',
        sourceType: retiredRegistration.sourceType,
        sourcePackage: null,
        latestAvailableVersion: '1.0.0',
        manifest: null,
      }),
    ]) {
      await expect(operation).rejects.toMatchObject({
        code: ApplicationRegistrationExceptionCode.APPLICATION_REGISTRATION_NOT_FOUND,
      });
    }

    expect(applicationRegistrationRepository.create).not.toHaveBeenCalled();
    expect(applicationRegistrationRepository.save).not.toHaveBeenCalled();
    expect(applicationRegistrationRepository.update).not.toHaveBeenCalled();
    expect(applicationRegistrationRepository.softDelete).not.toHaveBeenCalled();
  });

  it('rejects retired tarball uploads before parsing or persistence', async () => {
    jest.mocked(extractTarballSecurely).mockResolvedValue();
    jest.mocked(resolvePackageContentDir).mockResolvedValue('/tmp/content');
    jest.mocked(readJsonFile).mockImplementation(async (_directory, fileName) =>
      fileName === 'manifest.json'
        ? {
            application: {
              universalIdentifier:
                RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
            },
          }
        : { version: '1.0.0' },
    );
    const appRegistrationRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    const fileStorageService = { writeFile: jest.fn() };
    const applicationVersionValidationService = {
      validateServerCompatibility: jest
        .fn()
        .mockResolvedValue({ compatible: true }),
    };
    const service = new ApplicationTarballService(
      appRegistrationRepository as never,
      fileStorageService as never,
      {} as never,
      {} as never,
      applicationVersionValidationService as never,
    );

    await expect(
      service.uploadTarball({
        tarballBuffer: Buffer.alloc(0),
        universalIdentifier:
          RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        ownerWorkspaceId: 'workspace-id',
      }),
    ).rejects.toMatchObject({
      code: ApplicationRegistrationExceptionCode.APPLICATION_REGISTRATION_NOT_FOUND,
    });
    expect(extractTarballSecurely).not.toHaveBeenCalled();

    await expect(
      service.uploadTarball({
        tarballBuffer: Buffer.alloc(0),
        ownerWorkspaceId: 'workspace-id',
      }),
    ).rejects.toMatchObject({
      code: ApplicationRegistrationExceptionCode.APPLICATION_REGISTRATION_NOT_FOUND,
    });
    expect(extractTarballSecurely).toHaveBeenCalledTimes(1);
    expect(appRegistrationRepository.findOne).not.toHaveBeenCalled();
    expect(appRegistrationRepository.create).not.toHaveBeenCalled();
    expect(appRegistrationRepository.save).not.toHaveBeenCalled();
    expect(appRegistrationRepository.update).not.toHaveBeenCalled();
    expect(fileStorageService.writeFile).not.toHaveBeenCalled();
  });

  it('hides retired registrations from product and OAuth lookups', async () => {
    const activeRegistration = {
      ...retiredRegistration,
      id: 'active-registration-id',
      universalIdentifier: 'active-application-id',
      oAuthClientId: 'active-client-id',
    } as ApplicationRegistrationEntity;
    const applicationRegistrationRepository = {
      find: jest
        .fn()
        .mockResolvedValue([retiredRegistration, activeRegistration]),
      findOne: jest.fn().mockResolvedValue(retiredRegistration),
    };
    const service = new ApplicationRegistrationService(
      applicationRegistrationRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.findMany('workspace-id')).resolves.toEqual([
      activeRegistration,
    ]);
    await expect(service.findAll()).resolves.toEqual([activeRegistration]);
    await expect(service.findManyListedCatalogCards()).resolves.toEqual([
      expect.objectContaining({
        universalIdentifier: activeRegistration.universalIdentifier,
      }),
    ]);
    await expect(
      service.findOneByUniversalIdentifier(
        RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      ),
    ).resolves.toBeNull();
    await expect(
      service.findOneByClientId(retiredRegistration.oAuthClientId),
    ).resolves.toBeNull();
    await expect(
      service.findPublicByClientId(retiredRegistration.oAuthClientId),
    ).resolves.toBeNull();
    await expect(
      service.findOneById(retiredRegistration.id, 'workspace-id'),
    ).rejects.toMatchObject({
      code: ApplicationRegistrationExceptionCode.APPLICATION_REGISTRATION_NOT_FOUND,
    });
  });

  it('rejects retired synchronization and uninstall before destructive effects', async () => {
    const applicationService = {
      findOneApplicationOrThrow: jest.fn(),
      delete: jest.fn(),
    };
    const workspaceMigrationService = {
      validateBuildAndRunWorkspaceMigrationFromTo: jest.fn(),
    };
    const workspaceCacheService = { getOrRecompute: jest.fn() };
    const fileStorageService = { delete: jest.fn() };
    const logicFunctionDriverFactory = { getCurrentDriver: jest.fn() };
    const service = new ApplicationSyncService(
      applicationService as never,
      {} as never,
      workspaceMigrationService as never,
      workspaceCacheService as never,
      fileStorageService as never,
      {} as never,
      logicFunctionDriverFactory as never,
    );

    await expect(
      service.synchronizeFromManifest({
        workspaceId: 'workspace-id',
        manifest: {
          application: {
            universalIdentifier:
              RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
          },
        } as never,
      }),
    ).rejects.toMatchObject({
      code: ApplicationExceptionCode.APPLICATION_NOT_FOUND,
    });
    await expect(
      service.preInstallSynchronizeFromManifest({
        workspaceId: 'workspace-id',
        manifest: {
          application: {
            universalIdentifier:
              RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
          },
        } as never,
      }),
    ).rejects.toMatchObject({
      code: ApplicationExceptionCode.APPLICATION_NOT_FOUND,
    });
    await expect(
      service.uninstallApplication({
        workspaceId: 'workspace-id',
        applicationUniversalIdentifier:
          RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      }),
    ).rejects.toMatchObject({
      code: ApplicationExceptionCode.APPLICATION_NOT_FOUND,
    });

    expect(applicationService.findOneApplicationOrThrow).not.toHaveBeenCalled();
    expect(applicationService.delete).not.toHaveBeenCalled();
    expect(workspaceCacheService.getOrRecompute).not.toHaveBeenCalled();
    expect(
      workspaceMigrationService.validateBuildAndRunWorkspaceMigrationFromTo,
    ).not.toHaveBeenCalled();
    expect(fileStorageService.delete).not.toHaveBeenCalled();
    expect(logicFunctionDriverFactory.getCurrentDriver).not.toHaveBeenCalled();
  });

  it('rejects retired OAuth clients before token, install, or application effects', async () => {
    const appTokenRepository = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const applicationRepository = { findOne: jest.fn() };
    const applicationTokenService = {
      generateApplicationTokenPair: jest.fn(),
    };
    const applicationRegistrationService = {
      findOneByClientId: jest.fn().mockResolvedValue(retiredRegistration),
    };
    const applicationService = { create: jest.fn() };
    const applicationInstallService = { installApplication: jest.fn() };
    const service = new OAuthService(
      appTokenRepository as never,
      applicationRepository as never,
      {} as never,
      applicationTokenService as never,
      applicationRegistrationService as never,
      applicationService as never,
      applicationInstallService as never,
      {} as never,
    );

    await expect(
      service.exchangeAuthorizationCode({
        authorizationCode: 'authorization-code',
        clientId: retiredRegistration.oAuthClientId,
        redirectUri: 'https://example.com/callback',
      }),
    ).resolves.toMatchObject({ error: 'invalid_client' });
    expect(appTokenRepository.findOne).not.toHaveBeenCalled();
    expect(appTokenRepository.update).not.toHaveBeenCalled();
    expect(applicationRepository.findOne).not.toHaveBeenCalled();
    expect(applicationInstallService.installApplication).not.toHaveBeenCalled();
    expect(applicationService.create).not.toHaveBeenCalled();
    expect(
      applicationTokenService.generateApplicationTokenPair,
    ).not.toHaveBeenCalled();
  });
});
