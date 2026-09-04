import {
  HttpStatus,
  RequestMethod,
  type ExecutionContext,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PermissionFlagType } from 'twenty-shared/constants';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { UnipileHostedAuthAttemptStatus } from 'src/modules/myah-unipile/entities/unipile-hosted-auth-attempt.entity';
import { UnipileHostedAuthService } from 'src/modules/myah-unipile/services/unipile-hosted-auth.service';
import { UnipileInstagramAccountService } from 'src/modules/myah-unipile/services/unipile-instagram-account.service';

type MyahUnipileInstagramController = {
  getAccount(workspace: FlatWorkspace): Promise<unknown>;
  getHostedAuthAttemptStatus(
    workspace: FlatWorkspace,
    userWorkspaceId: string,
    attemptId: string,
  ): Promise<{
    attemptId: string;
    status: string;
    failureCode: string | null;
    failureReason: string | null;
  }>;
  connect(
    workspace: FlatWorkspace,
    userWorkspaceId: string,
  ): Promise<{ attemptId: string; redirectUrl: string }>;
  reconnect(
    workspace: FlatWorkspace,
    userWorkspaceId: string,
  ): Promise<{ attemptId: string; redirectUrl: string }>;
  disconnect(
    workspace: FlatWorkspace,
    userWorkspaceId: string,
  ): Promise<{ status: 'DISCONNECTED' | 'PENDING_RECOVERY' }>;
};

type MyahUnipileInstagramPublicController = {
  notifyHostedAuth(
    attemptId: string,
    body: { account_id: string; name: string; status: string },
  ): Promise<{ ok: true }>;
};

type MyahUnipileInstagramControllerModule = {
  MyahUnipileInstagramController: new (
    hostedAuthService: UnipileHostedAuthService,
    accountService: UnipileInstagramAccountService,
  ) => MyahUnipileInstagramController;
  MyahUnipileInstagramPublicController: new (
    hostedAuthService: UnipileHostedAuthService,
  ) => MyahUnipileInstagramPublicController;
};

const loadControllerModule = ():
  | MyahUnipileInstagramControllerModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/controllers/myah-unipile-instagram.controller') as MyahUnipileInstagramControllerModule;
  } catch {
    return undefined;
  }
};

describe('MyahUnipileInstagramController', () => {
  const workspace = { id: 'workspace-id' } as FlatWorkspace;
  const userWorkspaceId = 'user-workspace-id';

  const createAuthenticatedController = (
    controllerModule: MyahUnipileInstagramControllerModule,
  ) => {
    const hostedAuthService = {
      createConnectionAttempt: jest.fn(),
      createReconnectAttempt: jest.fn(),
      getAttemptStatus: jest.fn(),
    } as unknown as UnipileHostedAuthService;
    const accountService = {
      disconnectAccount: jest.fn(),
      getWorkspaceAccountStatus: jest.fn(),
    } as unknown as UnipileInstagramAccountService;

    return {
      accountService,
      controller: new controllerModule.MyahUnipileInstagramController(
        hostedAuthService,
        accountService,
      ),
      hostedAuthService,
    };
  };

  it('returns the authenticated workspace safe account status', async () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const { accountService, controller } =
      createAuthenticatedController(controllerModule);
    const account = {
      id: 'myah-instagram-account-id',
      lastCheckedAt: '2026-09-04T12:00:00.000Z',
      lastError: null,
      status: 'ACTIVE',
      username: 'myah',
    };

    jest
      .mocked(accountService.getWorkspaceAccountStatus)
      .mockResolvedValue(account as never);

    await expect(controller.getAccount(workspace)).resolves.toEqual(account);
    expect(accountService.getWorkspaceAccountStatus).toHaveBeenCalledWith(
      workspace.id,
    );
  });

  it('returns only the authenticated caller Hosted Auth attempt status', async () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const { controller, hostedAuthService } =
      createAuthenticatedController(controllerModule);
    const status = {
      attemptId: 'attempt-id',
      status: UnipileHostedAuthAttemptStatus.FAILED,
      failureCode: 'ACCOUNT_FINALIZATION_REJECTED',
      failureReason: 'Unable to finalize Instagram account connection',
    };

    jest.mocked(hostedAuthService.getAttemptStatus).mockResolvedValue(status);

    await expect(
      controller.getHostedAuthAttemptStatus(
        workspace,
        userWorkspaceId,
        status.attemptId,
      ),
    ).resolves.toEqual(status);
    expect(hostedAuthService.getAttemptStatus).toHaveBeenCalledWith({
      attemptId: status.attemptId,
      workspaceId: workspace.id,
      userWorkspaceId,
    });
  });

  it('starts Hosted Auth only for the authenticated workspace and user', async () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const { controller, hostedAuthService } =
      createAuthenticatedController(controllerModule);

    jest.mocked(hostedAuthService.createConnectionAttempt).mockResolvedValue({
      attemptId: 'attempt-id',
      url: 'https://hosted-auth.example.com/connect',
    });

    await expect(
      controller.connect(workspace, userWorkspaceId),
    ).resolves.toEqual({
      attemptId: 'attempt-id',
      redirectUrl: 'https://hosted-auth.example.com/connect',
    });
    expect(hostedAuthService.createConnectionAttempt).toHaveBeenCalledWith({
      userWorkspaceId,
      workspaceId: workspace.id,
    });
  });

  it('starts Hosted Auth reconnect only for the authenticated workspace and user', async () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const { controller, hostedAuthService } =
      createAuthenticatedController(controllerModule);

    jest.mocked(hostedAuthService.createReconnectAttempt).mockResolvedValue({
      attemptId: 'attempt-id',
      url: 'https://hosted-auth.example.com/reconnect',
    });

    await expect(
      controller.reconnect(workspace, userWorkspaceId),
    ).resolves.toEqual({
      attemptId: 'attempt-id',
      redirectUrl: 'https://hosted-auth.example.com/reconnect',
    });
    expect(hostedAuthService.createReconnectAttempt).toHaveBeenCalledWith({
      userWorkspaceId,
      workspaceId: workspace.id,
    });
  });

  it.each(['DISCONNECTED', 'PENDING_RECOVERY'] as const)(
    'returns the authenticated workspace disconnect %s status',
    async (status) => {
      const controllerModule = loadControllerModule();

      expect(controllerModule).toBeDefined();

      if (!controllerModule) {
        return;
      }

      const { accountService, controller } =
        createAuthenticatedController(controllerModule);

      jest
        .mocked(accountService.disconnectAccount)
        .mockResolvedValue({ status } as never);

      await expect(
        controller.disconnect(workspace, userWorkspaceId),
      ).resolves.toEqual({ status });
      expect(accountService.disconnectAccount).toHaveBeenCalledWith({
        userWorkspaceId,
        workspaceId: workspace.id,
      });
    },
  );

  it('registers only authenticated lifecycle routes behind connected-account settings permission', async () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      controllerModule.MyahUnipileInstagramController,
    ) as Array<new (...args: never[]) => unknown>;
    type PermissionsService = {
      userHasWorkspaceSettingPermission: jest.Mock;
    };
    const permissionsService: PermissionsService = {
      userHasWorkspaceSettingPermission: jest.fn().mockResolvedValue(true),
    };
    const SettingsPermissionGuard = guards[2] as new (
      permissionsService: PermissionsService,
    ) => {
      canActivate(context: ExecutionContext): Promise<boolean>;
    };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          userWorkspaceId,
          workspace: {
            activationStatus: WorkspaceActivationStatus.ACTIVE,
            id: workspace.id,
          },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guards).toHaveLength(3);
    expect(guards.slice(0, 2)).toEqual([JwtAuthGuard, WorkspaceAuthGuard]);
    expect(guards).not.toContain(PublicEndpointGuard);
    expect(guards).not.toContain(NoPermissionGuard);
    await expect(
      new SettingsPermissionGuard(permissionsService).canActivate(context),
    ).resolves.toBe(true);
    expect(
      permissionsService.userHasWorkspaceSettingPermission,
    ).toHaveBeenCalledWith({
      apiKeyId: undefined,
      applicationId: undefined,
      setting: PermissionFlagType.CONNECTED_ACCOUNTS,
      userWorkspaceId,
      workspaceId: workspace.id,
    });
  });

  it('registers the account and Hosted Auth lifecycle route metadata', () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const Controller = controllerModule.MyahUnipileInstagramController;

    expect(Reflect.getMetadata(PATH_METADATA, Controller)).toBe(
      'rest/myah/unipile/instagram',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, Controller.prototype.getAccount),
    ).toBe('account');
    expect(
      Reflect.getMetadata(METHOD_METADATA, Controller.prototype.getAccount),
    ).toBe(RequestMethod.GET);
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        Controller.prototype.getHostedAuthAttemptStatus,
      ),
    ).toBe('hosted-auth/:attemptId/status');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        Controller.prototype.getHostedAuthAttemptStatus,
      ),
    ).toBe(RequestMethod.GET);

    for (const method of ['connect', 'reconnect', 'disconnect'] as const) {
      expect(
        Reflect.getMetadata(METHOD_METADATA, Controller.prototype[method]),
      ).toBe(RequestMethod.POST);
    }

    expect(
      Reflect.getMetadata(PATH_METADATA, Controller.prototype.connect),
    ).toBe('hosted-auth/connect');
    expect(
      Reflect.getMetadata(PATH_METADATA, Controller.prototype.reconnect),
    ).toBe('hosted-auth/reconnect');
    expect(
      Reflect.getMetadata(PATH_METADATA, Controller.prototype.disconnect),
    ).toBe('disconnect');
  });

  it('injects lifecycle services rather than a provider client', () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        controllerModule.MyahUnipileInstagramController,
      ),
    ).toEqual([UnipileHostedAuthService, UnipileInstagramAccountService]);
  });
});

describe('MyahUnipileInstagramPublicController', () => {
  it('passes only callback-safe fields to Hosted Auth notification processing', async () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const hostedAuthService = {
      processNotification: jest.fn().mockResolvedValue({
        attemptId: 'attempt-id',
        status: 'COMPLETED',
      }),
    } as unknown as UnipileHostedAuthService;
    const controller =
      new controllerModule.MyahUnipileInstagramPublicController(
        hostedAuthService,
      );

    await expect(
      controller.notifyHostedAuth('attempt-id', {
        account_id: 'provider-account-id',
        name: 'callback-proof',
        status: 'CREATION_SUCCESS',
      }),
    ).resolves.toEqual({ ok: true });
    expect(hostedAuthService.processNotification).toHaveBeenCalledWith({
      accountId: 'provider-account-id',
      attemptId: 'attempt-id',
      name: 'callback-proof',
      status: 'CREATION_SUCCESS',
    });
  });

  it('registers only the public callback route with no-permission guard', () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    const Controller = controllerModule.MyahUnipileInstagramPublicController;

    expect(Reflect.getMetadata(PATH_METADATA, Controller)).toBe(
      'rest/myah/unipile/instagram',
    );
    expect(
      Reflect.getMetadata(PATH_METADATA, Controller.prototype.notifyHostedAuth),
    ).toBe('hosted-auth/:attemptId/notify');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        Controller.prototype.notifyHostedAuth,
      ),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        Controller.prototype.notifyHostedAuth,
      ),
    ).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata(GUARDS_METADATA, Controller)).toEqual([
      PublicEndpointGuard,
      NoPermissionGuard,
    ]);
  });

  it('injects Hosted Auth rather than a provider client', () => {
    const controllerModule = loadControllerModule();

    expect(controllerModule).toBeDefined();

    if (!controllerModule) {
      return;
    }

    expect(
      Reflect.getMetadata(
        'design:paramtypes',
        controllerModule.MyahUnipileInstagramPublicController,
      ),
    ).toEqual([UnipileHostedAuthService]);
  });
});
