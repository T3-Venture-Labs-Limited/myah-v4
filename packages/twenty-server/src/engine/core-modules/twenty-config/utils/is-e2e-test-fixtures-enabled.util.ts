import { NodeEnvironment } from 'src/engine/core-modules/twenty-config/interfaces/node-environment.interface';

export const isE2eTestFixturesEnabled = (): boolean =>
  [NodeEnvironment.DEVELOPMENT, NodeEnvironment.TEST].includes(
    process.env.NODE_ENV as NodeEnvironment,
  ) && process.env.E2E_TEST_FIXTURES === 'true';
