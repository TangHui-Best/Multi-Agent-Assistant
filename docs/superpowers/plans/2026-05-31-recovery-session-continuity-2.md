# Recovery / Session Continuity 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile persisted invocation and round state after Host restart before the worker starts polling jobs.

**Architecture:** Add a Room Hub recovery method that reads SQLite facts, uses existing F006 policy helpers to reconstruct prompts/continuations, and applies only deterministic recovery actions. Wire Host startup to run this method before Agent Worker start; Redis remains a queue target, not a fact source.

**Tech Stack:** TypeScript, Vitest, better-sqlite3 repositories, Redis Event Bus contract, pnpm workspaces.

---

## File Structure

- Modify `packages/room-hub/src/createRoomHub.ts`: add `recoverThreadContinuity(threadId)` and prompt reconstruction helpers.
- Modify `packages/room-hub/test/createRoomHub.test.ts`: unit tests for recovery decisions with mutable in-memory harness.
- Modify `packages/persistence/test/repositories.test.ts`: add real SQLite recovery-state regression tests if repository behavior needs coverage.
- Modify `apps/host/src/index.ts`: run recovery before `worker.start()`.
- Modify `apps/host/test/runtimeConfig.test.ts` or add a host startup helper test only if startup wiring is extracted.
- Create `docs/evidence/EV-013-recovery-session-continuity-2.md` during closeout.

## Task 1: Recovery Re-Enqueues Queued Work

- [x] Write failing Room Hub tests for queued mention invocation and queued architect step re-enqueue.
- [x] Run `pnpm.cmd exec vitest run packages/room-hub/test/createRoomHub.test.ts` and confirm RED.
- [x] Implement `recoverThreadContinuity(threadId)` with queued invocation prompt reconstruction and `enqueueAgentJob`.
- [x] Add audit entry `recovery.requeued` for recovered queued invocations.
- [x] Run focused tests and commit `feat: recover queued invocations on startup`.

## Task 2: Recovery Settles Stale Running Work

- [x] Write failing tests where a persisted `running` invocation remains after restart.
- [x] Assert recovery marks it failed, appends audit reason, publishes `invocation.failed`, and settles any linked round through existing policy convergence.
- [x] Run focused tests and confirm RED.
- [x] Implement stale running recovery.
- [x] Run focused tests and commit `feat: reconcile stale running invocations`.

## Task 3: Recovery Continues Or Settles Non-Terminal Rounds

- [x] Write failing tests for succeeded architect/reviewer/implementer invocations attached to non-terminal rounds.
- [x] Write failing tests for failed/canceled round-linked invocations attached to non-terminal rounds.
- [x] Confirm duplicate recovery is idempotent and does not create duplicate implementer invocations when the next step is already queued.
- [x] Implement continuation/settlement pass by reusing `continueRoundAfterInvocation` and `settleRoundAfterInvocation`.
- [x] Run focused tests and commit `feat: recover round continuity from sqlite`.

## Task 4: Host Startup Wiring

- [x] Extract a small startup helper if needed so Host startup order can be tested without binding a real port.
- [x] Add a test or focused verification that recovery runs before worker start.
- [x] Wire `apps/host/src/index.ts` to call `await roomHub.recoverThreadContinuity('default-thread')` before `worker.start()`.
- [x] Run `pnpm.cmd build` and focused host tests.
- [x] Commit `feat: run recovery before host worker start`.

## Task 5: Verification, Review, Evidence

- [x] Run full verification:

```text
docker compose exec -T redis redis-cli -n 15 FLUSHDB
$env:REDIS_URL='redis://127.0.0.1:6379/15'; pnpm.cmd test
pnpm.cmd build
python -m unittest tests.test_public_hygiene
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
```

- [x] Request independent code review and Vision Gate review.
- [x] Fix Critical/Important review findings before closeout.
- [x] Create `docs/evidence/EV-013-recovery-session-continuity-2.md`.
- [x] Mark F007 complete only after verification and review pass.
- [ ] Commit `docs: close recovery session continuity 2`.

## Self-Review

- Spec coverage: queued re-enqueue, stale running failure, succeeded continuation, failed/canceled settlement, host startup wiring, non-goals, review, and Evidence are covered.
- Placeholder scan: no `TBD` or open-ended implementation placeholder remains.
- Type consistency: planned public method is `recoverThreadContinuity(threadId)`; recovery audit event names use `recovery.*`.
