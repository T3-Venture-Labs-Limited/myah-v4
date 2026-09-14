import { appendConnectedAccountIdToRedirectLocation } from 'src/engine/core-modules/auth/utils/append-connected-account-id-to-redirect-location.util';

describe('appendConnectedAccountIdToRedirectLocation', () => {
  it('keeps Campaign Operations tab and appends the connected account id', () => {
    expect(
      appendConnectedAccountIdToRedirectLocation(
        '/object/campaign/campaign-1?linkConnectedAccount=1#a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
        'connected-account-1',
      ),
    ).toBe(
      '/object/campaign/campaign-1?linkConnectedAccount=1&connectedAccountId=connected-account-1#a62c90d6-08dc-4f2c-9b06-c7c10d3d12ba',
    );
  });

  it.each([
    ['/', '/?connectedAccountId=connected-account-1'],
    [
      '/settings/accounts',
      '/settings/accounts?connectedAccountId=connected-account-1',
    ],
    [
      '/settings/accounts?source=reconnect#connections',
      '/settings/accounts?source=reconnect&connectedAccountId=connected-account-1#connections',
    ],
  ])(
    'preserves safe relative redirect location %s',
    (redirectLocation, expectedRedirectLocation) => {
      expect(
        appendConnectedAccountIdToRedirectLocation(
          redirectLocation,
          'connected-account-1',
        ),
      ).toBe(expectedRedirectLocation);
    },
  );

  it.each([
    'https://evil.example/object/campaign/campaign-1',
    '//evil.example/object/campaign/campaign-1',
    '/object/campaign/%',
  ])('rejects unsafe redirect location %s', (redirectLocation) => {
    expect(
      appendConnectedAccountIdToRedirectLocation(
        redirectLocation,
        'connected-account-1',
      ),
    ).toBeUndefined();
  });
});
