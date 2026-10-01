import dotenv from 'dotenv';
import { type JestConfigWithTsJest, pathsToModuleNameMapper } from 'ts-jest';

import { NodeEnvironment } from 'src/engine/core-modules/twenty-config/interfaces/node-environment.interface';
import { getServerEnvFilePath } from 'src/utils/get-server-env-file-path';

import testTokens from './test/integration/constants/test-tokens.json';

// Load .env vars at jest boot time
dotenv.config({ path: getServerEnvFilePath(), override: true });

const isBillingEnabled = process.env.IS_BILLING_ENABLED === 'true';
const isClickhouseEnabled = process.env.CLICKHOUSE_URL !== undefined;

// Fresh-only Myah release: these exact legacy suites author customer-owned
// objects/fields (or install schema-owning apps) and fail at the product guard.
// Keep the remaining integration suites running; the current-schema denial and
// no-change boundary is covered by myah-fresh-schema-policy.integration-spec.ts.
const legacyCustomerSchemaSuites = [
  'test/integration/graphql/suites/files-field/files-field-sync.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/boolean-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/settings-permissions/data-model.integration-spec.ts',
  'test/integration/graphql/suites/settings-permissions/granular-settings-permissions.integration-spec.ts',
  'test/integration/graphql/suites/settings-permissions/roles.integration-spec.ts',
  'test/integration/graphql/suites/unique-field/unique-phones-field-null-equivalence.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field/successful-create-many-view-fields.integration-spec.ts',
  'test/integration/graphql/suites/view/view-filter-group-resolver.integration-spec.ts',
  'test/integration/graphql/suites/view/view-filter-resolver.integration-spec.ts',
  'test/integration/graphql/suites/view/view-group-resolver.integration-spec.ts',
  'test/integration/graphql/suites/view/view-group/successful-create-many-view-groups-v2.integration-spec.ts',
  'test/integration/graphql/suites/workspace/custom-application-translation.integration-spec.ts',
  'test/integration/metadata/suites/application/successful-manifest-sync-row-level-permission-predicate.integration-spec.ts',
  'test/integration/metadata/suites/application/successful-manifest-update-field.integration-spec.ts',
  'test/integration/metadata/suites/application/successful-manifest-update-view-field.integration-spec.ts',
  'test/integration/metadata/suites/application/successful-resync-application-with-cross-app-owned-view-field.integration-spec.ts',
  'test/integration/metadata/suites/application/successful-sync-application-cross-app-view-field.integration-spec.ts',
  'test/integration/metadata/suites/application/successful-sync-application-workspace-migration.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/atomic/update-one-files-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/failing-create-phone-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-create-phone-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-update-currency-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/enum/successful-update-default-value-option-value-and-side-effect-on-records.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/kanban-aggregate-field-deactivation-nullifies-views-kanban-properties.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/morph-relation/delete-one-field-metadata-morph-relation.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/morph-relation/failing-add-one-target-to-metadata-morph-relation-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/morph-relation/failing-create-one-field-metadata-morph-relation-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/morph-relation/successful-add-one-target-to-metadata-morph-relation-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/relation/failing-field-metadata-relation-creation.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/relation/successful-field-metadata-relation-update.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/successful-update-one-standard-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/update-one-field-metadata-view-groups-side-effect-v2.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/command-menu-item-side-effect-on-object-metadata.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/morph-relation/rename-object-metadata-with-morph-relation-v2.integration-spec.ts',
  'test/integration/metadata/suites/view-sort/successful-view-sort-creation.integration-spec.ts',
  'test/integration/metadata/suites/view/update-one-view-view-groups-side-effect-v2.integration-spec.ts',
  'test/integration/rest/suites/field-metadata.integration-spec.ts',
  'test/integration/rest/suites/object-metadata.integration-spec.ts',
  'test/integration/rest/suites/view-filter-group.integration-spec.ts',
  'test/integration/rest/suites/view.integration-spec.ts',
];

const tsConfig = require('./tsconfig.json');

const jestConfig: JestConfigWithTsJest = {
  // For more information please have a look to official docs https://jestjs.io/docs/configuration/#prettierpath-string
  // Prettier v3 should be supported in jest v30 https://github.com/jestjs/jest/releases/tag/v30.0.0-alpha.1
  prettierPath: null,
  silent: false,
  errorOnDeprecated: true,
  maxConcurrency: 1,
  moduleFileExtensions: ['js', 'mjs', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    ...(isBillingEnabled ? [] : ['<rootDir>/test/integration/billing']),
    ...(isClickhouseEnabled ? [] : ['<rootDir>/test/integration/audit']),
    ...(process.env.MYAH_FRESH_ONLY_CI === 'true'
      ? legacyCustomerSchemaSuites.map(
          (path) => `<rootDir>/${path.replace(/\./g, '\\.')}$`,
        )
      : []),
  ],
  testRegex: '\\.integration-spec\\.ts$',
  modulePathIgnorePatterns: ['<rootDir>/dist'],
  globalSetup: '<rootDir>/test/integration/utils/setup-test.ts',
  globalTeardown: '<rootDir>/test/integration/utils/teardown-test.ts',
  setupFilesAfterEnv: [
    '<rootDir>/test/integration/utils/setup-wait-for-all-jobs-between-tests.ts',
  ],
  testTimeout: 90_000,
  maxWorkers: 1,
  // jsdom 29 pulls ESM-only transitive deps (parse5, entities, tough-cookie,
  // @exodus/bytes via html-encoding-sniffer, @csstools/@asamuzakjp css engine);
  // let swc transform them (and .mjs below) so jest can require jsdom.
  transformIgnorePatterns: [
    '/node_modules/(?!(file-type|@file-type|strtok3|token-types|@borewit|@tokenizer|uint8array-extras|read-next-line|jsdom|html-encoding-sniffer|whatwg-encoding|@exodus|parse5|entities|tough-cookie|@csstools|@asamuzakjp)/)',
  ],
  transform: {
    '^.+\\.(t|j|mj)s$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: false,
            decorators: true,
          },
          transform: {
            decoratorMetadata: true,
          },
          baseUrl: '.',
          paths: {
            'src/*': ['./src/*'],
            'test/*': ['./test/*'],
          },
          experimental: {
            plugins: [
              [
                '@lingui/swc-plugin',
                {
                  stripNonEssentialFields: false,
                },
              ],
            ],
          },
        },
      },
    ],
  },
  moduleNameMapper: {
    ...pathsToModuleNameMapper(tsConfig.compilerOptions.paths, {
      prefix: '<rootDir>/',
    }),
    '^file-type$': require.resolve('file-type'),
    '^test/(.*)$': '<rootDir>/test/$1',
  },
  globals: {
    APP_PORT: 4000,
    NODE_ENV: NodeEnvironment.TEST,
    // Test tokens are loaded from a shared JSON file to ensure consistency
    // with CI workflows and other tools that need these tokens
    ...testTokens,
  },
};

export default jestConfig;
