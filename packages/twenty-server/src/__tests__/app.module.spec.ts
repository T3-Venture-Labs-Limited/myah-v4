import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HttpStatus, RequestMethod } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';

import { AppModule } from 'src/app.module';
import { ModulesModule } from 'src/modules/modules.module';

describe('AppModule middleware configuration', () => {
  it('does not register retired Shopify REST routes', () => {
    const appModuleSource = readFileSync(
      join(__dirname, '../app.module.ts'),
      'utf8',
    );
    const modules = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      ModulesModule,
    ) as Array<{ name: string }>;

    expect(appModuleSource).not.toContain('rest/myah/shopify/oauth/');
    expect(appModuleSource).not.toContain('rest/myah/shopify/agent/');
    expect(modules.map((module) => module.name)).not.toContain(
      'MyahShopifyModule',
    );
    expect(modules.map((module) => module.name)).toContain('MyahUnipileModule');
  });
  it('rejects stale Shopify requests before generic REST routing', () => {
    const registrations: Array<{
      middleware: unknown;
      route: { path: string; method: RequestMethod };
      excluded?: Array<{ path: string }>;
    }> = [];
    const consumer = {
      apply: (middleware: unknown) => {
        const forRoutes =
          (excluded?: Array<{ path: string }>) =>
          (route: { path: string; method: RequestMethod }) =>
            registrations.push({ middleware, route, excluded });

        return {
          forRoutes: forRoutes(),
          exclude: (...excluded: Array<{ path: string }>) => ({
            forRoutes: forRoutes(excluded),
          }),
        };
      },
    };

    new AppModule().configure(consumer as never);

    const retired = registrations.find(
      ({ route }) => route.path === 'rest/myah/shopify/*path',
    );
    const response = { sendStatus: jest.fn() };

    expect(retired?.route.method).toBe(RequestMethod.ALL);
    (retired?.middleware as (request: unknown, res: typeof response) => void)(
      {},
      response,
    );
    expect(response.sendStatus).toHaveBeenCalledWith(HttpStatus.GONE);
    const genericRestRoutes = registrations.filter(
      ({ route }) => route.path === 'rest/*path',
    );

    expect(genericRestRoutes.length).toBeGreaterThan(0);
    expect(
      genericRestRoutes.every(({ excluded }) =>
        excluded?.some(({ path }) => path === 'rest/myah/shopify/*path'),
      ),
    ).toBe(true);
  });

  it('keeps Unipile Instagram REST routes out of the generic REST object middleware', () => {
    const appModuleSource = readFileSync(
      join(__dirname, '../app.module.ts'),
      'utf8',
    );

    expect(appModuleSource).toContain(
      "{ path: 'rest/myah/unipile/instagram/*path', method: RequestMethod.ALL }",
    );
    expect(appModuleSource).toMatch(
      /\.exclude\(RETIRED_SHOPIFY_REST_ROUTE, \.\.\.MYAH_UNIPILE_REST_ROUTES\)\s*\.forRoutes/,
    );
  });

  it('hydrates optional auth context for the public client config endpoint', () => {
    const appModuleSource = readFileSync(
      join(__dirname, '../app.module.ts'),
      'utf8',
    );

    expect(appModuleSource).toMatch(
      /\.apply\(\s*GraphQLHydrateRequestFromTokenMiddleware,\s*WorkspaceAuthContextMiddleware,\s*\)\s*\.forRoutes\(\{ path: 'client-config', method: RequestMethod\.ALL \}\)/s,
    );
  });
});
