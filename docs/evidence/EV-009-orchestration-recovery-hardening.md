---
id: EV-009
doc_kind: evidence
scope: project
feature_ids:
  - F004
feature_refs:
  - docs/features/F004-orchestration-recovery-hardening.md
created: 2026-05-31
---

# EV-009: Orchestration Recovery Hardening

## Scope

本证据记录 F004 的 Phase 3/4/5 强化结果：

- Phase 3: cancellation API、adapter abort signal、running cancellation abort、timeout contract、Web Console invocation status、Redis-backed slot lease contract。
- Phase 4: `design_review_execute` persisted round 与 architect -> reviewer -> implementer step chain。
- Phase 5: Codex session id 捕获、resume metadata 持久化、invocation audit log、失败后恢复所需 metadata。
- Harness 深化: F004、ADR-002、EV-009、closeout dashboard、independent review subagent。

## Commits

```text
9b91b4e docs: anchor orchestration recovery hardening
eb185b5 feat: add invocation cancellation contract
b5d8fa9 feat: show invocation status in console
85125bb feat: persist design review execute rounds
7ddc038 feat: persist invocation recovery metadata
e684824 feat: add redis slot lease contract
599e292 feat: abort running invocations on cancellation
bf1699a fix: address orchestration recovery review findings
```

## Results

- Host exposes `POST /api/invocations/:invocationId/cancel`, validates an optional reason, and routes through Room Hub.
- Room Hub marks canceled invocations in Persistence, emits `invocation.canceled`, and writes cancellation audit rows.
- Agent Runtime passes `AbortSignal` into runtime adapters, skips already canceled queued jobs, and aborts running adapters when matching `invocation.canceled` events arrive.
- Codex Adapter kills its child process on timeout or abort and returns a cancellation/timeout error to the worker.
- Web Console bootstrap now includes persisted invocations and renders seat-level status pills for idle, queued, running, succeeded, failed, and canceled states.
- Persistence now stores rounds, round steps, invocation recovery metadata, and invocation audit logs.
- `design_review_execute` creates a running round with three ordered steps and now continues architect -> reviewer -> implementer after each successful invocation.
- Codex JSONL session records with `session_id` are captured as `runtimeSessionId` and `resumeMetadata`.
- Event Bus exposes Redis-backed `acquireAgentSlotLease` / `releaseAgentSlotLease` using owner + TTL semantics.

## Commands

```text
pnpm.cmd build
pnpm.cmd test
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
python -m unittest tests.test_public_hygiene
$paths = @(git ls-files) + @(git ls-files --others --exclude-standard); python scripts\public_hygiene.py --root . @paths
$env:PUBLIC_HYGIENE_FORBIDDEN_PATTERNS=('PH_' + [guid]::NewGuid().ToString('N')); $paths = @(git ls-files) + @(git ls-files --others --exclude-standard); python scripts\public_hygiene.py --root . --require-rules --require-env-rules --require-commit-range --commit-range origin/main..HEAD @paths
Browser check: http://127.0.0.1:5174 rendered Web Console status pills from bootstrap without overlap.
Independent review subagent: pending at time of initial evidence drafting.
```

## Verification Results

```text
pnpm.cmd build: passed
pnpm.cmd test: 11 test files passed, 57 tests passed
knowledge_check.py --strict: Scanned 28 markdown file(s). Checked 14 knowledge artifact(s). Errors: 0. Warnings: 0.
python -m unittest tests.test_public_hygiene: Ran 10 tests, OK
public_hygiene.py tracked/untracked scan: passed, 93 file(s), 0 rule(s)
public_hygiene.py env + commit-range scan: passed, 93 file(s), 1 rule(s)
Browser check: Web Console displayed Architect succeeded, Implementer idle, Reviewer idle; no visible text overlap.
```

## Recovery Path

- For a failed or canceled invocation, inspect `invocations.error`, `runtime_session_id`, and `resume_metadata_json`.
- Use `invocation_audit_logs` to reconstruct status transitions and adapter/session capture events.
- Use `source_message_id` to recover the original user task.
- For orchestrated work, use `round_id` and `round_step_id` on the invocation, then inspect `rounds` and `round_steps` to recover the collaboration chain.

## Residual Risks

- Redis slot lease is implemented as Event Bus contract and tested for owner + TTL exclusivity plus atomic compare-delete release, but Agent Runtime still uses in-process serialization until Redis stream pending-claim/requeue behavior is designed.
- Codex session parsing is tolerant for known `session_id` shapes, but real CLI schema changes may require additional samples.
- Timeout is enforced by the Codex Adapter and audited through failure status, but a dedicated timeout audit event type can be split out later if dashboards need stronger classification.
- Web Console renders invocation status, not full round-step status. The persisted round state is available for a later dashboard slice.

## Independent Review

Independent review found four blockers/important issues:

- Cancellation could be overwritten by a late successful adapter result.
- `design_review_execute` had persisted steps but no continuation.
- Timeout was private to Codex Adapter rather than a shared worker contract.
- Redis lease release used non-atomic `GET` then `DEL`.

All four were addressed after review with targeted tests in `bf1699a`.

## Artifacts

- `packages/shared/src/protocol.ts`
- `packages/shared/src/schemas.ts`
- `packages/persistence/src/migrations.ts`
- `packages/persistence/src/repositories.ts`
- `packages/event-bus/src/redisEventBus.ts`
- `packages/room-hub/src/createRoomHub.ts`
- `packages/agent-runtime/src/agentWorker.ts`
- `packages/agent-runtime/src/codexCliAdapter.ts`
- `apps/host/src/createServer.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/api.ts`
- `apps/web/src/styles.css`
- `docs/features/F004-orchestration-recovery-hardening.md`
- `docs/decisions/ADR-002-invocation-orchestration-recovery-contracts.md`

## Notes

F004 is marked completed for the requested slice. Remaining risks are follow-up scope: Redis lease worker integration, broader real Codex session schema samples, and richer round-step dashboard presentation.
