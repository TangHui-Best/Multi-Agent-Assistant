---
id: F002
doc_kind: feature
status: active
created: 2026-05-26
updated: 2026-06-12
---

# F002: Reference Architecture Adoption

## Goal

把已验证的本地参考架构能力转化为本项目自己的模块边界、公共术语和实施顺序，而不是做 source-to-source migration，也不是把私有参考实现的产品身份、目录、日志或命名带入公开项目。

## Vision Anchor

- 原始请求或来源：`docs/superpowers/specs/2026-05-24-reference-architecture-adoption-design.md` 与 `docs/superpowers/specs/2026-05-25-architecture-mapping-design.md`。
- 用户痛点或工程问题：如果先复制代码再定义目标契约，项目会继承私有产品假设、provider 膨胀、第二套状态模型或绕开主架构的 demo。
- 期望结果：以 neutral capability map 表达 adoption order，将 invocation lifecycle、runtime binding、CLI subprocess invocation、streaming event normalization、mention routing、queue/slot control、session continuity、connector boundary、governance 等能力归属到本项目模块。
- 非目标或边界：不公开私有参考源名称、URL、路径、commit、raw logs、产品身份或模块名；不在 Phase 1 建模型市场或宽泛 provider 平台。
- Exit Gate 对照来源：本 Feature 的验收标准、ADR-001、EV-002，以及 EV-014。

## Current Status

Active as architecture umbrella.

参考架构采用的第一本地产品化里程碑已由 [F008 first local product milestone](F008-first-local-product-milestone.md) 收束：项目以 source-neutral 模块边界完成 Shared Protocol、Room Hub、Persistence、Event Bus、Agent Runtime、Codex Adapter、Orchestration、Host API/WebSocket、Connector Interface 与 Web Console 投影的最小可用闭环。

后续采用范围已拆为 F009、F010、F011，避免把 Feishu、多 runtime 和显式 resume 混进同一批实现。

## Links

- Legacy spec: [2026-05-24 reference architecture adoption design](../superpowers/specs/2026-05-24-reference-architecture-adoption-design.md)
- Legacy spec: [2026-05-25 architecture mapping design](../superpowers/specs/2026-05-25-architecture-mapping-design.md)
- Rebaseline plan: [2026-05-26 architecture skeleton rebaseline](../superpowers/plans/2026-05-26-architecture-skeleton-rebaseline.md)
- Phase 2/3 plan: [2026-05-31 codex adapter and slot control](../superpowers/plans/2026-05-31-codex-adapter-slot-control.md)
- Related Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- ADR: [ADR-001 reference architecture adoption boundary](../decisions/ADR-001-reference-architecture-adoption-boundary.md)
- Evidence: [EV-001 local reference runtime validation](../evidence/EV-001-local-reference-runtime-validation.md)
- Evidence: [EV-002 architecture mapping](../evidence/EV-002-architecture-mapping.md)
- Evidence: [EV-004 harness knowledge migration](../evidence/EV-004-harness-knowledge-migration.md)
- Milestone Feature: [F008 first local product milestone](F008-first-local-product-milestone.md)
- Follow-up Feature: [F009 Feishu connector](F009-feishu-connector.md)
- Follow-up Feature: [F010 multi-runtime adapters](F010-multi-runtime-adapters.md)
- Follow-up Feature: [F011 explicit runtime resume](F011-explicit-runtime-resume.md)

## Acceptance Criteria

- [ ] 公共设计文档只使用本项目模块和中性能力名称，不出现私有参考源专有标识。
- [ ] 参考架构能力被映射到 Web Console、Host API、Shared Protocol、Room Hub、Persistence、Event Bus、Agent Runtime、Codex Adapter、Orchestration、Connector Interface 等项目边界。
- [ ] Adoption order 先定义 Shared Protocol、Room Hub、Persistence、Event Bus、Agent Runtime 和 WebSocket 主链路，再接 Codex Adapter。
- [ ] Codex CLI 是第一个 runtime binding，但核心模型保留 Claude Code、OpenCode、Gemini CLI 的扩展路径。
- [ ] Governance/bootstrap 只能临时 local bypass，不能被永久删除。
- [ ] 后续计划必须先修正 architecture skeleton，再展开大规模实现。

## Patch History

None yet

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

- [EV-001 local reference runtime validation](../evidence/EV-001-local-reference-runtime-validation.md) 支持“参考能力确实存在并可借鉴”的前提。
- [EV-002 architecture mapping](../evidence/EV-002-architecture-mapping.md) 支持 Phase 1 映射文档已通过本地验证。
- [EV-004 harness knowledge migration](../evidence/EV-004-harness-knowledge-migration.md) 支持 canonical Harness 入口已建立。
- [EV-006 architecture skeleton rebaseline](../evidence/EV-006-architecture-skeleton-rebaseline.md) 支持后续实现计划已按 F001/F002/ADR-001 重新基线化。
- [EV-007 architecture skeleton local runtime](../evidence/EV-007-architecture-skeleton-local.md) supports the adoption order by proving Shared Protocol, Persistence, Event Bus, Room Hub, mock Agent Runtime, Host API/WebSocket, and Web Console before Codex Adapter work.
- [EV-008 codex adapter and slot control](../evidence/EV-008-codex-adapter-slot-control.md) supports the next adoption step by proving Codex Adapter execution after the mock main path and keeping slot control in Agent Runtime.
- [EV-014 first local product milestone](../evidence/EV-014-first-local-product-milestone.md) supports source-neutral adoption closeout for the first local milestone: Connector Interface was added without implementing a concrete remote connector, Web Console remains a projection, stale Redis jobs are acknowledged safely, and follow-up runtime/connector work was split into named Features.

## Next Step

Continue adoption through F009, F010, and F011. Do not expose the local reference source in public tracked artifacts, and do not expand this Feature into a broad provider platform.
