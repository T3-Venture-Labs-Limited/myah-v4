import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { WorkspaceIteratorService } from 'src/database/commands/command-runners/workspace-iterator.service';
import { ApplicationInstallService } from 'src/engine/core-modules/application/application-install/application-install.service';
import { ApplicationRegistrationEntity } from 'src/engine/core-modules/application/application-registration/application-registration.entity';
import { PreInstalledAppsService } from 'src/engine/core-modules/application/pre-installed-apps/pre-installed-apps.service';
import {
  ApplicationException,
  ApplicationExceptionCode,
} from 'src/engine/core-modules/application/application.exception';
import {
  RETAINED_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER,
  RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
  RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER,
} from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';

describe('PreInstalledAppsService', () => {
  let service: PreInstalledAppsService;
  let applicationInstallService: { installApplication: jest.Mock };
  let applicationRegistrationRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let workspaceIteratorService: { iterate: jest.Mock };

  beforeEach(async () => {
    applicationInstallService = { installApplication: jest.fn() };
    applicationRegistrationRepository = { find: jest.fn(), findOne: jest.fn() };
    workspaceIteratorService = { iterate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreInstalledAppsService,
        {
          provide: ApplicationInstallService,
          useValue: applicationInstallService,
        },
        {
          provide: getRepositoryToken(ApplicationRegistrationEntity),
          useValue: applicationRegistrationRepository,
        },
        {
          provide: WorkspaceIteratorService,
          useValue: workspaceIteratorService,
        },
      ],
    }).compile();

    service = module.get<PreInstalledAppsService>(PreInstalledAppsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('installOnWorkspace', () => {
    it('skips retired apps while installing retained Instagram', async () => {
      applicationRegistrationRepository.find.mockResolvedValue([
        {
          id: 'brand-brain-registration',
          universalIdentifier:
            RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
          name: 'Brand Brain',
        },
        {
          id: 'shopify-registration',
          universalIdentifier: RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER,
          name: 'Myah Shopify',
        },
        {
          id: 'custom-registration',
          universalIdentifier: '00000000-0000-4000-8000-000000000001',
          name: 'Legacy custom app',
        },
        {
          id: 'instagram-registration',
          universalIdentifier:
            RETAINED_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER,
          name: 'Myah Instagram Messaging',
        },
      ] as ApplicationRegistrationEntity[]);

      await service.installOnWorkspace('workspace-1');

      expect(
        applicationInstallService.installApplication,
      ).toHaveBeenCalledTimes(1);
      expect(applicationInstallService.installApplication).toHaveBeenCalledWith(
        {
          appRegistrationId: 'instagram-registration',
          workspaceId: 'workspace-1',
        },
      );
    });
  });

  describe('backfillApplicationOnAllWorkspaces', () => {
    it.each([
      [
        'brand-brain-registration',
        RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      ],
      [
        'shopify-registration',
        RETIRED_SHOPIFY_APPLICATION_UNIVERSAL_IDENTIFIER,
      ],
    ])(
      'rejects queued retired app backfill %s',
      async (id, universalIdentifier) => {
        applicationRegistrationRepository.findOne.mockResolvedValue({
          id,
          universalIdentifier,
        } as ApplicationRegistrationEntity);

        await expect(
          service.backfillApplicationOnAllWorkspaces(id),
        ).rejects.toThrow(ApplicationException);
        expect(workspaceIteratorService.iterate).not.toHaveBeenCalled();
      },
    );

    it('should throw when the registration does not exist', async () => {
      applicationRegistrationRepository.findOne.mockResolvedValue(null);

      await expect(
        service.backfillApplicationOnAllWorkspaces('missing-id'),
      ).rejects.toThrow(ApplicationException);

      expect(workspaceIteratorService.iterate).not.toHaveBeenCalled();
    });

    it('should install the app on every iterated workspace', async () => {
      applicationRegistrationRepository.findOne.mockResolvedValue({
        id: 'app-1',
        name: 'Myah Instagram Messaging',
        universalIdentifier:
          RETAINED_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER,
      } as ApplicationRegistrationEntity);

      workspaceIteratorService.iterate.mockImplementation(
        async ({ callback }) => {
          await callback({ workspaceId: 'workspace-1', index: 0, total: 2 });
          await callback({ workspaceId: 'workspace-2', index: 1, total: 2 });

          return { success: [{ workspaceId: 'workspace-1' }], fail: [] };
        },
      );

      await service.backfillApplicationOnAllWorkspaces('app-1');

      expect(
        applicationInstallService.installApplication,
      ).toHaveBeenCalledTimes(2);
      expect(applicationInstallService.installApplication).toHaveBeenCalledWith(
        {
          appRegistrationId: 'app-1',
          workspaceId: 'workspace-1',
        },
      );
      expect(applicationInstallService.installApplication).toHaveBeenCalledWith(
        {
          appRegistrationId: 'app-1',
          workspaceId: 'workspace-2',
        },
      );
    });

    it('should swallow already-installed errors so the backfill stays idempotent', async () => {
      applicationRegistrationRepository.findOne.mockResolvedValue({
        id: 'app-1',
        name: 'Myah Instagram Messaging',
        universalIdentifier:
          RETAINED_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER,
      } as ApplicationRegistrationEntity);

      applicationInstallService.installApplication.mockRejectedValue(
        new ApplicationException(
          'already installed',
          ApplicationExceptionCode.APP_ALREADY_INSTALLED,
        ),
      );

      workspaceIteratorService.iterate.mockImplementation(
        async ({ callback }) => {
          await expect(
            callback({ workspaceId: 'workspace-1', index: 0, total: 1 }),
          ).resolves.toBeUndefined();

          return { success: [{ workspaceId: 'workspace-1' }], fail: [] };
        },
      );

      await expect(
        service.backfillApplicationOnAllWorkspaces('app-1'),
      ).resolves.toBeUndefined();
    });

    it('should rethrow unexpected install errors to the iterator', async () => {
      applicationRegistrationRepository.findOne.mockResolvedValue({
        id: 'app-1',
        name: 'Myah Instagram Messaging',
        universalIdentifier:
          RETAINED_INSTAGRAM_APPLICATION_UNIVERSAL_IDENTIFIER,
      } as ApplicationRegistrationEntity);

      const unexpectedError = new Error('boom');

      applicationInstallService.installApplication.mockRejectedValue(
        unexpectedError,
      );

      workspaceIteratorService.iterate.mockImplementation(
        async ({ callback }) => {
          await expect(
            callback({ workspaceId: 'workspace-1', index: 0, total: 1 }),
          ).rejects.toThrow(unexpectedError);

          return {
            success: [],
            fail: [{ workspaceId: 'workspace-1', error: unexpectedError }],
          };
        },
      );

      await expect(
        service.backfillApplicationOnAllWorkspaces('app-1'),
      ).resolves.toBeUndefined();
    });
  });
});
