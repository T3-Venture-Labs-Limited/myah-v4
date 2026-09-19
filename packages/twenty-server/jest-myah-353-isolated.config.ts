import { type JestConfigWithTsJest, pathsToModuleNameMapper } from 'ts-jest';

const tsConfig = require('./tsconfig.json');

const jestConfig: JestConfigWithTsJest = {
  prettierPath: null,
  silent: false,
  errorOnDeprecated: true,
  maxConcurrency: 1,
  moduleFileExtensions: ['js', 'mjs', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex:
    'myah-inbox-reply-context-(draft|action-compatibility|cutover)\\.integration-spec\\.ts$',
  modulePathIgnorePatterns: ['<rootDir>/dist'],
  testTimeout: 90_000,
  maxWorkers: 1,
  transform: {
    '^.+\\.(t|j|mj)s$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: false, decorators: true },
          transform: { decoratorMetadata: true },
          baseUrl: '.',
          paths: { 'src/*': ['./src/*'], 'test/*': ['./test/*'] },
        },
      },
    ],
  },
  moduleNameMapper: {
    ...pathsToModuleNameMapper(tsConfig.compilerOptions.paths, {
      prefix: '<rootDir>/',
    }),
    '^test/(.*)$': '<rootDir>/test/$1',
  },
};

export default jestConfig;
