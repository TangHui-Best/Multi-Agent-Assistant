---
id: F009
doc_kind: feature
status: planned
created: 2026-06-11
updated: 2026-06-14
---

# F009: Feishu Connector

## Goal

实现 Feishu 作为低信任远程入口，让 Feishu 消息复用 Connector Interface 和 Room Hub 主链路，而不是拥有核心状态或获得无限制本地 shell 权限。

## Vision Anchor

- 原始请求或来源：F001 远程入口目标，以及 F008 第一个本地里程碑拆分。
- 用户痛点或工程问题：用户希望未来能从 Feishu 进入同一套房间 runtime，但远程入口风险高，必须有权限边界和确认机制。
- 期望结果：Feishu connector 只把用户输入转换为 source-neutral connector submit；所有 invocation、event、persistence 和 recovery 仍由核心 runtime 负责。
- 非目标或边界：不让 Feishu 拥有 SQLite/Redis 状态；不暴露本地文件内容；不无确认地执行高风险动作。
- Exit Gate 对照来源：本 Feature 验收标准、F008 Connector Interface、`AGENTS.md` 低信任入口原则。

## Feature Intake

- Original problem: 让 Feishu 成为低信任远程入口，同时复用核心 Room Hub 主链路。
- User pain point: 远程 IM 入口如果拥有核心状态或 shell 权限，会把本地工作台变成高风险远程控制面。
- Capability promise: Feishu 消息只通过 Connector Interface 转换为 source-neutral input，并由 Room Hub 创建后续事实。
- Non-goals: 不让 Feishu 直接写 SQLite/Redis/Web 状态；不无确认执行高风险动作。
- Acceptance source: F009 acceptance criteria、AGENTS.md low-trust connector rules。
- Open questions: 需要设计鉴权、签名、确认和回调传输。

## Capability Contract

- Connector 是低信任 client/ingress，不拥有 core state。

## Current Status

Planned. F008 已建立 Connector Interface 基础，本 Feature 尚未实现。

## Links

- Parent Feature: [F008 first local product milestone](F008-first-local-product-milestone.md)

## Acceptance Criteria

- [ ] Feishu 入口只通过 Connector Interface 调用 Room Hub submit path。
- [ ] 高风险动作有明确确认机制。
- [ ] Feishu connector 不直接写 SQLite、Redis 或 Web Console 状态。
- [ ] 自动化测试覆盖 connector submit、权限拒绝和幂等行为。
- [ ] 手动验证记录说明 Feishu 消息如何进入房间线程。

## Acceptance Map

| Claim | Acceptance | Evidence | Status |
| --- | --- | --- | --- |
| Feishu connector is split as a future low-trust ingress Feature | Feature acceptance criteria | F009 Feature acceptance; EV-014 follow-up split | planned |

## State Timeline

| Date | State | Trigger | Evidence | Note |
| --- | --- | --- | --- | --- |
| 2026-06-14 | planned | Current Harness schema alignment | This Feature | Added required recovery-oriented Feature sections without changing scope. |

## Patch History

None yet

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

None yet

## Recovery Snapshot

- Read first: This Feature, linked ADR/spec/evidence, and AGENTS.md project rules.
- Current capability state: planned.
- Known risks: 远程入口安全边界不清时不得实现写文件、shell 或配置修改。
- Next safe action: 先设计 low-trust action confirmation contract，再实现 Feishu message ingress。
- Unblock condition: Scope, acceptance evidence, and safety boundaries are clear for the selected next slice.

## Next Step

先设计 low-trust action confirmation contract，再实现 Feishu 消息入口。
