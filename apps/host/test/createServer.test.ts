import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentJob, AgentSeat, InvocationRecord, MessageRecord, RoomEvent } from '@multi-agent-assi/shared';
import { attachRoomEventSocket, createServer } from '../src/createServer.js';

function createHarness() {
  const messages: MessageRecord[] = [];
  const agents: AgentSeat[] = [
    { id: 'architect', displayName: 'Architect', role: 'architect', runtime: { kind: 'mock', profile: 'architect' } },
  ];
  const repositories: PersistenceRepositories = {
    ensureDefaultState: vi.fn(),
    appendMessage: vi.fn((message: MessageRecord) => messages.push(message)),
    listMessages: vi.fn(() => messages),
    findMessageByIdempotencyKey: vi.fn(() => null),
    createInvocation: vi.fn(),
    listInvocationsBySourceMessage: vi.fn(() => []),
    updateInvocationStatus: vi.fn(),
    getInvocation: vi.fn(() => null),
    listAgents: vi.fn(() => agents),
  };
  const eventBus: EventBus = {
    publishRoomEvent: vi.fn(async () => {}),
    enqueueAgentJob: vi.fn(async () => {}),
    readAgentJobs: vi.fn(async () => []),
    ackAgentJob: vi.fn(async () => {}),
    subscribeRoomEvents: vi.fn(async () => async () => {}),
    close: vi.fn(async () => {}),
  };
  const roomHub = {
    submitMessage: vi.fn(async () => {
      const message: MessageRecord = {
        id: 'msg-1',
        roomId: 'default-room',
        threadId: 'default-thread',
        kind: 'user_message',
        sender: { type: 'user', userId: 'local-user', source: 'web' },
        body: '@architect review boundary',
        createdAt: 1,
      };
      const invocation: InvocationRecord = {
        id: 'inv-1',
        roomId: 'default-room',
        threadId: 'default-thread',
        sourceMessageId: 'msg-1',
        agentId: 'architect',
        status: 'queued',
        createdAt: 1,
        updatedAt: 1,
      };
      return { message, invocations: [invocation] };
    }),
    listMessages: vi.fn(async () => messages),
  };

  return { eventBus, repositories, roomHub };
}

describe('host server', () => {
  it('serves health and bootstrap state from repositories', async () => {
    const harness = createHarness();
    const server = await createServer(harness);

    const health = await server.inject({ method: 'GET', url: '/api/health' });
    const bootstrap = await server.inject({ method: 'GET', url: '/api/bootstrap' });

    expect(health.json()).toEqual({ ok: true });
    expect(bootstrap.json()).toEqual({ agents: harness.repositories.listAgents(), messages: [] });
    await server.close();
  });

  it('validates and submits user messages through Room Hub', async () => {
    const harness = createHarness();
    const server = await createServer(harness);

    const response = await server.inject({
      method: 'POST',
      url: '/api/messages',
      payload: {
        roomId: 'default-room',
        threadId: 'default-thread',
        userId: 'local-user',
        source: 'web',
        body: '@architect review boundary',
        target: { mode: 'mention', agentIds: ['architect'] },
        idempotencyKey: 'idem-123456',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(harness.roomHub.submitMessage).toHaveBeenCalledOnce();
    expect(response.json().invocations).toHaveLength(1);
    await server.close();
  });

  it('unsubscribes if a websocket closes before the Redis subscription resolves', async () => {
    let resolveSubscription: ((unsubscribe: () => Promise<void>) => void) | undefined;
    const unsubscribe = vi.fn(async () => {});
    const eventBus: EventBus = {
      publishRoomEvent: vi.fn(async () => {}),
      enqueueAgentJob: vi.fn(async () => {}),
      readAgentJobs: vi.fn(async () => []),
      ackAgentJob: vi.fn(async () => {}),
      subscribeRoomEvents: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveSubscription = resolve;
          }),
      ),
      close: vi.fn(async () => {}),
    };
    const socket = Object.assign(new EventEmitter(), {
      readyState: 1,
      send: vi.fn(),
    });

    attachRoomEventSocket(eventBus, socket);
    socket.readyState = 3;
    socket.emit('close');
    resolveSubscription?.(unsubscribe);
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  });
});
