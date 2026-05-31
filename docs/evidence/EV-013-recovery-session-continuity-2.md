---
id: EV-013
doc_kind: evidence
scope: project
feature_ids:
  - F007
feature_refs:
  - docs/features/F007-recovery-session-continuity-2.md
created: 2026-05-31
---

# EV-013: Recovery Session Continuity 2.0

## Scope

本证据记录 F007 `Recovery Session Continuity 2.0` 的实现与验证结果。范围包括 Host startup recovery 顺序、Room Hub `recoverThreadContinuity(threadId)`、queued invocation re-enqueue、stale running failure、succeeded round continuation、failed/canceled round settlement、半写入 crash window 收敛、严格 prompt reconstruction、terminal round skip，以及独立 code review 和 Vision Gate 复审。

本证据不声明 Feishu Connector、自动 `codex resume`、retry/resume UI、Claude/OpenCode/Gemini runtime binding 或通用恢复平台已经完成。

## Commits

```text
0be0f86 docs: anchor recovery session continuity 2
d3ceb11 feat: recover room continuity from sqlite
2e2c617 feat: run recovery before host worker start
60affd1 fix: clarify recovery idempotency results
286cd74 test: guard recovery startup order
ad5121c fix: harden recovery convergence after restart
```

## Results

Pass.

- `apps/host/src/index.ts` now calls `recoverBeforeWorkerStart({ roomHub, worker, threadId: 'default-thread' })`, and the helper awaits Room Hub recovery before `worker.start()`.
- `RoomHub.recoverThreadContinuity(threadId)` reads SQLite messages, invocations, rounds, and steps as durable facts.
- Queued invocations are re-enqueued to Redis only when their persisted round/step still allows execution. Terminal rounds are skipped with `recovery.skipped_terminal_round` audit instead of re-running work.
- Missing Redis jobs can be restored from persisted source messages and F006 policy prompt builders.
- Running invocations left by a prior Host are marked failed with `Recovered stale running invocation after host restart`, audited, and settled through round convergence.
- Succeeded round-linked invocations with non-terminal rounds continue policy progression idempotently, including crash windows where the current step was already persisted `succeeded`.
- Failed/canceled round-linked invocations with non-terminal rounds settle current step, cancel not-yet-run dependents, and mark the round terminal, including crash windows where the current step was already persisted terminal.
- Reviewer/implementer prompt reconstruction refuses to guess when predecessor output is missing or reviewer verdict is not `approved`.
- Event publication is useful but not the fact source; durable SQLite convergence is not blocked by failure-event publish errors in stale running recovery.

## Commands

```text
pnpm.cmd test -- packages/room-hub/test/createRoomHub.test.ts -t "prompt reconstruction fails"
pnpm.cmd test -- packages/room-hub/test/createRoomHub.test.ts -t "recoverThreadContinuity"
pnpm.cmd test -- packages/room-hub/test/createRoomHub.test.ts -t "SQLite half-written"
pnpm.cmd test -- packages/room-hub/test/createRoomHub.test.ts apps/host/test/startup.test.ts
pnpm.cmd build
docker compose exec -T redis redis-cli -n 15 FLUSHDB
$env:REDIS_URL='redis://127.0.0.1:6379/15'; pnpm.cmd test
python -m unittest tests.test_public_hygiene
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
```

## Verification Results

```text
Focused prompt reconstruction regression: 1 test passed after RED failure.
Focused recoverThreadContinuity run: 11 tests passed after five RED crash-window tests were added.
Focused SQLite half-written regression: 1 test passed.
Room Hub + Host startup focused run: 2 test files passed, 34 tests passed.
pnpm.cmd build: passed; 7 workspace projects built.
pnpm.cmd test with REDIS_URL=redis://127.0.0.1:6379/15 after Redis DB15 FLUSHDB: 12 test files passed, 107 tests passed.
python -m unittest tests.test_public_hygiene: Ran 10 tests, OK.
knowledge_check.py --strict before EV-013 closeout: Scanned 42 markdown file(s). Checked 21 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Harness Validation

```text
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
Scanned 43 markdown file(s). Checked 22 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Independent Review

Initial Vision Gate review returned `needs revision` because queued round invocation prompt reconstruction failure marked the invocation failed but did not settle the linked round/step. `ad5121c` fixed this and added regression coverage. Vision re-review returned `pass`: the deliverable remains the minimal restart recovery loop, does not drift into automatic resume, Feishu, runtime binding expansion, retry UI, or a generic recovery platform, and reinforces SQLite durable facts plus Redis runtime coordination.

Initial code review found three Critical issues and four Important issues:

- `continueRoundAfterInvocation` no-oped when the current step was already terminal, so crash windows after step success but before dependent queue or final round success could strand rounds.
- `settleRoundAfterInvocation` no-oped when the current step was already terminal, so crash windows after step failure/cancel but before round terminal write could strand rounds.
- queued recovery could re-enqueue invocations attached to terminal rounds.
- prompt reconstruction failure did not settle linked rounds.
- stale running recovery could let event publish failure interrupt durable settlement.
- reviewer/implementer prompt reconstruction was too permissive when predecessor output or reviewer approval was missing.
- recovery tests needed explicit crash-window coverage and at least one real SQLite repository regression.

`ad5121c` addressed these with convergence guards based on current SQLite facts, terminal round skip audits, strict predecessor-output checks, best-effort failure publish, and new crash-window tests. Code reviewer re-check returned `Ready` with no Critical or Important issues.

## Recovery Path

- If Redis loses queued jobs, startup recovery re-enqueues still-actionable queued invocations from persisted source messages and policy prompts.
- If a prior Host dies while an invocation is `running`, startup recovery marks it failed and settles any linked round.
- If a worker persists invocation success but dies before round continuation, startup recovery advances the next round step or marks the final round succeeded.
- If a worker persists invocation failure/cancel but dies before round settlement, startup recovery settles the round and cancels dependent pending/queued steps.
- If live events are missed, Host bootstrap still reads durable SQLite state, including audit entries.

## Residual Risks

- Host startup currently recovers `default-thread`. Before Feishu or multi-thread use, startup should enumerate persisted threads instead of relying on the local single-thread assumption.
- Repeated recovery of a still-queued invocation may intentionally add duplicate Redis jobs/audit entries. Worker `tryStartInvocation` prevents duplicate execution, but audit noise can be tightened later.
- Terminal rounds with orphan queued invocations are skipped and audited rather than forcing the invocation terminal. This is safe for F007 but should receive an explicit product/state policy later.
- Automatic runtime resume remains deliberately out of scope. Captured runtime session metadata is preserved for a future explicit resume feature.

## Artifacts

- `apps/host/src/index.ts`
- `apps/host/src/startup.ts`
- `apps/host/test/startup.test.ts`
- `packages/room-hub/src/createRoomHub.ts`
- `packages/room-hub/test/createRoomHub.test.ts`
- `docs/features/F007-recovery-session-continuity-2.md`
- `docs/superpowers/specs/2026-05-31-recovery-session-continuity-2.md`
- `docs/superpowers/plans/2026-05-31-recovery-session-continuity-2.md`

## Notes

本阶段的关键判断是：Recovery 2.0 不是 runtime-specific resume，也不是把 Redis pending state 当事实源；它只负责在 Host startup 时从 SQLite 当前事实收敛 Room Hub 可确定的不一致。任何需要用户授权、runtime adapter 细节或远程入口低信任确认的动作，都留给后续 Feature。
