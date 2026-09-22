import { ApplicationInstallService } from 'src/engine/core-modules/application/application-install/application-install.service';
import { ApplicationRegistrationSourceType } from 'src/engine/core-modules/application/application-registration/enums/application-registration-source-type.enum';
import { ApplicationExceptionCode } from 'src/engine/core-modules/application/application.exception';

const RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER =
  '2f7d88d6-c6c9-4ed2-87e2-c1f9f13f3991';

describe('ApplicationInstallService', () => {
  it('rejects a preserved Brand Brain registration before installation', async () => {
    const appRegistrationRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'brand-brain-registration-id',
        universalIdentifier:
          RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
        sourceType: ApplicationRegistrationSourceType.TARBALL,
      }),
    };
    const cacheLockService = { withLock: jest.fn() };
    const service = new ApplicationInstallService(
      appRegistrationRepository as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      cacheLockService as never,
      null as never,
      null as never,
      null as never,
      null as never,
    );

    await expect(
      service.installApplication({
        appRegistrationId: 'brand-brain-registration-id',
        workspaceId: 'workspace-id',
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: ApplicationExceptionCode.APPLICATION_NOT_FOUND,
      }),
    );
    expect(cacheLockService.withLock).not.toHaveBeenCalled();
  });
});
