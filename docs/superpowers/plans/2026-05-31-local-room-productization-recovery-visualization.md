# Local Room Productization And Recovery Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose persisted rounds, round steps, invocation audit, and recovery metadata in the local Web Console without moving core state into the frontend.

**Architecture:** Host adds read-only projections from SQLite. Web stores only view projections from bootstrap, WebSocket events, and selected audit fetches. Recovery execution remains out of scope; this slice only makes the existing durable state inspectable.

**Tech Stack:** TypeScript, Fastify, React, Vitest, SQLite repositories, existing shared protocol types.

---

## File Structure

- Modify `apps/host/src/createServer.ts`: extend bootstrap response and add read-only audit endpoint.
- Modify `apps/host/test/createServer.test.ts`: cover bootstrap rounds/steps and audit endpoint behavior.
- Modify `apps/web/src/api.ts`: extend `BootstrapState` and add `fetchInvocationAudit`.
- Modify `apps/web/src/App.tsx`: add round/step projection helpers, round panel, recovery detail panel, and audit loading.
- Modify `apps/web/src/App.test.ts`: cover round merge, derived step status, and recovery detail helpers.
- Modify `apps/web/src/styles.css`: add compact workbench styling for round and recovery panels.

## Task 1: Host Read Projection

**Files:**
- Modify: `apps/host/src/createServer.ts`
- Modify: `apps/host/test/createServer.test.ts`

- [ ] **Step 1: Write the failing bootstrap projection test**

Add `RoundRecord` and `RoundStepRecord` imports in `apps/host/test/createServer.test.ts`:

```ts
import type { AgentJob, AgentSeat, InvocationAuditRecord, InvocationRecord, MessageRecord, RoomEvent, RoundRecord, RoundStepRecord } from '@multi-agent-assi/shared';
```

In `createHarness`, add fixture arrays:

```ts
const rounds: RoundRecord[] = [
  {
    id: 'round-1',
    roomId: 'default-room',
    threadId: 'default-thread',
    sourceMessageId: 'msg-1',
    workflow: 'design_review_execute',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
  },
];
const roundSteps: RoundStepRecord[] = [
  {
    id: 'step-1',
    roundId: 'round-1',
    stepIndex: 0,
    agentId: 'architect',
    status: 'queued',
    invocationId: 'inv-1',
    createdAt: 1,
    updatedAt: 1,
  },
];
```

Change repository mocks:

```ts
listRoundsByThread: vi.fn(() => rounds),
listRoundSteps: vi.fn((roundId: string) => roundSteps.filter((step) => step.roundId === roundId)),
```

Change the bootstrap assertion:

```ts
expect(bootstrap.json()).toEqual({
  agents: harness.repositories.listAgents(),
  messages: [],
  invocations: harness.repositories.listInvocationsByThread('default-thread'),
  rounds,
  roundSteps,
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run apps/host/test/createServer.test.ts -t "serves health and bootstrap state from repositories"
```

Expected: FAIL because `/api/bootstrap` does not yet return `rounds` or `roundSteps`.

- [ ] **Step 3: Implement bootstrap projection**

In `apps/host/src/createServer.ts`, replace the bootstrap handler with:

```ts
server.get('/api/bootstrap', async () => {
  const threadId = 'default-thread';
  const rounds = deps.repositories.listRoundsByThread(threadId);
  return {
    agents: deps.repositories.listAgents(),
    messages: await deps.roomHub.listMessages(threadId),
    invocations: deps.repositories.listInvocationsByThread(threadId),
    rounds,
    roundSteps: rounds.flatMap((round) => deps.repositories.listRoundSteps(round.id)),
  };
});
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
pnpm.cmd exec vitest run apps/host/test/createServer.test.ts -t "serves health and bootstrap state from repositories"
```

Expected: PASS.

- [ ] **Step 5: Write the failing audit endpoint tests**

Add audit fixtures in `createHarness`:

```ts
const audits: InvocationAuditRecord[] = [
  {
    id: 'audit-1',
    invocationId: 'inv-1',
    eventType: 'invocation.queued',
    occurredAt: 1,
    metadata: { roundId: 'round-1', roundStepId: 'step-1' },
  },
];
```

Change mocks:

```ts
listInvocationAudit: vi.fn((invocationId: string) => audits.filter((audit) => audit.invocationId === invocationId)),
getInvocation: vi.fn((invocationId: string) => {
  if (invocationId !== 'inv-1') return null;
  return {
    id: 'inv-1',
    roomId: 'default-room',
    threadId: 'default-thread',
    sourceMessageId: 'msg-1',
    agentId: 'architect',
    status: 'queued',
    createdAt: 1,
    updatedAt: 1,
  };
}),
```

Add tests:

```ts
it('serves invocation audit records from repositories', async () => {
  const harness = createHarness();
  const server = await createServer(harness);

  const response = await server.inject({ method: 'GET', url: '/api/invocations/inv-1/audit' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(harness.repositories.listInvocationAudit('inv-1'));
  await server.close();
});

it('returns 404 for audit of an unknown invocation', async () => {
  const harness = createHarness();
  const server = await createServer(harness);

  const response = await server.inject({ method: 'GET', url: '/api/invocations/missing/audit' });

  expect(response.statusCode).toBe(404);
  expect(response.json()).toEqual({ error: 'Invocation not found' });
  await server.close();
});
```

- [ ] **Step 6: Run the audit tests and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run apps/host/test/createServer.test.ts -t "audit"
```

Expected: FAIL with 404 route missing or unexpected status.

- [ ] **Step 7: Implement audit endpoint**

In `apps/host/src/createServer.ts`, add after the cancel endpoint:

```ts
server.get('/api/invocations/:invocationId/audit', async (request, reply) => {
  const params = request.params as { invocationId?: string };
  if (!params.invocationId) {
    return reply.status(400).send({ error: 'Missing invocation id' });
  }
  const invocation = deps.repositories.getInvocation(params.invocationId);
  if (!invocation) {
    return reply.status(404).send({ error: 'Invocation not found' });
  }
  return deps.repositories.listInvocationAudit(params.invocationId);
});
```

- [ ] **Step 8: Run host tests and commit**

Run:

```powershell
pnpm.cmd exec vitest run apps/host/test/createServer.test.ts
```

Expected: all host server tests pass.

Commit:

```powershell
git add apps/host/src/createServer.ts apps/host/test/createServer.test.ts
git commit -m "feat: expose room recovery read projections"
```

## Task 2: Web Projection Helpers

**Files:**
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.ts`

- [ ] **Step 1: Write failing tests for round merge and step status derivation**

In `apps/web/src/App.test.ts`, extend imports:

```ts
import type { InvocationRecord, MessageRecord, RoomEvent, RoundRecord, RoundStepRecord } from '@multi-agent-assi/shared';
import { deriveRoundStepStatus, mergeInvocationEvent, mergeRoomEvent, mergeRoundEvent } from './App.js';
```

Add tests:

```ts
describe('mergeRoundEvent', () => {
  const round: RoundRecord = {
    id: 'round-1',
    roomId: 'default-room',
    threadId: 'default-thread',
    sourceMessageId: 'msg-1',
    workflow: 'design_review_execute',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
  };
  const steps: RoundStepRecord[] = [
    { id: 'step-1', roundId: 'round-1', stepIndex: 0, agentId: 'architect', status: 'queued', invocationId: 'inv-1', createdAt: 1, updatedAt: 1 },
  ];

  it('adds round.created events without duplicating rounds or steps', () => {
    const event: RoomEvent = { type: 'round.created', roomId: 'default-room', threadId: 'default-thread', round, steps, occurredAt: 1 };

    const first = mergeRoundEvent({ rounds: [], roundSteps: [] }, event);
    const duplicate = mergeRoundEvent(first, event);

    expect(duplicate.rounds.map((item) => item.id)).toEqual(['round-1']);
    expect(duplicate.roundSteps.map((item) => item.id)).toEqual(['step-1']);
  });
});

describe('deriveRoundStepStatus', () => {
  it('prefers linked invocation status over persisted step status', () => {
    const step: RoundStepRecord = {
      id: 'step-1',
      roundId: 'round-1',
      stepIndex: 0,
      agentId: 'architect',
      status: 'queued',
      invocationId: 'inv-1',
      createdAt: 1,
      updatedAt: 1,
    };
    const invocation: InvocationRecord = {
      id: 'inv-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'msg-1',
      agentId: 'architect',
      status: 'failed',
      error: 'adapter failed',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(deriveRoundStepStatus(step, [invocation])).toBe('failed');
  });
});
```

- [ ] **Step 2: Run web tests and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run apps/web/src/App.test.ts
```

Expected: FAIL because `mergeRoundEvent` and `deriveRoundStepStatus` do not exist.

- [ ] **Step 3: Implement API types and projection helpers**

In `apps/web/src/api.ts`, change the import and `BootstrapState`:

```ts
import type { AgentSeat, InvocationAuditRecord, InvocationRecord, MessageRecord, RoundRecord, RoundStepRecord, SubmitMessageInput } from '@multi-agent-assi/shared';

export interface BootstrapState {
  agents: AgentSeat[];
  messages: MessageRecord[];
  invocations: InvocationRecord[];
  rounds: RoundRecord[];
  roundSteps: RoundStepRecord[];
}
```

Add:

```ts
export async function fetchInvocationAudit(invocationId: string): Promise<InvocationAuditRecord[]> {
  const response = await fetch(`/api/invocations/${encodeURIComponent(invocationId)}/audit`);
  if (!response.ok) {
    throw new Error(`Invocation audit failed: ${response.status}`);
  }
  return response.json() as Promise<InvocationAuditRecord[]>;
}
```

In `apps/web/src/App.tsx`, extend imports:

```ts
import type { AgentSeat, InvocationAuditRecord, InvocationRecord, InvocationStatus, MessageRecord, RoomEvent, RoundRecord, RoundStepRecord, RoundStepStatus } from '@multi-agent-assi/shared';
import { fetchBootstrap, fetchInvocationAudit, submitMessage } from './api.js';
```

Add exported helpers:

```ts
export interface RoundProjectionState {
  rounds: RoundRecord[];
  roundSteps: RoundStepRecord[];
}

function upsertById<T extends { id: string; createdAt: number }>(items: T[], next: T): T[] {
  const existingIndex = items.findIndex((item) => item.id === next.id);
  if (existingIndex < 0) {
    return [...items, next].sort((a, b) => a.createdAt - b.createdAt);
  }
  return items.map((item, index) => (index === existingIndex ? { ...item, ...next } : item));
}

export function mergeRoundEvent(state: RoundProjectionState, event: RoomEvent): RoundProjectionState {
  if (event.type !== 'round.created') return state;
  return {
    rounds: upsertById(state.rounds, event.round),
    roundSteps: event.steps.reduce((steps, step) => upsertById(steps, step), state.roundSteps),
  };
}

export function deriveRoundStepStatus(step: RoundStepRecord, invocations: InvocationRecord[]): RoundStepStatus {
  const linkedInvocation = step.invocationId ? invocations.find((invocation) => invocation.id === step.invocationId) : undefined;
  return linkedInvocation?.status ?? step.status;
}
```

- [ ] **Step 4: Run web tests and commit**

Run:

```powershell
pnpm.cmd exec vitest run apps/web/src/App.test.ts
```

Expected: PASS.

Commit:

```powershell
git add apps/web/src/api.ts apps/web/src/App.tsx apps/web/src/App.test.ts
git commit -m "feat: add room round projection helpers"
```

## Task 3: Web Round And Recovery Detail UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write failing recovery detail helper test**

In `apps/web/src/App.test.ts`, import:

```ts
import { formatRecoveryMetadata } from './App.js';
```

Add:

```ts
describe('formatRecoveryMetadata', () => {
  it('prints stable JSON for resume metadata and a clear empty state', () => {
    expect(formatRecoveryMetadata({ runtime: 'codex-cli', sessionId: 'codex-session-1' })).toBe(
      '{\n  "runtime": "codex-cli",\n  "sessionId": "codex-session-1"\n}',
    );
    expect(formatRecoveryMetadata(undefined)).toBe('No resume metadata captured');
  });
});
```

- [ ] **Step 2: Run web tests and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run apps/web/src/App.test.ts -t "formatRecoveryMetadata"
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement helper and UI state**

In `apps/web/src/App.tsx`, add:

```ts
export function formatRecoveryMetadata(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return 'No resume metadata captured';
  return JSON.stringify(metadata, null, 2);
}
```

Inside `App`, replace separate `rounds` / `roundSteps` state with one projection state:

```ts
const [roundProjection, setRoundProjection] = useState<RoundProjectionState>({ rounds: [], roundSteps: [] });
const [selectedInvocationId, setSelectedInvocationId] = useState<string | null>(null);
const [auditEntries, setAuditEntries] = useState<InvocationAuditRecord[]>([]);
const [auditStatus, setAuditStatus] = useState('Select an invocation');
```

In bootstrap success:

```ts
setRoundProjection({ rounds: state.rounds ?? [], roundSteps: state.roundSteps ?? [] });
```

In WebSocket message handler:

```ts
setRoundProjection((current) => mergeRoundEvent(current, roomEvent));
```

Add selected invocation lookup:

```ts
const selectedInvocation = selectedInvocationId ? invocations.find((invocation) => invocation.id === selectedInvocationId) : undefined;
```

Add audit loading effect:

```ts
useEffect(() => {
  if (!selectedInvocationId) {
    setAuditEntries([]);
    setAuditStatus('Select an invocation');
    return;
  }
  let canceled = false;
  setAuditStatus('Loading audit');
  void fetchInvocationAudit(selectedInvocationId)
    .then((entries) => {
      if (canceled) return;
      setAuditEntries(entries);
      setAuditStatus(entries.length === 0 ? 'No audit entries yet' : 'Audit loaded');
    })
    .catch((err: unknown) => {
      if (canceled) return;
      setAuditEntries([]);
      setAuditStatus(err instanceof Error ? err.message : String(err));
    });
  return () => {
    canceled = true;
  };
}, [selectedInvocationId]);
```

- [ ] **Step 4: Render round panel and recovery detail**

Add a `workbench` container around the existing timeline and a new side panel. The rendered controls should use buttons for selectable steps:

```tsx
<section className="round-panel" aria-label="Round progress">
  <div className="panel-header">
    <p className="eyebrow">Rounds</p>
    <h3>design review</h3>
  </div>
  {roundProjection.rounds.length === 0 ? (
    <p className="subtle">No controlled rounds yet.</p>
  ) : (
    roundProjection.rounds.map((round) => (
      <article className="round-card" key={round.id}>
        <div className="round-title">
          <strong>{round.workflow.replaceAll('_', ' ')}</strong>
          <span className={`invocation-pill ${round.status}`}>{round.status}</span>
        </div>
        <div className="step-list">
          {roundProjection.roundSteps
            .filter((step) => step.roundId === round.id)
            .sort((a, b) => a.stepIndex - b.stepIndex)
            .map((step) => {
              const visibleStatus = deriveRoundStepStatus(step, invocations);
              return (
                <button className="round-step" key={step.id} onClick={() => setSelectedInvocationId(step.invocationId ?? null)} type="button">
                  <span>{step.stepIndex + 1}. {step.agentId}</span>
                  <small>{step.invocationId ?? 'waiting'}</small>
                  <span className={`invocation-pill ${visibleStatus}`}>{visibleStatus}</span>
                </button>
              );
            })}
        </div>
      </article>
    ))
  )}
</section>

<aside className="recovery-panel" aria-label="Recovery detail">
  <div className="panel-header">
    <p className="eyebrow">Recovery</p>
    <h3>{selectedInvocation?.agentId ?? 'No invocation selected'}</h3>
  </div>
  {selectedInvocation ? (
    <div className="recovery-detail">
      <dl>
        <dt>Invocation</dt>
        <dd>{selectedInvocation.id}</dd>
        <dt>Status</dt>
        <dd>{selectedInvocation.status}</dd>
        <dt>Source message</dt>
        <dd>{selectedInvocation.sourceMessageId}</dd>
        <dt>Runtime session</dt>
        <dd>{selectedInvocation.runtimeSessionId ?? 'No session captured'}</dd>
      </dl>
      <pre>{formatRecoveryMetadata(selectedInvocation.resumeMetadata)}</pre>
      <div className="audit-list">
        <strong>{auditStatus}</strong>
        {auditEntries.map((entry) => (
          <article className="audit-entry" key={entry.id}>
            <span>{entry.eventType}</span>
            <small>{entry.reason ?? entry.invocationId}</small>
          </article>
        ))}
      </div>
    </div>
  ) : (
    <p className="subtle">Select a round step or invocation to inspect recovery facts.</p>
  )}
</aside>
```

- [ ] **Step 5: Add focused CSS**

In `apps/web/src/styles.css`, add compact styles for:

```css
.workbench { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; min-height: 0; }
.round-panel, .recovery-panel { border-top: 1px solid oklch(88% 0.01 255); padding-top: 14px; }
.round-card { border: 1px solid oklch(88% 0.01 255); border-radius: 8px; padding: 12px; background: oklch(99% 0.004 255); }
.round-title, .panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.step-list { display: grid; gap: 8px; margin-top: 10px; }
.round-step { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; text-align: left; border: 1px solid oklch(88% 0.01 255); border-radius: 8px; padding: 10px; background: white; }
.round-step small { color: oklch(47% 0.02 255); overflow-wrap: anywhere; }
.recovery-detail dl { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; }
.recovery-detail dd { margin: 0; overflow-wrap: anywhere; }
.recovery-detail pre { white-space: pre-wrap; overflow-wrap: anywhere; border-radius: 8px; padding: 10px; background: oklch(96% 0.006 255); }
.audit-list { display: grid; gap: 8px; }
.audit-entry { border-top: 1px solid oklch(90% 0.01 255); padding-top: 8px; }
.subtle { color: oklch(47% 0.02 255); }
@media (max-width: 900px) { .workbench { grid-template-columns: 1fr; } }
```

- [ ] **Step 6: Run web tests and build**

Run:

```powershell
pnpm.cmd exec vitest run apps/web/src/App.test.ts
pnpm.cmd --filter @multi-agent-assi/web build
```

Expected: tests and web build pass.

Commit:

```powershell
git add apps/web/src/App.tsx apps/web/src/App.test.ts apps/web/src/styles.css
git commit -m "feat: visualize round recovery details"
```

## Task 4: Integration, Review, And Evidence

**Files:**
- Modify or create: `docs/evidence/EV-011-local-room-productization-recovery-visualization.md`
- Modify: `docs/features/F005-local-room-productization-recovery-visualization.md`

- [ ] **Step 1: Run full verification**

Run:

```powershell
pnpm.cmd test
pnpm.cmd build
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
python -m unittest tests.test_public_hygiene
```

Expected:

- Vitest test files pass.
- Workspace build passes.
- Harness knowledge check reports 0 errors and 0 warnings.
- Public hygiene tests pass.

- [ ] **Step 2: Dispatch independent review**

Use an independent reviewer subagent with this prompt:

```text
Review F005 implementation only. Check whether Host/Web changes keep Web as read-only projection, whether bootstrap/audit APIs expose persisted state without mutation, whether round-step visible status derivation is correct, whether recovery detail avoids retry/resume execution, and whether tests cover the behavior. Report Critical/Important/Medium findings with file paths. Do not modify files.
```

- [ ] **Step 3: Fix review findings with TDD**

For every Critical or Important finding, first add or adjust a failing test that reproduces the issue, verify RED, implement the minimal fix, verify GREEN, then rerun full verification.

- [ ] **Step 4: Record Evidence**

Create `docs/evidence/EV-011-local-room-productization-recovery-visualization.md` with:

```markdown
---
id: EV-011
doc_kind: evidence
scope: project
feature_ids:
  - F001
  - F005
feature_refs:
  - docs/features/F001-equal-room-host-core.md
  - docs/features/F005-local-room-productization-recovery-visualization.md
created: 2026-05-31
---

# EV-011: Local Room Productization And Recovery Visualization

## Scope

Records the F005 implementation that makes persisted rounds, round steps, invocation audit, and recovery metadata visible in the local Web Console.

## Commands

```text
pnpm.cmd test
pnpm.cmd build
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
python -m unittest tests.test_public_hygiene
```

## Results

Record the exact pass/fail counts and command summaries observed in Step 1 before committing this Evidence file.

## Independent Review

Record reviewer findings and fixes.

## Residual Risks

- Retry/resume execution remains intentionally deferred to Recovery / Session Continuity 2.0.
- Round terminal convergence for failed/canceled linked invocations remains a follow-up for Orchestration Policy Layer unless implemented in this slice.

## Artifacts

- `apps/host/src/createServer.ts`
- `apps/host/test/createServer.test.ts`
- `apps/web/src/api.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.ts`
- `apps/web/src/styles.css`
```

- [ ] **Step 5: Update F005 status and commit evidence**

After all acceptance criteria pass, update `docs/features/F005-local-room-productization-recovery-visualization.md`:

```markdown
status: completed
updated: 2026-05-31
```

Mark acceptance criteria `[x]`, add EV-011 under Evidence, and set Next Step to Orchestration Policy Layer.

Commit:

```powershell
git add docs/features/F005-local-room-productization-recovery-visualization.md docs/evidence/EV-011-local-room-productization-recovery-visualization.md
git commit -m "docs: record local room visualization evidence"
```

## Self-Review

- Spec coverage: Host projection, audit endpoint, Web round projection, recovery detail, test coverage, and no retry/resume execution are covered by Tasks 1-4.
- Placeholder scan: The only instruction to fill exact command results is inside the future EV-011 template and is intentionally scoped to the evidence-writing step; implementation workers must replace it before committing Evidence.
- Type consistency: Plan uses existing `RoundRecord`, `RoundStepRecord`, `InvocationAuditRecord`, `InvocationRecord`, and `RoomEvent` names from `@multi-agent-assi/shared`.
- Scope check: Feishu, multi-runtime binding, retry/resume execution, and workflow DSL remain excluded.

## Execution Handoff

Recommended execution mode: Subagent-driven for independent review, with main agent owning the critical-path implementation and integration. Implementation workers may own disjoint slices only if their write scopes do not overlap.
