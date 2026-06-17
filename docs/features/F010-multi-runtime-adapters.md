---
id: F010
doc_kind: feature
status: planned
created: 2026-06-11
updated: 2026-06-14
---

# F010: Multi-Runtime Adapters

## Goal

在 Codex CLI 之外接入 Claude Code、OpenCode 和 Gemini CLI runtime binding，同时保持 Agent seat 与 runtime binding 解耦，避免把 core room、invocation、persistence 或 UI model 写死为 Codex-only。

## Vision Anchor

- 原始请求或来源：F001/F002 的 runtime 扩展目标，以及 F008 第一个本地里程碑拆分。
- 用户痛点或工程问题：Codex 是第一个 runtime，但 Equal-Room Host 的长期价值来自多个独立 runtime 的平等协作和互相质疑。
- 期望结果：新增 runtime adapters 复用 Agent Runtime adapter contract、Invocation lifecycle、Event Bus streaming 和 SQLite persistence。
- 非目标或边界：不建设通用 provider marketplace；不引入宽泛账号生态；不改变 Room Hub 核心模型。
- Exit Gate 对照来源：本 Feature 验收标准、ADR-002 invocation/orchestration/recovery contracts。

## Feature Intake

- Original problem: Codex CLI 是第一 runtime，但 Equal-Room Host 需要保留 Claude Code、OpenCode、Gemini CLI 等扩展边界。
- User pain point: 如果 core model 写死 Codex-only，后续多 runtime 平等协作会被架构锁死。
- Capability promise: 通过 RuntimeAdapter contract 接入额外 CLI runtime，并复用 invocation lifecycle、streaming、recovery metadata。
- Non-goals: 不建设 provider marketplace；不引入宽泛账号生态；不改 Room Hub 核心模型。
- Acceptance source: F010 acceptance criteria、ADR-002 runtime/invocation contracts。
- Open questions: 需要先选择一个最容易本地验证的非 Codex runtime。

## Capability Contract

- Agent seat 绑定 runtime kind，Agent Runtime 通过 adapter map 执行，不让 core room/persistence/UI 依赖具体 runtime。

## Current Status

Planned. 当前协议已有 `claude-code`、`opencode`、`gemini-cli` runtime kind，占位尚未有真实 adapter。

## Links

- Parent Feature: [F008 first local product milestone](F008-first-local-product-milestone.md)
- ADR: [ADR-002 invocation orchestration and recovery contracts](../decisions/ADR-002-invocation-orchestration-recovery-contracts.md)

## Acceptance Criteria

- [ ] 每个新增 runtime 通过 `RuntimeAdapter` contract 接入 Agent Runtime。
- [ ] stdout/stderr 或 JSON event parsing 被规范化为 room events 和 final message。
- [ ] runtime session id / resume metadata 在可用时进入 Invocation recovery metadata。
- [ ] 单个 runtime adapter 失败、取消或超时不污染其他 agent seat。
- [ ] 自动化测试覆盖至少一个非 Codex adapter 的成功、失败、取消或超时路径。

## Acceptance Map

| Claim | Acceptance | Evidence | Status |
| --- | --- | --- | --- |
| Multi-runtime adapter work is explicitly split from F008 | Feature acceptance criteria | F010 Feature acceptance; EV-014 follow-up split | planned |

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
- Known risks: 抽象过度会演变为 provider 平台，必须只保留主链路需要的接口。
- Next safe action: 先选择一个非 Codex runtime 做最小纵切，并沿 Codex Adapter contract 实现。
- Unblock condition: Scope, acceptance evidence, and safety boundaries are clear for the selected next slice.

## Next Step

先选择一个最容易本地验证的 runtime binding，沿 Codex Adapter contract 做最小纵切。
