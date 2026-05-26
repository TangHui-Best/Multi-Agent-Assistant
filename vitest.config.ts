import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@multi-agent-assi/agent-runtime': new URL('./packages/agent-runtime/src/index.ts', import.meta.url).pathname,
      '@multi-agent-assi/event-bus': new URL('./packages/event-bus/src/index.ts', import.meta.url).pathname,
      '@multi-agent-assi/persistence': new URL('./packages/persistence/src/index.ts', import.meta.url).pathname,
      '@multi-agent-assi/room-hub': new URL('./packages/room-hub/src/index.ts', import.meta.url).pathname,
      '@multi-agent-assi/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.worktrees/**'],
  },
});
