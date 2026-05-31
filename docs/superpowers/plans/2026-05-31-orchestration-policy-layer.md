# Orchestration Policy Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `design_review_execute` reviewer-gated and terminal-state safe through a small Room Hub orchestration policy layer.

**Architecture:** Add a pure policy module under `packages/room-hub/src`, then have `createRoomHub.ts` apply policy decisions to Persistence and Event Bus. Shared protocol gains live round update events; Web Console consumes them as projections only.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, SQLite repository contract, Redis-backed Event Bus protocol.

---

## File Structure

- Create `packages/room-hub/src/orchestrationPolicy.ts`: pure policy helpers for step definitions, reviewer verdict parsing, prompt construction, and continuation decisions.
- Modify `packages/room-hub/src/createRoomHub.ts`: call the policy module, apply decisions, publish round update events, and converge failed/canceled round-linked invocations.
- Modify `packages/room-hub/test/createRoomHub.test.ts`: integration-level Room Hub tests for approved, blocked, missing verdict, failure, and cancellation paths.
- Modify `packages/shared/src/protocol.ts`: add `round.updated` room event type carrying updated round and steps.
- Modify `apps/web/src/App.tsx` and `apps/web/src/App.test.ts`: merge `round.updated` into the read projection.
- Modify `packages/agent-runtime/src/agentWorker.ts` and `packages/agent-runtime/test/agentWorker.test.ts`: add an optional failed-invocation callback so Room Hub can converge failed round steps.
- Modify `apps/host/src/index.ts`: wire the failed-invocation callback to Room Hub.

## Task 1: Pure Policy Module

**Files:**
- Create: `packages/room-hub/src/orchestrationPolicy.ts`
- Modify: `packages/room-hub/test/createRoomHub.test.ts`

- [ ] **Step 1: Write failing policy tests**

Add tests that import policy helpers and assert:

```ts
expect(parseReviewerVerdict('VERDICT: approved\nLooks good')).toEqual('approved');
expect(parseReviewerVerdict('VERDICT: changes_requested\nMissing tests')).toEqual('changes_requested');
expect(parseReviewerVerdict('Looks good')).toBeNull();
```

Also assert that reviewer approval is required before an implementer decision is produced.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```text
pnpm.cmd exec vitest run packages/room-hub/test/createRoomHub.test.ts
```

Expected: fail because `orchestrationPolicy.ts` or exported helpers do not exist.

- [ ] **Step 3: Implement minimal policy helpers**

Create `packages/room-hub/src/orchestrationPolicy.ts` with:

```ts
export type ReviewerVerdict = 'approved' | 'changes_requested';

export const DESIGN_REVIEW_EXECUTE_STEP_AGENT_IDS = ['architect', 'reviewer', 'implementer'] as const;

export function parseReviewerVerdict(body: string): ReviewerVerdict | null {
  const match = body.match(/^\s*VERDICT:\s*(approved|approve|changes_requested|request_changes)\b/im);
  if (!match) return null;
  return match[1] === 'approved' || match[1] === 'approve' ? 'approved' : 'changes_requested';
}
```

Add prompt builders and a small continuation decision type only for the current workflow.

- [ ] **Step 4: Run focused test and verify GREEN**

Run:

```text
pnpm.cmd exec vitest run packages/room-hub/test/createRoomHub.test.ts
```

Expected: room-hub tests pass.

- [ ] **Step 5: Commit**

Commit message:

```text
feat: add design review policy helpers
```

## Task 2: Reviewer Gate And Prompt Application

**Files:**
- Modify: `packages/room-hub/src/createRoomHub.ts`
- Modify: `packages/room-hub/test/createRoomHub.test.ts`

- [ ] **Step 1: Write failing Room Hub tests**

Add tests for:

- architect success queues reviewer with prompt containing original request and architect output;
- reviewer `VERDICT: approved` queues implementer;
- reviewer `VERDICT: changes_requested` does not queue implementer and marks round failed;
- reviewer output without verdict does not queue implementer and marks round failed.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```text
pnpm.cmd exec vitest run packages/room-hub/test/createRoomHub.test.ts
```

Expected: reviewer block/missing verdict tests fail because current code queues implementer on any reviewer success.

- [ ] **Step 3: Apply policy in `continueRoundAfterInvocation`**

Use the policy helpers to:

- find source message and completed invocation message;
- build the next prompt;
- parse reviewer verdict before implementer;
- terminally fail the round and cancel dependent pending steps when the gate blocks.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```text
pnpm.cmd exec vitest run packages/room-hub/test/createRoomHub.test.ts
```

Expected: room-hub tests pass.

- [ ] **Step 5: Commit**

Commit message:

```text
feat: enforce reviewer gate in orchestration policy
```

## Task 3: Terminal Convergence For Failure And Cancellation

**Files:**
- Modify: `packages/room-hub/src/createRoomHub.ts`
- Modify: `packages/agent-runtime/src/agentWorker.ts`
- Modify: `apps/host/src/index.ts`
- Modify: `packages/room-hub/test/createRoomHub.test.ts`
- Modify: `packages/agent-runtime/test/agentWorker.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that a round-linked failed invocation marks its current step `failed`, dependent steps `canceled`, and round `failed`. Add a cancellation test that marks current step and round `canceled`.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```text
pnpm.cmd exec vitest run packages/room-hub/test/createRoomHub.test.ts packages/agent-runtime/test/agentWorker.test.ts
```

Expected: fail because failed invocation callback and round terminal convergence are missing.

- [ ] **Step 3: Implement convergence path**

Add Room Hub method such as `settleRoundAfterInvocation(invocationId, terminalStatus, reason)` and call it from:

- `cancelInvocation` for canceled round-linked invocations;
- `AgentWorker` optional `onInvocationFailed` callback after durable failure;
- Host worker wiring.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```text
pnpm.cmd exec vitest run packages/room-hub/test/createRoomHub.test.ts packages/agent-runtime/test/agentWorker.test.ts
```

Expected: focused tests pass.

- [ ] **Step 5: Commit**

Commit message:

```text
feat: converge failed orchestration rounds
```

## Task 4: Live Round Update Projection

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.ts`
- Modify: `packages/room-hub/src/createRoomHub.ts`

- [ ] **Step 1: Write failing Web projection test**

Add a test that `mergeRoundEvent` handles:

```ts
{
  type: 'round.updated',
  roomId: 'default-room',
  threadId: 'default-thread',
  round,
  steps,
  occurredAt: 1,
}
```

and replaces the matching round/steps idempotently.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```text
pnpm.cmd exec vitest run apps/web/src/App.test.ts packages/room-hub/test/createRoomHub.test.ts
```

Expected: fail because the event type is not in the shared protocol or merge helper.

- [ ] **Step 3: Implement event and merge**

Add `round.updated` to shared `RoomEvent`, publish it after policy-driven round/step updates, and merge it in Web projection the same way as `round.created`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```text
pnpm.cmd exec vitest run apps/web/src/App.test.ts packages/room-hub/test/createRoomHub.test.ts
```

Expected: focused tests pass.

- [ ] **Step 5: Commit**

Commit message:

```text
feat: publish live round policy updates
```

## Task 5: Verification And Evidence

**Files:**
- Modify: `docs/features/F006-orchestration-policy-layer.md`
- Create: `docs/evidence/EV-012-orchestration-policy-layer.md`

- [ ] **Step 1: Run full verification**

Run:

```text
docker compose exec -T redis redis-cli -n 15 FLUSHDB
$env:REDIS_URL='redis://127.0.0.1:6379/15'; pnpm.cmd test
pnpm.cmd build
python -m unittest tests.test_public_hygiene
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
```

- [ ] **Step 2: Record Evidence**

Create `docs/evidence/EV-012-orchestration-policy-layer.md` with commits, commands, results, independent review findings, recovery path, residual risks, and next phase boundary.

- [ ] **Step 3: Update Feature**

Mark F006 acceptance criteria complete only for verified behavior and link EV-012.

- [ ] **Step 4: Run Harness strict validation again**

Run:

```text
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
```

- [ ] **Step 5: Commit**

Commit message:

```text
docs: close orchestration policy layer
```

## Self-Review

- Spec coverage: tasks cover policy helpers, reviewer approval gate, blocked/missing verdict, failure/cancellation convergence, live projection, verification, and Evidence.
- Placeholder scan: no `TBD` or open-ended implementation placeholder remains.
- Type consistency: the planned event name is `round.updated`; the planned helper name is `parseReviewerVerdict`; the planned terminal Room Hub method may be named `settleRoundAfterInvocation` as long as tests call the public Room Hub contract.
