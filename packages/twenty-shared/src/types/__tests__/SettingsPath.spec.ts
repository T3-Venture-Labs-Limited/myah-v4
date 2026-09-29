import { SettingsPath } from '../SettingsPath';

describe('SettingsPath', () => {
  it('does not expose a Shopify settings destination', () => {
    expect(Object.values(SettingsPath)).not.toContain('accounts/shopify');
  });
});
