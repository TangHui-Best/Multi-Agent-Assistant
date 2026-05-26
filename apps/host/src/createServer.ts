import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { RoomHub } from '@multi-agent-assi/room-hub';
import { submitMessageSchema } from '@multi-agent-assi/shared';

export interface CreateServerDeps {
  repositories: PersistenceRepositories;
  eventBus: EventBus;
  roomHub: RoomHub;
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
    let unsubscribe: (() => Promise<void>) | undefined;

    void deps.eventBus.subscribeRoomEvents((event) => {
      socket.send(JSON.stringify(event));
    }).then((nextUnsubscribe) => {
      unsubscribe = nextUnsubscribe;
    });

    socket.on('close', () => {
      void unsubscribe?.();
    });
  });

  return server;
}
