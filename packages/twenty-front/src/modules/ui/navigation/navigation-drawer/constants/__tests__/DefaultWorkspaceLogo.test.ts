import { DEFAULT_WORKSPACE_LOGO } from '@/ui/navigation/navigation-drawer/constants/DefaultWorkspaceLogo';

describe('DEFAULT_WORKSPACE_LOGO', () => {
  it('uses the local Myah product fallback instead of an external Twenty asset', () => {
    expect(DEFAULT_WORKSPACE_LOGO).toBe('/images/brand/myah-mark.png');
  });
});
