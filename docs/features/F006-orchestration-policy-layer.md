---
id: F006
doc_kind: feature
status: completed
created: 2026-05-31
updated: 2026-06-14
---

# F006: Orchestration Policy Layer

## Goal

把 `design_review_execute` 从硬编码顺序推进升级为可测试、可审计、可恢复的 orchestration policy：reviewer 必须给出明确 verdict，round 必须在 approved、changes requested、failure、cancellation 等路径上收敛到 durable terminal state。

## Vision Anchor

- 原始请求或来源：用户要求在 `Local Room Productization + Recovery 可视化` 之后，补 `Orchestration Policy Layer`，让 reviewer gate 和 round 收敛真正可靠。
- 用户痛点或工程问题：当前 Room Hub 只在成功 invocation 后按 architect -> reviewer -> implementer 固定推进；reviewer 输出没有机器可判定 verdict，失败/取消路径可能让 round 和后续 step 长时间停留在 running/pending。
- 期望结果：Room Hub 仍是 orchestration 入口；Persistence 仍是 round、step、invocation 的事实源；policy 层只决定下一步、终止原因和 prompt 上下文，不拥有 runtime 执行、不引入远程 connector 状态。
- 非目标或边界：不做通用 workflow DSL，不做多轮返工循环，不做自动 retry/resume，不引入 Feishu，不扩 runtime binding，不让 Web Console 或 Agent Runtime 私有状态决定 reviewer gate。
- Exit Gate 对照来源：本 Feature、F001、F004、F005、ADR-002、EV-009、EV-010、EV-011，以及 `docs/superpowers/specs/2026-05-31-orchestration-policy-layer.md`。

## Feature Intake

- Original problem: 多 agent 协作需要明确 mention routing、round policy 和 reviewer gate，而不是硬编码单一路径。
- User pain point: 缺少 policy 层会让协作策略散落在 Room Hub 或 UI 中，后续难以审计和恢复。
- Capability promise: 提供最小 orchestration policy 边界，支持设计 review 等可验证协作流程。
- Non-goals: 不建设复杂工作流平台；不让 policy 绕过 Invocation lifecycle。
- Acceptance source: F006 acceptance criteria、EV-012 orchestration policy layer。
- Open questions: 更复杂策略需另行 Feature/ADR。

## Capability Contract

- Policy 层只决定协作步骤和目标成员，执行事实仍进入 Room Hub/Invocation/Event Bus/Persistence。

## Current Status

Completed. 本 Feature 已把 `design_review_execute` 的 step order、reviewer verdict gate、prompt context、失败/取消收敛和 live `round.updated` projection 收束到 Room Hub policy path；Recovery / Session Continuity 2.0 可以基于这些 durable facts 做重启恢复扫描。

## Links

- Parent Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- Related Feature: [F004 orchestration recovery hardening](F004-orchestration-recovery-hardening.md)
- Related Feature: [F005 local room productization recovery visualization](F005-local-room-productization-recovery-visualization.md)
- ADR: [ADR-002 invocation orchestration and recovery contracts](../decisions/ADR-002-invocation-orchestration-recovery-contracts.md)
- Prior Evidence: [EV-009 orchestration recovery hardening](../evidence/EV-009-orchestration-recovery-hardening.md)
- Prior Evidence: [EV-011 local room recovery visualization](../evidence/EV-011-local-room-recovery-visualization.md)
- Design spec: [2026-05-31 orchestration policy layer](../superpowers/specs/2026-05-31-orchestration-policy-layer.md)
- Implementation plan: [2026-05-31 orchestration policy layer](../superpowers/plans/2026-05-31-orchestration-policy-layer.md)
- Evidence: [EV-012 orchestration policy layer](../evidence/EV-012-orchestration-policy-layer.md)

## Acceptance Criteria

- [x] `design_review_execute` step definitions and prompt construction live behind a Room Hub orchestration policy module rather than scattered inline constants.
- [x] Reviewer output must include a machine-readable verdict before implementer is queued.
- [x] Reviewer `approved` verdict queues implementer with original request, architect output, and reviewer verdict context.
- [x] Reviewer `changes_requested` or missing verdict stops the round without queuing implementer and records a durable terminal reason.
- [x] Failed or canceled round-linked invocations mark the current step and round terminal, and dependent not-yet-run steps are not left as actionable pending work.
- [x] Room events expose round/step updates so Web Console projections can converge without waiting for a full refresh.
- [x] Automatic retry/resume remains out of scope and is left for Recovery / Session Continuity 2.0.
- [x] Automated tests cover reviewer approved, reviewer blocked, missing verdict, invocation failure, invocation cancellation, and live projection update behavior.

## Acceptance Map

| Claim | Acceptance | Evidence | Status |
| --- | --- | --- | --- |
| Orchestration policy has a bounded first slice | Feature acceptance criteria | EV-012 orchestration policy layer | active capability slice |

## State Timeline

| Date | State | Trigger | Evidence | Note |
| --- | --- | --- | --- | --- |
| 2026-06-14 | active capability slice | Current Harness schema alignment | This Feature | Added required recovery-oriented Feature sections without changing scope. |

## Patch History

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

- EV-012 records implementation commits, review findings, verification commands, recovery path, and residual risks.

## Recovery Snapshot

- Read first: This Feature, linked ADR/spec/evidence, and AGENTS.md project rules.
- Current capability state: active capability slice.
- Known risks: 策略扩展过快会变成通用 workflow 平台。
- Next safe action: 新增 policy 前先证明它提升质疑、review 或风险发现能力。
- Unblock condition: Scope, acceptance evidence, and safety boundaries are clear for the selected next slice.

## Next Step

Proceed to Recovery / Session Continuity 2.0. The next phase should reconcile persisted invocations, rounds, steps, audit logs, and runtime session metadata after restart without introducing connector-owned state.
