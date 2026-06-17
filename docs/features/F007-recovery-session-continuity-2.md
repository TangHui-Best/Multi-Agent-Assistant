---
id: F007
doc_kind: feature
status: completed
created: 2026-05-31
updated: 2026-06-14
---

# F007: Recovery Session Continuity 2.0

## Goal

实现本地 Host 重启后的恢复闭环：Host 启动时从 SQLite 恢复 room、invocation、round、step、audit 和 session metadata 的一致状态，自动收敛安全可判定的不一致，并让仍需后续处理的恢复事实可由 Web Console bootstrap 和 live events 检查。

## Vision Anchor

- 原始请求或来源：用户要求在 `Orchestration Policy Layer` 后进入 `Recovery / Session Continuity 2.0 的重启恢复闭环`。
- 用户痛点或工程问题：F004/F005/F006 已经持久化并可视化 invocation、round、audit 和 session metadata，但进程崩溃或 Host 重启后，Redis queue、worker callback 和 SQLite terminal state 之间仍可能出现短暂或永久不一致。
- 期望结果：重启后不依赖 Web/Redis 内存判断事实，Room Hub/Persistence 能 reconcile queued、running、succeeded、failed、canceled invocation 与 round/step；Web Console 能看见恢复动作留下的 audit/recovery evidence。
- 非目标或边界：不自动执行 Codex `resume`，不做 retry/resume UI，不引入 Feishu，不扩 Claude/OpenCode/Gemini binding，不建设通用恢复平台，不让 connector 拥有核心状态。
- Exit Gate 对照来源：本 Feature、F001、F004、F005、F006、ADR-002、EV-010、EV-011、EV-012，以及 `docs/superpowers/specs/2026-05-31-recovery-session-continuity-2.md`。

## Feature Intake

- Original problem: 重启后需要恢复已持久化的 thread/round/invocation continuity，而不是丢失 runtime 事实。
- User pain point: 如果只依赖内存或单个 default-thread，重启后 agent 协作链路不可追踪。
- Capability promise: 记录并展示 runtime session metadata，启动时按持久化 thread 恢复 continuity。
- Non-goals: 不做自动 runtime resume；不让 Redis 成为持久事实源。
- Acceptance source: F007 acceptance criteria、EV-013 recovery session continuity 2、EV-014 startup recovery。
- Open questions: 显式 resume action 已拆到 F011。

## Capability Contract

- SQLite 保存恢复事实，Redis 只做运行时协调，Host startup 在 worker start 前恢复 persisted threads。

## Current Status

Completed. 本阶段完成 Feishu Connector 前的最后一个本地可靠性切片：Host startup 先运行 Room Hub recovery，再启动 worker；Room Hub 以 SQLite 为事实源，收敛 queued/running/succeeded/failed/canceled invocation 与 round/step 半写入状态。

## Links

- Parent Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- Related Feature: [F004 orchestration recovery hardening](F004-orchestration-recovery-hardening.md)
- Related Feature: [F005 local room productization recovery visualization](F005-local-room-productization-recovery-visualization.md)
- Related Feature: [F006 orchestration policy layer](F006-orchestration-policy-layer.md)
- ADR: [ADR-002 invocation orchestration and recovery contracts](../decisions/ADR-002-invocation-orchestration-recovery-contracts.md)
- Prior Evidence: [EV-010 redis slot lease worker integration](../evidence/EV-010-redis-slot-lease-worker-integration.md)
- Prior Evidence: [EV-012 orchestration policy layer](../evidence/EV-012-orchestration-policy-layer.md)
- Evidence: [EV-013 recovery session continuity 2](../evidence/EV-013-recovery-session-continuity-2.md)
- Design spec: [2026-05-31 recovery session continuity 2](../superpowers/specs/2026-05-31-recovery-session-continuity-2.md)

## Acceptance Criteria

- [x] Host startup runs a bounded recovery reconciliation before starting the worker loop.
- [x] Recovery reconciliation reads SQLite as the durable source of truth and does not depend on Web or Redis memory state.
- [x] Queued invocations are re-enqueued with reconstructed prompts so lost Redis jobs do not strand work.
- [x] Running invocations left by a prior Host process are marked failed with a restart recovery reason and audit entry.
- [x] Succeeded round-linked invocations with non-terminal rounds re-enter policy continuation idempotently.
- [x] Failed or canceled round-linked invocations with non-terminal rounds settle their round/step state.
- [x] Recovery publishes live room events where useful, but bootstrap remains sufficient to inspect the final recovered state.
- [x] Automatic runtime `resume` remains out of scope; captured session metadata is preserved as evidence for future explicit resume work.
- [x] Automated tests cover queued re-enqueue, stale running failure, succeeded continuation, failed/canceled round settlement, idempotency, and Host startup wiring.

## Acceptance Map

| Claim | Acceptance | Evidence | Status |
| --- | --- | --- | --- |
| Startup recovery enumerates persisted threads before worker start | Feature acceptance criteria | EV-013 recovery session continuity 2; EV-014 first local product milestone | completed slice, explicit resume pending |

## State Timeline

| Date | State | Trigger | Evidence | Note |
| --- | --- | --- | --- | --- |
| 2026-06-14 | completed slice, explicit resume pending | Current Harness schema alignment | This Feature | Added required recovery-oriented Feature sections without changing scope. |

## Patch History

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F007.1 | 2026-05-31 | `ad5121c` | 半写入 crash window 下，已 terminal 的 step 会让 continuation/settlement helper 过早 no-op，可能留下 non-terminal round；terminal round 中的 queued invocation 也可能被重新投递。 | 正常执行路径的 helper 假设 current step 还未 terminal；recovery 需要从 SQLite 当前事实收敛，而不是只复用前进路径。 | 新增 half-written succeeded step、final succeeded step、failed persisted step、terminal round skip、strict prompt reconstruction、SQLite repository regression tests。 | completed |

## Evidence

[EV-013 recovery session continuity 2](../evidence/EV-013-recovery-session-continuity-2.md)

## Recovery Snapshot

- Read first: This Feature, linked ADR/spec/evidence, and AGENTS.md project rules.
- Current capability state: completed slice, explicit resume pending.
- Known risks: Host bootstrap 当前仍面向默认线程视图，多线程产品导航待后续扩展。
- Next safe action: 继续把自动 resume 视为 out of scope，通过 F011 设计显式用户授权。
- Unblock condition: Scope, acceptance evidence, and safety boundaries are clear for the selected next slice.

## Next Step

进入 Feishu Connector 前，保留三个明确 follow-up：多 thread startup recovery、terminal round orphan queued invocation 的最终状态语义、重复 queued recovery audit/job 噪音收敛。Feishu Connector 本身仍必须作为低信任 connector，不拥有核心状态。
