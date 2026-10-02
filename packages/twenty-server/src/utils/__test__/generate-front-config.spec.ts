import * as fs from 'fs';
import { config } from 'dotenv';

import { generateFrontConfig } from 'src/utils/generate-front-config';

// dotenv runs at import time with override: true, which would clobber the
// per-test process.env we set below. Neutralize it so each test controls env.
jest.mock('dotenv', () => ({ config: jest.fn() }));

const mockedDotenvConfig = config as jest.MockedFunction<typeof config>;
jest.mock('fs');

const mockedFs = fs as jest.Mocked<typeof fs>;

const INDEX_TEMPLATE = `<html>
  <head>
    <!-- BEGIN: Twenty Config -->
    <script id="twenty-env-config">
      window._env_ = {"REACT_APP_SERVER_BASE_URL":"http://stale-value"};
    </script>
    <!-- END: Twenty Config -->
  </head>
</html>`;

// Pull the injected _env_ object back out of the written index.html and
// normalize whitespace so the multi-line JSON.stringify(..., 2) output can be
// compared against a compact expected string.
const getInjectedEnv = (): string => {
  const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;
  const match = writtenContent.match(/window\._env_ = (\{[\s\S]*?\});/);

  return match ? match[1].replace(/\s+/g, '') : '';
};

describe('generateFrontConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SENTRY_FRONT_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.APP_VERSION;
    mockedFs.readFileSync.mockReturnValue(INDEX_TEMPLATE);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('loads the selected task env rather than the package .env.test at import time', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSelector = process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE;

    try {
      process.env.NODE_ENV = 'test';
      process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE =
        '/synthetic/task-owned/server.env';
      jest.isolateModules(() => {
        require('src/utils/generate-front-config');
      });

      expect(mockedDotenvConfig).toHaveBeenCalledTimes(1);
      expect(mockedDotenvConfig).toHaveBeenCalledWith({
        path: '/synthetic/task-owned/server.env',
        override: true,
      });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSelector === undefined)
        delete process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE;
      else process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE = previousSelector;
    }
  });

  it.each([
    ['test', '.env.test'],
    ['production', '.env'],
  ])('retains the %s default env path', (nodeEnv, expectedPath) => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSelector = process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE;

    try {
      process.env.NODE_ENV = nodeEnv;
      delete process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE;
      jest.isolateModules(() => {
        require('src/utils/generate-front-config');
      });
      expect(mockedDotenvConfig).toHaveBeenCalledWith({
        path: expectedPath,
        override: true,
      });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSelector === undefined)
        delete process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE;
      else process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE = previousSelector;
    }
  });

  it('rejects a blank test selector before loading any env file', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSelector = process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE;

    try {
      process.env.NODE_ENV = 'test';
      process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE = '  ';
      expect(() =>
        jest.isolateModules(() => require('src/utils/generate-front-config')),
      ).toThrow('TWENTY_SERVER_INTEGRATION_ENV_FILE must be a non-empty path');
      expect(mockedDotenvConfig).not.toHaveBeenCalled();
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousSelector === undefined)
        delete process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE;
      else process.env.TWENTY_SERVER_INTEGRATION_ENV_FILE = previousSelector;
    }
  });

  it('should inject the absolute SERVER_URL when set and the toggle is unset', () => {
    process.env.SERVER_URL = 'http://x.com';
    delete process.env.FRONT_AUTO_BASE_URL;

    generateFrontConfig();

    expect(getInjectedEnv()).toBe(
      '{"REACT_APP_SERVER_BASE_URL":"http://x.com"}',
    );
  });

  it('should inject an empty _env_ when SERVER_URL is unset', () => {
    delete process.env.SERVER_URL;
    delete process.env.FRONT_AUTO_BASE_URL;

    generateFrontConfig();

    expect(getInjectedEnv()).toBe('{}');
  });

  it('should inject an empty _env_ when FRONT_AUTO_BASE_URL=true even if SERVER_URL is set', () => {
    process.env.SERVER_URL = 'http://x.com';
    process.env.FRONT_AUTO_BASE_URL = 'true';

    generateFrontConfig();

    expect(getInjectedEnv()).toBe('{}');
  });

  it('should keep the absolute SERVER_URL when FRONT_AUTO_BASE_URL is not exactly "true"', () => {
    process.env.SERVER_URL = 'http://x.com';
    process.env.FRONT_AUTO_BASE_URL = 'false';

    generateFrontConfig();

    expect(getInjectedEnv()).toBe(
      '{"REACT_APP_SERVER_BASE_URL":"http://x.com"}',
    );
  });

  it('should inject public Sentry config when the frontend base URL is automatic', () => {
    delete process.env.SERVER_URL;
    process.env.SENTRY_FRONT_DSN = 'https://public@example.ingest.sentry.io/1';
    process.env.SENTRY_ENVIRONMENT = 'production';
    process.env.APP_VERSION = '2026.08.31';

    generateFrontConfig();

    expect(getInjectedEnv()).toBe(
      '{"SENTRY_FRONT_DSN":"https://public@example.ingest.sentry.io/1","SENTRY_ENVIRONMENT":"production","APP_VERSION":"2026.08.31"}',
    );
  });
});
