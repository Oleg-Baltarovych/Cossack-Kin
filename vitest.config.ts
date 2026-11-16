import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __CK_DEBUG__: 'true' },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // The ESLint boundary test builds a type-aware TS program on first run.
    testTimeout: 30_000,
  },
});
