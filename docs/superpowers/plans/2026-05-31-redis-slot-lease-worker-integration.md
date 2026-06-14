# Redis Slot Lease Worker Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing Redis-backed agent slot lease contract into `AgentWorker` without losing stream jobs when a lease is unavailable.

**Architecture:** `AgentWorker` checks canceled invocations before lease acquisition, acquires a Redis owner lease before running an adapter, acks only processed or already-canceled jobs, and releases the owner lease in `finally`. `RedisEventBus.readAgentJobs` first replays current-consumer pending jobs and claims stale pending jobs before reading new stream entries, so lease-denied jobs remain recoverable.

**Tech Stack:** TypeScript, Vitest, Redis Streams through `ioredis`, existing Event Bus and Agent Runtime modules.

---

### Task 1: Event Bus Pending Recovery

**Files:**
- Modify: `packages/event-bus/src/redisEventBus.ts`
- Modify: `packages/event-bus/test/redisEventBus.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests proving `readAgentJobs` returns current-consumer pending entries before new entries and can parse stale entries claimed with `XAUTOCLAIM`.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm.cmd exec vitest run packages/event-bus/test/redisEventBus.test.ts`

Expected: FAIL because `readAgentJobs` only reads `>` entries and never calls `XAUTOCLAIM`.

- [ ] **Step 3: Implement minimal Event Bus recovery**

Refactor Redis stream entry parsing into a helper, then have `readAgentJobs`:

1. `XREADGROUP ... STREAMS mas:agent-jobs 0` to replay this consumer's pending entries.
2. `XAUTOCLAIM mas:agent-jobs <group> <consumer> 30000 0-0 COUNT 10` to claim stale pending entries.
3. Existing blocking `XREADGROUP ... STREAMS mas:agent-jobs >` for new jobs only when no pending work was returned.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm.cmd exec vitest run packages/event-bus/test/redisEventBus.test.ts`

Expected: PASS.

### Task 2: Agent Worker Lease Guard

**Files:**
- Modify: `packages/agent-runtime/src/agentWorker.ts`
- Modify: `packages/agent-runtime/test/agentWorker.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests proving:

1. A lease-denied active invocation is not run and not acked.
2. Already-canceled queued jobs are acked without requiring a lease.
3. A successfully acquired lease is released after success and after failure.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm.cmd exec vitest run packages/agent-runtime/test/agentWorker.test.ts`

Expected: FAIL because current worker does not consult the Redis lease APIs.

- [ ] **Step 3: Implement minimal lease guard**

Add `slotLeaseTtlMs` and a stable `workerId`. In `processJobGroup`, check canceled status before lease acquisition, acquire `eventBus.acquireAgentSlotLease(agentId, workerId, slotLeaseTtlMs)`, skip ack when acquisition fails, run exactly one job under the lease, and release with `releaseAgentSlotLease` in `finally`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm.cmd exec vitest run packages/agent-runtime/test/agentWorker.test.ts`

Expected: PASS.

### Task 3: Evidence And Verification

**Files:**
- Modify: `docs/features/F001-equal-room-host-core.md`
- Modify or create: `docs/evidence/EV-010-redis-slot-lease-worker-integration.md`

- [ ] **Step 1: Record evidence**

Create EV-010 with scope, commands, verification results, residual risks, rollback path, and touched artifacts.

- [ ] **Step 2: Update feature links**

Link EV-010 from F001 and update the Redis runtime coordination note to mention worker-level lease integration.

- [ ] **Step 3: Run final verification**

Run:

```text
pnpm.cmd build
pnpm.cmd test
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
python -m unittest tests.test_public_hygiene
$paths = @(git ls-files) + @(git ls-files --others --exclude-standard); python scripts\public_hygiene.py --root . @paths
```

Expected: all pass.
