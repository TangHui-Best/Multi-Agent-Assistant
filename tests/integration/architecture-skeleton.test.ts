import { describe, expect, it, vi } from 'vitest';
import { createMockAgentWorker } from '@multi-agent-assi/agent-runtime';
import { createRedisEventBus } from '@multi-agent-assi/event-bus';
import { createDatabase, createRepositories } from '@multi-agent-assi/persistence';
import { createRoomHub } from '@multi-agent-assi/room-hub';

describe('architecture skeleton', () => {
  it('routes a web message through Room Hub, Redis, mock runtime, and SQLite', async () => {
    const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    const eventBus = createRedisEventBus(redisUrl);
    const repositories = createRepositories(createDatabase(':memory:'));
    repositories.ensureDefaultState();
    const roomHub = createRoomHub({ repositories, eventBus });
    const worker = createMockAgentWorker({ repositories, eventBus, pollIntervalMs: 25 });
    worker.start();

    await roomHub.submitMessage({
      roomId: 'default-room',
      threadId: 'default-thread',
      userId: 'local-user',
      source: 'web',
      body: '@architect review boundary',
      target: { mode: 'mention', agentIds: ['architect'] },
      idempotencyKey: `idem-integration-${Date.now()}`,
    });

    await vi.waitFor(() => {
      const messages = repositories.listMessages('default-thread');
      expect(messages.some((message) => message.sender.type === 'agent' && message.sender.agentId === 'architect')).toBe(true);
    });

    await worker.stop();
    await eventBus.close();

    const messages = repositories.listMessages('default-thread');
    const agentMessage = messages.find((message) => message.sender.type === 'agent');
    expect(messages.some((message) => message.sender.type === 'user')).toBe(true);
    expect(agentMessage?.body).toBe('[architect] received: @architect review boundary');
    expect(repositories.getInvocation(agentMessage?.invocationId ?? '')?.status).toBe('succeeded');
  });
});
