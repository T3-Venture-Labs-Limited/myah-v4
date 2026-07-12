type ConfigModule = {
  REACT_APP_SERVER_BASE_URL: string;
};

const windowWithEnvironment = window as Window & {
  _env_?: Record<string, string>;
};

const originalServerBaseUrl = process.env.REACT_APP_SERVER_BASE_URL;
const originalRuntimeEnvironment = windowWithEnvironment._env_;

const importServerBaseUrl = () => {
  let serverBaseUrl: string | undefined;

  // The config constant is evaluated on import, so each test needs a fresh module.
  jest.isolateModules(() => {
    const configModule = jest.requireActual<ConfigModule>('./index');

    serverBaseUrl = configModule.REACT_APP_SERVER_BASE_URL;
  });

  if (serverBaseUrl === undefined) {
    throw new Error('Config module did not export a server base URL');
  }

  return serverBaseUrl;
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

    expect(importServerBaseUrl()).toBe('http://development-api:3000');
  });

  it('prefers the runtime environment URL over the development environment URL', () => {
    process.env.REACT_APP_SERVER_BASE_URL = 'http://development-api:3000';
    windowWithEnvironment._env_ = {
      REACT_APP_SERVER_BASE_URL: 'https://runtime-api.example.com',
    };

    expect(importServerBaseUrl()).toBe('https://runtime-api.example.com');
  });
});
