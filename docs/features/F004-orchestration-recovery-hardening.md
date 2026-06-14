---
id: F004
doc_kind: feature
status: completed
created: 2026-05-31
updated: 2026-06-14
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

## Feature Intake

- Original problem: Invocation orchestration 需要在失败、取消、超时和恢复场景下保持可追踪、可收敛。
- User pain point: 如果 orchestration 只覆盖 happy path，单个 agent failure 会污染 round 状态或阻断后续恢复。
- Capability promise: 强化 invocation lifecycle、round settlement、audit 和 recovery 语义。
- Non-goals: 不实现完整显式 runtime resume；不绕开 Room Hub 创建第二套恢复路径。
- Acceptance source: F004 acceptance criteria、ADR-002、相关 recovery evidence。
- Open questions: 显式 runtime resume 已拆到 F011。

## Capability Contract

- Orchestration 层负责 round/step 状态推进和失败收敛，Agent Runtime 负责执行，Persistence 负责 durable facts。

## Current Status

Completed. 主要实现切片已完成并记录在 EV-009；independent review 发现的 cancellation race、round continuation、shared timeout contract 和 Redis lease release race 已通过 `bf1699a` 修复。

## Links

- Parent Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- Related Feature: [F002 reference architecture adoption](F002-reference-architecture-adoption.md)
- ADR: [ADR-001 reference architecture adoption boundary](../decisions/ADR-001-reference-architecture-adoption-boundary.md)
- ADR: [ADR-002 invocation orchestration and recovery contracts](../decisions/ADR-002-invocation-orchestration-recovery-contracts.md)
- Prior Evidence: [EV-008 codex adapter and slot control](../evidence/EV-008-codex-adapter-slot-control.md)
- Evidence: [EV-009 orchestration recovery hardening](../evidence/EV-009-orchestration-recovery-hardening.md)
- Follow-up Evidence: [EV-010 redis slot lease worker integration](../evidence/EV-010-redis-slot-lease-worker-integration.md)
- Implementation plan: [2026-05-31 orchestration recovery hardening](../superpowers/plans/2026-05-31-orchestration-recovery-hardening.md)

## Acceptance Criteria

- [x] Host exposes a cancellation API that marks only the targeted invocation canceled and emits a durable room event.
- [x] Runtime adapters receive an abort signal and timeout deadline through the shared adapter contract.
- [x] Timeout behavior has an explicit contract: timed-out invocations fail and do not corrupt other agent seats.
- [x] Slot control has a Redis-backed lease design and Event Bus lease contract; release uses atomic compare-delete, and worker integration is deferred until pending-claim/requeue behavior is designed.
- [x] Web Console displays invocation status for queued, running, succeeded, failed, and canceled invocations.
- [x] `design_review_execute` creates a persisted round with ordered architect -> reviewer -> implementer steps.
- [x] Round creation event and persisted step state are recorded; successful invocations continue architect -> reviewer -> implementer.
- [x] Codex session id and resume metadata are captured when present in runtime output and persisted with the invocation.
- [x] Invocation audit log records queued, running, succeeded, failed, canceled, and session-captured lifecycle facts.
- [x] A failed invocation has a documented recovery path through persisted session metadata and source message context.

## Acceptance Map

| Claim | Acceptance | Evidence | Status |
| --- | --- | --- | --- |
| Orchestration recovery has hardened lifecycle evidence | Feature acceptance criteria | EV-009 orchestration recovery hardening; EV-014 milestone closeout | active capability slice |

## State Timeline

| Date | State | Trigger | Evidence | Note |
| --- | --- | --- | --- | --- |
| 2026-06-14 | active capability slice | Current Harness schema alignment | This Feature | Added required recovery-oriented Feature sections without changing scope. |

## Patch History

None yet

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

- [EV-009 orchestration recovery hardening](../evidence/EV-009-orchestration-recovery-hardening.md) records implementation slices, verification commands, browser check, independent review findings, recovery path, and residual risks.
- [EV-010 redis slot lease worker integration](../evidence/EV-010-redis-slot-lease-worker-integration.md) records the follow-up that wires Redis leases into Agent Runtime with pending/stale stream recovery.

## Recovery Snapshot

- Read first: This Feature, linked ADR/spec/evidence, and AGENTS.md project rules.
- Current capability state: active capability slice.
- Known risks: 复杂并发恢复仍需要更多集成级验证。
- Next safe action: 在 F011 前继续保持 resume 为事实展示，不做自动隐式恢复。
- Unblock condition: Scope, acceptance evidence, and safety boundaries are clear for the selected next slice.

## Next Step

Follow-up work can add Web Console round-step visualization, audit timeline inspection, and broader real Codex session schema samples.
