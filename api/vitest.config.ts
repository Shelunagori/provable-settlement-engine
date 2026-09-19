import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every test talks to a real Postgres and several of them commit concurrently
    // on purpose. Files run one at a time so concurrency under test is the
    // concurrency we wrote, not concurrency between unrelated test files.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
