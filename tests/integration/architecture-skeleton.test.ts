import net from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { createMockAgentWorker } from '@multi-agent-assi/agent-runtime';
import { createRedisEventBus } from '@multi-agent-assi/event-bus';
import { createDatabase, createRepositories } from '@multi-agent-assi/persistence';
import { createRoomHub } from '@multi-agent-assi/room-hub';

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const redisAvailable = await canConnect(redisUrl);

describe('architecture skeleton', () => {
  it.runIf(redisAvailable)('routes a web message through Room Hub, Redis, mock runtime, and SQLite', async () => {
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

async function canConnect(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const host = parsed.hostname || '127.0.0.1';
  const port = Number(parsed.port || 6379);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 300);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
