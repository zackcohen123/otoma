import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], env: { TZ: 'UTC' } },
  resolve: { alias: { 'server-only': new URL('./tests/server-only-stub.ts', import.meta.url).pathname } },
});
