import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import {
  type ExistingUserOrPartialUserWithPicture,
  type SignInUpNewUserPayload,
} from 'src/engine/core-modules/auth/types/signInUp.type';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';
import { type ApplicationService } from 'src/engine/core-modules/application/application.service';
import { type DataSource } from 'typeorm';

import { SignInUpService } from './sign-in-up.service';

const mockPartialUserPayload: SignInUpNewUserPayload = {
  email: 'first.user@acme.dev',
  firstName: 'First',
  lastName: 'User',
  locale: 'en',
  isEmailAlreadyVerified: true,
};

type MockConfigurationValues = {
  IS_MULTIWORKSPACE_ENABLED: boolean;
  IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS: boolean;
  SERVER_URL: string;
};

const createSignInUpServiceForTests = () => {
  const mockUserRepository = {
    create: jest.fn((user: object) => user),
    save: jest.fn(async (user: object) => ({ id: 'saved-user-id', ...user })),
    count: jest.fn(),
  };

  const mockWorkspaceRepository = {
    count: jest.fn(),
    create: jest.fn((workspace: object) => workspace),
  };

  const mockConfigurationValues: MockConfigurationValues = {
    IS_MULTIWORKSPACE_ENABLED: true,
    IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS: false,
    SERVER_URL: 'http://localhost:3000',
  };

  const mockTwentyConfigService = {
    get: jest.fn(
      (configKey: keyof MockConfigurationValues) =>
        mockConfigurationValues[configKey],
    ),
  };

  const queryRunnerMock = {
    manager: {
      save: jest.fn(
        async <Entity extends object>(_target: unknown, entity: Entity) => ({
          id: 'persisted-entity-id',
          ...entity,
        }),
      ),
      update: jest.fn(),
    },
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };

  const mockApplicationService = {
    createWorkspaceCustomApplication: jest.fn().mockResolvedValue({
      universalIdentifier: 'workspace-custom-application-id',
    }),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => queryRunnerMock),
    transaction: jest.fn(
      async (
        callback: (entityManager: {
          queryRunner: typeof queryRunnerMock;
        }) => Promise<unknown>,
      ) => callback({ queryRunner: queryRunnerMock }),
    ),
  };

  const service = new SignInUpService(
    mockUserRepository as any,
    mockWorkspaceRepository as any,
    {
      validatePersonalInvitation: jest.fn(),
      invalidateWorkspaceInvitation: jest.fn(),
    } as any,
    {
      create: jest.fn(),
      checkUserWorkspaceExists: jest.fn(),
    } as any,
    {
      setOnboardingConnectAccountPending: jest.fn(),
      setOnboardingCreateProfilePending: jest.fn(),
      setOnboardingInstallAppsPending: jest.fn(),
      setOnboardingInviteTeamPending: jest.fn(),
      createOnboardingStatusForWorkspaceMember: jest.fn(),
    } as any,
    {
      emitCustomBatchEvent: jest.fn(),
    } as any,
    mockTwentyConfigService as any,
    {
      generateSubdomain: jest.fn(),
    } as any,
    {
      findUserByEmail: jest.fn(),
      findByEmail: jest.fn(),
      markEmailAsVerified: jest.fn(),
    } as any,
    {
      incrementCounterForEvent: jest.fn(),
    } as any,
    {
      invalidateAndRecompute: jest.fn(),
    } as any,
    mockApplicationService as unknown as ApplicationService,
    {
      uploadWorkspaceLogoFromUrl: jest.fn(),
    } as any,
    {
      isValid: jest.fn().mockReturnValue(false),
    } as any,
    {
      createContext: jest.fn().mockReturnValue({
        insertWorkspaceEvent: jest.fn(),
      }),
    } as any,
    {
      creditWorkspaceBalance: jest.fn(),
    } as any,
    mockDataSource as unknown as DataSource,
  );

  return {
    service,
    mockUserRepository,
    mockWorkspaceRepository,
    mockConfigurationValues,
    queryRunnerMock,
  };
};

describe('SignInUpService workspace-creation policy', () => {
  it('grants bootstrap owner server permissions when multi-workspace is enabled and unrestricted', async () => {
    const {
      service,
      mockUserRepository,
      mockWorkspaceRepository,
      mockConfigurationValues,
    } = createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = true;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS = false;
    mockWorkspaceRepository.count.mockResolvedValue(0);
    mockUserRepository.count.mockResolvedValue(0);
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await service.signUpWithoutWorkspace(mockPartialUserPayload, {
      provider: AuthProviderEnum.Google,
    } as any);

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        canImpersonate: true,
        canAccessFullAdminPanel: true,
      }),
    );
  });

  it('grants bootstrap owner server permissions when multi-workspace is enabled and restricted', async () => {
    const {
      service,
      mockUserRepository,
      mockWorkspaceRepository,
      mockConfigurationValues,
    } = createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = true;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS = true;
    mockWorkspaceRepository.count.mockResolvedValue(0);
    mockUserRepository.count.mockResolvedValue(0);
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await service.signUpWithoutWorkspace(mockPartialUserPayload, {
      provider: AuthProviderEnum.Google,
    } as any);

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        canImpersonate: true,
        canAccessFullAdminPanel: true,
      }),
    );
  });

  it('assigns default non-admin permissions after bootstrap in multi-workspace mode', async () => {
    const {
      service,
      mockUserRepository,
      mockWorkspaceRepository,
      mockConfigurationValues,
    } = createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = true;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS = false;
    mockWorkspaceRepository.count.mockResolvedValue(1);
    mockUserRepository.count.mockResolvedValue(1);
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await service.signUpWithoutWorkspace(mockPartialUserPayload, {
      provider: AuthProviderEnum.Google,
    } as any);

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        canImpersonate: false,
        canAccessFullAdminPanel: false,
      }),
    );
  });

  it('does not grant admin to second user signing up before any workspace exists', async () => {
    const {
      service,
      mockUserRepository,
      mockWorkspaceRepository,
      mockConfigurationValues,
    } = createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = true;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS = false;
    mockWorkspaceRepository.count.mockResolvedValue(0);
    mockUserRepository.count.mockResolvedValue(1);
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await service.signUpWithoutWorkspace(mockPartialUserPayload, {
      provider: AuthProviderEnum.Google,
    } as any);

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        canImpersonate: false,
        canAccessFullAdminPanel: false,
      }),
    );
  });

  it('throws forbidden when a non-admin existing user creates workspace in restricted mode after bootstrap', async () => {
    const { service, mockWorkspaceRepository, mockConfigurationValues } =
      createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = true;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS = true;
    mockWorkspaceRepository.count.mockResolvedValue(1);

    const nonAdminExistingUser = {
      id: 'existing-user-id',
      email: 'existing.user@acme.dev',
      canAccessFullAdminPanel: false,
    };

    await expect(
      service.signUpOnNewWorkspace({
        type: 'existingUser',
        existingUser: nonAdminExistingUser as any,
      }),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    });
  });

  it('throws SIGNUP_DISABLED when creating workspace in single-workspace mode after bootstrap', async () => {
    const { service, mockWorkspaceRepository, mockConfigurationValues } =
      createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = false;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS = false;
    mockWorkspaceRepository.count.mockResolvedValue(1);

    await expect(
      service.signUpOnNewWorkspace({
        type: 'existingUser',
        existingUser: {
          id: 'existing-user-id',
          email: 'existing.user@acme.dev',
          canAccessFullAdminPanel: true,
        } as any,
      }),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.SIGNUP_DISABLED,
    });
  });

  it('keeps single-workspace SIGNUP_DISABLED behavior after first workspace exists', async () => {
    const { service, mockWorkspaceRepository, mockConfigurationValues } =
      createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = false;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS = false;
    mockWorkspaceRepository.count.mockResolvedValue(1);
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await expect(
      service.signUpWithoutWorkspace(mockPartialUserPayload, {
        provider: AuthProviderEnum.Google,
      } as any),
    ).rejects.toBeInstanceOf(AuthException);

    await expect(
      service.signUpWithoutWorkspace(mockPartialUserPayload, {
        provider: AuthProviderEnum.Google,
      } as any),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.SIGNUP_DISABLED,
    });
  });

  it('does not record a click-through DPA for a new workspace', async () => {
    const { service, queryRunnerMock, mockWorkspaceRepository } =
      createSignInUpServiceForTests();

    mockWorkspaceRepository.count.mockResolvedValue(0);
    const newUserWithPicture = {
      type: 'newUserWithPicture',
      newUserWithPicture: {
        email: 'new.user@gmail.com',
        firstName: 'New',
        lastName: 'User',
        picture: '',
        locale: 'en',
        isEmailVerified: true,
      },
    } satisfies ExistingUserOrPartialUserWithPicture['userData'];

    await service.signUpOnNewWorkspace(newUserWithPicture, {
      displayName: 'New workspace',
    });

    expect(queryRunnerMock.manager.save).toHaveBeenCalledTimes(2);
  });
});
