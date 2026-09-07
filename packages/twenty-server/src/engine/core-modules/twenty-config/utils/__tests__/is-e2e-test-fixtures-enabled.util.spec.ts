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
    [undefined, 'true', false],
    ['staging', 'true', false],
    ['production', 'true', false],
  ])('is %s with E2E_TEST_FIXTURES=%s -> %s', (nodeEnv, flag, expected) => {
    process.env.NODE_ENV = nodeEnv;
    if (flag === undefined) {
      delete process.env.E2E_TEST_FIXTURES;
    } else {
      process.env.E2E_TEST_FIXTURES = flag;
    }

    expect(isE2eTestFixturesEnabled()).toBe(expected);
  });
});
