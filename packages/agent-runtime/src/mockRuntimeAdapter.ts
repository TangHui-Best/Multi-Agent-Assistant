import type { RuntimeAdapter } from './agentWorker.js';

export function createMockRuntimeAdapter(): RuntimeAdapter {
  return {
    kind: 'mock',
    async run({ job, emitDelta }) {
      const body = `[${job.agentId}] received: ${job.prompt}`;
      await emitDelta(body);
      return { body };
    },
  };
}
