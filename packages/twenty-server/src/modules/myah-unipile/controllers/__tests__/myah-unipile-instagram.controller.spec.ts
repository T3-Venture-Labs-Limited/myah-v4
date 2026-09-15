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
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PermissionFlagType } from 'twenty-shared/constants';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';

import { settings } from 'src/engine/constants/settings';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { redactJsonParserErrorMiddleware } from 'src/engine/middlewares/redact-json-parser-error.middleware';
import { UnhandledExceptionFilter } from 'src/filters/unhandled-exception.filter';
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
  notifyHostedAuth(attemptId: string, body: unknown): Promise<{ ok: true }>;
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
  const attemptId = '97ea42c5-0514-4f29-a2ea-b641f90230ec';
  const notification = {
    account_id: 'provider-account-id',
    name: 'ab'.repeat(32),
    status: 'CREATION_SUCCESS',
  };

  const withHttpApp = async (
    run: (input: {
      post: (
        body: string | undefined,
        pathAttemptId?: string,
      ) => Promise<Response>;
      processNotification: jest.Mock;
    }) => Promise<void>,
  ) => {
    jest.useRealTimers();

    const controllerModule = loadControllerModule();

    if (!controllerModule) {
      throw new Error('Unable to load Instagram controller');
    }

    const processNotification = jest.fn().mockResolvedValue({
      attemptId,
      status: 'COMPLETED',
    });
    const module = await Test.createTestingModule({
      controllers: [controllerModule.MyahUnipileInstagramPublicController],
      providers: [
        {
          provide: UnipileHostedAuthService,
          useValue: { processNotification },
        },
      ],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
      rawBody: true,
    });

    app.useGlobalFilters(new UnhandledExceptionFilter());
    app.useBodyParser('json', { limit: settings.storage.maxFileSize });
    app.useBodyParser('urlencoded', {
      limit: settings.storage.maxFileSize,
      extended: true,
    });
    app.useBodyParser('text', { type: 'text/plain', limit: '1024kb' });
    app.use(redactJsonParserErrorMiddleware);

    try {
      await app.listen(0, '127.0.0.1');

      const baseUrl = await app.getUrl();

      await run({
        post: (body, pathAttemptId = attemptId) =>
          fetch(
            `${baseUrl}/rest/myah/unipile/instagram/hosted-auth/${encodeURIComponent(pathAttemptId)}/notify`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            },
          ),
        processNotification,
      });
    } finally {
      await app.close();
      jest.useFakeTimers();
    }
  };

  const invalidNotifications: Array<[string, unknown]> = [
    ['missing body', undefined],
    ['empty object', {}],
    ['array body', []],
    [
      'unknown field',
      { ...notification, untrusted: 'synthetic-private-value' },
    ],
    ['unsupported status', { ...notification, status: 'SYNC_SUCCESS' }],
    ['oversized status', { ...notification, status: 'x'.repeat(513) }],
    ['short nonce', { ...notification, name: 'ab'.repeat(31) }],
    ['oversized nonce', { ...notification, name: 'ab'.repeat(33) }],
    ['nonhex nonce', { ...notification, name: 'z'.repeat(64) }],
    ['uppercase nonce', { ...notification, name: 'AB'.repeat(32) }],
    [
      'nonce with trailing newline',
      { ...notification, name: `${'a'.repeat(63)}\n` },
    ],
    ['oversized account ID', { ...notification, account_id: 'x'.repeat(513) }],
    ['blank account ID', { ...notification, account_id: '  \t' }],
  ];

  for (const field of ['account_id', 'name', 'status'] as const) {
    const { [field]: _omitted, ...missingField } = notification;

    invalidNotifications.push([`missing ${field}`, missingField]);

    for (const [label, value] of [
      ['null', null],
      ['object', { secret: 'synthetic-private-value' }],
      ['array', ['synthetic-private-value']],
      ['number', 123],
      ['boolean', true],
      ['empty', ''],
    ] as const) {
      invalidNotifications.push([
        `${label} ${field}`,
        { ...notification, [field]: value },
      ]);
    }
  }

  it.each(invalidNotifications)(
    'rejects %s over HTTP before notification processing with a redacted 400',
    async (_label, body) => {
      await withHttpApp(async ({ post, processNotification }) => {
        const response = await post(JSON.stringify(body));

        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(await response.json()).toEqual({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid Hosted Auth notification',
          error: 'Bad Request',
        });
        expect(processNotification).not.toHaveBeenCalled();
      });
    },
  );

  it.each([
    ['non-UUID', 'not-a-uuid'],
    ['compact UUID', attemptId.replace(/-/g, '')],
    ['braced UUID', `{${attemptId}}`],
    ['oversized path ID', 'a'.repeat(513)],
  ])('rejects %s route IDs over HTTP before processing', async (_label, id) => {
    await withHttpApp(async ({ post, processNotification }) => {
      const response = await post(JSON.stringify(notification), id);

      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(await response.json()).toEqual({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid Hosted Auth notification',
        error: 'Bad Request',
      });
      expect(processNotification).not.toHaveBeenCalled();
    });
  });

  it.each(['CREATION_SUCCESS', 'RECONNECTED'])(
    'retains public %s notifications and exact opaque IDs over HTTP',
    async (status) => {
      await withHttpApp(async ({ post, processNotification }) => {
        // Match the existing webhook identifier ceiling without inventing an ID alphabet.
        const accountId = ` account:/+_%?=é${'x'.repeat(495)} `;

        expect(accountId).toHaveLength(512);

        const response = await post(
          JSON.stringify({ ...notification, account_id: accountId, status }),
        );

        expect(response.status).toBe(HttpStatus.OK);
        expect(await response.json()).toEqual({ ok: true });
        expect(processNotification).toHaveBeenCalledTimes(1);
        expect(processNotification).toHaveBeenCalledWith({
          accountId,
          attemptId,
          name: notification.name,
          status,
        });
      });
    },
  );

  it.each([
    ['top-level null', 'null'],
    ['top-level number', '123'],
    ['top-level boolean', 'true'],
    ['top-level string', '"SYN"'],
    ['malformed JSON', '{"SYN":invalid}'],
    ['truncated JSON', '{"SYN":'],
  ] as const)(
    'redacts %s parser failures over HTTP before notification processing',
    async (_label, body) => {
      await withHttpApp(async ({ post, processNotification }) => {
        const response = await post(body);
        const error = await response.json();

        expect(response.status).toBe(HttpStatus.BAD_REQUEST);
        expect(processNotification).not.toHaveBeenCalled();
        expect(JSON.stringify(error).includes('SYN')).toBe(false);
        expect(error).toEqual({
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid JSON body',
          error: 'Bad Request',
        });
      });
    },
  );

  it('rejects a direct null body before notification processing', async () => {
    const controllerModule = loadControllerModule();

    if (!controllerModule) {
      throw new Error('Unable to load Instagram controller');
    }

    const processNotification = jest.fn();
    const controller =
      new controllerModule.MyahUnipileInstagramPublicController({
        processNotification,
      } as unknown as UnipileHostedAuthService);

    await expect(
      controller.notifyHostedAuth(attemptId, null),
    ).rejects.toMatchObject({
      response: {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid Hosted Auth notification',
        error: 'Bad Request',
      },
    });
    expect(processNotification).not.toHaveBeenCalled();
  });

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
      controller.notifyHostedAuth(attemptId, notification),
    ).resolves.toEqual({ ok: true });
    expect(hostedAuthService.processNotification).toHaveBeenCalledWith({
      accountId: 'provider-account-id',
      attemptId,
      name: notification.name,
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
