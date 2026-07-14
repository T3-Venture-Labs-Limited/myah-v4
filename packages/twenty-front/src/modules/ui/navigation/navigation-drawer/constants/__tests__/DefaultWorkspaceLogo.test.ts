import {
  DEFAULT_WORKSPACE_LOGO,
  getWorkspaceLogoUrl,
} from '@/ui/navigation/navigation-drawer/constants/DefaultWorkspaceLogo';

jest.mock('~/config', () => ({
  REACT_APP_SERVER_BASE_URL: 'https://example.com',
}));

describe('DEFAULT_WORKSPACE_LOGO', () => {
  it('uses the local Myah product fallback instead of an external Twenty asset', () => {
    expect(DEFAULT_WORKSPACE_LOGO).toBe('/images/brand/myah-mark.png');
  });
});

describe('getWorkspaceLogoUrl', () => {
  it('uses the frontend public fallback without resolving it as a file', () => {
    expect(getWorkspaceLogoUrl()).toBe(DEFAULT_WORKSPACE_LOGO);
  });

  it('resolves a customer workspace logo through the file URL resolver', () => {
    expect(getWorkspaceLogoUrl('workspace-logos/acme.png')).toBe(
      'https://example.com/files/workspace-logos/acme.png',
    );
  });
});
