---
id: EV-001
doc_kind: evidence
scope: project
feature_ids:
  - F001
  - F002
feature_refs:
  - docs/features/F001-equal-room-host-core.md
  - docs/features/F002-reference-architecture-adoption.md
created: 2026-05-26
---

# EV-001: Local Reference Runtime Validation

## Scope

迁移 legacy evidence `docs/superpowers/evidence/2026-05-25-local-reference-runtime-validation.md` 的可恢复验证结论：私有本地参考运行时曾验证多 Codex-bound agent、mention routing、invocation lifecycle、session continuity 和持久化回写等能力。原始记录保留在 legacy 路径；本文件只作为 canonical Evidence 索引和摘要。

## Commands

```text
Start the private local reference runtime in memory mode.
GET /api/health
GET /api/cats
POST /api/messages with a single-agent mention
POST /api/messages with a two-agent mention
GET /api/messages?threadId=<thread-id>&limit=100
GET /api/invocations/<invocation-id>
Inspect private raw CLI archives and audit logs for the matching invocation ids.
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs
```

## Results

Pass, based on the original 2026-05-25 record.

- API health returned `status: ok`.
- Configured Codex-bound agents included `architect`, `reviewer`, and `implementer`.
- Single-agent mention created a parent invocation and internal turn invocation, returned `OK`, persisted the assistant message, and ended with parent invocation `succeeded`.
- Two-agent mention created independent internal turn invocations for `architect` and `reviewer`, returned two persisted `OK` messages, and ended with parent invocation `succeeded`.
- Session chains were captured for `architect` and `reviewer`.
- Original Harness knowledge check passed at that time for the then-current artifact set.

## Harness Validation

The original legacy evidence recorded:

```text
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs
Scanned 7 markdown file(s). Checked 1 knowledge artifact(s). Errors: 0. Warnings: 0.
```

Current strict validation for the migrated canonical artifact set is recorded in `docs/evidence/EV-004-harness-knowledge-migration.md`.

## Artifacts

- Legacy evidence: `docs/superpowers/evidence/2026-05-25-local-reference-runtime-validation.md`
- Public project artifacts intentionally avoid naming or linking the private reference source.

## Notes

The original validation used memory runtime, not the final Redis/SQLite production split. It supports adoption of capabilities, not direct copying. It also noted Windows Codex CLI timeout/reconnect behavior, so future Codex Adapter work should treat timeout, reconnect, cancellation, and failure as first-class states.
