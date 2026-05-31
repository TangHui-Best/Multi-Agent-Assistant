---
id: F004
doc_kind: feature
status: active
created: 2026-05-31
updated: 2026-05-31
---

# F004: Orchestration Recovery Hardening

## Goal

把 Phase 3/4/5 的剩余能力收束为一组可验证的运行时增量：可取消、可超时、可追踪 round、可恢复 session、可审计 invocation，并让 Web Console 能看到 invocation 状态。

## Vision Anchor

- 原始请求或来源：用户在 2026-05-31 要求继续强化 Phase 3、实现 Phase 4 Orchestration、推进 Phase 5 Recovery / Session Continuity，并深化 Harness。
- 用户痛点或工程问题：如果 invocation 只能排队执行但不能取消、不能解释超时、不能追踪 architect -> reviewer -> implementer 的协作链，失败后也无法恢复，那么多个 agent 同房间协作会退化成不可审计的并发 CLI 输出。
- 期望结果：Room Hub 仍然是所有用户输入和 orchestration 的入口；Agent Runtime 仍然拥有 runtime adapter 与 slot control；Persistence 成为 rounds、session metadata、audit logs 和 invocation 状态的事实源；Redis 只承担运行时协调与 lease。
- 非目标或边界：不实现 Feishu、移动端或宽 provider 平台；不让 Web Console 直接拥有核心状态；不创建绕开 Room Hub/Event Bus/Persistence 的第二套消息通道。
- Exit Gate 对照来源：本 Feature、F001、F002、ADR-001、ADR-002、EV-008 以及本轮新增 Evidence。

## Current Status

Active. EV-008 已证明 Codex Adapter 与单进程 per-agent slot serialization；本 Feature 接管 EV-008 的剩余 gaps。

## Links

- Parent Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- Related Feature: [F002 reference architecture adoption](F002-reference-architecture-adoption.md)
- ADR: [ADR-001 reference architecture adoption boundary](../decisions/ADR-001-reference-architecture-adoption-boundary.md)
- ADR: [ADR-002 invocation orchestration and recovery contracts](../decisions/ADR-002-invocation-orchestration-recovery-contracts.md)
- Prior Evidence: [EV-008 codex adapter and slot control](../evidence/EV-008-codex-adapter-slot-control.md)
- Implementation plan: [2026-05-31 orchestration recovery hardening](../superpowers/plans/2026-05-31-orchestration-recovery-hardening.md)

## Acceptance Criteria

- [ ] Host exposes a cancellation API that marks only the targeted invocation canceled and emits a durable room event.
- [ ] Runtime adapters receive an abort signal and timeout deadline through the shared adapter contract.
- [ ] Timeout behavior has an explicit contract: timed-out invocations fail with a timeout audit reason and do not corrupt other agent seats.
- [ ] Slot control has a Redis-backed lease design, and implementation if needed for the current worker shape.
- [ ] Web Console displays invocation status for queued, running, succeeded, failed, and canceled invocations.
- [ ] `design_review_execute` creates a persisted round with ordered architect -> reviewer -> implementer steps.
- [ ] Round events and status transitions are persisted and visible through bootstrap/event replay surfaces.
- [ ] Codex session id and resume metadata are captured when present in runtime output and persisted with the invocation.
- [ ] Invocation audit log records lifecycle transitions, cancellation, timeout, adapter failure, and recovery-relevant metadata.
- [ ] A failed invocation has a documented recovery path through persisted session metadata and source message context.

## Patch History

None yet

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

To be captured in EV-009 after implementation slices produce verification output.

## Next Step

Implement and commit the slices from `docs/superpowers/plans/2026-05-31-orchestration-recovery-hardening.md` independently, pushing each verified commit before moving to the next slice.
