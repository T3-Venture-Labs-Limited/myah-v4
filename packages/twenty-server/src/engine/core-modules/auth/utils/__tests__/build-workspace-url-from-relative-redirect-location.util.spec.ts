import { buildWorkspaceUrlFromRelativeRedirectLocation } from 'src/engine/core-modules/auth/utils/build-workspace-url-from-relative-redirect-location.util';

describe('buildWorkspaceUrlFromRelativeRedirectLocation', () => {
  it('passes only the pathname to the workspace URL builder and restores query and hash', () => {
    const buildWorkspaceURL = jest.fn(({ pathname }: { pathname: string }) => {
      const url = new URL('https://myah.example.com');

      url.pathname = pathname;

      return url;
    });

    const url = buildWorkspaceUrlFromRelativeRedirectLocation({
      buildWorkspaceURL,
      redirectLocation:
        '/object/campaign/campaign-1?linkConnectedAccount=1&connectedAccountId=0560dffc-4a79-4c13-9a11-df2745eab756#operations',
      workspace: { id: 'workspace-id' },
    });

    expect(buildWorkspaceURL).toHaveBeenCalledWith({
      pathname: '/object/campaign/campaign-1',
      workspace: { id: 'workspace-id' },
    });
    expect(url.toString()).toBe(
      'https://myah.example.com/object/campaign/campaign-1?linkConnectedAccount=1&connectedAccountId=0560dffc-4a79-4c13-9a11-df2745eab756#operations',
    );
  });
});
