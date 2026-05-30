# Codex Adapter And Slot Control Implementation Plan

> **For agentic workers:** use Harness gates before implementation, keep commits as verified slices, and do not bypass Room Hub, Event Bus, or Persistence.

**Goal:** advance beyond the Phase 1 mock skeleton by adding the first real runtime adapter path and the minimum per-agent slot control needed for multi-seat execution.

**Route:** Phase 1 closeout -> Phase 2 Codex Adapter -> Phase 3 multi-seat and slot control.

## Source Anchors

- Feature: `docs/features/F001-equal-room-host-core.md`
- Feature: `docs/features/F002-reference-architecture-adoption.md`
- ADR: `docs/decisions/ADR-001-reference-architecture-adoption-boundary.md`
- Evidence: `docs/evidence/EV-007-architecture-skeleton-local.md`
- Prior plan: `docs/superpowers/plans/2026-05-26-architecture-skeleton-rebaseline.md`

## Non-Goals

- Do not implement Feishu, mobile, or other remote connectors in this slice.
- Do not build a broad provider marketplace.
- Do not make Room Hub, Web Console, or Persistence depend on Codex-specific process details.
- Do not remove the mock runtime; it remains the deterministic test adapter.
- Do not use a second message path outside Room Hub -> Invocation -> Event Bus -> Persistence.

## Phase 1 Closeout

Acceptance:

- Host WebSocket subscriptions are awaited during `server.close()`.
- Local `.tmp/` work directories do not pollute the canonical Vitest count.
- `EV-007` records the stabilization evidence.
- `pnpm.cmd build`, `pnpm.cmd test`, strict Harness check, and public hygiene checks pass.

## Phase 2: Codex Adapter Minimum Runtime Loop

### Design

Introduce a runtime adapter boundary owned by `packages/agent-runtime`:

- `RuntimeAdapter` receives an `AgentJob`, agent seat/runtime binding, and lifecycle callbacks.
- `mock` and `codex-cli` are concrete adapters behind the same contract.
- The worker resolves the target agent seat from Persistence and dispatches by `seat.runtime.kind`.
- Codex-specific command, process spawning, JSONL parsing, timeout, and diagnostics stay inside the Codex adapter.

### Codex CLI Invocation

Use the npm-installed `@openai/codex/bin/codex.js` through Node on Windows by default because direct `codex` resolves to `codex.ps1`, `codex.cmd` can split prompt arguments through its shim, and the WindowsApps `codex.exe` path may be access-restricted. The command should run non-interactively, prefer JSONL output when configured, and start with safe local defaults equivalent to:

```text
codex.cmd -a never exec --json --sandbox workspace-write <prompt>
```

The adapter must allow command override for tests and local configuration.

### Minimum Acceptance

- Unit tests prove the worker dispatches `mock` and `codex-cli` through the same adapter interface.
- Contract tests prove the Codex adapter can convert process output into normalized text deltas and final output.
- Failure tests prove non-zero exit, process error, and timeout mark only the current invocation failed.
- A local manual check can run one Codex-bound `architect` invocation through the existing Host/Room Hub path and persist the final agent message.

## Phase 3: Multi-Seat And Slot Control

### Design

Add the smallest queue safety layer that prevents two jobs for the same agent seat from executing concurrently in one worker process.

- Slot state belongs to Agent Runtime / runtime coordination, not Web Console.
- The first implementation may be in-process for local skeleton verification, but the interface must leave room for Redis-backed slot state.
- Jobs for different seats may run independently.
- Jobs for the same seat must remain serialized.

### Minimum Acceptance

- Tests prove broadcast creates independent invocations for `architect`, `reviewer`, and `implementer`.
- Tests prove two jobs for the same agent are not processed concurrently.
- Tests prove one agent failure does not fail or block another agent's invocation.
- Web/Host bootstrap can expose enough invocation/member state for a user to see runtime progress.

## Suggested Commit Slices

1. `fix: stabilize phase one websocket teardown`
2. `docs: plan codex adapter and slot control`
3. `feat: introduce runtime adapter contract`
4. `feat: add codex cli adapter`
5. `feat: route agent jobs by runtime binding`
6. `feat: serialize per-agent runtime slots`
7. `docs: record codex adapter runtime evidence`

## Verification Plan

Run after each relevant slice:

```powershell
pnpm.cmd build
pnpm.cmd test
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
python -m unittest tests.test_public_hygiene
$paths = @(git ls-files); python scripts\public_hygiene.py --root . @paths
$env:PUBLIC_HYGIENE_FORBIDDEN_PATTERNS=('PH_' + [guid]::NewGuid().ToString('N')); $paths = @(git ls-files); python scripts\public_hygiene.py --root . --require-rules --require-env-rules --require-commit-range --commit-range origin/main..HEAD @paths
```

Manual Codex runtime verification is required before claiming Phase 2 complete.

## Open Risks

- Real Codex output schema may differ across CLI versions; keep parsing tolerant and test with captured local JSONL samples.
- Windows Codex invocations can reconnect for longer than two minutes; keep adapter timeout configurable and avoid treating ordinary reconnects as immediate failure.
- Session continuity is not complete until session ids and resume metadata are persisted; do not claim that in Phase 2 unless implemented and verified.
- Redis-backed distributed slot control may be needed later; this slice only needs local worker correctness unless multi-process workers are introduced.
