// Importing main normally starts Nest. Replace every startup boundary so this
// tests the real entrypoint's listen arguments without opening a socket.
const listen = jest.fn().mockResolvedValue(undefined);
const configGet = jest.fn((key: string): string | number | undefined => {
  if (key === 'NODE_PORT') return 3000;
  if (key === 'SERVER_KEEP_ALIVE_TIMEOUT_MS') return 65000;
  if (key === 'TRUST_PROXY') return 'false';
  return undefined;
});
const httpServer = { keepAliveTimeout: 0, headersTimeout: 0 };
const app = {
  get: jest.fn((token: unknown) =>
    token === TwentyConfigService ? { get: configGet } : {},
  ),
  getHttpServer: jest.fn(() => httpServer),
  enableCors: jest.fn(),
  set: jest.fn(),
  use: jest.fn(),
  select: jest.fn(),
  useLogger: jest.fn(),
  useGlobalFilters: jest.fn(),
  useBodyParser: jest.fn(),
  listen,
};
const create = jest.fn().mockResolvedValue(app);

jest.mock('src/instrument', () => ({}));
jest.mock('src/app.module', () => ({ AppModule: class {} }));
jest.mock('@nestjs/core', () => ({ NestFactory: { create } }));
jest.mock('src/database/pg/set-pg-date-type-parser', () => ({
  setPgDateTypeParser: jest.fn(),
}));
jest.mock('src/engine/core-modules/logger/logger.service', () => ({
  LoggerService: class {},
}));
jest.mock(
  'src/engine/core-modules/exception-handler/exception-handler.service',
  () => ({
    ExceptionHandlerService: class {},
  }),
);
jest.mock(
  'src/engine/core-modules/twenty-config/twenty-config.service',
  () => ({
    TwentyConfigService: class {},
  }),
);
jest.mock(
  'src/engine/core-modules/session-storage/session-storage.module-factory',
  () => ({
    getSessionStorageOptions: jest.fn(() => ({})),
  }),
);
jest.mock(
  'src/engine/core-modules/twenty-config/utils/config-transformers.util',
  () => ({
    configTransformers: { boolean: jest.fn(() => false) },
  }),
);
jest.mock('src/engine/middlewares/redact-json-parser-error.middleware', () => ({
  redactJsonParserErrorMiddleware: jest.fn(),
}));
jest.mock('src/engine/utils/global-exception-handler.util', () => ({
  shouldCaptureException: jest.fn(() => false),
}));
jest.mock('src/filters/unhandled-exception.filter', () => ({
  UnhandledExceptionFilter: class {},
}));
jest.mock('src/engine/constants/settings', () => ({
  settings: { storage: { maxFileSize: '1mb' } },
}));
jest.mock('src/utils/generate-front-config', () => ({
  generateFrontConfig: jest.fn(),
}));
jest.mock('src/utils/get-cors-options.util', () => ({
  getCorsOptions: jest.fn(() => ({})),
}));
jest.mock('graphql-upload/graphqlUploadExpress.mjs', () => jest.fn());
jest.mock('express-session', () => jest.fn());

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

const loadMain = async () => {
  jest.isolateModules(() => require('src/main'));
  // bootstrap awaits NestFactory.create before it reaches listen.
  await create.mock.results[create.mock.results.length - 1]?.value;
  await Promise.resolve();
  await Promise.resolve();
};

describe('API listen interface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configGet.mockImplementation((key: string) => {
      if (key === 'NODE_PORT') return 3000;
      if (key === 'SERVER_KEEP_ALIVE_TIMEOUT_MS') return 65000;
      if (key === 'TRUST_PROXY') return 'false';
      return undefined;
    });
  });

  it('passes the configured host to listen', async () => {
    configGet.mockImplementation((key: string) => {
      if (key === 'NODE_HOST') return '127.0.0.1';
      if (key === 'NODE_PORT') return 3000;
      if (key === 'SERVER_KEEP_ALIVE_TIMEOUT_MS') return 65000;
      if (key === 'TRUST_PROXY') return 'false';
      return undefined;
    });

    await loadMain();

    expect(listen).toHaveBeenCalledWith(3000, '127.0.0.1');
  });

  it('retains port-only listen when host is not configured', async () => {
    await loadMain();

    expect(listen).toHaveBeenCalledWith(3000);
  });
});
