# Orchestration Recovery Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** implement the smallest recoverable Phase 3/4/5 runtime increment: cancellation, timeout contract, round persistence, session metadata, audit logs, and visible invocation status.

**Architecture:** Room Hub remains the command and orchestration entry point. Persistence owns durable facts for invocations, rounds, sessions, and audit logs; Redis remains runtime coordination for queue/events/leases/cancellation notifications. Agent Runtime receives cancellation and timeout through its adapter contract, while Web Console only displays persisted/evented state and calls Host APIs.

**Tech Stack:** TypeScript, Fastify, Vite/React, Vitest, SQLite via `better-sqlite3`, Redis via `ioredis`.

---

## Source Anchors

- Feature: `docs/features/F004-orchestration-recovery-hardening.md`
- Parent Feature: `docs/features/F001-equal-room-host-core.md`
- Architecture Feature: `docs/features/F002-reference-architecture-adoption.md`
- ADR: `docs/decisions/ADR-002-invocation-orchestration-recovery-contracts.md`
- Prior Evidence: `docs/evidence/EV-008-codex-adapter-slot-control.md`

## Non-Goals

- Do not implement Feishu, mobile, or other remote connectors in this slice.
- Do not create a second message path outside Room Hub -> Invocation/Round -> Event Bus -> Persistence.
- Do not make Web Console the owner of invocation, cancellation, round, or session state.
- Do not build a broad scheduler/provider platform before the equal-room runtime path needs it.

## Commit Slices

### Task 1: Harness Anchor

**Files:**
- Create: `docs/features/F004-orchestration-recovery-hardening.md`
- Create: `docs/decisions/ADR-002-invocation-orchestration-recovery-contracts.md`
- Create: `docs/superpowers/plans/2026-05-31-orchestration-recovery-hardening.md`

- [ ] Validate Harness docs with strict knowledge check.
- [ ] Commit as `docs: anchor orchestration recovery hardening`.
- [ ] Push the branch.

### Task 2: Cancellation And Timeout Contract

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/event-bus/src/redisEventBus.ts`
- Modify: `packages/room-hub/src/createRoomHub.ts`
- Modify: `packages/agent-runtime/src/agentWorker.ts`
- Modify: `packages/agent-runtime/src/codexCliAdapter.ts`
- Modify: `packages/persistence/src/repositories.ts`
- Modify: `apps/host/src/createServer.ts`
- Test: `packages/agent-runtime/test/agentWorker.test.ts`
- Test: `packages/agent-runtime/test/codexCliAdapter.test.ts`
- Test: `packages/room-hub/test/createRoomHub.test.ts`
- Test: `apps/host/test/createServer.test.ts`

- [ ] Write failing tests for cancellation marking only one invocation canceled, publishing a cancellation event, and preventing queued canceled jobs from running.
- [ ] Write failing tests proving adapter timeout surfaces a timeout failure and abort signal terminates the Codex process.
- [ ] Implement the minimal shared event/API/repository/worker changes.
- [ ] Run targeted tests, build, and relevant Harness/public hygiene checks.
- [ ] Commit as `feat: add invocation cancellation contract`.
- [ ] Push the branch.

### Task 3: Invocation Status In Web Console

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/App.test.ts`

- [ ] Write failing tests proving bootstrap and websocket events render invocation statuses.
- [ ] Store invocation state from bootstrap and room events in React state.
- [ ] Render member status without making Web the source of truth.
- [ ] Run web tests and build.
- [ ] Commit as `feat: show invocation status in console`.
- [ ] Push the branch.

### Task 4: Round Persistence And design_review_execute

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/persistence/src/migrations.ts`
- Modify: `packages/persistence/src/repositories.ts`
- Modify: `packages/room-hub/src/createRoomHub.ts`
- Test: `packages/persistence/test/repositories.test.ts`
- Test: `packages/room-hub/test/createRoomHub.test.ts`

- [ ] Write failing tests for persisted round creation and architect -> reviewer -> implementer step records.
- [ ] Implement `rounds` and `round_steps` persistence with status transitions.
- [ ] Make `target.mode = orchestrated` create a round and traceable invocation chain.
- [ ] Run targeted package tests and build.
- [ ] Commit as `feat: persist design review execute rounds`.
- [ ] Push the branch.

### Task 5: Session Metadata And Invocation Audit Log

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/persistence/src/migrations.ts`
- Modify: `packages/persistence/src/repositories.ts`
- Modify: `packages/agent-runtime/src/agentWorker.ts`
- Modify: `packages/agent-runtime/src/codexCliAdapter.ts`
- Test: `packages/persistence/test/repositories.test.ts`
- Test: `packages/agent-runtime/test/codexCliAdapter.test.ts`
- Test: `packages/agent-runtime/test/agentWorker.test.ts`

- [ ] Write failing tests for storing session id, resume metadata, and lifecycle audit entries.
- [ ] Capture Codex session id from tolerant JSONL parsing when present.
- [ ] Persist resume metadata on invocation completion or failure.
- [ ] Record audit entries for queued, running, succeeded, failed, canceled, timeout, and recovery metadata updates.
- [ ] Run targeted package tests and build.
- [ ] Commit as `feat: persist invocation recovery metadata`.
- [ ] Push the branch.

### Task 6: Redis Slot Lease Contract

**Files:**
- Modify: `packages/event-bus/src/redisEventBus.ts`
- Modify: `packages/agent-runtime/src/agentWorker.ts`
- Test: `packages/event-bus/test/redisEventBus.test.ts`
- Test: `packages/agent-runtime/test/agentWorker.test.ts`
- Docs: `docs/decisions/ADR-002-invocation-orchestration-recovery-contracts.md`

- [ ] Write failing tests for acquiring/releasing a slot lease and not processing a job when the lease is held.
- [ ] Implement the smallest Redis-backed lease API required by Agent Runtime, keeping in-process grouping as the fallback for tests/local operation.
- [ ] Run targeted Redis/event-bus and agent-runtime tests.
- [ ] Commit as `feat: add redis slot lease contract`.
- [ ] Push the branch.

### Task 7: Evidence And Closeout Dashboard

**Files:**
- Create: `docs/evidence/EV-009-orchestration-recovery-hardening.md`
- Modify: `docs/features/F004-orchestration-recovery-hardening.md`

- [ ] Run full verification: `pnpm.cmd build`, `pnpm.cmd test`, strict Harness knowledge check, and public hygiene tests.
- [ ] Record commands, results, residual risks, and recovery path in EV-009.
- [ ] Update F004 Evidence and status.
- [ ] Run strict Harness knowledge check again.
- [ ] Commit as `docs: record orchestration recovery evidence`.
- [ ] Push the branch.
