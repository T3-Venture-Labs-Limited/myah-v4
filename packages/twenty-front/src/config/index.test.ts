type ConfigModule = {
  APP_VERSION?: string;
  REACT_APP_SERVER_BASE_URL: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_FRONT_DSN?: string;
};

const windowWithEnvironment = window as Window & {
  _env_?: Record<string, string>;
};

const originalServerBaseUrl = process.env.REACT_APP_SERVER_BASE_URL;
const originalRuntimeEnvironment = windowWithEnvironment._env_;

const importConfig = () => {
  let configModule: ConfigModule | undefined;

  // The config constants are evaluated on import, so each test needs a fresh module.
  jest.isolateModules(() => {
    configModule = jest.requireActual<ConfigModule>('./index');
  });

  if (configModule === undefined) {
    throw new Error('Config module did not load');
  }

  return configModule;
};

describe('REACT_APP_SERVER_BASE_URL', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.REACT_APP_SERVER_BASE_URL;
    delete windowWithEnvironment._env_;
  });

  afterEach(() => {
    jest.resetModules();

    if (originalServerBaseUrl === undefined) {
      delete process.env.REACT_APP_SERVER_BASE_URL;
    } else {
      process.env.REACT_APP_SERVER_BASE_URL = originalServerBaseUrl;
    }

    windowWithEnvironment._env_ = originalRuntimeEnvironment;
  });

  it('uses the development environment URL instead of the local default', () => {
    process.env.REACT_APP_SERVER_BASE_URL = 'http://development-api:3000';

    expect(importConfig().REACT_APP_SERVER_BASE_URL).toBe(
      'http://development-api:3000',
    );
  });

  it('prefers the runtime environment URL over the development environment URL', () => {
    process.env.REACT_APP_SERVER_BASE_URL = 'http://development-api:3000';
    windowWithEnvironment._env_ = {
      REACT_APP_SERVER_BASE_URL: 'https://runtime-api.example.com',
    };

    expect(importConfig().REACT_APP_SERVER_BASE_URL).toBe(
      'https://runtime-api.example.com',
    );
  });

  it('exposes runtime Sentry config before the application starts', () => {
    windowWithEnvironment._env_ = {
      APP_VERSION: '2026.08.31',
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_FRONT_DSN: 'https://public@example.ingest.sentry.io/1',
    };

    expect(importConfig()).toEqual(
      expect.objectContaining({
        APP_VERSION: '2026.08.31',
        SENTRY_ENVIRONMENT: 'production',
        SENTRY_FRONT_DSN: 'https://public@example.ingest.sentry.io/1',
      }),
    );
  });
});
