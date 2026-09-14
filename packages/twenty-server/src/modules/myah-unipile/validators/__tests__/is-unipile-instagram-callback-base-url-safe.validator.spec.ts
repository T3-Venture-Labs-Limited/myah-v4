type UnipileInstagramCallbackBaseUrlValidatorModule = {
  isUnipileInstagramCallbackBaseUrlSafe: (value: unknown) => boolean;
};

const loadCallbackValidatorModule = ():
  | UnipileInstagramCallbackBaseUrlValidatorModule
  | undefined => {
  try {
    return require('src/modules/myah-unipile/validators/is-unipile-instagram-callback-base-url-safe.validator') as UnipileInstagramCallbackBaseUrlValidatorModule;
  } catch {
    return undefined;
  }
};

const isSafeUnipileInstagramCallbackBaseUrl = (
  value: unknown,
): boolean | undefined => {
  const validatorModule = loadCallbackValidatorModule();

  expect(validatorModule).toBeDefined();

  return validatorModule?.isUnipileInstagramCallbackBaseUrlSafe(value);
};

describe('isUnipileInstagramCallbackBaseUrlSafe', () => {
  it.each(['https://callback.example', 'https://callback.example/'])(
    'accepts a canonical HTTPS callback origin: %s',
    (url) => {
      expect(isSafeUnipileInstagramCallbackBaseUrl(url)).toBe(true);
    },
  );

  it.each([
    ['surrounding whitespace', ' https://callback.example '],
    ['a normalized dot-segment path', 'https://callback.example/./'],
    ['an encoded dot-segment path', 'https://callback.example/%2e/'],
    ['a normalized backslash path', 'https://callback.example\\'],
    ['an explicit default HTTPS port', 'https://callback.example:443'],
    ['a bare query marker', 'https://callback.example?'],
    ['a bare fragment marker', 'https://callback.example#'],
    ['credentials', 'https://user:password@callback.example'],
    ['a local hostname', 'https://localhost'],
    ['an IP address', 'https://127.0.0.1'],
  ])('rejects %s', (_reason, url) => {
    expect(isSafeUnipileInstagramCallbackBaseUrl(url)).toBe(false);
  });
});
