---
id: F005
doc_kind: feature
status: completed
created: 2026-05-31
updated: 2026-06-14
---

# F005: Local Room Productization And Recovery Visualization

## Goal

把已经实现的 room、invocation、round、audit 和 session recovery 元数据变成用户可以在本地 Web Console 中检查的协作工作台能力，让用户能判断一次多 agent 协作走到哪一步、为什么失败、是否具备恢复依据。

## Vision Anchor

- 原始请求或来源：用户要求按 Harness 依次推进 `Local Room Productization + Recovery 可视化`、`Orchestration Policy Layer`、`Recovery / Session Continuity 2.0`、`Feishu Connector`、`Claude/OpenCode/Gemini runtime binding`。
- 用户痛点或工程问题：F004/EV-010 已经把后端 recovery 和 slot lease 能力做成可验证 runtime 增量，但 Web Console 仍只能看到 message timeline 和 seat-level invocation status，用户无法检查 round step、audit timeline 或 resume metadata。
- 期望结果：Web Console 能从 Host API 和 WebSocket 消费 persisted rounds、round steps、invocation audit 和 recovery metadata，并以只读方式展示协作进度与恢复依据；Room Hub/Persistence 仍是事实源。
- 非目标或边界：本 Feature 不实现自动 retry/resume，不引入 Feishu，不扩展 Claude/OpenCode/Gemini runtime binding，不建设通用 workflow DSL，不让前端拥有 core state。
- Exit Gate 对照来源：本 Feature、`docs/superpowers/specs/2026-05-31-local-room-productization-recovery-visualization-design.md`、F001、F004、ADR-002、EV-010。

## Feature Intake

- Original problem: Web Console 需要从临时 demo 收敛为本地房间工作台。
- User pain point: 没有可视化成员、线程、round、invocation 和恢复事实时，用户无法判断多 agent 协作是否可控。
- Capability promise: 展示成员/席位、线程时间线、Round 进度、Invocation/恢复详情和任务 Composer。
- Non-goals: 不让 Web Console 成为核心状态源；不迁移完整参考 UI 组件库。
- Acceptance source: F005 acceptance criteria、F008 workbench acceptance、EV-011、EV-014。
- Open questions: 多线程导航和更完整产品交互留给后续 Feature。

## Capability Contract

- Web Console 只消费 bootstrap 和 room events，并把任务提交回 Room Hub。

## Current Status

Completed. 本 Feature 已把 F004 留下的 persisted recovery 数据暴露为本地 Web Console 可读的产品化视图：Host 提供 rounds、round steps 与 invocation audit read projection，Web Console 以 bootstrap 与 room events 的投影展示 round 进度、step 状态和 selected invocation recovery detail。

## Links

- Parent Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- Related Feature: [F004 orchestration recovery hardening](F004-orchestration-recovery-hardening.md)
- ADR: [ADR-002 invocation orchestration and recovery contracts](../decisions/ADR-002-invocation-orchestration-recovery-contracts.md)
- Prior Evidence: [EV-010 redis slot lease worker integration](../evidence/EV-010-redis-slot-lease-worker-integration.md)
- Design spec: [2026-05-31 local room productization recovery visualization](../superpowers/specs/2026-05-31-local-room-productization-recovery-visualization-design.md)
- Implementation plan: [2026-05-31 local room productization recovery visualization](../superpowers/plans/2026-05-31-local-room-productization-recovery-visualization.md)
- Evidence: [EV-011 local room recovery visualization](../evidence/EV-011-local-room-recovery-visualization.md)

## Acceptance Criteria

- [x] `GET /api/bootstrap` returns the default thread's persisted rounds and round steps in addition to agents, messages, and invocations.
- [x] Host exposes a read-only invocation audit endpoint backed by SQLite `invocation_audit_logs`.
- [x] Web Console keeps local view state for rounds and round steps only as a projection of bootstrap and room events, not as a source of truth.
- [x] Web Console displays `design_review_execute` round progress with ordered architect -> reviewer -> implementer steps.
- [x] Step display derives the visible execution state from linked invocation status when available, so stale round step rows do not hide terminal invocation state.
- [x] Web Console can show selected invocation recovery details: status, source message id, runtime session id, resume metadata, and audit timeline.
- [x] The implementation keeps retry/resume execution out of scope and records that follow-up under Recovery / Session Continuity 2.0.
- [x] Automated tests cover bootstrap projection, audit endpoint behavior, round event merging, step status derivation, and recovery detail rendering.

## Acceptance Map

| Claim | Acceptance | Evidence | Status |
| --- | --- | --- | --- |
| Room workbench exposes recovery and round projection | Feature acceptance criteria | EV-011 local room recovery visualization; EV-014 first local product milestone | completed slice, active follow-up potential |

## State Timeline

| Date | State | Trigger | Evidence | Note |
| --- | --- | --- | --- | --- |
| 2026-06-14 | completed slice, active follow-up potential | Current Harness schema alignment | This Feature | Added required recovery-oriented Feature sections without changing scope. |

## Patch History

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F005.1 | 2026-05-31 | `7cc1421` | WebSocket live projection could be overwritten by slower bootstrap, and selected audit detail could show stale entries while reloading. | Bootstrap replacement treated the older durable snapshot as authoritative over newer room events, and audit loading state was keyed only by invocation id. | `mergeBootstrapState` and audit loading helper tests now preserve newer live status while backfilling durable fields and clearing old audit entries during refresh. | Closed |

## Evidence

- F004 and EV-010 prove that the underlying persisted recovery data already exists.
- EV-011 records the F005 implementation commits, automated verification, visual screenshot, independent reviews, and residual risks.

## Recovery Snapshot

- Read first: This Feature, linked ADR/spec/evidence, and AGENTS.md project rules.
- Current capability state: completed slice, active follow-up potential.
- Known risks: 首版 workbench 仍是产品化基线，不是完整协作 IDE。
- Next safe action: 后续 UI 改动继续保持 Web 为 projection，不新增私有状态源。
- Unblock condition: Scope, acceptance evidence, and safety boundaries are clear for the selected next slice.

## Next Step

Proceed to Orchestration Policy Layer before Recovery / Session Continuity 2.0. The next phase should make reviewer gates, round verdicts, and convergence policy explicit before adding automatic restart/resume execution.
