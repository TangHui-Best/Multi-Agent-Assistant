# Orchestration Policy Layer Design

## Summary

This slice makes `design_review_execute` policy-driven without turning the project into a workflow platform. The policy should decide three things only:

- which ordered step is valid next;
- what prompt context that step receives;
- whether the round may continue, must fail, or must be canceled.

It deliberately avoids automatic retry, multi-round revision loops, remote connector behavior, and generalized workflow authoring.

## Context

F004 made persisted rounds and steps real. F005 made them visible. The remaining defect is that the current orchestration path is still a hardcoded success chain:

```text
architect success -> reviewer queued -> reviewer success -> implementer queued -> implementer success -> round succeeded
```

That is insufficient for equal-room collaboration because reviewer is supposed to gate risk. If reviewer cannot say "approved" or "changes requested" in a machine-readable way, implementer can run even when review found blockers, and restart recovery cannot know whether a round should resume or stop.

## Desired Behavior

### Policy Scope

`design_review_execute` remains the only workflow in scope. The policy owns:

- step order: architect -> reviewer -> implementer;
- reviewer verdict parsing;
- step prompt construction;
- next-step or terminal decision;
- terminal cleanup for failed/canceled linked invocations.

The policy does not own:

- adapter execution;
- Redis queue semantics;
- Web Console state ownership;
- automatic retry/resume;
- generalized workflow DSL.

### Reviewer Verdict Contract

Reviewer output must include one verdict line:

```text
VERDICT: approved
```

or:

```text
VERDICT: changes_requested
```

Accepted aliases may be intentionally small, for example `approve`, `approved`, `request_changes`, and `changes_requested`.

If no verdict is present, the safe behavior is to stop the round as failed and explain that reviewer verdict was missing. Do not guess approval from positive prose.

### Prompt Contract

Architect receives the original user request and is asked to produce an implementation plan.

Reviewer receives:

- original user request;
- architect output;
- required verdict format.

Implementer receives:

- original user request;
- architect output;
- reviewer output including approved verdict.

Implementer must not be queued when reviewer verdict is `changes_requested` or missing.

### Terminal State Contract

When a round-linked invocation fails or is canceled:

- current step is marked `failed` or `canceled`;
- dependent steps that are still `pending` or `queued` are marked `canceled` with a reason;
- round is marked `failed` or `canceled`;
- a room event publishes the updated round and steps for live Web Console projection.

When reviewer blocks implementer:

- reviewer step is marked `succeeded` because the reviewer completed its job;
- implementer step is marked `canceled` with a gate-blocked reason;
- round is marked `failed` with a reviewer gate reason;
- no implementer invocation is created.

## Module Boundary

Create a small Room Hub owned module:

```text
packages/room-hub/src/orchestrationPolicy.ts
```

This module is pure TypeScript logic. It may import shared types but must not import Persistence, Event Bus, Host, Web, Agent Runtime, Redis, or SQLite.

`packages/room-hub/src/createRoomHub.ts` remains responsible for applying policy decisions to Persistence and Event Bus.

`packages/shared/src/protocol.ts` may gain round update event types. The Web Console may project those events but must not decide policy.

## Rejected Paths

- General workflow engine: rejected because the current pain is policy reliability for one known workflow, not user-authored orchestration.
- Natural-language reviewer approval inference: rejected because it makes gate behavior unrecoverable and non-deterministic.
- Loop reviewer changes back to architect now: rejected because it creates multi-round convergence and retry semantics before the terminal-state policy is reliable.
- Store policy state in Redis: rejected because reviewer verdict and round terminal reason are durable facts.

## Acceptance Criteria

- Policy module exposes tested helpers for step definitions, prompt construction, reviewer verdict parsing, and continuation decisions.
- Room Hub applies policy decisions and keeps Persistence as source of truth.
- Reviewer approval is required before implementer queues.
- Reviewer block, missing verdict, failure, and cancellation all converge round state.
- Web Console receives live round update events and merges them as projections.
- Recovery / Session Continuity 2.0 can later inspect persisted round, step, invocation, message, audit, and verdict facts to decide whether a restart should resume or stop.
