import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('useCreateWorkspaceAppRouter', () => {
  it('registers Myah page IDs in the authenticated shell before the wildcard', () => {
    const source = readFileSync(
      resolve(__dirname, '../useCreateWorkspaceAppRouter.tsx'),
      'utf8',
    );
    const myahRouteIndex = source.indexOf('path="/myah/:pageId"');
    const wildcardRouteIndex = source.indexOf(
      'path={AppPath.NotFoundWildcard}',
    );

    expect(myahRouteIndex).toBeGreaterThan(source.indexOf('<DefaultLayout />'));
    expect(myahRouteIndex).toBeGreaterThan(
      source.indexOf('<MainAppLayoutWithSidePanel />'),
    );
    expect(myahRouteIndex).toBeLessThan(wildcardRouteIndex);
  });
});
