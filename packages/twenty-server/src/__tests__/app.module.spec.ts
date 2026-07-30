import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AppModule middleware configuration', () => {
  it('keeps custom Shopify REST routes out of the generic REST object middleware', () => {
    const appModuleSource = readFileSync(
      join(__dirname, '../app.module.ts'),
      'utf8',
    );

    expect(appModuleSource).toContain("path: 'rest/myah/shopify/oauth/start'");
    expect(appModuleSource).toContain(
      "path: 'rest/myah/shopify/oauth/callback'",
    );
    expect(appModuleSource).toContain("path: 'rest/myah/shopify/status'");
    expect(appModuleSource).toContain(
      "path: 'rest/myah/shopify/agent/store-context'",
    );
    for (const path of [
      "path: 'rest/myah/shopify/agent/products'",
      "path: 'rest/myah/shopify/agent/product-detail'",
      "path: 'rest/myah/shopify/agent/brand-content'",
      "path: 'rest/myah/shopify/agent/custom-data'",
      "path: 'rest/myah/shopify/agent/commerce-summary'",
      "path: 'rest/myah/shopify/agent/customer-summary'",
      "path: 'rest/myah/shopify/agent/promotions-summary'",
      "path: 'rest/myah/shopify/agent/channel-context'",
    ]) {
      expect(appModuleSource).toContain(path);
    }
    expect(appModuleSource).toContain("path: 'rest/myah/shopify/disconnect'");
    expect(appModuleSource).toContain('method: RequestMethod.POST');
    expect(appModuleSource).toContain('method: RequestMethod.GET');
    expect(appModuleSource).toMatch(
      /\.exclude\(\.\.\.MYAH_SHOPIFY_REST_ROUTES\)\s*\.forRoutes/,
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
