import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootNodeModulesPath = (packageName: string): string =>
  fileURLToPath(
    new URL(`../../../../node_modules/${packageName}`, import.meta.url),
  );

export default defineConfig({
  resolve: {
    alias: {
      react: rootNodeModulesPath('react'),
      'react-dom': rootNodeModulesPath('react-dom'),
    },
    dedupe: ['react', 'react-dom'],
    tsconfigPaths: true,
  },
  test: {
    include: ['src/**/*.unit.test.ts'],
    server: {
      deps: {
        inline: ['twenty-ui'],
      },
    },
  },
});
