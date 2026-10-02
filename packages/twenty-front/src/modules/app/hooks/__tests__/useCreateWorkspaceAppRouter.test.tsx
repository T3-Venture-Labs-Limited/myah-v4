import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('useCreateWorkspaceAppRouter', () => {
  it('registers Myah page IDs in the authenticated shell before the wildcard', () => {
    const source = readFileSync(
      resolve(__dirname, '../useCreateWorkspaceAppRouter.tsx'),
      'utf8',
    );
    const campaignRouteIndex = source.indexOf(
      'path="/myah/campaigns/:campaignId"',
    );
    const myahRouteIndex = source.indexOf('path="/myah/:pageId"');
    const wildcardRouteIndex = source.indexOf(
      'path={AppPath.NotFoundWildcard}',
    );

    expect(campaignRouteIndex).toBeGreaterThan(
      source.indexOf('<MainAppLayoutWithSidePanel />'),
    );
    expect(campaignRouteIndex).toBeLessThan(myahRouteIndex);
    expect(source).toContain('<MyahCampaignPage />');
    expect(myahRouteIndex).toBeGreaterThan(source.indexOf('<DefaultLayout />'));
    expect(myahRouteIndex).toBeGreaterThan(
      source.indexOf('<MainAppLayoutWithSidePanel />'),
    );
    expect(myahRouteIndex).toBeLessThan(wildcardRouteIndex);
  });

  it('creates the authenticated router through the Sentry wrapper', () => {
    const source = readFileSync(
      resolve(__dirname, '../useCreateWorkspaceAppRouter.tsx'),
      'utf8',
    );

    expect(source).toContain(
      "import { sentryCreateBrowserRouter } from '~/instrument';",
    );
    expect(source).toContain('sentryCreateBrowserRouter(');
  });
});
