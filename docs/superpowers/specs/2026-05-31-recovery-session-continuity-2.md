# Recovery / Session Continuity 2.0 Design

## Summary

This slice closes the local restart recovery loop. On Host startup, the system should inspect SQLite facts and reconcile safe, deterministic inconsistencies before the worker begins consuming Redis jobs.

The goal is not automatic runtime resume. The goal is to make restart behavior explainable and recoverable:

- queued work should not be stranded because a Redis job was lost;
- running work from a dead Host should not remain forever running;
- completed/failed/canceled round-linked invocations should converge round and step state;
- captured runtime session metadata should remain visible as recovery evidence.

## Context

F004 introduced invocation lifecycle, cancellation, timeout, persisted rounds, session metadata, and audit logs.
F005 exposed those facts in the Web Console.
F006 made reviewer gate and round convergence deterministic.

EV-012 records one remaining recovery risk: worker failure notification is fire-and-forget so ack/lease progress cannot be blocked, but a crash after persisted invocation failure and before round settlement can leave a failed invocation attached to a non-terminal round. This feature should close that gap by reconciling from SQLite on restart.

## Durable Source Of Truth

SQLite remains the source of durable truth:

- `messages`
- `invocations`
- `rounds`
- `round_steps`
- `invocation_audit_logs`
- runtime session id and resume metadata on invocations

Redis remains runtime coordination only. Recovery may enqueue Redis jobs from SQLite facts, but Redis must not decide durable state.

## Recovery Actions

### Safe Automatic Actions

The following can run automatically at local Host startup:

- Re-enqueue `queued` invocations with reconstructed prompts.
- Mark `running` invocations as `failed` with reason `Recovered stale running invocation after host restart`.
- Settle failed/canceled round-linked invocations whose round is still non-terminal.
- Continue succeeded round-linked invocations whose round is still non-terminal, using F006 policy guards.
- Append invocation audit entries for recovery actions.
- Publish room events for recovered invocation failure and round updates when an Event Bus is available.

### Not In Scope

Do not do these in this slice:

- Run `codex resume` or any runtime-specific resume command.
- Add retry/resume buttons to Web Console.
- Ask Feishu or mobile users to approve recovery actions.
- Build a general recovery platform or job scheduler.
- Store recovery truth in Redis or Web state.

## Prompt Reconstruction

Queued invocations need a prompt to be safely re-enqueued:

- non-round mention/broadcast invocations use the source user message body;
- architect step uses the design review architect prompt;
- reviewer step uses original request plus architect output when available;
- implementer step uses original request, architect output, and approved reviewer output when available.

If prompt reconstruction lacks required context for a non-architect round step, recovery should fail that invocation with a clear reason instead of guessing.

## Host Startup Order

The default Host startup order should become:

1. create repositories and ensure default state;
2. create Event Bus and Room Hub;
3. run `roomHub.recoverThreadContinuity('default-thread')`;
4. create/start Agent Worker;
5. start HTTP/WebSocket server.

This keeps queued recovery jobs available before the worker begins polling.

## Acceptance Criteria

- Recovery method is explicit on Room Hub or a Room Hub-owned module.
- Recovery is idempotent: running it twice should not duplicate terminal state or create unsafe extra work.
- Tests prove each recovery state transition from persisted facts, not only mocked callbacks.
- Recovery audit entries explain why startup changed invocation status or re-enqueued work.
- Bootstrap after recovery is sufficient for Web Console to display the recovered state.
