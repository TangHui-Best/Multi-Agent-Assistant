---
id: ADR-002
doc_kind: adr
status: accepted
scope: project
feature_ids:
  - F004
feature_refs:
  - docs/features/F004-orchestration-recovery-hardening.md
decision_area: invocation-orchestration-recovery
created: 2026-05-31
updated: 2026-05-31
---

# ADR-002: Invocation Orchestration And Recovery Contracts

## Context

Phase 2/3 已经证明 Codex Adapter 可以通过 Room Hub -> Event Bus -> Agent Runtime -> Persistence 主链路执行，并且单进程 worker 可以按 agent seat 串行处理 job。下一阶段会引入取消、超时、round orchestration、session continuity 和 audit log。如果这些能力分散在 Web Console 或 adapter 私有状态里，系统会再次变成不可追踪的 CLI 控制台，而不是 equal-room host。

## Decision

采用以下边界：

- Invocation lifecycle 的事实源是 SQLite Persistence；Redis 事件和队列只做运行时协调。
- Cancellation API 由 Host 暴露、Room Hub 处理、Persistence 记录，并通过 Event Bus 通知 Agent Runtime；Web Console 只能调用 API 和展示状态，不拥有取消状态。
- Timeout 是 Runtime Adapter contract 的一部分。Agent Runtime 给 adapter 传入 deadline/abort signal，adapter 负责终止本 runtime 进程；Persistence 记录 `failed` 状态和 audit reason。
- Slot lease 的长期分布式形态属于 Redis-backed runtime coordination；当前 worker 可以先保留 in-process serialization，但接口必须能替换为 Redis lease，不能把 slot 所有权放进 Web 或 SQLite busy lock。
- `design_review_execute` 是 Room Hub/Orchestration 能力，而不是前端脚本。它必须创建 persisted round，并按 architect -> reviewer -> implementer 形成可追踪 step chain。
- Codex session id 与 resume metadata 是 invocation 的恢复元数据，存入 SQLite；Codex Adapter 只负责捕获和上报，不成为事实源。
- Invocation audit log 记录生命周期事件、触发原因和恢复所需 metadata；它不是普通 room message，也不替代用户可见消息。

## Alternatives

- Web Console 本地维护 cancellation/status：拒绝。它会让远程 connector 无法复用同一事实源，并制造第二套状态。
- 只依赖 Redis 保存 session 和 audit：拒绝。Redis 是运行时协调层，不是持久事实源。
- 先做完整分布式 scheduler：暂缓。当前原始问题是防止失控和保留可恢复路径，不是建设宽平台；先设计 lease contract，再在 worker 需要跨进程竞争时实现 Redis lease。
- 把 `design_review_execute` 展开为三个独立用户消息：拒绝。这样会丢失 round 边界，reviewer/implementer 的结论无法追踪到同一次协作链。

## Consequences

收益是 invocation、round、session 和 audit 都能从 SQLite 恢复，Web 和未来 connector 共享同一条主链路。代价是 schema 和 repository contract 会变厚；必须用小 commit 和 Evidence 防止把 Phase 4/5 做成过宽平台。

## Evidence

- `docs/features/F004-orchestration-recovery-hardening.md`
- `docs/evidence/EV-008-codex-adapter-slot-control.md`
