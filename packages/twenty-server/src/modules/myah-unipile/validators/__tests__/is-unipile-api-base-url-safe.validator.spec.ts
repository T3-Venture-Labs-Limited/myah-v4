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
  it.each([
    'https://api49.unipile.com:17981/api/v1/',
    'https://api46.unipile.com:17699/api/v1/',
  ])('accepts an allowlisted Unipile v1 API base URL', (url) => {
    expect(isSafeUnipileApiBaseUrl(url)).toBe(true);
  });

  it.each([
    ['HTTP', 'http://api49.unipile.com:17981/api/v1/'],
    ['a different host', 'https://api.unipile.com:17981/api/v1/'],
    [
      'a malicious subdomain',
      'https://api46.unipile.com.attacker.test:17699/api/v1/',
    ],
    ['a private host', 'https://127.0.0.1:17699/api/v1/'],
    [
      'api49 paired with the api46 port',
      'https://api49.unipile.com:17699/api/v1/',
    ],
    [
      'api46 paired with the api49 port',
      'https://api46.unipile.com:17981/api/v1/',
    ],
    ['a different port', 'https://api49.unipile.com:443/api/v1/'],
    ['a different path', 'https://api49.unipile.com:17981/api/v2/'],
    ['a nested v1 path', 'https://api49.unipile.com:17981/api/v1/accounts'],
    ['a malformed v1 path', 'https://api49.unipile.com:17981/api/v1-malformed'],
    ['a missing trailing slash', 'https://api49.unipile.com:17981/api/v1'],
    [
      'surrounding whitespace normalized by URL parsing',
      ' https://api46.unipile.com:17699/api/v1/ ',
    ],
    [
      'a dot segment normalized by URL parsing',
      'https://api46.unipile.com:17699/api/v1/../v1/',
    ],
    [
      'an encoded dot segment normalized by URL parsing',
      'https://api46.unipile.com:17699/api/%76%31/',
    ],
    [
      'a backslash normalized by URL parsing',
      'https://api46.unipile.com:17699/api\\v1\\',
    ],
    [
      'an explicit default HTTPS port normalized by URL parsing',
      'https://api46.unipile.com:443/api/v1/',
    ],
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
