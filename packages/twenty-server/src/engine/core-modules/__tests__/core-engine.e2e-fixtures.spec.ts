const loadImports = (nodeEnv: string, fixtureFlag: string | undefined) => {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  if (fixtureFlag === undefined) {
    delete process.env.E2E_TEST_FIXTURES;
  } else {
    process.env.E2E_TEST_FIXTURES = fixtureFlag;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    CoreEngineModule,
  } = require('src/engine/core-modules/core-engine.module');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    MyahE2eFixtureModule,
  } = require('src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture.module');

  return {
    imports: Reflect.getMetadata('imports', CoreEngineModule) as unknown[],
    fixtureModule: MyahE2eFixtureModule,
  };
};

describe('CoreEngineModule E2E fixture registration', () => {
  const nodeEnv = process.env.NODE_ENV;
  const fixtureFlag = process.env.E2E_TEST_FIXTURES;

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    if (fixtureFlag === undefined) {
      delete process.env.E2E_TEST_FIXTURES;
    } else {
      process.env.E2E_TEST_FIXTURES = fixtureFlag;
    }
  });

  it.each([
    ['development', undefined, false],
    ['development', 'false', false],
    ['development', 'true', true],
    ['test', 'true', true],
    ['production', 'true', false],
  ])(
    'registers fixture providers only for %s with E2E_TEST_FIXTURES=%s',
    (environment, flag, expected) => {
      const { imports, fixtureModule } = loadImports(environment, flag);

      expect(imports.includes(fixtureModule)).toBe(expected);
    },
  );
});
