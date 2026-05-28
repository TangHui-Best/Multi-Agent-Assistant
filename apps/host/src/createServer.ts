import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { RoomHub } from '@multi-agent-assi/room-hub';
import { submitMessageSchema, type RoomEvent } from '@multi-agent-assi/shared';

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

export function attachRoomEventSocket(eventBus: EventBus, socket: RoomEventSocket): void {
  let closed = false;
  let unsubscribe: (() => Promise<void>) | undefined;

  const sendEvent = (event: RoomEvent) => {
    if (closed || (socket.readyState !== undefined && socket.readyState !== SOCKET_OPEN)) {
      return;
    }
    socket.send(JSON.stringify(event));
  };

  void eventBus.subscribeRoomEvents(sendEvent).then((nextUnsubscribe) => {
    if (closed) {
      void nextUnsubscribe();
      return;
    }
    unsubscribe = nextUnsubscribe;
  });

  socket.on('close', () => {
    closed = true;
    void unsubscribe?.();
  });
}

export async function createServer(deps: CreateServerDeps): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  await server.register(websocket);

  server.get('/api/health', async () => ({ ok: true }));

  server.get('/api/bootstrap', async () => ({
    agents: deps.repositories.listAgents(),
    messages: await deps.roomHub.listMessages('default-thread'),
  }));

  server.post('/api/messages', async (request, reply) => {
    const parsed = submitMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid message input', issues: parsed.error.issues });
    }

    return deps.roomHub.submitMessage(parsed.data);
  });

  server.get('/ws', { websocket: true }, (socket) => {
    attachRoomEventSocket(deps.eventBus, socket);
  });

  return server;
}
