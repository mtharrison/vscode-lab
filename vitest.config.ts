import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/extension.ts'],
    },
  },
  resolve: {
    alias: {
      vscode: resolve(__dirname, 'test/__mocks__/vscode.ts'),
    },
  },
});
