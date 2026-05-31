---
id: F005
doc_kind: feature
status: active
created: 2026-05-31
updated: 2026-05-31
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

## Current Status

In Progress. 本 Feature 是 F001 的产品化切片，也是 F004 后续工作的第一步。当前先沉淀设计与计划，然后按 TDD 实现最小可验收链路。

## Links

- Parent Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- Related Feature: [F004 orchestration recovery hardening](F004-orchestration-recovery-hardening.md)
- ADR: [ADR-002 invocation orchestration and recovery contracts](../decisions/ADR-002-invocation-orchestration-recovery-contracts.md)
- Prior Evidence: [EV-010 redis slot lease worker integration](../evidence/EV-010-redis-slot-lease-worker-integration.md)
- Design spec: [2026-05-31 local room productization recovery visualization](../superpowers/specs/2026-05-31-local-room-productization-recovery-visualization-design.md)

## Acceptance Criteria

- [ ] `GET /api/bootstrap` returns the default thread's persisted rounds and round steps in addition to agents, messages, and invocations.
- [ ] Host exposes a read-only invocation audit endpoint backed by SQLite `invocation_audit_logs`.
- [ ] Web Console keeps local view state for rounds and round steps only as a projection of bootstrap and room events, not as a source of truth.
- [ ] Web Console displays `design_review_execute` round progress with ordered architect -> reviewer -> implementer steps.
- [ ] Step display derives the visible execution state from linked invocation status when available, so stale round step rows do not hide terminal invocation state.
- [ ] Web Console can show selected invocation recovery details: status, source message id, runtime session id, resume metadata, and audit timeline.
- [ ] The implementation keeps retry/resume execution out of scope and records that follow-up under Recovery / Session Continuity 2.0.
- [ ] Automated tests cover bootstrap projection, audit endpoint behavior, round event merging, step status derivation, and recovery detail rendering.

## Patch History

None yet

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

- F004 and EV-010 prove that the underlying persisted recovery data already exists.
- This Feature will receive implementation Evidence after the UI/API slice is built and verified.

## Next Step

Write the implementation plan for the read projection, round UI, and recovery detail slices, then implement with TDD and a small commit sequence.
