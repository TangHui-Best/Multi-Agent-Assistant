---
id: F008
doc_kind: feature
status: completed
created: 2026-06-11
updated: 2026-06-12
---

# F008: First Local Product Milestone

## Goal

把已有 Equal-Room Host 工程骨架收束为第一个本地可用产品化里程碑：本地 Web Console 能作为房间工作台查看成员、线程、round、invocation 与恢复事实；Host startup recovery 不再只恢复固定线程；Connector Interface 有明确 source-neutral 边界；公开项目身份保持中性。

## Vision Anchor

- 原始请求或来源：用户要求完成第一个本地产品化里程碑，并明确 UI 应优先复用本地参考实现的成熟结构，但公开仓库保持 source-neutral。
- 用户痛点或工程问题：已有后端主链路和 recovery 事实，但 Web Console 仍偏临时页面；startup recovery 有单线程假设；connector 入口缺少明确边界。
- 期望结果：完成一个可测试、可构建、可手动验证的本地房间工作台切片，并把 Feishu、多 runtime、显式 runtime resume 拆成后续 Feature。
- 非目标或边界：不实现完整 Feishu Connector；不实现 Claude Code、OpenCode、Gemini CLI adapters；不建设 provider marketplace；不引入第二套消息总线或 UI 私有状态源。
- Exit Gate 对照来源：本 Feature 的验收标准、F001/F002 总体目标、ADR-001、ADR-002，以及 EV-014。

## Current Status

Completed.

本里程碑通过已提交的 startup recovery、Connector Interface、Web Console 工作台切片，以及当前 closeout 批次中的 stale Redis job recovery 和 Feature/Evidence 拆分完成。Web Console 显式呈现成员/席位、线程时间线、Round 进度、Invocation 与恢复详情、任务 Composer 五个区域。

## Links

- Parent Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- Architecture Feature: [F002 reference architecture adoption](F002-reference-architecture-adoption.md)
- Follow-up Feature: [F009 Feishu connector](F009-feishu-connector.md)
- Follow-up Feature: [F010 multi-runtime adapters](F010-multi-runtime-adapters.md)
- Follow-up Feature: [F011 explicit runtime resume](F011-explicit-runtime-resume.md)
- Evidence: [EV-014 first local product milestone](../evidence/EV-014-first-local-product-milestone.md)

## Acceptance Criteria

- [x] Host startup recovery enumerates persisted thread ids before starting Agent Runtime worker.
- [x] Connector-originated messages have a source-neutral `connector` ingress boundary and submit through Room Hub.
- [x] Web Console exposes visible regions for members/seats, thread timeline, round progress, invocation/recovery detail, and task composer.
- [x] Web Console remains a bootstrap + room event projection and does not gain a private state source.
- [x] Public tracked files remain source-neutral and do not expose private reference identifiers.
- [x] Stale Redis jobs whose invocation no longer exists in persistence are acknowledged so they cannot block current recovery or integration runs.
- [x] Follow-up work is split into named Features for Feishu Connector, multi-runtime adapters, and explicit runtime resume.

## Patch History

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F008.1 | 2026-06-12 | 3dbec81 | Redis stream could contain a job whose invocation no longer exists in the current SQLite persistence, causing a worker to keep seeing an unprocessable stale job. | Redis is runtime coordination, while SQLite is the persistent fact source; old stream entries can outlive an in-memory or reset persistence state. | `packages/agent-runtime/test/agentWorker.test.ts` covers missing-invocation stale jobs and asserts they are acked without acquiring a slot lease or running an adapter. | completed |

## Evidence

- [EV-014 first local product milestone](../evidence/EV-014-first-local-product-milestone.md)

## Next Step

Use F009, F010, and F011 as the next durable delivery boundaries. Do not expand this milestone into full remote connectors or additional runtime bindings.
