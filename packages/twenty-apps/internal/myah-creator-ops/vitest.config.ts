import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
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
