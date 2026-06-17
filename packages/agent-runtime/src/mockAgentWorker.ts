import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import { createAgentWorker, type AgentWorker } from './agentWorker.js';
import { createMockRuntimeAdapter } from './mockRuntimeAdapter.js';

export type MockAgentWorker = AgentWorker;

export function createMockAgentWorker(deps: {
  repositories: PersistenceRepositories;
  eventBus: EventBus;
  pollIntervalMs?: number;
}): MockAgentWorker {
  return createAgentWorker({
    repositories: deps.repositories,
    eventBus: deps.eventBus,
    adapters: [createMockRuntimeAdapter()],
    consumerGroup: 'mock-agent-workers',
    pollIntervalMs: deps.pollIntervalMs,
  });
}
