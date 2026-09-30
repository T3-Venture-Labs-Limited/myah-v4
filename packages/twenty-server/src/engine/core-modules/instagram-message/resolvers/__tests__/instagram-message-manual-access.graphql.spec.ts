import {
  type INestApplication,
  Injectable,
  type NestMiddleware,
  Module,
  type MiddlewareConsumer,
} from '@nestjs/common';
import { GraphQLModule, Context, Query, Resolver } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { YogaDriver, type YogaDriverConfig } from '@graphql-yoga/nestjs';
import { type NextFunction, type Request, type Response } from 'express';

import { WorkspaceAuthContextMiddleware } from 'src/engine/core-modules/auth/middlewares/workspace-auth-context.middleware';
import { InstagramMessagePermissionService } from 'src/engine/core-modules/instagram-message/services/instagram-message-permission.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

// A trusted test-only hydrator models the verified JWT strategy's request fields.
// The GraphQL HTTP request, middleware, ALS context and permission gate are real.
@Injectable()
class TestRequestHydrator implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    req.workspace = { id: 'workspace-id' } as Request['workspace'];
    req.user = { id: 'user-id' } as Request['user'];
    req.userWorkspaceId = 'user-workspace-id';
    req.workspaceMemberId = 'member-id';
    req.workspaceMember = { id: 'member-id' } as Request['workspaceMember'];
    if (req.headers['x-test-impersonated'] === 'true') {
      req.impersonationContext = {
        impersonatorUserWorkspaceId: 'operator-id',
        impersonatedUserWorkspaceId: 'user-workspace-id',
      };
    }
    next();
  }
}

@Resolver()
class ManualAccessGraphqlProbe {
  constructor(private readonly permission: InstagramMessagePermissionService) {}

  // Test-only probe: request authentication is modeled by TestRequestHydrator.
  // oxlint-disable-next-line twenty/graphql-resolvers-should-be-guarded
  @Query(() => Boolean)
  async canSendManualInstagramReply(
    @Context('req') req: Request,
  ): Promise<boolean> {
    return this.permission.canSend({
      actionKind: 'REPLY',
      rolePermissionConfig: { unionOf: ['ordinary-role'] },
      workspaceId: req.workspace!.id,
      manualHumanAccess: {
        userWorkspaceId: 'user-workspace-id',
        workspaceMemberId: 'member-id',
      },
    });
  }
}

@Module({
  imports: [
    GraphQLModule.forRoot<YogaDriverConfig>({
      driver: YogaDriver,
      autoSchemaFile: true,
    }),
  ],
  providers: [
    ManualAccessGraphqlProbe,
    InstagramMessagePermissionService,
    {
      provide: PermissionsService,
      useValue: { hasToolPermission: jest.fn().mockResolvedValue(false) },
    },
  ],
})
class ManualAccessGraphqlTestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TestRequestHydrator, WorkspaceAuthContextMiddleware)
      .forRoutes('graphql');
  }
}

describe('Manual Instagram permission from an actual GraphQL HTTP request', () => {
  let app: INestApplication;
  let url: string;
  let routePermissions: jest.Mock;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [ManualAccessGraphqlTestModule],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/graphql`;
    routePermissions = app.get(PermissionsService)
      .hasToolPermission as jest.Mock;
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['ordinary member', false, true],
    ['actively impersonated member', true, false],
  ] as const)(
    'allows manual access for %s only',
    async (_label, impersonated, allowed) => {
      routePermissions.mockClear();
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-impersonated': String(impersonated),
        },
        body: JSON.stringify({ query: '{ canSendManualInstagramReply }' }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { canSendManualInstagramReply: allowed },
      });
      expect(routePermissions).toHaveBeenCalledTimes(impersonated ? 1 : 0);
    },
  );
});
