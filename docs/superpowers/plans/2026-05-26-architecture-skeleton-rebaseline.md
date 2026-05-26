# Architecture Skeleton Rebaseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first non-bypass Equal-Room Host skeleton on the project-owned path: Web Console -> Host API -> Room Hub -> SQLite -> Redis Event Bus / Queue -> mock Agent Runtime -> Event Bus -> WebSocket -> Web Console.

**Architecture:** This plan supersedes the execution path in `docs/superpowers/plans/2026-05-01-architecture-skeleton-v1.md`. It keeps the final Room Hub, Persistence, Event Bus, Agent Runtime, Runtime Adapter, Orchestration, and Connector Interface boundaries from F001/F002, while using a mock agent runtime before real Codex CLI wiring. Codex CLI remains the first runtime binding target, but no Phase 1 code may hard-code the core model as Codex-only.

**Tech Stack:** Node.js 20+, pnpm, TypeScript, Vitest, Fastify, WebSocket, better-sqlite3, ioredis, Vite, React.

---

## Source Anchors

- Feature: `docs/features/F001-equal-room-host-core.md`
- Feature: `docs/features/F002-reference-architecture-adoption.md`
- ADR: `docs/decisions/ADR-001-reference-architecture-adoption-boundary.md`
- Evidence: `docs/evidence/EV-001-local-reference-runtime-validation.md`
- Evidence: `docs/evidence/EV-002-architecture-mapping.md`
- Legacy plan superseded for execution: `docs/superpowers/plans/2026-05-01-architecture-skeleton-v1.md`

## Scope

This plan implements the Phase 1 architecture skeleton only. It does not implement real Codex CLI process management, Feishu, Claude Code, OpenCode, Gemini CLI, voice, games, model marketplace, or autonomous long-running agent loops.

The skeleton must prove that a user message enters Room Hub, becomes persisted SQLite state, creates invocation jobs through Redis, is handled by a mock Agent Runtime, returns normalized events through Redis/WebSocket, and persists agent messages back to SQLite.

## File Structure

- Root tooling: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`, `README.md`
- Shared contracts: `packages/shared/src/protocol.ts`, `packages/shared/src/schemas.ts`, `packages/shared/src/index.ts`
- Persistence: `packages/persistence/src/database.ts`, `packages/persistence/src/migrations.ts`, `packages/persistence/src/repositories.ts`
- Event Bus: `packages/event-bus/src/eventBus.ts`, `packages/event-bus/src/redisEventBus.ts`, `packages/event-bus/src/index.ts`
- Room Hub: `packages/room-hub/src/createRoomHub.ts`, `packages/room-hub/src/targeting.ts`, `packages/room-hub/src/index.ts`
- Agent Runtime: `packages/agent-runtime/src/mockAgentWorker.ts`, `packages/agent-runtime/src/index.ts`
- Host API: `apps/host/src/createServer.ts`, `apps/host/src/index.ts`
- Web Console: `apps/web/src/api.ts`, `apps/web/src/App.tsx`, `apps/web/src/main.tsx`, `apps/web/src/styles.css`, `apps/web/index.html`
- Tests: package-local `*.test.ts` files plus `tests/integration/architecture-skeleton.test.ts`
- Evidence after execution: new `docs/evidence/EV-007-architecture-skeleton-local.md`

## Commit Slices

Use one commit per verified slice:

1. `chore: scaffold phase one workspace`
2. `feat: define shared room protocol`
3. `feat: add sqlite persistence repositories`
4. `feat: add redis event bus`
5. `feat: route messages through room hub`
6. `feat: add mock agent runtime`
7. `feat: expose host api and websocket`
8. `feat: add local web console`
9. `test: cover architecture skeleton path`
10. `docs: record architecture skeleton evidence`

## Task 1: Workspace And Tooling Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Create root package manifest**

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

- [ ] **Step 4: Create Redis compose service**

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

- [ ] **Step 5: Create local env example**

Create `.env.example`:

```dotenv
HOST_PORT=4317
WEB_PORT=5173
REDIS_URL=redis://127.0.0.1:6379
SQLITE_PATH=.data/multi-agent-assi.sqlite
```

- [ ] **Step 6: Update README with skeleton boundary**

Append to `README.md`:

```md
## Phase 1 Architecture Skeleton

The first executable spine is:

`Web Console -> Host API -> Room Hub -> SQLite -> Redis Event Bus / Queue -> mock Agent Runtime -> Redis Event Bus -> WebSocket -> Web Console`.

Redis is runtime coordination. SQLite is durable truth. The mock agent runtime exists only to prove the main path before Codex CLI adapter work begins.
```

- [ ] **Step 7: Install dependencies**

Run:

```powershell
pnpm install
```

Expected: dependencies install and `pnpm-lock.yaml` is created.

- [ ] **Step 8: Verify baseline commands**

Run:

```powershell
pnpm build
```

Expected: command exits successfully after package scaffolds exist in later tasks. Before packages exist, this step may report no matched workspace builds; do not commit a failing command.

- [ ] **Step 9: Commit workspace scaffold**

Run:

```powershell
git add package.json pnpm-workspace.yaml tsconfig.base.json docker-compose.yml .env.example README.md pnpm-lock.yaml
git commit -m "chore: scaffold phase one workspace"
```

## Task 2: Shared Protocol Package

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/protocol.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/protocol.test.ts`

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
    "test": "vitest run src"
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

- [ ] **Step 3: Write failing schema tests**

Create `packages/shared/src/protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { submitMessageSchema } from './schemas.js';

describe('submitMessageSchema', () => {
  it('accepts a web mention routed through Room Hub', () => {
    const result = submitMessageSchema.safeParse({
      roomId: 'default-room',
      threadId: 'default-thread',
      userId: 'local-user',
      source: 'web',
      body: '@architect map the boundary',
      target: { mode: 'mention', agentIds: ['architect'] },
      idempotencyKey: 'idem-123456',
    });

    expect(result.success).toBe(true);
  });

  it('rejects empty target mentions', () => {
    const result = submitMessageSchema.safeParse({
      roomId: 'default-room',
      threadId: 'default-thread',
      userId: 'local-user',
      source: 'web',
      body: 'hello',
      target: { mode: 'mention', agentIds: [] },
      idempotencyKey: 'idem-123456',
    });

    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests and verify they fail**

Run:

```powershell
pnpm --filter @multi-agent-assi/shared test
```

Expected: FAIL because `schemas.ts` does not exist yet.

- [ ] **Step 5: Define protocol types**

Create `packages/shared/src/protocol.ts`:

```ts
export type RoomId = string;
export type ThreadId = string;
export type MessageId = string;
export type AgentId = string;
export type InvocationId = string;

export type RuntimeKind = 'codex-cli' | 'claude-code' | 'opencode' | 'gemini-cli' | 'mock';

export interface RuntimeBinding {
  kind: RuntimeKind;
  profile: string;
}

export type MessageSender =
  | { type: 'user'; userId: string; source: 'web' | 'connector' }
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

export interface AgentSeat {
  id: AgentId;
  displayName: string;
  role: 'architect' | 'reviewer' | 'implementer' | 'custom';
  runtime: RuntimeBinding;
}

export type Target =
  | { mode: 'broadcast' }
  | { mode: 'mention'; agentIds: AgentId[] }
  | { mode: 'orchestrated'; workflow: 'design_review_execute' };

export interface SubmitMessageInput {
  roomId: RoomId;
  threadId: ThreadId;
  userId: string;
  source: 'web' | 'connector';
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
  | { type: 'invocation.running'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; agentId: AgentId; occurredAt: number }
  | { type: 'agent.delta'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; agentId: AgentId; delta: string; occurredAt: number }
  | { type: 'invocation.completed'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; message: MessageRecord; occurredAt: number }
  | { type: 'invocation.failed'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; agentId: AgentId; error: string; occurredAt: number };

export interface AgentJob {
  invocationId: InvocationId;
  roomId: RoomId;
  threadId: ThreadId;
  sourceMessageId: MessageId;
  agentId: AgentId;
  prompt: string;
}
```

- [ ] **Step 6: Define Zod schemas**

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
  source: z.enum(['web', 'connector']),
  body: z.string().min(1).max(20000),
  target: targetSchema,
  idempotencyKey: z.string().min(8),
});
```

- [ ] **Step 7: Export package API**

Create `packages/shared/src/index.ts`:

```ts
export * from './protocol.js';
export * from './schemas.js';
```

- [ ] **Step 8: Verify shared package**

Run:

```powershell
pnpm --filter @multi-agent-assi/shared test
pnpm --filter @multi-agent-assi/shared build
```

Expected: tests pass and build exits successfully.

- [ ] **Step 9: Commit shared protocol**

Run:

```powershell
git add packages/shared
git commit -m "feat: define shared room protocol"
```

## Task 3: SQLite Persistence Package

**Files:**
- Create: `packages/persistence/package.json`
- Create: `packages/persistence/tsconfig.json`
- Create: `packages/persistence/src/database.ts`
- Create: `packages/persistence/src/migrations.ts`
- Create: `packages/persistence/src/repositories.ts`
- Create: `packages/persistence/src/repositories.test.ts`
- Create: `packages/persistence/src/index.ts`

- [ ] **Step 1: Write repository tests first**

Create `packages/persistence/src/repositories.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createDatabase } from './database.js';
import { createRepositories } from './repositories.js';

describe('persistence repositories', () => {
  it('seeds default equal-room agent seats with mock runtime bindings', () => {
    const db = createDatabase(':memory:');
    const repositories = createRepositories(db);

    repositories.ensureDefaultState();

    expect(repositories.listAgents().map((agent) => agent.id)).toEqual(['architect', 'implementer', 'reviewer']);
    expect(repositories.listAgents().every((agent) => agent.runtime.kind === 'mock')).toBe(true);
  });

  it('persists messages and invocations as durable facts', () => {
    const db = createDatabase(':memory:');
    const repositories = createRepositories(db);
    repositories.ensureDefaultState();

    repositories.appendMessage({
      id: 'msg-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      kind: 'user_message',
      sender: { type: 'user', userId: 'local-user', source: 'web' },
      body: 'hello',
      createdAt: 1,
    });
    repositories.createInvocation({
      id: 'inv-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'msg-1',
      agentId: 'architect',
      status: 'queued',
      createdAt: 2,
      updatedAt: 2,
    });

    expect(repositories.listMessages('default-thread')).toHaveLength(1);
    expect(repositories.getInvocation('inv-1')?.status).toBe('queued');
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
pnpm --filter @multi-agent-assi/persistence test
```

Expected: FAIL because package files do not exist yet.

- [ ] **Step 3: Implement package manifest and repository code**

Create the package using `better-sqlite3`, JSON columns for sender/runtime binding, and repository methods:

```ts
export interface PersistenceRepositories {
  ensureDefaultState(): void;
  appendMessage(message: MessageRecord): void;
  listMessages(threadId: string): MessageRecord[];
  createInvocation(invocation: InvocationRecord): void;
  updateInvocationStatus(id: string, status: InvocationRecord['status'], error?: string): void;
  getInvocation(id: string): InvocationRecord | null;
  listAgents(): AgentSeat[];
}
```

The default seats must be `architect`, `reviewer`, and `implementer`, each with `{ kind: 'mock', profile: '<agent-id>' }` for Phase 1.

- [ ] **Step 4: Verify persistence**

Run:

```powershell
pnpm --filter @multi-agent-assi/persistence test
pnpm --filter @multi-agent-assi/persistence build
```

Expected: tests pass and build exits successfully.

- [ ] **Step 5: Commit persistence**

Run:

```powershell
git add packages/persistence
git commit -m "feat: add sqlite persistence repositories"
```

## Task 4: Redis Event Bus Package

**Files:**
- Create: `packages/event-bus/package.json`
- Create: `packages/event-bus/tsconfig.json`
- Create: `packages/event-bus/src/eventBus.ts`
- Create: `packages/event-bus/src/redisEventBus.ts`
- Create: `packages/event-bus/src/index.ts`

- [ ] **Step 1: Define the EventBus interface**

Create `packages/event-bus/src/eventBus.ts`:

```ts
import type { AgentJob, RoomEvent } from '@multi-agent-assi/shared';

export interface EventBus {
  publishRoomEvent(event: RoomEvent): Promise<void>;
  subscribeRoomEvents(handler: (event: RoomEvent) => void): Promise<() => Promise<void>>;
  enqueueAgentJob(job: AgentJob): Promise<void>;
  readAgentJobs(group: string, consumer: string, blockMs: number): Promise<AgentJob[]>;
  close(): Promise<void>;
}
```

- [ ] **Step 2: Implement Redis streams and pub/sub**

Implement `packages/event-bus/src/redisEventBus.ts` with:

- stream key `mas:room-events`
- pub/sub channel `mas:room-events:live`
- stream key `mas:agent-jobs`
- consumer group creation for agent workers
- JSON serialization for `RoomEvent` and `AgentJob`

- [ ] **Step 3: Verify Redis-backed integration manually**

Run:

```powershell
pnpm redis:up
pnpm --filter @multi-agent-assi/event-bus build
```

Expected: Redis starts and the package builds.

- [ ] **Step 4: Commit event bus**

Run:

```powershell
git add packages/event-bus
git commit -m "feat: add redis event bus"
```

## Task 5: Room Hub Package

**Files:**
- Create: `packages/room-hub/package.json`
- Create: `packages/room-hub/tsconfig.json`
- Create: `packages/room-hub/src/targeting.ts`
- Create: `packages/room-hub/src/createRoomHub.ts`
- Create: `packages/room-hub/src/createRoomHub.test.ts`
- Create: `packages/room-hub/src/index.ts`

- [ ] **Step 1: Write failing Room Hub test**

Create `packages/room-hub/src/createRoomHub.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDatabase, createRepositories } from '@multi-agent-assi/persistence';
import type { EventBus } from '@multi-agent-assi/event-bus';
import { createRoomHub } from './createRoomHub.js';

function createFakeEventBus(): EventBus & { jobs: unknown[]; events: unknown[] } {
  return {
    jobs: [],
    events: [],
    async publishRoomEvent(event) {
      this.events.push(event);
    },
    async subscribeRoomEvents() {
      return async () => undefined;
    },
    async enqueueAgentJob(job) {
      this.jobs.push(job);
    },
    async readAgentJobs() {
      return [];
    },
    async close() {
      return undefined;
    },
  };
}

describe('Room Hub', () => {
  it('persists a user message and creates invocations for mentioned agents', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T00:00:00Z'));
    const repositories = createRepositories(createDatabase(':memory:'));
    repositories.ensureDefaultState();
    const eventBus = createFakeEventBus();
    const roomHub = createRoomHub({ repositories, eventBus });

    const result = await roomHub.submitMessage({
      roomId: 'default-room',
      threadId: 'default-thread',
      userId: 'local-user',
      source: 'web',
      body: '@architect review boundary',
      target: { mode: 'mention', agentIds: ['architect'] },
      idempotencyKey: 'idem-123456',
    });

    expect(result.invocations).toHaveLength(1);
    expect(repositories.listMessages('default-thread')).toHaveLength(1);
    expect(eventBus.jobs).toHaveLength(1);
    expect(eventBus.events.map((event) => (event as { type: string }).type)).toContain('message.created');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
pnpm --filter @multi-agent-assi/room-hub test
```

Expected: FAIL because `createRoomHub.ts` does not exist yet.

- [ ] **Step 3: Implement target resolution**

Create `packages/room-hub/src/targeting.ts` so:

- `mention` targets return the named agent ids.
- `broadcast` returns all agent ids from `repositories.listAgents()`.
- `orchestrated` returns `['architect']` for Phase 1 and leaves workflow policy expansion to a later orchestration slice.

- [ ] **Step 4: Implement Room Hub**

Create `packages/room-hub/src/createRoomHub.ts` with `submitMessage(input)` that:

- validates through `submitMessageSchema`
- writes one user `MessageRecord`
- publishes `message.created`
- creates one `InvocationRecord` per target agent
- persists each invocation as `queued`
- publishes `invocation.queued`
- enqueues one `AgentJob` per invocation

- [ ] **Step 5: Verify Room Hub**

Run:

```powershell
pnpm --filter @multi-agent-assi/room-hub test
pnpm --filter @multi-agent-assi/room-hub build
```

Expected: tests pass and build exits successfully.

- [ ] **Step 6: Commit Room Hub**

Run:

```powershell
git add packages/room-hub
git commit -m "feat: route messages through room hub"
```

## Task 6: Mock Agent Runtime

**Files:**
- Create: `packages/agent-runtime/package.json`
- Create: `packages/agent-runtime/tsconfig.json`
- Create: `packages/agent-runtime/src/mockAgentWorker.ts`
- Create: `packages/agent-runtime/src/index.ts`

- [ ] **Step 1: Implement mock worker**

Create `createMockAgentWorker({ repositories, eventBus, pollIntervalMs })` that:

- reads Redis jobs through `eventBus.readAgentJobs`
- marks invocation `running`
- publishes `invocation.running`
- publishes one `agent.delta`
- persists an agent message body `[<agentId>] received: <prompt>`
- marks invocation `succeeded`
- publishes `invocation.completed`
- isolates failures by marking only the current invocation `failed`

- [ ] **Step 2: Verify package build**

Run:

```powershell
pnpm --filter @multi-agent-assi/agent-runtime build
```

Expected: build exits successfully.

- [ ] **Step 3: Commit mock runtime**

Run:

```powershell
git add packages/agent-runtime
git commit -m "feat: add mock agent runtime"
```

## Task 7: Host API And WebSocket

**Files:**
- Create: `apps/host/package.json`
- Create: `apps/host/tsconfig.json`
- Create: `apps/host/src/createServer.ts`
- Create: `apps/host/src/index.ts`

- [ ] **Step 1: Implement Host API**

Create Fastify endpoints:

- `GET /api/health` returns `{ ok: true }`
- `GET /api/bootstrap` returns default agents and default-thread messages
- `POST /api/messages` validates with `submitMessageSchema` and calls Room Hub
- `GET /ws` streams `RoomEvent` payloads from Event Bus

- [ ] **Step 2: Implement host entrypoint**

Create `apps/host/src/index.ts` that opens SQLite, creates repositories, ensures default state, connects Redis Event Bus, creates Room Hub, starts mock worker, and listens on `127.0.0.1:${HOST_PORT}`.

- [ ] **Step 3: Verify host build and health**

Run:

```powershell
pnpm --filter @multi-agent-assi/host build
pnpm redis:up
pnpm dev:host
```

In another shell:

```powershell
Invoke-RestMethod http://127.0.0.1:4317/api/health
```

Expected: response contains `ok : True`.

- [ ] **Step 4: Commit host**

Run:

```powershell
git add apps/host
git commit -m "feat: expose host api and websocket"
```

## Task 8: Web Console

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/styles.css`

- [ ] **Step 1: Create a work-focused Web Console**

Build a local UI with:

- left roster for `architect`, `reviewer`, `implementer`
- central timeline
- composer that posts to `/api/messages`
- WebSocket event listener that appends `message.created` and `invocation.completed`

Use neutral product language: room, thread, members, seats, task, review. Do not introduce external product identity or pet metaphors.

- [ ] **Step 2: Verify web build**

Run:

```powershell
pnpm --filter @multi-agent-assi/web build
```

Expected: Vite build exits successfully.

- [ ] **Step 3: Manual local check**

Run:

```powershell
pnpm redis:up
pnpm dev
```

Open `http://127.0.0.1:5173`, send `@architect review the boundary`, and confirm the timeline receives a user message plus mock agent response through WebSocket.

- [ ] **Step 4: Commit Web Console**

Run:

```powershell
git add apps/web
git commit -m "feat: add local web console"
```

## Task 9: Integration Test For Main Path

**Files:**
- Create: `tests/integration/architecture-skeleton.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/architecture-skeleton.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
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
      idempotencyKey: 'idem-integration-123456',
    });

    await new Promise((resolve) => setTimeout(resolve, 300));
    worker.stop();
    await eventBus.close();

    const messages = repositories.listMessages('default-thread');
    expect(messages.some((message) => message.sender.type === 'user')).toBe(true);
    expect(messages.some((message) => message.sender.type === 'agent' && message.sender.agentId === 'architect')).toBe(true);
    expect(repositories.getInvocation(messages.find((message) => message.sender.type === 'agent')?.invocationId ?? '')?.status).toBe('succeeded');
  });
});
```

- [ ] **Step 2: Run integration test**

Run:

```powershell
pnpm redis:up
pnpm test -- tests/integration/architecture-skeleton.test.ts
```

Expected: test passes.

- [ ] **Step 3: Run full build and test**

Run:

```powershell
pnpm build
pnpm test
```

Expected: build and test suite pass.

- [ ] **Step 4: Commit integration test**

Run:

```powershell
git add tests/integration/architecture-skeleton.test.ts
git commit -m "test: cover architecture skeleton path"
```

## Task 10: Evidence And Closeout

**Files:**
- Create: `docs/evidence/EV-007-architecture-skeleton-local.md`
- Modify: `docs/features/F001-equal-room-host-core.md`
- Modify: `docs/features/F002-reference-architecture-adoption.md`
- Modify: `README.md`

- [ ] **Step 1: Record local architecture skeleton evidence**

Create `docs/evidence/EV-007-architecture-skeleton-local.md` with:

- commands run
- build/test results
- manual Web Console check result
- Redis/SQLite responsibility statement
- known unverified Codex Adapter items

- [ ] **Step 2: Link evidence from F001 and F002**

Update:

- `docs/features/F001-equal-room-host-core.md`
- `docs/features/F002-reference-architecture-adoption.md`

Add a link to `docs/evidence/EV-007-architecture-skeleton-local.md` under `## Evidence`.

- [ ] **Step 3: Update README with verified behavior**

Append:

```md
## Verified Phase 1 Skeleton

- Web submits a message to Host API.
- Room Hub persists the user message to SQLite.
- Room Hub enqueues invocation jobs through Redis.
- Mock Agent Runtime consumes Redis jobs.
- Agent output returns through Redis room events and WebSocket.
- Agent messages persist to SQLite.
```

- [ ] **Step 4: Verify Harness, hygiene, build, and tests**

Run:

```powershell
python C:\Users\HUAWEI\.codex\skills-backup\harness-before-f31d980-20260526-113424\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
python -m unittest tests.test_public_hygiene
$paths = @(git ls-files) + @(git ls-files --others --exclude-standard); python scripts\public_hygiene.py --root . @paths
$env:PUBLIC_HYGIENE_FORBIDDEN_PATTERNS=('PH_' + [guid]::NewGuid().ToString('N')); $paths = @(git ls-files) + @(git ls-files --others --exclude-standard); python scripts\public_hygiene.py --root . --require-rules --require-env-rules --require-commit-range --commit-range origin/main..HEAD @paths
pnpm build
pnpm test
```

Expected: every command exits successfully.

- [ ] **Step 5: Commit evidence**

Run:

```powershell
git add docs/evidence/EV-007-architecture-skeleton-local.md docs/features/F001-equal-room-host-core.md docs/features/F002-reference-architecture-adoption.md README.md
git commit -m "docs: record architecture skeleton evidence"
```

## Self-Review

### Spec Coverage

- F001 Room Hub requirement: covered by Tasks 5, 7, and 9.
- F001 Event Bus requirement: covered by Tasks 4, 6, 7, and 9.
- F001 SQLite durable truth requirement: covered by Tasks 3, 5, 6, and 9.
- F001 runtime binding decoupling requirement: covered by Task 2 `RuntimeBinding` and Task 3 default mock runtime seats.
- F002 adoption order requirement: covered by Tasks 2 through 7 before Codex Adapter work.
- F002 public identity boundary: covered by Task 8 UI language and Task 10 public hygiene verification.
- F003 Public Hygiene requirement: covered by Task 10 verification.

### Placeholder Scan

This plan intentionally avoids source-specific private identifiers, copied private paths, raw logs, and public denylist contents. Every implementation task has file paths, commands, expected results, and commit boundaries.

### Type Consistency

The plan uses `AgentSeat`, `RuntimeBinding`, `SubmitMessageInput`, `MessageRecord`, `InvocationRecord`, `RoomEvent`, `AgentJob`, `EventBus`, `createRoomHub`, `createMockAgentWorker`, `createRepositories`, and `createRedisEventBus` consistently across tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-26-architecture-skeleton-rebaseline.md`.

Recommended execution mode for this repository is inline execution with checkpoints because the user explicitly requested not to create a worktree and has not authorized subagents for this step. If subagents are later authorized, split by package boundary and keep write ranges isolated.
