import { createAgentWorker, createCodexCliAdapter, createMockRuntimeAdapter } from '@multi-agent-assi/agent-runtime';
import { createRedisEventBus } from '@multi-agent-assi/event-bus';
import { createDatabase, createRepositories } from '@multi-agent-assi/persistence';
import { createRoomHub } from '@multi-agent-assi/room-hub';
import { createServer } from './createServer.js';
import { readDefaultRuntimeKind } from './runtimeConfig.js';

const host = '127.0.0.1';
const port = Number.parseInt(process.env.HOST_PORT ?? '4317', 10);
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const sqlitePath = process.env.SQLITE_PATH ?? '.data/multi-agent-assi.sqlite';
const defaultRuntimeKind = readDefaultRuntimeKind(process.env);

const repositories = createRepositories(createDatabase(sqlitePath));
repositories.ensureDefaultState({ runtimeKind: defaultRuntimeKind });

const eventBus = createRedisEventBus(redisUrl);
const roomHub = createRoomHub({ repositories, eventBus });
const worker = createAgentWorker({
  repositories,
  eventBus,
  adapters: [createMockRuntimeAdapter(), createCodexCliAdapter()],
});
worker.start();

const server = await createServer({ repositories, eventBus, roomHub });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void worker
      .stop()
      .then(() => server.close())
      .finally(() => {
        void eventBus.close();
        process.exit(0);
      });
  });
}

await server.listen({ host, port });
