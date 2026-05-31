---
id: F007
doc_kind: feature
status: active
created: 2026-05-31
updated: 2026-05-31
---

# F007: Recovery Session Continuity 2.0

## Goal

实现本地主机重启后的恢复闭环：Host 启动时从 SQLite 恢复 room、invocation、round、step、audit 和 session metadata 的一致状态，自动收敛安全可判定的不一致，并把仍需后续处理的恢复事实暴露给 Web Console。

## Vision Anchor

- 原始请求或来源：用户要求在 `Orchestration Policy Layer` 后进入 `Recovery / Session Continuity 2.0 的重启恢复闭环`。
- 用户痛点或工程问题：F004/F005/F006 已经持久化并可视化 invocation、round、audit 和 session metadata，但进程崩溃或 Host 重启后，Redis queue、worker callback 和 SQLite terminal state 之间仍可能出现短暂或永久不一致。
- 期望结果：重启后不依赖 Web/Redis 内存判断事实；Room Hub/Persistence 能 reconcile queued、running、succeeded、failed、canceled invocation 与 round/step；Web Console 能看见恢复动作留下的 audit/recovery evidence。
- 非目标或边界：不自动执行 Codex `resume`、不做 retry/resume 按钮、不引入 Feishu、不扩 Claude/OpenCode/Gemini binding、不建设通用恢复平台、不让 connector 拥有核心状态。
- Exit Gate 对照来源：本 Feature、F001、F004、F005、F006、ADR-002、EV-010、EV-011、EV-012，以及 `docs/superpowers/specs/2026-05-31-recovery-session-continuity-2.md`。

## Current Status

In Progress. 本 Feature 是 Feishu Connector 前的最后一个本地可靠性切片：先让本地重启恢复可信，再开放低信任远程入口。

## Links

- Parent Feature: [F001 equal-room host core](F001-equal-room-host-core.md)
- Related Feature: [F004 orchestration recovery hardening](F004-orchestration-recovery-hardening.md)
- Related Feature: [F005 local room productization recovery visualization](F005-local-room-productization-recovery-visualization.md)
- Related Feature: [F006 orchestration policy layer](F006-orchestration-policy-layer.md)
- ADR: [ADR-002 invocation orchestration and recovery contracts](../decisions/ADR-002-invocation-orchestration-recovery-contracts.md)
- Prior Evidence: [EV-010 redis slot lease worker integration](../evidence/EV-010-redis-slot-lease-worker-integration.md)
- Prior Evidence: [EV-012 orchestration policy layer](../evidence/EV-012-orchestration-policy-layer.md)
- Design spec: [2026-05-31 recovery session continuity 2](../superpowers/specs/2026-05-31-recovery-session-continuity-2.md)

## Acceptance Criteria

- [ ] Host startup runs a bounded recovery reconciliation before starting the worker loop.
- [ ] Recovery reconciliation reads SQLite as the durable source of truth and does not depend on Web or Redis memory state.
- [ ] Queued invocations are re-enqueued with reconstructed prompts so lost Redis jobs do not strand work.
- [ ] Running invocations left by a prior Host process are marked failed with a restart recovery reason and audit entry.
- [ ] Succeeded round-linked invocations with non-terminal rounds re-enter policy continuation idempotently.
- [ ] Failed or canceled round-linked invocations with non-terminal rounds settle their round/step state.
- [ ] Recovery publishes live room events where useful, but bootstrap remains sufficient to inspect the final recovered state.
- [ ] Automatic runtime `resume` remains out of scope; captured session metadata is preserved as evidence for future explicit resume work.
- [ ] Automated tests cover queued re-enqueue, stale running failure, succeeded continuation, failed/canceled round settlement, idempotency, and Host startup wiring.

## Patch History

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |

## Evidence

Pending implementation Evidence.

## Next Step

Implement a narrow Room Hub recovery reconciliation method and wire it into Host startup before worker start.
