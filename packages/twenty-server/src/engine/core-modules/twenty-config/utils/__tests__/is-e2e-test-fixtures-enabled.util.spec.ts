import { isE2eTestFixturesEnabled } from 'src/engine/core-modules/twenty-config/utils/is-e2e-test-fixtures-enabled.util';

describe('isE2eTestFixturesEnabled', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFixtureFlag = process.env.E2E_TEST_FIXTURES;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.E2E_TEST_FIXTURES = originalFixtureFlag;
  });

  it.each([
    ['development', undefined, false],
    ['development', 'false', false],
    ['development', 'true', true],
    ['test', 'true', true],
  ])('is %s with E2E_TEST_FIXTURES=%s -> %s', (nodeEnv, flag, expected) => {
    process.env.NODE_ENV = nodeEnv;
    if (flag === undefined) {
      delete process.env.E2E_TEST_FIXTURES;
    } else {
      process.env.E2E_TEST_FIXTURES = flag;
    }

    expect(isE2eTestFixturesEnabled()).toBe(expected);
  });

  it.each([undefined, 'staging', 'production'])(
    'throws before activation when NODE_ENV=%s and fixtures requested',
    (environment) => {
      process.env.NODE_ENV = environment;
      process.env.E2E_TEST_FIXTURES = 'true';
      expect(isE2eTestFixturesEnabled).toThrow(
        'E2E_TEST_FIXTURES cannot be enabled',
      );
    },
  );
});
