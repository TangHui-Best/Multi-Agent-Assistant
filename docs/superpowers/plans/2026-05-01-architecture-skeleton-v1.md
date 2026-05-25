# Architecture Skeleton v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first non-bypass architecture skeleton for the Multi-Codex Equal-Room Host: Web Console -> Host API -> Room Hub -> SQLite -> Redis Event Bus / Queue -> mock Agent Runtime -> Redis Event Bus -> WebSocket -> Web Console.

**Architecture:** Use a pnpm TypeScript workspace with a local Host Runtime, Web Console, shared protocol package, SQLite persistence package, Redis event-bus package, Room Hub package, and mock Agent Runtime package. Redis is included from the first working path as runtime coordination infrastructure; SQLite is the durable source of truth. Physical layout may evolve later, but this plan creates explicit logical modules so future Feishu and Codex adapters can reuse the same path.

**Tech Stack:** Node.js 20+, pnpm, TypeScript, Vite, React, Fastify, WebSocket, better-sqlite3, ioredis, Zod, Vitest, Docker Compose for Redis.

---

## Scope

This plan implements Phase 1 from the design spec:

```text
Web Console
  -> Host API
  -> Room Hub
  -> SQLite
  -> Redis Event Bus / Queue
  -> mock Agent Runtime
  -> Redis Event Bus
  -> WebSocket
  -> Web Console
```

This plan does not implement real Codex CLI spawning, Feishu, Claude, Gemini, or long-running autonomous agent loops. Those come after the architecture skeleton proves the main data path.

## Planned Files

Create:

- `package.json` - workspace scripts.
- `pnpm-workspace.yaml` - workspace package discovery.
- `tsconfig.base.json` - shared TypeScript config.
- `docker-compose.yml` - local Redis service.
- `.env.example` - local runtime defaults.
- `packages/shared/package.json`
- `packages/shared/tsconfig.json`
- `packages/shared/src/index.ts`
- `packages/shared/src/protocol.ts`
- `packages/shared/src/schemas.ts`
- `packages/persistence/package.json`
- `packages/persistence/tsconfig.json`
- `packages/persistence/src/index.ts`
- `packages/persistence/src/database.ts`
- `packages/persistence/src/migrations.ts`
- `packages/persistence/src/repositories.ts`
- `packages/event-bus/package.json`
- `packages/event-bus/tsconfig.json`
- `packages/event-bus/src/index.ts`
- `packages/event-bus/src/redisEventBus.ts`
- `packages/room-hub/package.json`
- `packages/room-hub/tsconfig.json`
- `packages/room-hub/src/index.ts`
- `packages/room-hub/src/createRoomHub.ts`
- `packages/agent-runtime/package.json`
- `packages/agent-runtime/tsconfig.json`
- `packages/agent-runtime/src/index.ts`
- `packages/agent-runtime/src/mockAgentWorker.ts`
- `apps/host/package.json`
- `apps/host/tsconfig.json`
- `apps/host/src/index.ts`
- `apps/host/src/createServer.ts`
- `apps/web/package.json`
- `apps/web/tsconfig.json`
- `apps/web/index.html`
- `apps/web/src/main.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/api.ts`
- `apps/web/src/styles.css`
- `tests/integration/architecture-skeleton.test.ts`

Modify:

- `README.md` - add local development commands and skeleton scope.

## Task 1: Workspace And Tooling Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Create the workspace package manifest**

Create `package.json`:

```json
{
  "name": "multi-agent-assi",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.4",
  "scripts": {
    "dev": "pnpm --parallel --filter @multi-agent-assi/host --filter @multi-agent-assi/web dev",
    "dev:host": "pnpm --filter @multi-agent-assi/host dev",
    "dev:web": "pnpm --filter @multi-agent-assi/web dev",
    "build": "pnpm -r build",
    "test": "vitest run",
    "redis:up": "docker compose up -d redis",
    "redis:down": "docker compose down"
  },
  "devDependencies": {
    "@types/node": "^22.13.10",
    "@vitejs/plugin-react": "^4.3.4",
    "tsx": "^4.19.3",
    "typescript": "^5.8.2",
    "vite": "^6.2.0",
    "vitest": "^3.0.8"
  }
}
```

- [ ] **Step 2: Create workspace discovery**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create shared TypeScript config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Create Redis docker-compose service**

Create `docker-compose.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

- [ ] **Step 5: Create environment example**

Create `.env.example`:

```dotenv
HOST_PORT=4317
WEB_PORT=5173
REDIS_URL=redis://127.0.0.1:6379
SQLITE_PATH=.data/multi-agent-assi.sqlite
```

- [ ] **Step 6: Update README with architecture skeleton commands**

Append to `README.md`:

```md
## Architecture Skeleton Development

```bash
pnpm install
pnpm redis:up
pnpm dev
```

The first implementation path is:

`Web Console -> Host API -> Room Hub -> SQLite -> Redis Event Bus / Queue -> mock Agent Runtime -> Redis Event Bus -> WebSocket -> Web Console`.

Redis is runtime coordination. SQLite is durable truth.
```

- [ ] **Step 7: Install dependencies**

Run:

```powershell
pnpm install
```

Expected: dependencies install and `pnpm-lock.yaml` is created.

- [ ] **Step 8: Commit workspace scaffold**

Use the development-continuity skill before commit. Then run:

```powershell
git add package.json pnpm-workspace.yaml tsconfig.base.json docker-compose.yml .env.example README.md pnpm-lock.yaml
git commit -m "chore: scaffold host web workspace"
```

## Task 2: Shared Protocol Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/schemas.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/shared/package.json`:

```json
{
  "name": "@multi-agent-assi/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.24.2"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Define protocol types**

Create `packages/shared/src/protocol.ts`:

```ts
export type RoomId = string;
export type ThreadId = string;
export type MessageId = string;
export type AgentId = 'architect' | 'reviewer' | 'implementer' | string;
export type InvocationId = string;

export type MessageSender =
  | { type: 'user'; userId: string; source: 'web' | 'feishu' | 'system' }
  | { type: 'agent'; agentId: AgentId }
  | { type: 'system' };

export type MessageKind = 'user_message' | 'agent_message' | 'system_event';

export interface MessageRecord {
  id: MessageId;
  roomId: RoomId;
  threadId: ThreadId;
  kind: MessageKind;
  sender: MessageSender;
  body: string;
  createdAt: number;
  invocationId?: InvocationId;
}

export type AgentStatus = 'idle' | 'queued' | 'thinking' | 'replying' | 'errored' | 'offline';

export interface AgentDefinition {
  id: AgentId;
  displayName: string;
  role: 'architect' | 'reviewer' | 'implementer' | 'custom';
  status: AgentStatus;
}

export type Target =
  | { mode: 'broadcast' }
  | { mode: 'mention'; agentIds: AgentId[] }
  | { mode: 'orchestrated'; workflow: 'design_review_execute' };

export interface SubmitMessageInput {
  roomId: RoomId;
  threadId: ThreadId;
  userId: string;
  source: 'web' | 'feishu';
  body: string;
  target: Target;
  idempotencyKey: string;
}

export type InvocationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface InvocationRecord {
  id: InvocationId;
  roomId: RoomId;
  threadId: ThreadId;
  sourceMessageId: MessageId;
  agentId: AgentId;
  status: InvocationStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export type RoomEvent =
  | { type: 'message.created'; roomId: RoomId; threadId: ThreadId; message: MessageRecord; occurredAt: number }
  | { type: 'invocation.queued'; roomId: RoomId; threadId: ThreadId; invocation: InvocationRecord; occurredAt: number }
  | { type: 'invocation.running'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; occurredAt: number }
  | { type: 'agent.delta'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; agentId: AgentId; delta: string; occurredAt: number }
  | { type: 'invocation.completed'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; message: MessageRecord; occurredAt: number }
  | { type: 'invocation.failed'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; error: string; occurredAt: number };

export interface AgentJob {
  invocationId: InvocationId;
  roomId: RoomId;
  threadId: ThreadId;
  sourceMessageId: MessageId;
  agentId: AgentId;
  prompt: string;
}
```

- [ ] **Step 4: Define Zod schemas**

Create `packages/shared/src/schemas.ts`:

```ts
import { z } from 'zod';

export const targetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('broadcast') }),
  z.object({ mode: z.literal('mention'), agentIds: z.array(z.string().min(1)).min(1) }),
  z.object({ mode: z.literal('orchestrated'), workflow: z.literal('design_review_execute') }),
]);

export const submitMessageSchema = z.object({
  roomId: z.string().min(1),
  threadId: z.string().min(1),
  userId: z.string().min(1),
  source: z.enum(['web', 'feishu']),
  body: z.string().min(1).max(20000),
  target: targetSchema,
  idempotencyKey: z.string().min(8),
});
```

- [ ] **Step 5: Export package API**

Create `packages/shared/src/index.ts`:

```ts
export * from './protocol.js';
export * from './schemas.js';
```

- [ ] **Step 6: Build shared package**

Run:

```powershell
pnpm --filter @multi-agent-assi/shared build
```

Expected: PASS and `packages/shared/dist` is generated.

- [ ] **Step 7: Commit shared protocol**

Use the development-continuity skill before commit. Then run:

```powershell
git add packages/shared
git commit -m "feat: define shared room protocol"
```

## Task 3: SQLite Persistence Package

**Files:**
- Create: `packages/persistence/package.json`
- Create: `packages/persistence/tsconfig.json`
- Create: `packages/persistence/src/index.ts`
- Create: `packages/persistence/src/database.ts`
- Create: `packages/persistence/src/migrations.ts`
- Create: `packages/persistence/src/repositories.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/persistence/package.json`:

```json
{
  "name": "@multi-agent-assi/persistence",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@multi-agent-assi/shared": "workspace:*",
    "better-sqlite3": "^12.6.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `packages/persistence/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create migrations**

Create `packages/persistence/src/migrations.ts`:

```ts
import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    create table if not exists rooms (
      id text primary key,
      title text not null,
      created_at integer not null
    );

    create table if not exists threads (
      id text primary key,
      room_id text not null,
      title text not null,
      created_at integer not null
    );

    create table if not exists agents (
      id text primary key,
      display_name text not null,
      role text not null,
      status text not null
    );

    create table if not exists messages (
      id text primary key,
      room_id text not null,
      thread_id text not null,
      kind text not null,
      sender_json text not null,
      body text not null,
      invocation_id text,
      created_at integer not null
    );

    create table if not exists invocations (
      id text primary key,
      room_id text not null,
      thread_id text not null,
      source_message_id text not null,
      agent_id text not null,
      status text not null,
      error text,
      created_at integer not null,
      updated_at integer not null
    );
  `);
}
```

- [ ] **Step 4: Create database opener**

Create `packages/persistence/src/database.ts`:

```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrations.js';

export function createDatabase(filename: string): Database.Database {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  runMigrations(db);
  return db;
}
```

- [ ] **Step 5: Create repositories**

Create `packages/persistence/src/repositories.ts`:

```ts
import type Database from 'better-sqlite3';
import type { AgentDefinition, InvocationRecord, MessageRecord } from '@multi-agent-assi/shared';

export interface PersistenceRepositories {
  ensureDefaultState(): void;
  appendMessage(message: MessageRecord): void;
  listMessages(threadId: string): MessageRecord[];
  createInvocation(invocation: InvocationRecord): void;
  updateInvocationStatus(id: string, status: InvocationRecord['status'], error?: string): void;
  getInvocation(id: string): InvocationRecord | null;
  listAgents(): AgentDefinition[];
}

export function createRepositories(db: Database.Database): PersistenceRepositories {
  return {
    ensureDefaultState() {
      const now = Date.now();
      db.prepare('insert or ignore into rooms (id, title, created_at) values (?, ?, ?)').run('default-room', 'Default Room', now);
      db.prepare('insert or ignore into threads (id, room_id, title, created_at) values (?, ?, ?, ?)').run('default-thread', 'default-room', 'Default Thread', now);
      const insertAgent = db.prepare('insert or replace into agents (id, display_name, role, status) values (?, ?, ?, ?)');
      insertAgent.run('architect', 'Architect', 'architect', 'idle');
      insertAgent.run('reviewer', 'Reviewer', 'reviewer', 'idle');
      insertAgent.run('implementer', 'Implementer', 'implementer', 'idle');
    },

    appendMessage(message) {
      db.prepare(`
        insert into messages (id, room_id, thread_id, kind, sender_json, body, invocation_id, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.id,
        message.roomId,
        message.threadId,
        message.kind,
        JSON.stringify(message.sender),
        message.body,
        message.invocationId ?? null,
        message.createdAt,
      );
    },

    listMessages(threadId) {
      return db.prepare('select * from messages where thread_id = ? order by created_at asc').all(threadId).map((row) => {
        const r = row as {
          id: string;
          room_id: string;
          thread_id: string;
          kind: MessageRecord['kind'];
          sender_json: string;
          body: string;
          invocation_id: string | null;
          created_at: number;
        };
        return {
          id: r.id,
          roomId: r.room_id,
          threadId: r.thread_id,
          kind: r.kind,
          sender: JSON.parse(r.sender_json) as MessageRecord['sender'],
          body: r.body,
          ...(r.invocation_id ? { invocationId: r.invocation_id } : {}),
          createdAt: r.created_at,
        };
      });
    },

    createInvocation(invocation) {
      db.prepare(`
        insert into invocations (id, room_id, thread_id, source_message_id, agent_id, status, error, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invocation.id,
        invocation.roomId,
        invocation.threadId,
        invocation.sourceMessageId,
        invocation.agentId,
        invocation.status,
        invocation.error ?? null,
        invocation.createdAt,
        invocation.updatedAt,
      );
    },

    updateInvocationStatus(id, status, error) {
      db.prepare('update invocations set status = ?, error = ?, updated_at = ? where id = ?').run(status, error ?? null, Date.now(), id);
    },

    getInvocation(id) {
      const row = db.prepare('select * from invocations where id = ?').get(id) as
        | {
            id: string;
            room_id: string;
            thread_id: string;
            source_message_id: string;
            agent_id: string;
            status: InvocationRecord['status'];
            error: string | null;
            created_at: number;
            updated_at: number;
          }
        | undefined;
      if (!row) return null;
      return {
        id: row.id,
        roomId: row.room_id,
        threadId: row.thread_id,
        sourceMessageId: row.source_message_id,
        agentId: row.agent_id,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.error ? { error: row.error } : {}),
      };
    },

    listAgents() {
      return db.prepare('select * from agents order by id asc').all().map((row) => {
        const r = row as { id: string; display_name: string; role: AgentDefinition['role']; status: AgentDefinition['status'] };
        return { id: r.id, displayName: r.display_name, role: r.role, status: r.status };
      });
    },
  };
}
```

- [ ] **Step 6: Export persistence API**

Create `packages/persistence/src/index.ts`:

```ts
export * from './database.js';
export * from './repositories.js';
```

- [ ] **Step 7: Build persistence package**

Run:

```powershell
pnpm --filter @multi-agent-assi/persistence build
```

Expected: PASS.

- [ ] **Step 8: Commit persistence**

Use the development-continuity skill before commit. Then run:

```powershell
git add packages/persistence
git commit -m "feat: add sqlite persistence layer"
```

## Task 4: Redis Event Bus Package

**Files:**
- Create: `packages/event-bus/package.json`
- Create: `packages/event-bus/tsconfig.json`
- Create: `packages/event-bus/src/index.ts`
- Create: `packages/event-bus/src/redisEventBus.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/event-bus/package.json`:

```json
{
  "name": "@multi-agent-assi/event-bus",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@multi-agent-assi/shared": "workspace:*",
    "ioredis": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `packages/event-bus/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Implement Redis event bus and queue**

Create `packages/event-bus/src/redisEventBus.ts`:

```ts
import Redis from 'ioredis';
import type { AgentJob, RoomEvent } from '@multi-agent-assi/shared';

const ROOM_EVENTS_STREAM = 'mas:room-events';
const AGENT_JOBS_STREAM = 'mas:agent-jobs';

export interface EventBus {
  publishRoomEvent(event: RoomEvent): Promise<void>;
  enqueueAgentJob(job: AgentJob): Promise<void>;
  readAgentJobs(consumerGroup: string, consumerName: string, blockMs: number): Promise<AgentJob[]>;
  ackAgentJob(consumerGroup: string, streamId: string): Promise<void>;
  subscribeRoomEvents(onEvent: (event: RoomEvent) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

export function createRedisEventBus(redisUrl: string): EventBus {
  const redis = new Redis(redisUrl);
  const subscriber = new Redis(redisUrl);

  async function ensureGroup(stream: string, group: string): Promise<void> {
    try {
      await redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) {
        throw err;
      }
    }
  }

  return {
    async publishRoomEvent(event) {
      await redis.xadd(ROOM_EVENTS_STREAM, '*', 'event', JSON.stringify(event));
      await redis.publish('mas:room-events:pubsub', JSON.stringify(event));
    },

    async enqueueAgentJob(job) {
      await redis.xadd(AGENT_JOBS_STREAM, '*', 'job', JSON.stringify(job));
    },

    async readAgentJobs(consumerGroup, consumerName, blockMs) {
      await ensureGroup(AGENT_JOBS_STREAM, consumerGroup);
      const response = await redis.xreadgroup(
        'GROUP',
        consumerGroup,
        consumerName,
        'COUNT',
        10,
        'BLOCK',
        blockMs,
        'STREAMS',
        AGENT_JOBS_STREAM,
        '>',
      );
      if (!response) return [];
      const jobs: AgentJob[] = [];
      for (const [, entries] of response) {
        for (const [, fields] of entries) {
          const jobFieldIndex = fields.findIndex((value) => value === 'job');
          if (jobFieldIndex >= 0) {
            jobs.push(JSON.parse(fields[jobFieldIndex + 1] ?? '{}') as AgentJob);
          }
        }
      }
      return jobs;
    },

    async ackAgentJob(consumerGroup, streamId) {
      await redis.xack(AGENT_JOBS_STREAM, consumerGroup, streamId);
    },

    async subscribeRoomEvents(onEvent) {
      const channel = 'mas:room-events:pubsub';
      const handler = (_channel: string, payload: string) => {
        onEvent(JSON.parse(payload) as RoomEvent);
      };
      subscriber.on('message', handler);
      await subscriber.subscribe(channel);
      return async () => {
        subscriber.off('message', handler);
        await subscriber.unsubscribe(channel);
      };
    },

    async close() {
      redis.disconnect();
      subscriber.disconnect();
    },
  };
}
```

- [ ] **Step 4: Export event-bus API**

Create `packages/event-bus/src/index.ts`:

```ts
export * from './redisEventBus.js';
```

- [ ] **Step 5: Build event-bus package**

Run:

```powershell
pnpm --filter @multi-agent-assi/event-bus build
```

Expected: PASS.

- [ ] **Step 6: Commit event bus**

Use the development-continuity skill before commit. Then run:

```powershell
git add packages/event-bus
git commit -m "feat: add redis event bus"
```

## Task 5: Room Hub Package

**Files:**
- Create: `packages/room-hub/package.json`
- Create: `packages/room-hub/tsconfig.json`
- Create: `packages/room-hub/src/index.ts`
- Create: `packages/room-hub/src/createRoomHub.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/room-hub/package.json`:

```json
{
  "name": "@multi-agent-assi/room-hub",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@multi-agent-assi/event-bus": "workspace:*",
    "@multi-agent-assi/persistence": "workspace:*",
    "@multi-agent-assi/shared": "workspace:*"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `packages/room-hub/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Implement Room Hub**

Create `packages/room-hub/src/createRoomHub.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentId, AgentJob, InvocationRecord, MessageRecord, SubmitMessageInput } from '@multi-agent-assi/shared';

export interface RoomHub {
  submitMessage(input: SubmitMessageInput): Promise<{ message: MessageRecord; invocations: InvocationRecord[] }>;
  listMessages(threadId: string): Promise<MessageRecord[]>;
}

function resolveTargets(input: SubmitMessageInput): AgentId[] {
  if (input.target.mode === 'mention') return input.target.agentIds;
  if (input.target.mode === 'broadcast') return ['architect', 'reviewer', 'implementer'];
  return ['architect', 'reviewer'];
}

export function createRoomHub(deps: { repositories: PersistenceRepositories; eventBus: EventBus }): RoomHub {
  return {
    async submitMessage(input) {
      const now = Date.now();
      const message: MessageRecord = {
        id: randomUUID(),
        roomId: input.roomId,
        threadId: input.threadId,
        kind: 'user_message',
        sender: { type: 'user', userId: input.userId, source: input.source },
        body: input.body,
        createdAt: now,
      };
      deps.repositories.appendMessage(message);
      await deps.eventBus.publishRoomEvent({
        type: 'message.created',
        roomId: input.roomId,
        threadId: input.threadId,
        message,
        occurredAt: now,
      });

      const invocations: InvocationRecord[] = [];
      for (const agentId of resolveTargets(input)) {
        const invocation: InvocationRecord = {
          id: randomUUID(),
          roomId: input.roomId,
          threadId: input.threadId,
          sourceMessageId: message.id,
          agentId,
          status: 'queued',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        deps.repositories.createInvocation(invocation);
        invocations.push(invocation);
        const job: AgentJob = {
          invocationId: invocation.id,
          roomId: input.roomId,
          threadId: input.threadId,
          sourceMessageId: message.id,
          agentId,
          prompt: input.body,
        };
        await deps.eventBus.enqueueAgentJob(job);
        await deps.eventBus.publishRoomEvent({
          type: 'invocation.queued',
          roomId: input.roomId,
          threadId: input.threadId,
          invocation,
          occurredAt: Date.now(),
        });
      }

      return { message, invocations };
    },

    async listMessages(threadId) {
      return deps.repositories.listMessages(threadId);
    },
  };
}
```

- [ ] **Step 4: Export Room Hub API**

Create `packages/room-hub/src/index.ts`:

```ts
export * from './createRoomHub.js';
```

- [ ] **Step 5: Build Room Hub**

Run:

```powershell
pnpm --filter @multi-agent-assi/room-hub build
```

Expected: PASS.

- [ ] **Step 6: Commit Room Hub**

Use the development-continuity skill before commit. Then run:

```powershell
git add packages/room-hub
git commit -m "feat: add room hub message path"
```

## Task 6: Mock Agent Runtime

**Files:**
- Create: `packages/agent-runtime/package.json`
- Create: `packages/agent-runtime/tsconfig.json`
- Create: `packages/agent-runtime/src/index.ts`
- Create: `packages/agent-runtime/src/mockAgentWorker.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/agent-runtime/package.json`:

```json
{
  "name": "@multi-agent-assi/agent-runtime",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@multi-agent-assi/event-bus": "workspace:*",
    "@multi-agent-assi/persistence": "workspace:*",
    "@multi-agent-assi/shared": "workspace:*"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `packages/agent-runtime/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Implement mock worker**

Create `packages/agent-runtime/src/mockAgentWorker.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { MessageRecord } from '@multi-agent-assi/shared';

export interface MockAgentWorker {
  start(): void;
  stop(): void;
}

export function createMockAgentWorker(deps: {
  repositories: PersistenceRepositories;
  eventBus: EventBus;
  pollIntervalMs?: number;
}): MockAgentWorker {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function tick(): Promise<void> {
    if (stopped) return;
    const jobs = await deps.eventBus.readAgentJobs('mock-agent-workers', `worker-${process.pid}`, 100);
    for (const job of jobs) {
      deps.repositories.updateInvocationStatus(job.invocationId, 'running');
      await deps.eventBus.publishRoomEvent({
        type: 'invocation.running',
        roomId: job.roomId,
        threadId: job.threadId,
        invocationId: job.invocationId,
        occurredAt: Date.now(),
      });
      const body = `[${job.agentId}] received: ${job.prompt}`;
      await deps.eventBus.publishRoomEvent({
        type: 'agent.delta',
        roomId: job.roomId,
        threadId: job.threadId,
        invocationId: job.invocationId,
        agentId: job.agentId,
        delta: body,
        occurredAt: Date.now(),
      });
      const message: MessageRecord = {
        id: randomUUID(),
        roomId: job.roomId,
        threadId: job.threadId,
        kind: 'agent_message',
        sender: { type: 'agent', agentId: job.agentId },
        body,
        invocationId: job.invocationId,
        createdAt: Date.now(),
      };
      deps.repositories.appendMessage(message);
      deps.repositories.updateInvocationStatus(job.invocationId, 'succeeded');
      await deps.eventBus.publishRoomEvent({
        type: 'invocation.completed',
        roomId: job.roomId,
        threadId: job.threadId,
        invocationId: job.invocationId,
        message,
        occurredAt: Date.now(),
      });
    }
    timer = setTimeout(() => void tick(), deps.pollIntervalMs ?? 250);
  }

  return {
    start() {
      stopped = false;
      void tick();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
  };
}
```

- [ ] **Step 4: Export runtime API**

Create `packages/agent-runtime/src/index.ts`:

```ts
export * from './mockAgentWorker.js';
```

- [ ] **Step 5: Build agent-runtime**

Run:

```powershell
pnpm --filter @multi-agent-assi/agent-runtime build
```

Expected: PASS.

- [ ] **Step 6: Commit mock runtime**

Use the development-continuity skill before commit. Then run:

```powershell
git add packages/agent-runtime
git commit -m "feat: add mock agent runtime"
```

## Task 7: Host API And WebSocket Broadcaster

**Files:**
- Create: `apps/host/package.json`
- Create: `apps/host/tsconfig.json`
- Create: `apps/host/src/index.ts`
- Create: `apps/host/src/createServer.ts`

- [ ] **Step 1: Create host package manifest**

Create `apps/host/package.json`:

```json
{
  "name": "@multi-agent-assi/host",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.0",
    "@fastify/websocket": "^10.0.0",
    "@multi-agent-assi/agent-runtime": "workspace:*",
    "@multi-agent-assi/event-bus": "workspace:*",
    "@multi-agent-assi/persistence": "workspace:*",
    "@multi-agent-assi/room-hub": "workspace:*",
    "@multi-agent-assi/shared": "workspace:*",
    "fastify": "^4.25.0"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `apps/host/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Implement host server**

Create `apps/host/src/createServer.ts`:

```ts
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { RoomHub } from '@multi-agent-assi/room-hub';
import { submitMessageSchema } from '@multi-agent-assi/shared';

export function createServer(deps: {
  repositories: PersistenceRepositories;
  roomHub: RoomHub;
  eventBus: EventBus;
}) {
  const app = Fastify({ logger: true });

  void app.register(cors, { origin: true });
  void app.register(websocket);

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/bootstrap', async () => ({
    agents: deps.repositories.listAgents(),
    messages: deps.repositories.listMessages('default-thread'),
  }));

  app.post('/api/messages', async (request, reply) => {
    const parsed = submitMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const result = await deps.roomHub.submitMessage(parsed.data);
    return reply.code(202).send(result);
  });

  app.get('/ws', { websocket: true }, (connection) => {
    const unsubscribePromise = deps.eventBus.subscribeRoomEvents((event) => {
      connection.socket.send(JSON.stringify(event));
    });
    connection.socket.on('close', () => {
      void unsubscribePromise.then((unsubscribe) => unsubscribe());
    });
  });

  return app;
}
```

- [ ] **Step 4: Implement host entrypoint**

Create `apps/host/src/index.ts`:

```ts
import { createMockAgentWorker } from '@multi-agent-assi/agent-runtime';
import { createRedisEventBus } from '@multi-agent-assi/event-bus';
import { createDatabase, createRepositories } from '@multi-agent-assi/persistence';
import { createRoomHub } from '@multi-agent-assi/room-hub';
import { createServer } from './createServer.js';

const port = Number(process.env.HOST_PORT ?? 4317);
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const sqlitePath = process.env.SQLITE_PATH ?? '.data/multi-agent-assi.sqlite';

const db = createDatabase(sqlitePath);
const repositories = createRepositories(db);
repositories.ensureDefaultState();

const eventBus = createRedisEventBus(redisUrl);
const roomHub = createRoomHub({ repositories, eventBus });
const worker = createMockAgentWorker({ repositories, eventBus });
worker.start();

const app = createServer({ repositories, roomHub, eventBus });

await app.listen({ host: '127.0.0.1', port });
console.log(`Host listening on http://127.0.0.1:${port}`);
```

- [ ] **Step 5: Build host**

Run:

```powershell
pnpm --filter @multi-agent-assi/host build
```

Expected: PASS.

- [ ] **Step 6: Start Redis and host**

Run:

```powershell
pnpm redis:up
pnpm dev:host
```

Expected: host logs `Host listening on http://127.0.0.1:4317`.

- [ ] **Step 7: Verify health endpoint**

Run in a second shell:

```powershell
Invoke-RestMethod http://127.0.0.1:4317/api/health
```

Expected:

```text
ok
--
True
```

- [ ] **Step 8: Commit host**

Use the development-continuity skill before commit. Then run:

```powershell
git add apps/host
git commit -m "feat: add host api and websocket"
```

## Task 8: Web Console

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/styles.css`

- [ ] **Step 1: Create web package manifest**

Create `apps/web/package.json`:

```json
{
  "name": "@multi-agent-assi/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 5173",
    "build": "vite build"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "vite": "^6.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.12",
    "@types/react-dom": "^19.0.4"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create HTML entry**

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Multi-Codex Room</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create API helpers**

Create `apps/web/src/api.ts`:

```ts
const HOST_URL = 'http://127.0.0.1:4317';

export interface UiMessage {
  id: string;
  kind: string;
  body: string;
  sender: { type: string; userId?: string; agentId?: string };
}

export async function loadBootstrap(): Promise<{ agents: Array<{ id: string; displayName: string; status: string }>; messages: UiMessage[] }> {
  const response = await fetch(`${HOST_URL}/api/bootstrap`);
  if (!response.ok) throw new Error(`Bootstrap failed: ${response.status}`);
  return response.json();
}

export async function submitMessage(body: string): Promise<void> {
  const response = await fetch(`${HOST_URL}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      roomId: 'default-room',
      threadId: 'default-thread',
      userId: 'local-user',
      source: 'web',
      body,
      target: { mode: 'broadcast' },
      idempotencyKey: crypto.randomUUID(),
    }),
  });
  if (!response.ok) throw new Error(`Submit failed: ${response.status}`);
}

export function connectEvents(onEvent: (event: unknown) => void): WebSocket {
  const socket = new WebSocket('ws://127.0.0.1:4317/ws');
  socket.addEventListener('message', (message) => onEvent(JSON.parse(message.data)));
  return socket;
}
```

- [ ] **Step 5: Create React app**

Create `apps/web/src/App.tsx`:

```tsx
import { FormEvent, useEffect, useState } from 'react';
import { connectEvents, loadBootstrap, submitMessage, type UiMessage } from './api';
import './styles.css';

interface Agent {
  id: string;
  displayName: string;
  status: string;
}

export function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBootstrap()
      .then((data) => {
        setAgents(data.agents);
        setMessages(data.messages);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));

    const socket = connectEvents((event) => {
      const e = event as { type?: string; message?: UiMessage };
      if ((e.type === 'message.created' || e.type === 'invocation.completed') && e.message) {
        setMessages((current) => {
          if (current.some((message) => message.id === e.message?.id)) return current;
          return [...current, e.message];
        });
      }
    });
    return () => socket.close();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    try {
      await submitMessage(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <h1>Multi-Codex Room</h1>
        <section>
          <h2>Agents</h2>
          {agents.map((agent) => (
            <div className="agent" key={agent.id}>
              <strong>{agent.displayName}</strong>
              <span>{agent.status}</span>
            </div>
          ))}
        </section>
      </aside>

      <section className="timeline">
        {error ? <div className="error">{error}</div> : null}
        {messages.map((message) => (
          <article className={`message ${message.sender.type}`} key={message.id}>
            <header>{message.sender.agentId ?? message.sender.userId ?? message.sender.type}</header>
            <p>{message.body}</p>
          </article>
        ))}
        <form className="composer" onSubmit={onSubmit}>
          <textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button type="submit">Send</button>
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Create React entry**

Create `apps/web/src/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 7: Create basic styling**

Create `apps/web/src/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f6f7f9;
  color: #17202a;
}

.shell {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid #d9dee7;
  background: #ffffff;
  padding: 20px;
}

.sidebar h1 {
  font-size: 20px;
  margin: 0 0 24px;
}

.sidebar h2 {
  font-size: 13px;
  color: #5e6b7a;
  text-transform: uppercase;
}

.agent {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #edf0f4;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  padding-bottom: 160px;
}

.message {
  max-width: 880px;
  border: 1px solid #dce2ea;
  border-radius: 8px;
  background: #ffffff;
  padding: 14px 16px;
}

.message header {
  color: #5e6b7a;
  font-size: 13px;
  margin-bottom: 8px;
}

.message p {
  margin: 0;
  white-space: pre-wrap;
}

.error {
  border: 1px solid #f1b9b9;
  border-radius: 8px;
  background: #fff1f1;
  color: #9f1d1d;
  padding: 12px;
}

.composer {
  position: fixed;
  left: 280px;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 96px;
  gap: 12px;
  border-top: 1px solid #d9dee7;
  background: #ffffff;
  padding: 16px 24px;
}

.composer textarea {
  min-height: 72px;
  resize: vertical;
  border: 1px solid #c9d1dc;
  border-radius: 8px;
  padding: 12px;
  font: inherit;
}

.composer button {
  border: 0;
  border-radius: 8px;
  background: #1f6feb;
  color: #ffffff;
  font: inherit;
  font-weight: 650;
}
```

- [ ] **Step 8: Build web app**

Run:

```powershell
pnpm --filter @multi-agent-assi/web build
```

Expected: PASS.

- [ ] **Step 9: Run full local skeleton**

Run:

```powershell
pnpm redis:up
pnpm dev
```

Expected:

- Host listens on `http://127.0.0.1:4317`.
- Web listens on `http://127.0.0.1:5173`.
- Sending a message from the Web UI creates one user message and three mock agent responses.

- [ ] **Step 10: Commit Web Console**

Use the development-continuity skill before commit. Then run:

```powershell
git add apps/web
git commit -m "feat: add local web console"
```

## Task 9: Integration Test For Main Architecture Path

**Files:**
- Create: `tests/integration/architecture-skeleton.test.ts`

- [ ] **Step 1: Create integration test**

Create `tests/integration/architecture-skeleton.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMockAgentWorker } from '@multi-agent-assi/agent-runtime';
import { createRedisEventBus } from '@multi-agent-assi/event-bus';
import { createDatabase, createRepositories } from '@multi-agent-assi/persistence';
import { createRoomHub } from '@multi-agent-assi/room-hub';

describe('architecture skeleton', () => {
  it('routes a web message through room hub, redis queue, mock runtime, and sqlite persistence', async () => {
    const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    const eventBus = createRedisEventBus(redisUrl);
    const db = createDatabase(':memory:');
    const repositories = createRepositories(db);
    repositories.ensureDefaultState();
    const roomHub = createRoomHub({ repositories, eventBus });
    const worker = createMockAgentWorker({ repositories, eventBus, pollIntervalMs: 25 });
    worker.start();

    await roomHub.submitMessage({
      roomId: 'default-room',
      threadId: 'default-thread',
      userId: 'test-user',
      source: 'web',
      body: 'Design a safer round protocol',
      target: { mode: 'mention', agentIds: ['architect'] },
      idempotencyKey: 'test-key-architecture-skeleton',
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    worker.stop();
    await eventBus.close();

    const messages = repositories.listMessages('default-thread');
    expect(messages.some((message) => message.sender.type === 'user')).toBe(true);
    expect(messages.some((message) => message.sender.type === 'agent' && message.sender.agentId === 'architect')).toBe(true);
  });
});
```

- [ ] **Step 2: Run Redis and integration test**

Run:

```powershell
pnpm redis:up
pnpm test -- tests/integration/architecture-skeleton.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full build**

Run:

```powershell
pnpm build
```

Expected: PASS across all packages/apps.

- [ ] **Step 4: Commit integration test**

Use the development-continuity skill before commit. Then run:

```powershell
git add tests/integration/architecture-skeleton.test.ts
git commit -m "test: cover architecture skeleton path"
```

## Task 10: Final Verification And Handoff

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README with verified skeleton behavior**

Append to `README.md`:

```md
## Architecture Skeleton v1

Verified behavior:

- Web submits a message to Host API.
- Room Hub persists the user message to SQLite.
- Room Hub enqueues agent jobs through Redis.
- Mock Agent Runtime consumes Redis jobs.
- Mock agent output is published through Redis events.
- Host WebSocket pushes events to Web Console.
- Agent messages are persisted to SQLite.

This is the main path for future Codex and Feishu work. Do not bypass it for feature demos.
```

- [ ] **Step 2: Run final verification**

Run:

```powershell
pnpm redis:up
pnpm build
pnpm test -- tests/integration/architecture-skeleton.test.ts
```

Expected:

- Build passes.
- Integration test passes.

- [ ] **Step 3: Commit final documentation**

Use the development-continuity skill before commit. Then run:

```powershell
git add README.md
git commit -m "docs: document architecture skeleton workflow"
```

## Self-Review

### Spec Coverage

- Host-centered architecture: Tasks 1, 7, 8.
- Shared protocol: Task 2.
- SQLite durable truth: Task 3.
- Redis runtime coordination: Task 4.
- Room Hub canonical input path: Task 5.
- Agent Runtime and mock worker: Task 6.
- WebSocket event return path: Task 7.
- Web Console first client: Task 8.
- Architecture-path verification: Task 9.
- Traceable commits using development-continuity: every commit step explicitly requires it.

### Red Flag Scan

The plan contains no unresolved-marker or incomplete implementation steps. Deferred items are explicit non-scope items from the design spec.

### Type Consistency

The same names are used across tasks:

- `SubmitMessageInput`
- `MessageRecord`
- `InvocationRecord`
- `RoomEvent`
- `AgentJob`
- `createRedisEventBus`
- `createRepositories`
- `createRoomHub`
- `createMockAgentWorker`

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-architecture-skeleton-v1.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
