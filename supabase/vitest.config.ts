import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'functions/_shared/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
