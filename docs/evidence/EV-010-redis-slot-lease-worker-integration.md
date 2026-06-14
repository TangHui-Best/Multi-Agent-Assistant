---
id: EV-010
doc_kind: evidence
scope: project
feature_ids:
  - F001
  - F004
feature_refs:
  - docs/features/F001-equal-room-host-core.md
  - docs/features/F004-orchestration-recovery-hardening.md
created: 2026-05-31
---

# EV-010: Redis Slot Lease Worker Integration

## Scope

本证据记录 Redis-backed agent slot lease 从 Event Bus contract 推进到 Agent Runtime worker 接入的结果。

目标不是引入完整分布式 scheduler，而是补齐 F004 遗留的最小安全链路：

- worker 在运行 adapter 前获取 Redis owner lease；
- 拿不到 lease 时不运行、不 ack，避免丢失 stream job；
- Event Bus 先恢复 pending/stale pending job，再读取新 job；
- 已取消 queued invocation 可以不依赖 lease 直接 ack；
- 成功或失败后释放 owner lease。

## Commits

```text
0dcf1b7 feat: recover pending agent jobs before new work
0b6d53b feat: guard agent jobs with redis slot leases
d59d727 fix: harden slot lease worker races
7faa47f fix: recover stale running slot jobs
```

## Results

- `RedisEventBus.readAgentJobs` now replays current-consumer pending entries before reading new stream entries.
- `RedisEventBus.readAgentJobs` uses `XAUTOCLAIM` with a 30 second idle threshold to recover stale pending agent jobs.
- Agent worker now derives a stable per-worker lease owner id and acquires `acquireAgentSlotLease(agentId, ownerId, ttlMs)` before running an active invocation.
- Lease-denied jobs are left unacked so the stream recovery path can retry them instead of dropping them.
- Already-canceled queued invocations are acked without requiring a lease, so cancellation cleanup is not blocked by another worker holding the seat.
- Acquired leases are released after adapter success and adapter failure; release errors are logged and the Redis TTL remains the fallback.
- Review follow-up moved stream ack inside the lease-protected section before lease release, so a second worker cannot acquire the lease and rerun the same terminal invocation in the release-before-ack window.
- Persistence now exposes `tryStartInvocation`, a conditional `queued -> running` transition. Workers only start adapters after this transition succeeds.
- Terminal invocations (`succeeded`, `failed`, `canceled`) are treated as already processed stream entries and acked without acquiring a slot lease or rerunning an adapter.
- `XAUTOCLAIM` now follows the returned cursor through a bounded number of pages before falling back to new stream entries.
- Stale pending entries whose invocation is still `running` now use Redis lease ownership to decide recovery: if the lease is unavailable, the job remains unacked; if the lease is available, the worker marks the invocation failed, publishes failure, acks, and does not rerun the adapter.

## Commands

```text
pnpm.cmd exec vitest run packages/event-bus/test/redisEventBus.test.ts
pnpm.cmd exec vitest run packages/agent-runtime/test/agentWorker.test.ts
pnpm.cmd --filter @multi-agent-assi/agent-runtime build
pnpm.cmd exec vitest run packages/agent-runtime/test/agentWorker.test.ts packages/event-bus/test/redisEventBus.test.ts
pnpm.cmd exec vitest run packages/agent-runtime/test/agentWorker.test.ts packages/persistence/test/repositories.test.ts packages/event-bus/test/redisEventBus.test.ts
pnpm.cmd exec vitest run packages/agent-runtime/test/agentWorker.test.ts
pnpm.cmd build
pnpm.cmd test
```

## Verification Results

```text
packages/event-bus/test/redisEventBus.test.ts: 6 tests passed
packages/agent-runtime/test/agentWorker.test.ts: 15 tests passed
Focused Event Bus + Agent Worker run: 21 tests passed
Focused review-fix run: 3 test files passed, 31 tests passed
Stale-running focused run: packages/agent-runtime/test/agentWorker.test.ts passed, 18 tests passed
pnpm.cmd --filter @multi-agent-assi/agent-runtime build: passed
pnpm.cmd build: passed after review fixes and stale-running recovery
pnpm.cmd test: initially caught mock worker expectations still assuming unguarded running status updates; after updating tests for CAS semantics, 11 test files passed, 67 tests passed; final run after stale-running recovery passed with 11 test files and 68 tests
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict: Scanned 31 markdown file(s). Checked 16 knowledge artifact(s). Errors: 0. Warnings: 0.
python -m unittest tests.test_public_hygiene: Ran 10 tests, OK
public_hygiene.py tracked/untracked scan: passed, 96 file(s), 0 rule(s)
public_hygiene.py env + commit-range scan: passed, 96 file(s), 1 rule(s)
```

## Recovery Path

- If a worker cannot acquire an agent slot lease, it leaves the Redis stream entry pending and does not mutate invocation state.
- The same consumer can replay its pending entry on the next read.
- Another consumer can claim stale pending work after the idle threshold.
- A processed stream entry is acked before the worker releases the slot lease. If lease release fails, the owner TTL eventually frees the slot.
- If a pending stream entry points at a terminal invocation, the worker acks it without acquiring a lease or rerunning the adapter.
- If `queued -> running` is rejected because another durable transition won the race, terminal invocations are acked.
- If a stale pending entry points at a `running` invocation, Redis lease ownership drives recovery: lease denied means another runtime may still own the seat, lease acquired means the stale running invocation is failed and acked rather than duplicated.

## Residual Risks

- Lease TTL is fixed relative to the worker timeout and does not yet renew during very long adapter executions. Current default timeout is 300 seconds and default lease TTL is timeout plus 30 seconds.
- Stale pending claim uses a fixed 30 second idle threshold. A future operational dashboard may need this surfaced as configuration.
- Running invocations recovered from a crashed worker are not automatically retried in this slice. They are failed after the slot lease can be acquired, so future resume/retry work can use persisted session metadata and audit trail instead of duplicating runtime execution.
- If future configuration allows `slotLeaseTtlMs` to be lower than `timeoutMs`, a still-running adapter could be misclassified as stale. Current default is `timeoutMs + 30_000`; keep that invariant until lease renewal exists.
- This slice does not add round-step visualization or connector-level recovery UI.

## Independent Review

Initial independent review found three issues:

- Important: slot lease was released before stream ack, creating a rerun window for already-terminal invocations.
- Important: running transition was not conditional, so a cancellation race could be overwritten.
- Medium: stale pending claim ignored the `XAUTOCLAIM` cursor.

All three were addressed in `d59d727` with targeted tests. Re-review then found one additional Important issue: stale pending entries whose invocation was already `running` could remain permanently unacked. `7faa47f` fixed that by using slot lease ownership as the stale-running recovery signal, marking the invocation failed and acking only after the worker can acquire the lease.

Final re-review found no Critical or Important issues. The reviewer noted one residual non-blocking risk: future configs must not set `slotLeaseTtlMs` below `timeoutMs` before lease renewal exists.

## Artifacts

- `docs/superpowers/plans/2026-05-31-redis-slot-lease-worker-integration.md`
- `packages/event-bus/src/redisEventBus.ts`
- `packages/event-bus/test/redisEventBus.test.ts`
- `packages/agent-runtime/src/agentWorker.ts`
- `packages/agent-runtime/test/agentWorker.test.ts`
- `packages/persistence/src/repositories.ts`
- `packages/persistence/test/repositories.test.ts`

## Notes

This slice converts the earlier Redis lease contract into worker behavior, but it deliberately keeps scheduling narrow: Redis Streams remain the job queue, SQLite remains the durable invocation fact source, and the worker still acks only after durable invocation handling.
