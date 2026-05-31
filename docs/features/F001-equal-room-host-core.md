---
id: F001
doc_kind: feature
status: active
created: 2026-05-26
updated: 2026-05-26
---

# F001: Equal-Room Host Core

## Goal

构建运行在用户主力电脑上的 Multi-Agent Equal-Room Host，让多个独立 agent runtime 以平等协作者身份进入同一个房间工作，减少用户手动复制粘贴上下文的成本，同时保留上下文隔离、互相质疑、review、风险发现和用户最终收敛权。

## Vision Anchor

- 原始请求或来源：`AGENTS.md` 项目目标，以及 legacy 设计稿 `docs/superpowers/specs/2026-04-05-multi-codex-room-design.md`、`docs/superpowers/specs/2026-05-01-multi-codex-equal-room-host-design.md`、`docs/superpowers/specs/2026-05-24-independent-multi-codex-room-design.md`。
- 用户痛点或工程问题：多个 agent 分散在不同 CLI/远程入口时，用户需要手动转述、复制输出、判断冲突，且缺少可追溯 invocation、持久事实源和恢复路径。
- 期望结果：Web Console、Host Runtime、Room Hub、Event Bus、Persistence、Agent Runtime、Runtime Adapter、Orchestration、Connector Interface 形成同一条主链路。
- 非目标或边界：不是 subagent 调度器，不创建绕开 Room Hub 的 MVP，不让 Web/飞书/移动端成为核心状态所有者，不把 Codex CLI 硬编码成唯一 runtime。
- Exit Gate 对照来源：本 Feature 的验收标准、`AGENTS.md` 核心原则，以及 F002 的架构映射。

## Current Status

In Progress。当前 canonical Feature 负责承载总体 Vision Anchor；存量详细 spec/plan 保留在 `docs/superpowers/**` 作为 legacy 历史材料。

## Links

- Legacy spec: [2026-04-05 multi-codex room design](../superpowers/specs/2026-04-05-multi-codex-room-design.md)
- Legacy plan: [2026-04-05 multi-codex room v1 plan](../superpowers/plans/2026-04-05-multi-codex-room-v1.md)
- Legacy spec: [2026-05-01 multi-codex equal-room host design](../superpowers/specs/2026-05-01-multi-codex-equal-room-host-design.md)
- Legacy plan: [2026-05-01 architecture skeleton v1 plan](../superpowers/plans/2026-05-01-architecture-skeleton-v1.md)
- Rebaseline plan: [2026-05-26 architecture skeleton rebaseline](../superpowers/plans/2026-05-26-architecture-skeleton-rebaseline.md)
- Legacy spec: [2026-05-24 independent multi-codex room design](../superpowers/specs/2026-05-24-independent-multi-codex-room-design.md)
- Related Feature: [F002 reference architecture adoption](F002-reference-architecture-adoption.md)
- Phase 2/3 plan: [2026-05-31 codex adapter and slot control](../superpowers/plans/2026-05-31-codex-adapter-slot-control.md)
- Evidence: [EV-001 local reference runtime validation](../evidence/EV-001-local-reference-runtime-validation.md)
- Evidence: [EV-004 harness knowledge migration](../evidence/EV-004-harness-knowledge-migration.md)

## Acceptance Criteria

- [ ] 所有用户输入都进入 Room Hub，并由 Room Hub 创建 Invocation。
- [ ] 实时输出通过 Event Bus 返回 Web Console 或连接器。
- [ ] rooms、threads、messages、agents、sessions、invocations、rounds、audit logs 等持久事实进入 SQLite。
- [ ] Redis 只承担 event streams、pub/sub、invocation queue、agent heartbeat、runtime state、idempotency keys 等运行时协调职责。
- [ ] 默认协作成员支持 `architect`、`reviewer`、`implementer`，且成员身份与 runtime binding 解耦。
- [ ] 单个 agent 失败、取消或超时不会破坏其他 agent 的上下文或整个房间状态。
- [ ] 远程入口只能作为低信任 connector 复用核心 runtime，不拥有核心状态。

## Patch History

None yet

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

- [EV-001 local reference runtime validation](../evidence/EV-001-local-reference-runtime-validation.md) 记录了本地参考运行时对多 Codex-bound agent、mention routing、invocation lifecycle、session continuity 的验证。
- [EV-004 harness knowledge migration](../evidence/EV-004-harness-knowledge-migration.md) 记录本次 Harness canonical artifact 迁移和 strict validator 结果。
- [EV-006 architecture skeleton rebaseline](../evidence/EV-006-architecture-skeleton-rebaseline.md) 记录 Phase 1 skeleton 计划已按 canonical Feature/ADR 重新基线化。
- [EV-007 architecture skeleton local runtime](../evidence/EV-007-architecture-skeleton-local.md) records the local Phase 1 skeleton runtime path through Web Console, Host API, Room Hub, SQLite, Redis, mock Agent Runtime, WebSocket, and back to Web Console.
- [EV-008 codex adapter and slot control](../evidence/EV-008-codex-adapter-slot-control.md) records the first real Codex Adapter Room Hub path and in-process per-agent slot control evidence.
- [EV-010 redis slot lease worker integration](../evidence/EV-010-redis-slot-lease-worker-integration.md) records Redis-backed slot lease integration in Agent Runtime and Event Bus pending/stale recovery.

## Next Step

Continue closing F001 by making recovery and orchestration visible in the Web Console: round-step status, audit timeline, and resume metadata should be inspectable without moving core state into the frontend.
