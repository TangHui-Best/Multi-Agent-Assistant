import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { RoomHub } from '@multi-agent-assi/room-hub';
import { cancelInvocationSchema, submitMessageSchema, type RoomEvent } from '@multi-agent-assi/shared';

export interface CreateServerDeps {
  repositories: PersistenceRepositories;
  eventBus: EventBus;
  roomHub: RoomHub;
}

interface RoomEventSocket {
  readyState?: number;
  send(payload: string): void;
  on(event: 'close', handler: () => void): void;
}

const SOCKET_OPEN = 1;

interface RoomEventSocketSubscription {
  close(): Promise<void>;
  closed: Promise<void>;
}

export function attachRoomEventSocket(eventBus: EventBus, socket: RoomEventSocket): RoomEventSocketSubscription {
  let closed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  let closePromise: Promise<void> | undefined;
  let resolveClosed: (() => void) | undefined;
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const sendEvent = (event: RoomEvent) => {
    if (closed || (socket.readyState !== undefined && socket.readyState !== SOCKET_OPEN)) {
      return;
    }
    socket.send(JSON.stringify(event));
  };

  const subscriptionReady = eventBus.subscribeRoomEvents(sendEvent).then(async (nextUnsubscribe) => {
    if (closed) {
      await nextUnsubscribe();
      return;
    }
    unsubscribe = nextUnsubscribe;
  }).catch((err) => {
    if (!closed) {
      console.warn('Unable to subscribe websocket to room events', err);
    }
  });

  const close = async () => {
    if (closePromise) return closePromise;
    closed = true;
    closePromise = (async () => {
      if (unsubscribe) {
        const nextUnsubscribe = unsubscribe;
        unsubscribe = undefined;
        await nextUnsubscribe();
        return;
      }
      await subscriptionReady;
    })().finally(() => {
      resolveClosed?.();
    });
    return closePromise;
  };

  socket.on('close', () => {
    void close();
  });

  return { close, closed: closedPromise };
}

export async function createServer(deps: CreateServerDeps): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  const roomEventSubscriptions = new Set<RoomEventSocketSubscription>();
  await server.register(websocket);

  server.addHook('onClose', async () => {
    await Promise.all([...roomEventSubscriptions].map((subscription) => subscription.close()));
  });

  server.get('/api/health', async () => ({ ok: true }));

  server.get('/api/bootstrap', async () => ({
    agents: deps.repositories.listAgents(),
    messages: await deps.roomHub.listMessages('default-thread'),
    invocations: deps.repositories.listInvocationsByThread('default-thread'),
  }));

  server.post('/api/messages', async (request, reply) => {
    const parsed = submitMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid message input', issues: parsed.error.issues });
    }

    return deps.roomHub.submitMessage(parsed.data);
  });

  server.post('/api/invocations/:invocationId/cancel', async (request, reply) => {
    const params = request.params as { invocationId?: string };
    if (!params.invocationId) {
      return reply.status(400).send({ error: 'Missing invocation id' });
    }
    const parsed = cancelInvocationSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid cancellation input', issues: parsed.error.issues });
    }

    return deps.roomHub.cancelInvocation(params.invocationId, parsed.data.reason);
  });

  server.get('/ws', { websocket: true }, (socket) => {
    const subscription = attachRoomEventSocket(deps.eventBus, socket);
    roomEventSubscriptions.add(subscription);
    void subscription.closed.finally(() => {
      roomEventSubscriptions.delete(subscription);
    });
  });

  return server;
}
