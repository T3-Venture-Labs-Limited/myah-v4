import { SettingsPath } from '../SettingsPath';

describe('SettingsPath', () => {
  it('defines a nested Shopify settings route under Accounts', () => {
    expect(SettingsPath.AccountsShopify).toBe('accounts/shopify');
  });
});
