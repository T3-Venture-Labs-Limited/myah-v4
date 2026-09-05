import { NodeEnvironment } from 'src/engine/core-modules/twenty-config/interfaces/node-environment.interface';

export const isE2eTestFixturesEnabled = (): boolean =>
  process.env.NODE_ENV !== NodeEnvironment.PRODUCTION &&
  process.env.E2E_TEST_FIXTURES === 'true';
