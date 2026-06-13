---
id: F010
doc_kind: feature
status: planned
created: 2026-06-11
updated: 2026-06-12
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

## Patch History

None yet

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

None yet

## Next Step

先选择一个最容易本地验证的 runtime binding，沿 Codex Adapter contract 做最小纵切。
