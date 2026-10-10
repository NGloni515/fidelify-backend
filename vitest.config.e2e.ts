import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { testEnv } from './test/test-env.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: './test/global-setup.ts',
    env: testEnv,
    // Every spec truncates the same database.
    fileParallelism: false,
  },
});
