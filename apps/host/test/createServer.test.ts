import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type {
  AgentJob,
  AgentSeat,
  InvocationAuditRecord,
  InvocationRecord,
  MessageRecord,
  RoomEvent,
  RoundRecord,
  RoundStepRecord,
} from '@multi-agent-assi/shared';
import { attachRoomEventSocket, createServer } from '../src/createServer.js';

interface WebSocketTestServer {
  injectWS(path: string): Promise<{ close(): void }>;
  close(): Promise<void>;
}

function createHarness() {
  const messages: MessageRecord[] = [];
  const agents: AgentSeat[] = [
    { id: 'architect', displayName: 'Architect', role: 'architect', runtime: { kind: 'mock', profile: 'architect' } },
  ];
  const rounds: RoundRecord[] = [
    {
      id: 'round-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'msg-1',
      workflow: 'design_review_execute',
      status: 'running',
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const roundSteps: RoundStepRecord[] = [
    {
      id: 'step-1',
      roundId: 'round-1',
      stepIndex: 0,
      agentId: 'architect',
      status: 'queued',
      invocationId: 'inv-1',
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const audits: InvocationAuditRecord[] = [
    {
      id: 'audit-1',
      invocationId: 'inv-1',
      eventType: 'invocation.queued',
      occurredAt: 1,
      metadata: { roundId: 'round-1', roundStepId: 'step-1' },
    },
  ];
  const repositories: PersistenceRepositories = {
    ensureDefaultState: vi.fn(),
    appendMessage: vi.fn((message: MessageRecord) => messages.push(message)),
    listMessages: vi.fn(() => messages),
    findMessageByIdempotencyKey: vi.fn(() => null),
    createInvocation: vi.fn(),
    listInvocationsBySourceMessage: vi.fn(() => []),
    listInvocationsByThread: vi.fn(() => [
      {
        id: 'inv-1',
        roomId: 'default-room',
        threadId: 'default-thread',
        sourceMessageId: 'msg-1',
        agentId: 'architect',
        status: 'queued',
        createdAt: 1,
        updatedAt: 1,
      },
    ]),
    createRound: vi.fn(),
    createRoundSteps: vi.fn(),
    listRoundsByThread: vi.fn(() => rounds),
    listRoundSteps: vi.fn((roundId: string) => roundSteps.filter((step) => step.roundId === roundId)),
    updateRoundStatus: vi.fn(),
    updateRoundStepStatus: vi.fn(),
    updateInvocationRecoveryMetadata: vi.fn(),
    appendInvocationAudit: vi.fn(),
    listInvocationAudit: vi.fn((invocationId: string) => audits.filter((audit) => audit.invocationId === invocationId)),
    tryStartInvocation: vi.fn(() => true),
    updateInvocationStatus: vi.fn(),
    getInvocation: vi.fn((invocationId: string) => {
      if (invocationId !== 'inv-1') return null;
      return {
        id: 'inv-1',
        roomId: 'default-room',
        threadId: 'default-thread',
        sourceMessageId: 'msg-1',
        agentId: 'architect',
        status: 'queued',
        createdAt: 1,
        updatedAt: 1,
      };
    }),
    listAgents: vi.fn(() => agents),
  };
  const eventBus: EventBus = {
    publishRoomEvent: vi.fn(async () => {}),
    enqueueAgentJob: vi.fn(async () => {}),
    readAgentJobs: vi.fn(async () => []),
    ackAgentJob: vi.fn(async () => {}),
    acquireAgentSlotLease: vi.fn(async () => true),
    releaseAgentSlotLease: vi.fn(async () => {}),
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
    continueRoundAfterInvocation: vi.fn(async () => null),
    cancelInvocation: vi.fn(async (invocationId: string, reason?: string) => ({
      id: invocationId,
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'msg-1',
      agentId: 'architect',
      status: 'canceled' as const,
      error: reason,
      createdAt: 1,
      updatedAt: 2,
    })),
  };

  return { eventBus, repositories, roomHub, rounds, roundSteps };
}

describe('host server', () => {
  it('serves health and bootstrap state from repositories', async () => {
    const harness = createHarness();
    const server = await createServer(harness);

    const health = await server.inject({ method: 'GET', url: '/api/health' });
    const bootstrap = await server.inject({ method: 'GET', url: '/api/bootstrap' });

    expect(health.json()).toEqual({ ok: true });
    expect(bootstrap.json()).toEqual({
      agents: harness.repositories.listAgents(),
      messages: [],
      invocations: harness.repositories.listInvocationsByThread('default-thread'),
      rounds: harness.rounds,
      roundSteps: harness.roundSteps,
    });
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

  it('cancels an invocation through Room Hub', async () => {
    const harness = createHarness();
    const server = await createServer(harness);

    const response = await server.inject({
      method: 'POST',
      url: '/api/invocations/inv-1/cancel',
      payload: { reason: 'user requested stop' },
    });

    expect(response.statusCode).toBe(200);
    expect(harness.roomHub.cancelInvocation).toHaveBeenCalledWith('inv-1', 'user requested stop');
    expect(response.json()).toMatchObject({ id: 'inv-1', status: 'canceled' });
    await server.close();
  });

  it('serves invocation audit records from repositories', async () => {
    const harness = createHarness();
    const server = await createServer(harness);

    const response = await server.inject({ method: 'GET', url: '/api/invocations/inv-1/audit' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(harness.repositories.listInvocationAudit('inv-1'));
    await server.close();
  });

  it('returns 404 for audit of an unknown invocation', async () => {
    const harness = createHarness();
    const server = await createServer(harness);

    const response = await server.inject({ method: 'GET', url: '/api/invocations/missing/audit' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Invocation not found' });
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
      acquireAgentSlotLease: vi.fn(async () => true),
      releaseAgentSlotLease: vi.fn(async () => {}),
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

  it('waits for active websocket subscriptions during server close', async () => {
    let releaseUnsubscribe: (() => void) | undefined;
    let unsubscribeCompleted = false;
    const unsubscribe = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseUnsubscribe = () => {
            unsubscribeCompleted = true;
            resolve();
          };
        }),
    );
    const harness = createHarness();
    harness.eventBus.subscribeRoomEvents = vi.fn(async () => unsubscribe);
    const server = await createServer(harness);
    await server.ready();
    await (server as unknown as WebSocketTestServer).injectWS('/ws');

    let closeResolved = false;
    const closePromise = server.close().then(() => {
      closeResolved = true;
    });
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(closeResolved).toBe(false);
    releaseUnsubscribe?.();
    await closePromise;
    expect(unsubscribeCompleted).toBe(true);
  });

  it('waits for pending websocket subscriptions during server close', async () => {
    let resolveSubscription: ((unsubscribe: () => Promise<void>) => void) | undefined;
    let releaseUnsubscribe: (() => void) | undefined;
    const unsubscribe = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseUnsubscribe = resolve;
        }),
    );
    const harness = createHarness();
    harness.eventBus.subscribeRoomEvents = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSubscription = resolve;
        }),
    );
    const server = await createServer(harness);
    await server.ready();
    await (server as unknown as WebSocketTestServer).injectWS('/ws');

    let closeResolved = false;
    const closePromise = server.close().then(() => {
      closeResolved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    const closeResolvedBeforeSubscription = closeResolved;

    resolveSubscription?.(unsubscribe);
    await vi.waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    releaseUnsubscribe?.();
    await closePromise;

    expect(closeResolvedBeforeSubscription).toBe(false);
  });
});
