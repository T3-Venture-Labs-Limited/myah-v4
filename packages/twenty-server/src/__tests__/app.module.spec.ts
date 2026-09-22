import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AppModule middleware configuration', () => {
  it('removes Shopify REST middleware exceptions', () => {
    const appModuleSource = readFileSync(
      join(__dirname, '../app.module.ts'),
      'utf8',
    );

    expect(appModuleSource).not.toContain('rest/myah/shopify');
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
      /\.exclude\(\.\.\.MYAH_REST_ROUTES\)\s*\.forRoutes/,
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
