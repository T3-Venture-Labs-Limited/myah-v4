import {
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { Test } from '@nestjs/testing';

import { MyahE2eFixtureResolver } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture.resolver';
import { MyahE2eFixtureService } from 'src/engine/core-modules/myah/e2e-fixtures/myah-e2e-fixture.service';
import { WorkspaceMailboxConnectionResolver } from 'src/engine/core-modules/myah/resolvers/workspace-mailbox-connection.resolver';
import { WorkspaceMailboxConnectionService } from 'src/engine/core-modules/myah/services/workspace-mailbox-connection.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';

jest.mock('dotenv', () => ({ config: jest.fn() }));

const loadImports = (
  nodeEnv: string | undefined,
  fixtureFlag: string | undefined,
) => {
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

  it('omits fixture mutations from the generated production schema', async () => {
    const { imports, fixtureModule } = loadImports('production', 'true');
    const moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        WorkspaceMailboxConnectionResolver,
        { provide: WorkspaceMailboxConnectionService, useValue: {} },
        { provide: PermissionsService, useValue: {} },
        MyahE2eFixtureResolver,
        { provide: MyahE2eFixtureService, useValue: {} },
      ],
    }).compile();
    const schema = await moduleRef
      .get(GraphQLSchemaFactory)
      .create([
        WorkspaceMailboxConnectionResolver,
        ...(imports.includes(fixtureModule) ? [MyahE2eFixtureResolver] : []),
      ]);

    expect(
      Object.keys(schema.getMutationType()?.getFields() ?? {}),
    ).not.toEqual(
      expect.arrayContaining([
        'createMyahE2eCampaignMailboxFixture',
        'createMyahE2eCampaignCallbackFixture',
        'cleanupMyahE2eCampaignMailboxFixture',
      ]),
    );
  });
});
