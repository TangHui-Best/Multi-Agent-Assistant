---
id: F011
doc_kind: feature
status: planned
created: 2026-06-11
updated: 2026-06-12
---

# F011: Explicit Runtime Resume

## Goal

把已捕获的 runtime session metadata 产品化为显式 resume 能力，让用户可以在恢复详情中理解并授权后续 runtime resume，而不是让系统自动重启或隐式继续高风险执行。

## Vision Anchor

- 原始请求或来源：F004/F005/F007 已捕获 recovery metadata，但明确把自动 resume 留作后续；F008 第一个本地里程碑拆分。
- 用户痛点或工程问题：当前系统能记录 session id 和 resume metadata，但用户还不能通过产品化流程显式恢复 runtime 会话。
- 期望结果：恢复动作由用户控制；Room Hub 和 Agent Runtime 负责 invocation lifecycle；UI 只展示事实和发起授权过的动作。
- 非目标或边界：不做自动 retry/resume；不让 Web Console 私有状态决定恢复；不绕开 Room Hub 创建 invocation。
- Exit Gate 对照来源：本 Feature 验收标准、ADR-002、F007 recovery session continuity。

## Current Status

Planned. F007 已完成 restart reconciliation，自动 runtime resume 仍然 deliberately out of scope。

## Links

- Parent Feature: [F008 first local product milestone](F008-first-local-product-milestone.md)
- Recovery Feature: [F007 recovery session continuity 2](F007-recovery-session-continuity-2.md)
- ADR: [ADR-002 invocation orchestration and recovery contracts](../decisions/ADR-002-invocation-orchestration-recovery-contracts.md)

## Acceptance Criteria

- [ ] Web Console 能展示可恢复 invocation 的 runtime session metadata 和明确 resume 动作入口。
- [ ] Resume 动作必须由用户确认，并通过 Room Hub 创建新的受控 invocation 或恢复记录。
- [ ] Agent Runtime adapter contract 明确区分 fresh run 与 resume run。
- [ ] 失败、取消、超时和重复 resume 请求有持久 audit 记录。
- [ ] 自动化测试覆盖授权 resume、拒绝 resume、metadata 缺失和重复请求。

## Patch History

None yet

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

None yet

## Next Step

先设计 explicit resume 的 Room Hub contract，再扩展具体 runtime adapter。
