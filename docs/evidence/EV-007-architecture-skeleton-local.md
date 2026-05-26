---
id: EV-007
doc_kind: evidence
scope: project
feature_ids:
  - F001
  - F002
feature_refs:
  - docs/features/F001-equal-room-host-core.md
  - docs/features/F002-reference-architecture-adoption.md
created: 2026-05-26
---

# EV-007: Architecture Skeleton Local Runtime

## Scope

This evidence records the first local Phase 1 skeleton implementation on a fresh branch from `main`.

Verified path:

`Web Console -> Host API -> Room Hub -> SQLite -> Redis Event Bus / Queue -> mock Agent Runtime -> Redis Event Bus -> WebSocket -> Web Console`

## Commands

```text
python C:\Users\HUAWEI\.codex\skills-backup\harness-before-f31d980-20260526-113424\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
git switch main
git switch -c codex/phase1-skeleton-mainline
git checkout codex/architecture-skeleton-v1 -- package.json pnpm-workspace.yaml tsconfig.base.json docker-compose.yml .env.example pnpm-lock.yaml packages
git status --short
pnpm.cmd install
pnpm.cmd --filter @multi-agent-assi/shared test
pnpm.cmd test
pnpm.cmd build
pnpm.cmd --filter @multi-agent-assi/host build
pnpm.cmd --filter @multi-agent-assi/web build
pnpm.cmd redis:up
pnpm.cmd test -- tests/integration/architecture-skeleton.test.ts
```

Manual Web Console path check:

```text
pnpm.cmd redis:up
pnpm.cmd dev
Invoke-RestMethod http://127.0.0.1:4317/api/health
GET http://127.0.0.1:5173
POST http://127.0.0.1:5173/api/messages
WS ws://127.0.0.1:5173/ws
```

Observed WebSocket event sequence through the Web Console dev proxy:

```text
message.created
invocation.queued
invocation.running
agent.delta
invocation.completed
```

Observed mock response body:

```text
[architect] received: @architect review the boundary
```

## Results

- Initial strict Harness baseline passed before branch work: 22 markdown files scanned, 10 knowledge artifacts checked, 0 errors, 0 warnings.
- Selective replay did not delete or modify `docs/features/**`, `docs/evidence/**`, `docs/decisions/**`, `.github/workflows/public-hygiene.yml`, `scripts/public_hygiene.py`, or `tests/test_public_hygiene.py`.
- Shared protocol was corrected from `AgentDefinition` to `AgentSeat` plus `RuntimeBinding`.
- `SubmitMessageInput.source` now uses `web | connector`; concrete remote entry names are not part of the core protocol.
- `pnpm.cmd build` passed after Host API and Web Console were added.
- `pnpm.cmd test` passed with 7 test files and 20 tests.
- Redis-backed integration test passed after Docker Desktop was started locally.
- Manual Web Console proxy check confirmed POST and WebSocket round trip through Host, Redis, mock runtime, and back to the Web client.
- Final strict Harness validation passed: 23 markdown files scanned, 11 knowledge artifacts checked, 0 errors, 0 warnings.
- Final Public Hygiene unit tests passed: 10 tests.
- Final Public Hygiene scans passed: 83 files checked, 0 static rules loaded for the basic scan, 1 env rule loaded for the fail-closed commit-range scan.
- Final `pnpm.cmd build` passed.
- Final `pnpm.cmd test` passed: 7 test files and 20 tests.

## Redis And SQLite Responsibility

SQLite is the durable fact source for rooms, threads, messages, agents, and invocations. The Room Hub persists user messages and invocation records before emitting runtime work.

Redis is the runtime coordination layer. It carries room event streams/pub-sub and agent job queues. Redis events are replay/coordination signals, not the durable source of user or agent message truth.

## Known Unverified Codex Adapter Items

- Real Codex CLI process spawn/resume is not implemented in this slice.
- Codex streaming event parsing and normalization are not implemented.
- Codex session continuity capture is not implemented.
- Per-agent Codex slot control, cancellation, timeout, and recovery are not implemented.
- Claude Code, OpenCode, Gemini CLI, and remote connector bindings remain future runtime/connector work.

## Artifacts

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `docker-compose.yml`
- `.env.example`
- `vitest.config.ts`
- `packages/shared/**`
- `packages/persistence/**`
- `packages/event-bus/**`
- `packages/room-hub/**`
- `packages/agent-runtime/**`
- `apps/host/**`
- `apps/web/**`
- `tests/integration/architecture-skeleton.test.ts`
- `docs/evidence/EV-007-architecture-skeleton-local.md`
- `docs/features/F001-equal-room-host-core.md`
- `docs/features/F002-reference-architecture-adoption.md`
- `README.md`

## Notes

The local manual Web Console check used the Vite dev proxy and a WebSocket client because no browser automation tool was available in this session. It still exercised the Web Console origin (`127.0.0.1:5173`), Host API, Redis event bus, mock Agent Runtime, and WebSocket return path.

## Harness Validation

Observed final output:

```text
Scanned 23 markdown file(s). Checked 11 knowledge artifact(s). Errors: 0. Warnings: 0.
```
