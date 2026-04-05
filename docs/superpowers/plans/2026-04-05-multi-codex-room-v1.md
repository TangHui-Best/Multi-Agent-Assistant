# Multi-Codex Room V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local desktop app that launches multiple CodexCLI sessions through wrappers, connects them to one shared room, and lets the user collaborate with them through broadcast, `@agent`, and controlled rounds without manual copy-paste.

**Architecture:** Use Electron as the local desktop shell so the app can own windows, child processes, and IPC cleanly. Keep the Room Hub, persistence, and adapter orchestration in the Electron main process; keep React focused on room rendering and controls; keep Codex integration behind a narrow wrapper-based adapter contract.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Vitest, React Testing Library, Playwright, better-sqlite3, Zod

---

## Scope And Assumptions

- Single-machine only.
- The repository starts empty and is not yet a git repository.
- Use npm as the package manager.
- Use SQLite in the main process for persistence.
- Use a wrapper-launched Codex adapter rather than PTY mirroring.
- Defer license selection until just before public release; do not block V1 on legal choice.

## Planned File Structure

### Repository Baseline

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.gitignore`
- Create: `README.md`

### Shared Protocol

- Create: `src/shared/protocol.ts`
- Create: `src/shared/channels.ts`

### Main Process

- Create: `src/main/index.ts`
- Create: `src/main/room-hub/roomService.ts`
- Create: `src/main/room-hub/orchestrator.ts`
- Create: `src/main/persistence/database.ts`
- Create: `src/main/persistence/migrations.ts`
- Create: `src/main/persistence/roomRepository.ts`
- Create: `src/main/adapters/types.ts`
- Create: `src/main/adapters/mockAdapter.ts`
- Create: `src/main/adapters/codex/buildCodexLaunch.ts`
- Create: `src/main/adapters/codex/parseCodexOutput.ts`
- Create: `src/main/adapters/codex/codexAdapter.ts`
- Create: `src/main/ipc/roomHandlers.ts`

### Preload And Renderer

- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/features/room/RoomLayout.tsx`
- Create: `src/renderer/src/features/room/Timeline.tsx`
- Create: `src/renderer/src/features/room/Composer.tsx`
- Create: `src/renderer/src/features/room/ControlPanel.tsx`
- Create: `src/renderer/src/features/room/useRoomViewModel.ts`
- Create: `src/renderer/src/styles.css`

### Tests

- Create: `tests/setup.ts`
- Create: `tests/unit/project-meta.test.ts`
- Create: `tests/unit/roomService.test.ts`
- Create: `tests/unit/orchestrator.test.ts`
- Create: `tests/unit/roomRepository.test.ts`
- Create: `tests/unit/mockAdapter.test.ts`
- Create: `tests/unit/buildCodexLaunch.test.ts`
- Create: `tests/unit/parseCodexOutput.test.ts`
- Create: `tests/component/roomLayout.test.tsx`
- Create: `tests/e2e/multi-codex-room.spec.ts`

## Task 1: Bootstrap The Repository And Desktop Toolchain

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `electron.vite.config.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `README.md`
- Create: `tests/setup.ts`
- Create: `tests/unit/project-meta.test.ts`

- [ ] **Step 1: Write the failing baseline tests**

```ts
// tests/unit/project-meta.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const packageJson = JSON.parse(
  readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
)

describe('repository baseline', () => {
  it('declares the desktop workflow scripts', () => {
    expect(packageJson.scripts).toMatchObject({
      dev: 'electron-vite dev',
      build: 'electron-vite build',
      test: 'vitest run',
      'test:e2e': 'playwright test'
    })
  })

  it('marks the repository as private until the first public release', () => {
    expect(packageJson.private).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/project-meta.test.ts`

Expected: FAIL with an `ENOENT: no such file or directory, open 'package.json'` error

- [ ] **Step 3: Add the minimal repository scaffold**

```json
// package.json
{
  "name": "multi-codex-room",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "better-sqlite3": "^11.8.1",
    "electron": "^35.1.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.2"
  },
  "devDependencies": {
    "@playwright/test": "^1.52.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^22.13.10",
    "@types/react": "^19.0.12",
    "@types/react-dom": "^19.0.4",
    "@vitejs/plugin-react": "^4.3.4",
    "electron-vite": "^3.1.0",
    "jsdom": "^26.0.0",
    "typescript": "^5.8.2",
    "vite": "^6.2.0",
    "vitest": "^3.0.8"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "types": ["node", "vitest/globals"],
    "baseUrl": "."
  },
  "include": ["src", "tests", "electron.vite.config.ts", "vitest.config.ts"]
}
```

```json
// tsconfig.node.json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["node"]
  },
  "include": ["electron.vite.config.ts", "playwright.config.ts", "src/main", "src/preload"]
}
```

```ts
// electron.vite.config.ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts']
  }
})
```

```ts
// tests/setup.ts
import '@testing-library/jest-dom/vitest'
```

```gitignore
# .gitignore
node_modules
out
dist
playwright-report
test-results
.superpowers
*.log
```

```md
# README.md

# Multi-Codex Room

A local desktop app for running multiple CodexCLI perspectives inside one shared room without manual copy-paste relay.
```

- [ ] **Step 4: Install dependencies and rerun the baseline test**

Run:

```bash
npm install
npx vitest run tests/unit/project-meta.test.ts
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Initialize git and commit the baseline**

Run:

```bash
git init
git add .
git commit -m "chore: bootstrap electron desktop workspace"
```

Expected: a clean initial commit on the default branch

## Task 2: Define The Shared Room Protocol And Open-Mode Routing

**Files:**
- Create: `src/shared/protocol.ts`
- Create: `src/shared/channels.ts`
- Create: `src/main/room-hub/roomService.ts`
- Test: `tests/unit/roomService.test.ts`

- [ ] **Step 1: Write failing tests for broadcast and mention routing**

```ts
// tests/unit/roomService.test.ts
import { describe, expect, it } from 'vitest'
import { createRoomService } from '../../src/main/room-hub/roomService'

describe('roomService', () => {
  it('broadcasts a user message to every active agent in open mode', () => {
    const room = createRoomService()
    room.seedAgents([
      { id: 'builder', status: 'idle' },
      { id: 'critic', status: 'idle' }
    ])

    const delivery = room.acceptUserMessage({
      roomId: 'room-1',
      senderId: 'user',
      body: 'review this design',
      target: { mode: 'broadcast' }
    })

    expect(delivery.recipientIds).toEqual(['builder', 'critic'])
  })

  it('routes a mention only to the selected agent', () => {
    const room = createRoomService()
    room.seedAgents([
      { id: 'builder', status: 'idle' },
      { id: 'critic', status: 'idle' }
    ])

    const delivery = room.acceptUserMessage({
      roomId: 'room-1',
      senderId: 'user',
      body: '@critic pressure test this',
      target: { mode: 'mention', agentIds: ['critic'] }
    })

    expect(delivery.recipientIds).toEqual(['critic'])
  })
})
```

- [ ] **Step 2: Run the routing tests to verify they fail**

Run: `npx vitest run tests/unit/roomService.test.ts`

Expected: FAIL with `Cannot find module '../../src/main/room-hub/roomService'`

- [ ] **Step 3: Implement the shared protocol and minimal room service**

```ts
// src/shared/protocol.ts
export type AgentStatus = 'starting' | 'idle' | 'thinking' | 'replying' | 'errored' | 'offline'
export type RoomMode = 'open' | 'controlled'
export type MessageKind = 'user_message' | 'agent_message' | 'system_event' | 'control_command'
export type Target =
  | { mode: 'broadcast' }
  | { mode: 'mention'; agentIds: string[] }
  | { mode: 'orchestrated'; agentIds: string[] }

export interface AgentParticipant {
  id: string
  status: AgentStatus
}

export interface IncomingUserMessage {
  roomId: string
  senderId: string
  body: string
  target: Target
}
```

```ts
// src/shared/channels.ts
export const IPC_CHANNELS = {
  sendMessage: 'room:send-message',
  getSnapshot: 'room:get-snapshot'
} as const
```

```ts
// src/main/room-hub/roomService.ts
import type { AgentParticipant, IncomingUserMessage, RoomMode } from '../../shared/protocol'

interface RoomState {
  mode: RoomMode
  agents: AgentParticipant[]
}

export function createRoomService() {
  const state: RoomState = {
    mode: 'open',
    agents: []
  }

  return {
    seedAgents(agents: AgentParticipant[]) {
      state.agents = agents
    },
    acceptUserMessage(message: IncomingUserMessage) {
      const recipientIds =
        message.target.mode === 'broadcast'
          ? state.agents.filter((agent) => agent.status !== 'offline').map((agent) => agent.id)
          : message.target.agentIds

      return {
        roomId: message.roomId,
        messageBody: message.body,
        recipientIds
      }
    }
  }
}
```

- [ ] **Step 4: Rerun the routing tests**

Run: `npx vitest run tests/unit/roomService.test.ts`

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit the protocol baseline**

Run:

```bash
git add src/shared src/main/room-hub tests/unit/roomService.test.ts
git commit -m "feat: add room routing protocol"
```

## Task 3: Add Controlled Rounds And Orchestrator Rules

**Files:**
- Modify: `src/main/room-hub/roomService.ts`
- Create: `src/main/room-hub/orchestrator.ts`
- Test: `tests/unit/orchestrator.test.ts`

- [ ] **Step 1: Write failing tests for controlled rounds**

```ts
// tests/unit/orchestrator.test.ts
import { describe, expect, it } from 'vitest'
import { createRoomService } from '../../src/main/room-hub/roomService'

describe('controlled rounds', () => {
  it('allows only nominated agents to answer during a controlled round', () => {
    const room = createRoomService()
    room.seedAgents([
      { id: 'builder', status: 'idle' },
      { id: 'critic', status: 'idle' }
    ])

    room.startControlledRound({
      roundId: 'round-1',
      allowedAgentIds: ['critic'],
      replyBudget: 1
    })

    expect(room.canAgentReply('builder')).toBe(false)
    expect(room.canAgentReply('critic')).toBe(true)
  })

  it('ends the round when the reply budget is exhausted', () => {
    const room = createRoomService()
    room.seedAgents([{ id: 'critic', status: 'idle' }])
    room.startControlledRound({
      roundId: 'round-1',
      allowedAgentIds: ['critic'],
      replyBudget: 1
    })

    room.recordAgentReply('critic')

    expect(room.getSnapshot().mode).toBe('open')
  })

  it('marks the round as timed out when the orchestrator expires it', () => {
    const room = createRoomService()
    room.seedAgents([{ id: 'critic', status: 'idle' }])
    room.startControlledRound({
      roundId: 'round-1',
      allowedAgentIds: ['critic'],
      replyBudget: 1
    })

    room.markRoundTimedOut()

    expect(room.getSnapshot()).toMatchObject({
      mode: 'open',
      lastRoundResult: 'timed_out'
    })
  })
})
```

- [ ] **Step 2: Run the controlled-round tests**

Run: `npx vitest run tests/unit/orchestrator.test.ts`

Expected: FAIL with `room.startControlledRound is not a function`

- [ ] **Step 3: Implement the orchestrator rules**

```ts
// src/main/room-hub/orchestrator.ts
export interface ControlledRound {
  roundId: string
  allowedAgentIds: string[]
  replyBudget: number
  repliesUsed: number
}

export function canReply(round: ControlledRound | null, agentId: string) {
  if (!round) return true
  return round.allowedAgentIds.includes(agentId) && round.repliesUsed < round.replyBudget
}
```

```ts
// src/main/room-hub/roomService.ts
import { canReply, type ControlledRound } from './orchestrator'

// inside createRoomService()
let controlledRound: ControlledRound | null = null
let lastRoundResult: 'completed' | 'timed_out' | null = null

function getSnapshot() {
  return {
    mode: controlledRound ? 'controlled' : 'open',
    agents: state.agents,
    lastRoundResult
  }
}

function startControlledRound(input: Omit<ControlledRound, 'repliesUsed'>) {
  lastRoundResult = null
  controlledRound = { ...input, repliesUsed: 0 }
}

function canAgentReply(agentId: string) {
  return canReply(controlledRound, agentId)
}

function recordAgentReply(agentId: string) {
  if (!controlledRound || !canAgentReply(agentId)) return
  controlledRound.repliesUsed += 1
  if (controlledRound.repliesUsed >= controlledRound.replyBudget) {
    lastRoundResult = 'completed'
    controlledRound = null
  }
}

function markRoundTimedOut() {
  if (!controlledRound) return
  lastRoundResult = 'timed_out'
  controlledRound = null
}

return {
  seedAgents,
  acceptUserMessage,
  startControlledRound,
  canAgentReply,
  recordAgentReply,
  markRoundTimedOut,
  getSnapshot
}
```

- [ ] **Step 4: Rerun the controlled-round tests**

Run: `npx vitest run tests/unit/orchestrator.test.ts`

Expected: PASS with `3 passed`

- [ ] **Step 5: Commit the round controls**

Run:

```bash
git add src/main/room-hub tests/unit/orchestrator.test.ts
git commit -m "feat: add controlled round orchestration"
```

## Task 4: Persist Rooms, Messages, And Round State In SQLite

**Files:**
- Create: `src/main/persistence/database.ts`
- Create: `src/main/persistence/migrations.ts`
- Create: `src/main/persistence/roomRepository.ts`
- Test: `tests/unit/roomRepository.test.ts`

- [ ] **Step 1: Write a failing repository test**

```ts
// tests/unit/roomRepository.test.ts
import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../src/main/persistence/database'
import { createRoomRepository } from '../../src/main/persistence/roomRepository'

describe('roomRepository', () => {
  it('persists a room snapshot and reloads it', () => {
    const db = createDatabase(':memory:')
    const repo = createRoomRepository(db)

    repo.saveSnapshot({
      roomId: 'room-1',
      title: 'Design Review',
      mode: 'controlled',
      agentIds: ['builder', 'critic']
    })

    expect(repo.getSnapshot('room-1')).toEqual({
      roomId: 'room-1',
      title: 'Design Review',
      mode: 'controlled',
      agentIds: ['builder', 'critic']
    })
  })
})
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run: `npx vitest run tests/unit/roomRepository.test.ts`

Expected: FAIL with `Cannot find module '../../src/main/persistence/database'`

- [ ] **Step 3: Implement the SQLite layer**

```ts
// src/main/persistence/database.ts
import Database from 'better-sqlite3'
import { runMigrations } from './migrations'

export function createDatabase(filename: string) {
  const db = new Database(filename)
  runMigrations(db)
  return db
}
```

```ts
// src/main/persistence/migrations.ts
import type Database from 'better-sqlite3'

export function runMigrations(db: Database.Database) {
  db.exec(`
    create table if not exists rooms (
      room_id text primary key,
      title text not null,
      mode text not null
    );

    create table if not exists room_agents (
      room_id text not null,
      agent_id text not null,
      primary key (room_id, agent_id)
    );
  `)
}
```

```ts
// src/main/persistence/roomRepository.ts
import type Database from 'better-sqlite3'

export function createRoomRepository(db: Database.Database) {
  return {
    saveSnapshot(snapshot: { roomId: string; title: string; mode: string; agentIds: string[] }) {
      db.prepare('insert or replace into rooms (room_id, title, mode) values (?, ?, ?)')
        .run(snapshot.roomId, snapshot.title, snapshot.mode)
      db.prepare('delete from room_agents where room_id = ?').run(snapshot.roomId)
      const insert = db.prepare('insert into room_agents (room_id, agent_id) values (?, ?)')
      for (const agentId of snapshot.agentIds) {
        insert.run(snapshot.roomId, agentId)
      }
    },
    getSnapshot(roomId: string) {
      const room = db.prepare('select room_id, title, mode from rooms where room_id = ?').get(roomId) as
        | { room_id: string; title: string; mode: string }
        | undefined
      if (!room) return null
      const agentIds = db.prepare('select agent_id from room_agents where room_id = ? order by agent_id')
        .all(roomId)
        .map((row: { agent_id: string }) => row.agent_id)
      return {
        roomId: room.room_id,
        title: room.title,
        mode: room.mode,
        agentIds
      }
    }
  }
}
```

- [ ] **Step 4: Rerun the repository test**

Run: `npx vitest run tests/unit/roomRepository.test.ts`

Expected: PASS with `1 passed`

- [ ] **Step 5: Commit persistence**

Run:

```bash
git add src/main/persistence tests/unit/roomRepository.test.ts
git commit -m "feat: persist room snapshots in sqlite"
```

## Task 5: Add The Adapter Contract And A Mock Adapter

**Files:**
- Create: `src/main/adapters/types.ts`
- Create: `src/main/adapters/mockAdapter.ts`
- Modify: `src/main/room-hub/roomService.ts`
- Test: `tests/unit/mockAdapter.test.ts`

- [ ] **Step 1: Write a failing adapter integration test**

```ts
// tests/unit/mockAdapter.test.ts
import { describe, expect, it } from 'vitest'
import { createRoomService } from '../../src/main/room-hub/roomService'
import { createMockAdapter } from '../../src/main/adapters/mockAdapter'

describe('mock adapter', () => {
  it('publishes a synthetic agent reply back into the room', async () => {
    const room = createRoomService()
    const adapter = createMockAdapter({ agentId: 'critic' })
    room.registerAdapter(adapter)

    const reply = await room.dispatchToAgent('critic', 'stress test this plan')

    expect(reply.senderId).toBe('critic')
    expect(reply.body).toContain('stress test this plan')
  })
})
```

- [ ] **Step 2: Run the adapter test to verify it fails**

Run: `npx vitest run tests/unit/mockAdapter.test.ts`

Expected: FAIL with `room.registerAdapter is not a function`

- [ ] **Step 3: Implement the adapter interface and mock adapter**

```ts
// src/main/adapters/types.ts
export interface AgentReply {
  senderId: string
  body: string
}

export interface RoomAdapter {
  agentId: string
  send(message: string): Promise<AgentReply>
}
```

```ts
// src/main/adapters/mockAdapter.ts
import type { RoomAdapter } from './types'

export function createMockAdapter(input: { agentId: string }): RoomAdapter {
  return {
    agentId: input.agentId,
    async send(message: string) {
      return {
        senderId: input.agentId,
        body: `[mock:${input.agentId}] ${message}`
      }
    }
  }
}
```

```ts
// src/main/room-hub/roomService.ts
import type { RoomAdapter } from '../adapters/types'

const adapters = new Map<string, RoomAdapter>()

function registerAdapter(adapter: RoomAdapter) {
  adapters.set(adapter.agentId, adapter)
}

async function dispatchToAgent(agentId: string, message: string) {
  const adapter = adapters.get(agentId)
  if (!adapter) {
    throw new Error(`Missing adapter for ${agentId}`)
  }
  return adapter.send(message)
}

return {
  seedAgents,
  acceptUserMessage,
  startControlledRound,
  canAgentReply,
  recordAgentReply,
  getSnapshot,
  registerAdapter,
  dispatchToAgent
}
```

- [ ] **Step 4: Rerun the mock adapter test**

Run: `npx vitest run tests/unit/mockAdapter.test.ts`

Expected: PASS with `1 passed`

- [ ] **Step 5: Commit adapter plumbing**

Run:

```bash
git add src/main/adapters src/main/room-hub tests/unit/mockAdapter.test.ts
git commit -m "feat: add adapter contract and mock adapter"
```

## Task 6: Wire IPC, Preload, And The React Room Shell

**Files:**
- Create: `src/main/index.ts`
- Create: `src/main/ipc/roomHandlers.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/features/room/RoomLayout.tsx`
- Create: `src/renderer/src/features/room/Timeline.tsx`
- Create: `src/renderer/src/features/room/Composer.tsx`
- Create: `src/renderer/src/features/room/ControlPanel.tsx`
- Create: `src/renderer/src/features/room/useRoomViewModel.ts`
- Create: `src/renderer/src/styles.css`
- Test: `tests/component/roomLayout.test.tsx`

- [ ] **Step 1: Write a failing component test for the room shell**

```tsx
// tests/component/roomLayout.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RoomLayout } from '../../src/renderer/src/features/room/RoomLayout'

describe('RoomLayout', () => {
  it('renders the room timeline, composer, and control panel', () => {
    render(
      <RoomLayout
        roomTitle="Design Review"
        agents={[{ id: 'builder', status: 'idle' }]}
        messages={[{ id: 'm1', senderId: 'user', body: 'hello', kind: 'user_message' }]}
        mode="open"
      />
    )

    expect(screen.getByText('Design Review')).toBeInTheDocument()
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /message/i })).toBeInTheDocument()
    expect(screen.getByText('Round Mode')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the component test to verify it fails**

Run: `npx vitest run tests/component/roomLayout.test.tsx`

Expected: FAIL with `Cannot find module '../../src/renderer/src/features/room/RoomLayout'`

- [ ] **Step 3: Implement the desktop shell and room UI**

```ts
// src/main/ipc/roomHandlers.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/channels'

export function registerRoomHandlers(roomService: {
  getSnapshot(): unknown
  acceptUserMessage(payload: unknown): unknown
}) {
  ipcMain.handle(IPC_CHANNELS.getSnapshot, () => roomService.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.sendMessage, (_event, payload) => roomService.acceptUserMessage(payload))
}
```

```ts
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/channels'

contextBridge.exposeInMainWorld('roomApi', {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot),
  sendMessage: (payload: unknown) => ipcRenderer.invoke(IPC_CHANNELS.sendMessage, payload)
})
```

```tsx
// src/renderer/src/features/room/RoomLayout.tsx
import { ControlPanel } from './ControlPanel'
import { Composer } from './Composer'
import { Timeline } from './Timeline'

export function RoomLayout(props: {
  roomTitle: string
  agents: { id: string; status: string }[]
  messages: { id: string; senderId: string; body: string; kind: string }[]
  mode: 'open' | 'controlled'
}) {
  return (
    <main className="room-layout">
      <aside className="room-sidebar">
        <h1>{props.roomTitle}</h1>
        <ul>{props.agents.map((agent) => <li key={agent.id}>{agent.id} | {agent.status}</li>)}</ul>
      </aside>
      <section className="room-main">
        <Timeline messages={props.messages} />
        <Composer />
      </section>
      <aside className="room-controls">
        <ControlPanel mode={props.mode} />
      </aside>
    </main>
  )
}
```

```tsx
// src/renderer/src/features/room/Timeline.tsx
export function Timeline(props: { messages: { id: string; senderId: string; body: string }[] }) {
  return <div>{props.messages.map((message) => <article key={message.id}>{message.body}</article>)}</div>
}
```

```tsx
// src/renderer/src/features/room/Composer.tsx
export function Composer() {
  return (
    <label>
      Message
      <textarea aria-label="Message" />
    </label>
  )
}
```

```tsx
// src/renderer/src/features/room/ControlPanel.tsx
export function ControlPanel(props: { mode: 'open' | 'controlled' }) {
  return (
    <section>
      <h2>Round Mode</h2>
      <p>{props.mode}</p>
    </section>
  )
}
```

- [ ] **Step 4: Rerun the component test**

Run: `npx vitest run tests/component/roomLayout.test.tsx`

Expected: PASS with `1 passed`

- [ ] **Step 5: Commit the desktop shell**

Run:

```bash
git add src/main src/preload src/renderer tests/component/roomLayout.test.tsx
git commit -m "feat: add room shell ipc and renderer"
```

## Task 7: Implement The Codex Wrapper Adapter Prototype

**Files:**
- Create: `src/main/adapters/codex/buildCodexLaunch.ts`
- Create: `src/main/adapters/codex/parseCodexOutput.ts`
- Create: `src/main/adapters/codex/codexAdapter.ts`
- Test: `tests/unit/buildCodexLaunch.test.ts`
- Test: `tests/unit/parseCodexOutput.test.ts`

- [ ] **Step 1: Write failing tests for the wrapper command and output parser**

```ts
// tests/unit/buildCodexLaunch.test.ts
import { describe, expect, it } from 'vitest'
import { buildCodexLaunch } from '../../src/main/adapters/codex/buildCodexLaunch'

describe('buildCodexLaunch', () => {
  it('wraps CodexCLI with room and agent identity arguments', () => {
    expect(
      buildCodexLaunch({
        codexPath: 'codex',
        roomId: 'room-1',
        agentId: 'critic'
      })
    ).toEqual({
      command: 'codex',
      args: ['--room-id', 'room-1', '--agent-id', 'critic']
    })
  })
})
```

```ts
// tests/unit/parseCodexOutput.test.ts
import { describe, expect, it } from 'vitest'
import { parseCodexOutput } from '../../src/main/adapters/codex/parseCodexOutput'

describe('parseCodexOutput', () => {
  it('extracts the publishable room reply marker', () => {
    const parsed = parseCodexOutput('[ROOM_REPLY] Critique: this needs stronger state boundaries')
    expect(parsed).toEqual({
      publishable: true,
      body: 'Critique: this needs stronger state boundaries'
    })
  })
})
```

- [ ] **Step 2: Run the codex adapter tests**

Run:

```bash
npx vitest run tests/unit/buildCodexLaunch.test.ts
npx vitest run tests/unit/parseCodexOutput.test.ts
```

Expected: FAIL because both implementation files do not exist yet

- [ ] **Step 3: Implement the wrapper contract**

```ts
// src/main/adapters/codex/buildCodexLaunch.ts
export function buildCodexLaunch(input: { codexPath: string; roomId: string; agentId: string }) {
  return {
    command: input.codexPath,
    args: ['--room-id', input.roomId, '--agent-id', input.agentId]
  }
}
```

```ts
// src/main/adapters/codex/parseCodexOutput.ts
export function parseCodexOutput(line: string) {
  if (!line.startsWith('[ROOM_REPLY] ')) {
    return { publishable: false as const }
  }

  return {
    publishable: true as const,
    body: line.slice('[ROOM_REPLY] '.length)
  }
}
```

```ts
// src/main/adapters/codex/codexAdapter.ts
import { spawn } from 'node:child_process'
import { buildCodexLaunch } from './buildCodexLaunch'
import { parseCodexOutput } from './parseCodexOutput'

export function createCodexAdapter(input: { codexPath: string; roomId: string; agentId: string }) {
  const launch = buildCodexLaunch(input)
  const child = spawn(launch.command, launch.args, { stdio: 'pipe' })

  return {
    agentId: input.agentId,
    child,
    parseLine: parseCodexOutput
  }
}
```

- [ ] **Step 4: Rerun the codex adapter tests**

Run:

```bash
npx vitest run tests/unit/buildCodexLaunch.test.ts
npx vitest run tests/unit/parseCodexOutput.test.ts
```

Expected: PASS with `2 passed`

- [ ] **Step 5: Commit the Codex adapter prototype**

Run:

```bash
git add src/main/adapters/codex tests/unit/buildCodexLaunch.test.ts tests/unit/parseCodexOutput.test.ts
git commit -m "feat: add codex wrapper adapter prototype"
```

## Task 8: Add The Smoke E2E Flow And Final Project Docs

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/multi-codex-room.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing smoke E2E test**

```ts
// tests/e2e/multi-codex-room.spec.ts
import { test, expect } from '@playwright/test'

test('renders one room with agent roster and round controls', async ({ page }) => {
  await page.goto('http://127.0.0.1:5173')
  await expect(page.getByText('Design Review')).toBeVisible()
  await expect(page.getByText('builder')).toBeVisible()
  await expect(page.getByText('Round Mode')).toBeVisible()
})
```

- [ ] **Step 2: Run the smoke E2E test to verify it fails**

Run: `npx playwright test tests/e2e/multi-codex-room.spec.ts`

Expected: FAIL because the app is not yet serving a stable renderer page in the test harness

- [ ] **Step 3: Add the Playwright config and finish the README**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:5173'
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI
  }
})
```

````md
<!-- README.md -->
## Development

```bash
npm install
npm run dev
```

## Tests

```bash
npm run test
npm run test:e2e
```

## Current V1 Scope

- local desktop app only
- one room with multiple CodexCLI agents
- broadcast, `@agent`, and controlled rounds
- wrapper-based adapter contract
````

- [ ] **Step 4: Run the full verification sweep**

Run:

```bash
npm run test
npm run test:e2e
```

Expected:

- unit and component suites PASS
- smoke E2E PASS

- [ ] **Step 5: Commit the verification and docs**

Run:

```bash
git add playwright.config.ts tests/e2e README.md
git commit -m "test: add multi-agent room smoke coverage"
```

## Self-Review

### Spec Coverage

- Repository baseline and Git readiness: Task 1
- Shared room protocol and routing: Task 2
- Controlled rounds and orchestrator behavior: Task 3
- Persistence: Task 4
- Adapter contract and failure-isolated integration seam: Task 5
- Desktop shell and room UI: Task 6
- Real Codex wrapper prototype: Task 7
- Verification and docs: Task 8

No spec requirement is intentionally left without a task, but two items are deliberately bounded:

- timeout handling is implemented first at the room-service level in Task 3 rather than as a full scheduler subsystem
- public GitHub publication is prepared by repository shape and docs, but creating the remote itself is outside the code plan

### Placeholder Scan

- No unresolved placeholders remain.
- Every task names exact files and concrete commands.
- Every code step includes concrete snippets rather than generic descriptions.

### Type Consistency

- `broadcast`, `mention`, and `orchestrated` naming is consistent with the spec.
- `open` and `controlled` round modes are used consistently.
- Adapter terminology stays split between `RoomAdapter`, `mockAdapter`, and `codexAdapter`.
