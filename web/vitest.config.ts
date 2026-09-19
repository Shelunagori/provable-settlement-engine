import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node 20+ exposes Web Crypto globally, so the verifier runs unchanged here
    // and in the browser. No DOM environment is needed for it.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
