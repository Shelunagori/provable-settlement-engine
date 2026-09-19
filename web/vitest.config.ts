import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Most of these tests are pure -- the verifier runs unchanged in Node 20+
    // because Web Crypto is global there. The routing tests render components,
    // so they ask for jsdom per file with an environment docblock.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
