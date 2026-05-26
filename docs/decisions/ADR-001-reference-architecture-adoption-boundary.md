---
id: ADR-001
doc_kind: adr
status: accepted
scope: project
feature_ids:
  - F002
feature_refs:
  - docs/features/F002-reference-architecture-adoption.md
decision_area: architecture-adoption
created: 2026-05-26
updated: 2026-05-26
---

# ADR-001: Reference Architecture Adoption Boundary

## Context

本项目需要尽快验证多 agent equal-room 主链路，但又不能把私有参考实现的产品身份、模块命名、目录结构、日志、raw archives 或 provider 假设带入公开项目。未来 Agent 很可能质疑“为什么不直接复制参考实现”或“为什么不从零重写”，因此需要把长期边界沉淀为 ADR。

## Decision

采用参考实现中已经验证过的架构能力，但只以本项目语言重新映射为 project-owned module contracts。公共知识只讨论 `invocation lifecycle`、`runtime binding`、`streaming event normalization`、`mention routing`、`session continuity`、`connector boundary`、`governance` 等中性能力；实现和文档必须保持本项目独立产品身份。

## Alternatives

- Source-to-source migration：拒绝。它会把私有结构、命名和历史假设变成公开项目事实，且不利于重新验证本项目模块边界。
- 完全从零重写：拒绝。参考实现已经验证过关键 runtime 链路，忽略这些证据会增加时间成本和重复踩坑风险。
- Web-first bypass demo：拒绝。绕过 Room Hub、Persistence 或 Event Bus 会制造第二套状态源，破坏第一阶段主架构。
- Phase 1 broad provider platform：拒绝。Codex CLI 是第一 runtime；过早建设模型市场或复杂 provider 平台会稀释主链路验证。

## Consequences

收益是可以复用已验证能力，同时保持公开项目身份、模块边界和验收路径清晰。代价是早期需要先完成架构映射和 public hygiene gate，不能用最快 demo 速度复制参考实现。后续风险在于 Agent 可能重新引入私有术语或绕开主链路，需要 F002、F003 和 public hygiene verification 持续约束。

## Evidence

- `docs/features/F002-reference-architecture-adoption.md`
- `docs/evidence/EV-001-local-reference-runtime-validation.md`
- `docs/evidence/EV-002-architecture-mapping.md`
- `docs/evidence/EV-003-public-hygiene-gate.md`
