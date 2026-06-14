---
id: EV-012
doc_kind: evidence
scope: project
feature_ids:
  - F006
feature_refs:
  - docs/features/F006-orchestration-policy-layer.md
created: 2026-05-31
---

# EV-012: Orchestration Policy Layer

## Scope

本证据记录 F006 `Orchestration Policy Layer` 的实现与验证结果。范围包括 `design_review_execute` 的 Room Hub policy helper、reviewer verdict gate、approved/block/missing verdict 行为、失败/取消 round 收敛、`round.updated` live projection、worker failure notification，以及独立 code review 和 Vision Gate re-review。

本证据不声明 Recovery / Session Continuity 2.0、Feishu Connector、Claude/OpenCode/Gemini runtime binding 或通用 workflow DSL 已完成。

## Commits

```text
c39069e docs: anchor orchestration policy layer
936542c feat: add design review policy helpers
acbe6b8 feat: enforce reviewer gate in orchestration policy
6bbdc46 feat: converge failed orchestration rounds
5a3f0be feat: publish live round policy updates
0fadea6 fix: harden orchestration policy convergence
```

## Results

Pass.

- `packages/room-hub/src/orchestrationPolicy.ts` now owns fixed `design_review_execute` step ids, prompt builders, and conservative reviewer verdict parsing.
- Reviewer output must contain exactly one verdict line as the final non-empty line; missing or ambiguous verdicts stop the round instead of queuing implementer.
- Approved reviewer verdict queues implementer with original request, architect output, and reviewer output.
- `changes_requested` and missing verdict mark the round failed, cancel the implementer step, and publish `round.updated`.
- Duplicate continuation callbacks for non-final steps are no-ops once the dependent step is already queued.
- Stale failure/cancel callbacks do not overwrite terminal step or round state.
- Failed/canceled round-linked invocations settle current step and round, and cancel only not-yet-run dependent steps.
- Success path publishes `round.updated` for architect -> reviewer, reviewer approved -> implementer, and final round success.
- Agent Runtime failure notification no longer blocks Redis ack or slot lease release when the callback hangs.

## Commands

```text
pnpm.cmd exec vitest run packages/room-hub/test/createRoomHub.test.ts
pnpm.cmd exec vitest run packages/agent-runtime/test/agentWorker.test.ts packages/room-hub/test/createRoomHub.test.ts
pnpm.cmd exec vitest run apps/web/src/App.test.ts packages/room-hub/test/createRoomHub.test.ts
pnpm.cmd exec vitest run packages/room-hub/test/createRoomHub.test.ts apps/web/src/App.test.ts packages/agent-runtime/test/agentWorker.test.ts
docker compose exec -T redis redis-cli -n 15 FLUSHDB
pnpm.cmd build
$env:REDIS_URL='redis://127.0.0.1:6379/15'; pnpm.cmd test
python -m unittest tests.test_public_hygiene
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
```

## Verification Results

```text
Focused Room Hub policy run: 19 tests passed before final review hardening.
Focused Room Hub + Web + Agent Runtime run after review fixes: 3 test files passed, 54 tests passed.
pnpm.cmd build: passed; 7 workspace projects built, including apps/web, packages/room-hub, packages/agent-runtime, and apps/host.
pnpm.cmd test with REDIS_URL=redis://127.0.0.1:6379/15 after Redis DB15 FLUSHDB: 11 test files passed, 94 tests passed.
python -m unittest tests.test_public_hygiene: Ran 10 tests, OK.
knowledge_check.py --strict before this Evidence closeout: Scanned 38 markdown file(s). Checked 19 knowledge artifact(s). Errors: 0. Warnings: 0.
knowledge_check.py --strict after EV-012 and F006 status update: Scanned 39 markdown file(s). Checked 20 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Harness Validation

```text
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
Scanned 39 markdown file(s). Checked 20 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Independent Review

Initial Vision Gate review returned `needs revision` because `round.updated` covered failure/gate/cancel paths but not successful progression or final success. `0fadea6` fixed this and added tests. Vision re-review returned `pass`: no scope drift into workflow DSL, Recovery 2.0, Feishu, or runtime binding; Room Hub applies policy, Persistence remains fact source, and Web remains read projection.

Initial code review found two Critical issues and four Important issues:

- duplicate `continueRoundAfterInvocation` could mark a round succeeded before reviewer/implementer ran;
- stale failure/cancel for an earlier invocation could overwrite downstream progress;
- multiple reviewer verdict lines were accepted by first match;
- successful round convergence did not publish `round.updated`;
- enqueue failure could leave later pending steps actionable;
- hanging `onInvocationFailed` callback could block ack and lease release.

`0fadea6` addressed these with status guards, terminal-state no-ops, pending/queued-only dependent cleanup, stricter verdict parsing, success-path `round.updated`, enqueue-failure cleanup, and fire-and-forget failure notification. Code reviewer re-check approved with residual risks only.

## Recovery Path

- Recovery / Session Continuity 2.0 can inspect SQLite `rounds`, `round_steps`, `invocations`, `messages`, and `invocation_audit_logs` to decide whether a round is terminal, waiting, blocked by reviewer, or stale.
- If a live `round.updated` event is missed, Host bootstrap still returns the durable round and step projection.
- If a worker persists invocation failure and the process dies before the fire-and-forget round settle callback finishes, a future restart reconciliation pass should compare failed round-linked invocations against non-terminal rounds and settle them.

## Residual Risks

- Failure convergence after worker failure notification is now intentionally off the ack/lease critical path. This protects runtime throughput but leaves a narrow crash window where invocation failure is durable and round state is temporarily stale until Recovery / Session Continuity 2.0 reconciles it.
- Reviewer verdict parsing is intentionally conservative and structured. It is not a natural-language review classifier and will block implementer when the verdict line is absent, duplicated, or not final.
- `design_review_execute` remains the only workflow. A broader workflow policy model is still out of scope until multiple workflows create real pressure for it.

## Artifacts

- `packages/room-hub/src/orchestrationPolicy.ts`
- `packages/room-hub/src/createRoomHub.ts`
- `packages/room-hub/test/createRoomHub.test.ts`
- `packages/shared/src/protocol.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.ts`
- `packages/agent-runtime/src/agentWorker.ts`
- `packages/agent-runtime/test/agentWorker.test.ts`
- `apps/host/src/index.ts`
- `docs/features/F006-orchestration-policy-layer.md`
- `docs/superpowers/specs/2026-05-31-orchestration-policy-layer.md`
- `docs/superpowers/plans/2026-05-31-orchestration-policy-layer.md`

## Notes

本阶段的关键判断是把“reviewer 是否允许 implementer 执行”和“round 为什么停止”变成可测试的 deterministic policy，而不是让 UI、Redis、runtime adapter 或自然语言推断拥有策略权。下一阶段应补重启恢复扫描，专门处理进程崩溃、stream pending、failed invocation 与非 terminal round 不一致等恢复闭环。
