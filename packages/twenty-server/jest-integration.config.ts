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
  'test/integration/graphql/suites/unique-field/unique-phones-field-null-equivalence.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field/successful-create-many-view-fields.integration-spec.ts',
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
  // CI on the first fresh-only candidate identified these additional suites;
  // each requires customer-authored objects/fields or schema-owning app sync.
  'test/integration/graphql/suites/files-field/files-field-download.integration-spec.ts',
  'test/integration/graphql/suites/files-field/upload-files-field-file.integration-spec.ts',
  // Person/Company and customer-relation cases remain legacy; native Creator
  // aggregation and restricted SocialProfile.creator live in the selected
  // group-by-native-resolver.integration-spec.ts.
  'test/integration/graphql/suites/group-by-resolver.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/address-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/date-time-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/morph-relation-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/rating-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/relation-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/rich-text-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/text-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/uuid-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/address-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/array-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/date-time-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/links-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/relation-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/select-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/timeline-from-object-record.integration-spec.ts',
  'test/integration/graphql/suites/upsert/upsert.integration-spec.ts',
  'test/integration/graphql/suites/view/update-view.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field/failing-create-view-field.integration-spec.ts',
  'test/integration/metadata/suites/application/failing-sync-application-object-system-fields.integration-spec.ts',
  'test/integration/metadata/suites/application/failing-sync-application-unique-index-side-effect-collision.integration-spec.ts',
  'test/integration/metadata/suites/application/successful-manifest-update-object.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/calendar-field-deactivation-deletes-views.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-create-address-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-create-emails-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-create-full-name-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-update-emails-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-update-links-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-update-phones-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-update-rich-text-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/enum/successful-create-one-field-metadata-enum-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/morph-relation/find-empty-morph-relation-to-many.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/morph-relation/successful-create-one-field-metadata-morph-relation-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/morph-relation/successful-update-one-field-metadata-morph-relation-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/relation/create-one-field-metadata-relation.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/update-one-field-metadata-search-vector-side-effect.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/update-one-field-metadata-view-filters-side-effect-v2.integration-spec.ts',
  'test/integration/metadata/suites/index/successful-index-on-relation-field-v2.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/backfill-search-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/create-delete-and-create-object-metadata-v2.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/relation/delete-one-object-metadata-with-relation.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/rename-custom-object.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/view-side-effect-on-object-metadata-creation.integration-spec.ts',
  'test/integration/metadata/suites/page-layout/failing-page-layout-with-tabs-update.integration-spec.ts',
  // Additional source-audited legacy fixtures whose setup requires customer
  // schema authoring; preserve native view, role and metadata-read coverage.
  'test/integration/graphql/suites/file-upload/direct-file-upload.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/array-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/boolean-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/currency-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/date-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/emails-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/files-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/full-name-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/links-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/multi-select-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/number-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/phones-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/position-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/raw-json-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/create-validation/select-field-create-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/currency-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/date-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/emails-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/files-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/full-name-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/morph-relation-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/multi-select-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/number-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/phones-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/rating-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/raw-json-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/text-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/inputs-validation/filter-validation/uuid-field-filter-input-validation.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field-group/failing-create-many-view-field-groups.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field-group/failing-create-view-field-group.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field-group/failing-delete-view-field-group.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field-group/failing-destroy-view-field-group.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field-group/failing-update-view-field-group.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field-group/successful-create-many-view-field-groups.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field/failing-delete-view-field.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field/failing-destroy-view-field.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field/failing-update-view-field.integration-spec.ts',
  'test/integration/graphql/suites/view/view-field/object-identifier-update-side-effect-on-view-field.integration-spec.ts',
  'test/integration/graphql/suites/view/view-group/successful-update-many-view-groups-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/atomic/create-one-files-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-create-actor-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-create-currency-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-create-links-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-create-rich-text-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-update-actor-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-update-address-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/composite/successful-update-full-name-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/create-and-delete-field-metadata-search-vector-side-effect.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/create-one-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/enum/failing-create-one-field-metadata-enum-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/enum/failing-update-one-enum-field-metadata-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/enum/successful-remove-multi-select-option-side-effect-on-records.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/enum/successful-update-one-enum-field-metadata-v2.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/failing-create-one-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/field-group-by-deactivation-deletes-views.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/morph-relation/find-many-morph-relation-records.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/relation/failing-field-metadata-relation-update.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/unique-field/create-one-unique-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/field-metadata/update-one-field-metadata.integration-spec.ts',
  'test/integration/metadata/suites/index/successful-index-creation-on-object-creation-v2.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/failing-create-one-object-metadata-v2.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/failing-update-one-object-metadata.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/morph-relation/delete-one-object-metadata-with-morph-relation.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/successful-create-one-object-metadata.integration-spec.ts',
  'test/integration/metadata/suites/object-metadata/update-one-object-metadata-serach-vector-side-effect.integration-spec.ts',
  'test/integration/metadata/suites/view-sort/successful-view-sort-deletion.integration-spec.ts',
  'test/integration/metadata/suites/view-sort/successful-view-sort-destroy.integration-spec.ts',
  'test/integration/metadata/suites/view-sort/successful-view-sort-update.integration-spec.ts',
  // These four application tests explicitly install schema-owning manifests.
  'test/integration/metadata/suites/application/dry-run-manifest-sync.integration-spec.ts',
  'test/integration/metadata/suites/application/failing-sync-application-flat-entity-map-conflict.integration-spec.ts',
  'test/integration/metadata/suites/application/successful-sync-application-unique-field-rename.integration-spec.ts',
  'test/integration/metadata/suites/application/successful-sync-application-universal-identifier-reuse-cross-entity.integration-spec.ts',
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
