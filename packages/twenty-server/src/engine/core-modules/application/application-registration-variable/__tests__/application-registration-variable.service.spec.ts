import { ApplicationRegistrationVariableService } from 'src/engine/core-modules/application/application-registration-variable/application-registration-variable.service';
import { ApplicationRegistrationExceptionCode } from 'src/engine/core-modules/application/application-registration/application-registration.exception';
import { RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER } from 'src/engine/core-modules/application/constants/retired-application-universal-identifiers.constant';

describe('ApplicationRegistrationVariableService retired applications', () => {
  it('rejects listing, global updates, and schema sync before variable effects', async () => {
    const variable = {
      id: 'variable-id',
      applicationRegistrationId: 'registration-id',
    };
    const variableRepository = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(variable),
      findOneOrFail: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const applicationRegistrationRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'registration-id',
        universalIdentifier:
          RETIRED_BRAND_BRAIN_APPLICATION_UNIVERSAL_IDENTIFIER,
      }),
    };
    const encryptionService = {
      encryptVersioned: jest.fn(),
      decryptVersionedOrThrow: jest.fn(),
    };
    const service = new ApplicationRegistrationVariableService(
      variableRepository as never,
      applicationRegistrationRepository as never,
      {} as never,
      encryptionService as never,
    );

    const operations = [
      () => service.findVariablesWithObfuscatedValuesGlobal('registration-id'),
      () =>
        service.updateVariableGlobal({
          id: variable.id,
          update: { value: 'secret' as never },
        }),
      () => service.syncVariableSchemas('registration-id', {}),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toMatchObject({
        code: ApplicationRegistrationExceptionCode.APPLICATION_REGISTRATION_NOT_FOUND,
      });
    }

    expect(variableRepository.find).not.toHaveBeenCalled();
    expect(variableRepository.findOneOrFail).not.toHaveBeenCalled();
    expect(variableRepository.create).not.toHaveBeenCalled();
    expect(variableRepository.save).not.toHaveBeenCalled();
    expect(variableRepository.update).not.toHaveBeenCalled();
    expect(variableRepository.delete).not.toHaveBeenCalled();
    expect(encryptionService.encryptVersioned).not.toHaveBeenCalled();
    expect(encryptionService.decryptVersionedOrThrow).not.toHaveBeenCalled();
  });
});
