---
id: F002
doc_kind: feature
status: active
created: 2026-05-26
updated: 2026-05-26
---

# F002: Reference Architecture Adoption

## Goal

把已验证的参考架构能力转化为本项目自己的模块边界、公共术语和实施顺序，而不是做 source-to-source migration 或把私有参考实现的产品身份、目录、日志和命名带入公开项目。

## Vision Anchor

- 原始请求或来源：`docs/superpowers/specs/2026-05-24-reference-architecture-adoption-design.md` 与 `docs/superpowers/specs/2026-05-25-architecture-mapping-design.md`。
- 用户痛点或工程问题：如果先复制代码再定义目标契约，项目会继承私有产品假设、provider 膨胀、第二套状态模型或绕开主架构的 demo。
- 期望结果：以 neutral capability map 表达 adoption order，将 invocation lifecycle、runtime binding、CLI subprocess invocation、streaming event normalization、mention routing、queue/slot control、session continuity、connector boundary、governance 等能力归属到本项目模块。
- 非目标或边界：不公开私有参考源名称、URL、路径、commit、raw logs、产品身份或模块名；不在 Phase 1 建模型市场或宽泛 provider 平台。
- Exit Gate 对照来源：本 Feature 的验收标准、ADR-001、EV-002。

## Current Status

In Progress。Phase 1 架构映射已形成 legacy spec 和 evidence；architecture skeleton 已有 rebaseline plan，可作为下一轮 implementation 入口。

## Links

- Legacy spec: [2026-05-24 reference architecture adoption design](../superpowers/specs/2026-05-24-reference-architecture-adoption-design.md)
- Legacy spec: [2026-05-25 architecture mapping design](../superpowers/specs/2026-05-25-architecture-mapping-design.md)
- Rebaseline plan: [2026-05-26 architecture skeleton rebaseline](../superpowers/plans/2026-05-26-architecture-skeleton-rebaseline.md)
- Related Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- ADR: [ADR-001 reference architecture adoption boundary](../decisions/ADR-001-reference-architecture-adoption-boundary.md)
- Evidence: [EV-001 local reference runtime validation](../evidence/EV-001-local-reference-runtime-validation.md)
- Evidence: [EV-002 architecture mapping](../evidence/EV-002-architecture-mapping.md)
- Evidence: [EV-004 harness knowledge migration](../evidence/EV-004-harness-knowledge-migration.md)

## Acceptance Criteria

- [ ] 公共设计文档只使用本项目模块和中性能力名称，不出现私有参考源专有标识。
- [ ] 参考架构能力被映射到 Web Console、Host API、Shared Protocol、Room Hub、Persistence、Event Bus、Agent Runtime、Codex Adapter、Orchestration、Connector Interface 等项目边界。
- [ ] Adoption order 先定义 Shared Protocol、Room Hub、Persistence、Event Bus、Agent Runtime 和 WebSocket 主链路，再接 Codex Adapter。
- [ ] Codex CLI 是第一 runtime binding，但核心模型保留 Claude Code、OpenCode、Gemini CLI 的扩展路径。
- [ ] Governance/bootstrap 只能临时 local bypass，不能被永久删除。
- [ ] 后续计划必须先修订 architecture skeleton，再展开大规模实现。

## Patch History

None yet

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

- [EV-001 local reference runtime validation](../evidence/EV-001-local-reference-runtime-validation.md) 支持“参考能力确实存在并可借鉴”的前提。
- [EV-002 architecture mapping](../evidence/EV-002-architecture-mapping.md) 支持 Phase 1 映射文档已通过本地验证。
- [EV-004 harness knowledge migration](../evidence/EV-004-harness-knowledge-migration.md) 支持 canonical Harness 入口已建立。
- [EV-006 architecture skeleton rebaseline](../evidence/EV-006-architecture-skeleton-rebaseline.md) 支持后续实现计划已按 F001/F002/ADR-001 重基线。
- [EV-007 architecture skeleton local runtime](../evidence/EV-007-architecture-skeleton-local.md) supports the adoption order by proving Shared Protocol, Persistence, Event Bus, Room Hub, mock Agent Runtime, Host API/WebSocket, and Web Console before Codex Adapter work.

## Next Step

执行 `docs/superpowers/plans/2026-05-26-architecture-skeleton-rebaseline.md`，让下一轮实现以 project-native Shared Protocol 和 mock main path 为第一能力增量。
