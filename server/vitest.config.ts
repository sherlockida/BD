import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    // Server tests don't need jsdom
    environment: 'node',
  },
});
