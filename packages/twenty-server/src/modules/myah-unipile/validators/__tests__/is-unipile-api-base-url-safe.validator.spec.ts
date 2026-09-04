type UnipileApiBaseUrlValidatorModule = {
  isUnipileApiBaseUrlSafe: (value: unknown) => boolean;
};

const loadValidatorModule = ():
  | UnipileApiBaseUrlValidatorModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/validators/is-unipile-api-base-url-safe.validator') as UnipileApiBaseUrlValidatorModule;
  } catch {
    return undefined;
  }
};

const isSafeUnipileApiBaseUrl = (value: unknown): boolean | undefined => {
  const validatorModule = loadValidatorModule();

  expect(validatorModule).toBeDefined();

  return validatorModule?.isUnipileApiBaseUrlSafe(value);
};

describe('isUnipileApiBaseUrlSafe', () => {
  it('accepts only the configured Unipile v1 API base URL', () => {
    expect(
      isSafeUnipileApiBaseUrl('https://api49.unipile.com:17981/api/v1/'),
    ).toBe(true);
  });

  it.each([
    ['HTTP', 'http://api49.unipile.com:17981/api/v1/'],
    ['a different host', 'https://api.unipile.com:17981/api/v1/'],
    ['a different port', 'https://api49.unipile.com:443/api/v1/'],
    ['a different path', 'https://api49.unipile.com:17981/api/v2/'],
    ['a nested v1 path', 'https://api49.unipile.com:17981/api/v1/accounts'],
    ['a malformed v1 path', 'https://api49.unipile.com:17981/api/v1-malformed'],
    ['a missing trailing slash', 'https://api49.unipile.com:17981/api/v1'],
    [
      'embedded credentials',
      'https://user:password@api49.unipile.com:17981/api/v1/',
    ],
    ['a query string', 'https://api49.unipile.com:17981/api/v1/?tenant=test'],
    ['a fragment', 'https://api49.unipile.com:17981/api/v1/#fragment'],
  ])('rejects %s', (_reason, value) => {
    expect(isSafeUnipileApiBaseUrl(value)).toBe(false);
  });
});
