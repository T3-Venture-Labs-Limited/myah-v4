import { NodeEnvironment } from 'src/engine/core-modules/twenty-config/interfaces/node-environment.interface';

export const isE2eTestFixturesEnabled = (): boolean => {
  if (process.env.E2E_TEST_FIXTURES !== 'true') {
    return false;
  }

  if (
    ![NodeEnvironment.DEVELOPMENT, NodeEnvironment.TEST].includes(
      process.env.NODE_ENV as NodeEnvironment,
    )
  ) {
    throw new Error(
      'E2E_TEST_FIXTURES cannot be enabled outside development or test',
    );
  }

  return true;
};
