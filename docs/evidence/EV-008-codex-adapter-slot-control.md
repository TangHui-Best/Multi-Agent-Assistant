---
id: EV-008
doc_kind: evidence
scope: project
feature_ids:
  - F001
  - F002
feature_refs:
  - docs/features/F001-equal-room-host-core.md
  - docs/features/F002-reference-architecture-adoption.md
created: 2026-05-31
---

# EV-008: Codex Adapter And Slot Control

## Scope

本证据记录 Phase 2/3 的本地验证结果：

- Phase 2: Agent Runtime 通过 `RuntimeAdapter` contract 调用 `codex-cli` binding。
- Phase 3: 单 worker 内按 `agentId` 分组，保证同一 seat 串行、不同 seat 可并行。
- 真实 Codex CLI 已通过现有 `Room Hub -> Redis queue -> Agent Runtime -> Codex Adapter -> SQLite` 主链路返回 agent message。

## Commands

```text
pnpm.cmd exec vitest run packages/agent-runtime/test/agentWorker.test.ts
pnpm.cmd exec vitest run packages/agent-runtime/test/codexCliAdapter.test.ts
pnpm.cmd --filter @multi-agent-assi/agent-runtime build
pnpm.cmd build
pnpm.cmd test
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
python -m unittest tests.test_public_hygiene
$paths = @(git ls-files) + @(git ls-files --others --exclude-standard); python scripts\public_hygiene.py --root . @paths
$env:PUBLIC_HYGIENE_FORBIDDEN_PATTERNS=('PH_' + [guid]::NewGuid().ToString('N')); $paths = @(git ls-files) + @(git ls-files --others --exclude-standard); python scripts\public_hygiene.py --root . --require-rules --require-env-rules --require-commit-range --commit-range origin/main..HEAD @paths
codex.cmd -a never exec --json --sandbox read-only "Reply with exactly: MAS_ADAPTER_OK"
docker exec multi-agent-assi-redis-1 redis-cli DEL mas:agent-jobs mas:room-events
@'<manual tsx script>'@ | pnpm.cmd --filter @multi-agent-assi/host exec tsx -
```

## Results

- `RuntimeAdapter` contract added under `packages/agent-runtime`.
- `createMockAgentWorker` now uses the same generic worker path as other adapters.
- `createCodexCliAdapter` normalizes JSONL `agent.delta` and final message output, falls back to plain stdout, handles non-zero exit, spawn errors, and timeout.
- Host default runtime remains `mock`; `DEFAULT_AGENT_RUNTIME_KIND=codex-cli` can seed default seats as Codex-bound.
- Full `pnpm.cmd test` passed with 11 test files and 39 tests before the final Windows subprocess fixes.
- Real direct Codex CLI check returned `MAS_ADAPTER_OK`.
- Real Room Hub path check returned a durable agent message body `MAS_ROOM_OK` and invocation status `succeeded`.

Observed manual Room Hub summary:

```json
{
  "invocation": {
    "agentId": "architect",
    "status": "succeeded"
  },
  "messages": [
    {
      "kind": "user_message",
      "body": "Reply with exactly: MAS_ROOM_OK"
    },
    {
      "kind": "agent_message",
      "sender": {
        "type": "agent",
        "agentId": "architect"
      },
      "body": "MAS_ROOM_OK"
    }
  ]
}
```

## Windows Runtime Findings

- `codex` resolves to `codex.ps1` under PowerShell and can be blocked by execution policy.
- `codex.cmd` works when run directly from PowerShell, but wrapping `.cmd` from Node split prompt arguments through the npm shim.
- WindowsApps `codex.exe` was present but returned access denied when invoked directly.
- The stable adapter path on this machine is current Node executing `%APPDATA%\npm\node_modules\@openai\codex\bin\codex.js` with stdin ignored and stdout/stderr piped.
- Codex CLI may reconnect for more than two minutes, so the adapter default timeout was raised to 300 seconds while tests keep an explicit short timeout case.

## Slot Control Evidence

Automated tests prove:

- one job dispatches through the adapter matching `AgentSeat.runtime.kind`;
- missing adapter fails and acks only the current invocation;
- two jobs for the same `agentId` do not run concurrently;
- jobs for different `agentId` values can run concurrently;
- one agent failure in a batch does not block another agent from succeeding.

## Remaining Gaps

- Session continuity metadata is still not persisted.
- Cancellation API/UI is not implemented.
- Slot control is in-process for the current local worker shape; Redis-backed distributed slot leases remain future work.
- Web Console invocation-status presentation remains minimal.

## Artifacts

- `packages/agent-runtime/src/agentWorker.ts`
- `packages/agent-runtime/src/codexCliAdapter.ts`
- `packages/agent-runtime/src/mockRuntimeAdapter.ts`
- `packages/agent-runtime/src/mockAgentWorker.ts`
- `packages/agent-runtime/test/agentWorker.test.ts`
- `packages/agent-runtime/test/codexCliAdapter.test.ts`
- `packages/agent-runtime/test/mockAgentWorker.test.ts`
- `packages/persistence/src/repositories.ts`
- `packages/persistence/test/repositories.test.ts`
- `apps/host/src/index.ts`
- `apps/host/src/runtimeConfig.ts`
- `apps/host/test/runtimeConfig.test.ts`
- `.env.example`
- `docs/superpowers/plans/2026-05-31-codex-adapter-slot-control.md`
- `docs/features/F001-equal-room-host-core.md`
- `docs/features/F002-reference-architecture-adoption.md`

## Notes

Manual Redis keys were cleared before the real Room Hub Codex check so stale test jobs could not masquerade as current runtime evidence. After manual checks, clear `mas:agent-jobs` and `mas:room-events` again before running integration tests in the same local Redis instance.
