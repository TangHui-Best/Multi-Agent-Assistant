# Local Room Productization And Recovery Visualization Design

## Summary

This slice turns the existing local room runtime into a more inspectable workbench. The backend already persists invocations, rounds, round steps, audit logs, Codex session ids, and resume metadata. The missing product capability is a user-facing read projection: the Web Console should show where a controlled round is, which invocation owns each step, why an invocation failed or was canceled, and what recovery metadata is available.

The slice is deliberately read-only for recovery actions. It does not retry or resume executions. That keeps the first productization step small, verifiable, and aligned with F001: Web Console can inspect core state, but Room Hub and Persistence remain the source of truth.

## Source Anchors

- `docs/features/F001-equal-room-host-core.md`
- `docs/features/F004-orchestration-recovery-hardening.md`
- `docs/features/F005-local-room-productization-recovery-visualization.md`
- `docs/decisions/ADR-002-invocation-orchestration-recovery-contracts.md`
- `docs/evidence/EV-010-redis-slot-lease-worker-integration.md`
- Read-only explorer findings from 2026-05-31 for UI/API projection and orchestration recovery gaps.

## Problem

F004 and EV-010 made invocation lifecycle and recovery data durable, but the Web Console still exposes only:

- agent roster,
- message timeline,
- latest invocation status per seat,
- live WebSocket updates for messages and invocation terminal events.

That is not enough for a user to operate an equal-room workflow. A user needs to inspect the collaboration chain itself: round progress, ordered step state, invocation audit facts, runtime session ids, and resume metadata. Without this view, recovery exists in SQLite but not in the product experience.

## Goals

- Expose persisted round and round step projections through Host bootstrap.
- Expose invocation audit logs through a read-only Host API endpoint.
- Show controlled round progress in the Web Console.
- Show selected invocation recovery details, including audit timeline and resume metadata.
- Keep all UI state as a projection of Host API and WebSocket events.
- Preserve the existing main path: Web -> Host API -> Room Hub -> Persistence/Event Bus -> Agent Runtime -> WebSocket -> Web.

## Non-Goals

- No automatic retry or resume execution.
- No Feishu or remote connector behavior.
- No Claude Code, OpenCode, or Gemini CLI binding.
- No general workflow DSL.
- No front-end-owned round, invocation, or recovery state.
- No large visual redesign beyond the layout needed to inspect rounds and recovery details.

## Design

### Host Read Projection

`GET /api/bootstrap` will return:

- `agents`,
- `messages`,
- `invocations`,
- `rounds`,
- `roundSteps`.

The endpoint can stay scoped to `default-thread` for this slice, matching the current app shape. It must read `rounds` and `round_steps` from SQLite repositories. This is a read projection; it must not create or mutate round state.

Host will also expose:

```text
GET /api/invocations/:invocationId/audit
```

The endpoint returns the ordered audit records from `repositories.listInvocationAudit(invocationId)`. If the invocation does not exist, it returns 404. If the invocation exists but has no audit records, it returns an empty list.

### Web State Model

The Web Console will add local projection state for:

- `rounds`,
- `roundSteps`,
- selected invocation id,
- selected invocation audit records.

This state is derived from bootstrap data, `round.created` WebSocket events, and invocation lifecycle events. It is allowed to cache a selected audit response for display, but it is not allowed to decide or mutate durable recovery state.

### Round Progress View

The Web Console will display a compact round panel for `design_review_execute` rounds. Each round shows:

- workflow name,
- round status,
- ordered steps,
- step agent id,
- visible step status,
- linked invocation id when present.

Visible step status should prefer linked invocation status when an invocation exists. This protects the UI from stale `round_steps.status` rows in the current implementation, where failed or canceled round-linked invocations may already be terminal while the step row has not yet converged.

### Recovery Detail View

Selecting an invocation or round step opens a recovery detail panel showing:

- invocation id,
- agent id,
- status,
- source message id,
- runtime session id if present,
- resume metadata if present,
- error if present,
- audit timeline loaded from the audit endpoint.

The panel should make absence explicit with restrained text such as `No session captured` or `No audit entries yet`. It must not show a retry or resume button in this slice.

### Event Handling

Existing WebSocket events remain sufficient for the first slice:

- `round.created` adds the round and its initial steps.
- `invocation.queued` adds or updates an invocation.
- `invocation.running`, `invocation.completed`, `invocation.failed`, and `invocation.canceled` update invocation projection state.

This design does not add `round.step.updated` yet. Step rendering can derive current status from the linked invocation. A future Orchestration Policy Layer can add explicit round/step transition events once round state convergence is hardened.

## Error Handling

- Bootstrap should return empty arrays for missing round/audit data rather than omitting keys.
- The audit endpoint returns 400 only for invalid route shape, 404 for unknown invocation, and 200 with an empty array for known invocations with no audit.
- Web audit loading failures should be visible in the detail panel without breaking the room timeline.
- Malformed resume metadata should not crash the UI; it is stored as JSON from Persistence and can be rendered through a safe pretty-printer with fallback text.

## Testing Strategy

- Host tests:
  - bootstrap includes `rounds` and `roundSteps`;
  - audit endpoint returns ordered records for a known invocation;
  - audit endpoint returns 404 for an unknown invocation.
- Web unit tests:
  - bootstrap state initializes rounds and steps;
  - `round.created` is merged idempotently;
  - visible step status derives from linked invocation status;
  - recovery detail renders session metadata and audit entries;
  - audit loading error is contained.
- Existing full test suite and build remain required before closeout.

## Rejected Paths

- **Add retry/resume buttons now:** rejected because execution semantics need Recovery / Session Continuity 2.0. Showing a button without a hardened recovery contract would create false confidence.
- **Add a general workflow engine now:** rejected because only `design_review_execute` exists. The immediate problem is visibility, not policy generality.
- **Store round progress in the Web Console:** rejected because it violates F001 and ADR-002. Web may project state, but Persistence remains the durable fact source.
- **Fetch all audit logs in bootstrap:** rejected for now because it creates unnecessary payload and N+1 pressure. Lazy loading selected invocation audit is enough for the first product slice.

## Acceptance Criteria

- Bootstrap returns agents, messages, invocations, rounds, and round steps for `default-thread`.
- A read-only audit endpoint exposes invocation audit logs from SQLite.
- Web Console displays controlled round progress and ordered steps.
- Web Console can show selected invocation recovery detail with audit timeline and resume metadata.
- Step status display reflects terminal invocation status even if the persisted step row has not converged.
- No retry/resume execution action is introduced.
- `pnpm.cmd test`, `pnpm.cmd build`, and Harness strict knowledge check pass before completion.
