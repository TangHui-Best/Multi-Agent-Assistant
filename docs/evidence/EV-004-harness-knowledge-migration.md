---
id: EV-004
doc_kind: evidence
scope: project
feature_ids:
  - F001
  - F002
  - F003
feature_refs:
  - docs/features/F001-equal-room-host-core.md
  - docs/features/F002-reference-architecture-adoption.md
  - docs/features/F003-public-hygiene-gate.md
created: 2026-05-26
---

# EV-004: Harness Knowledge Migration

## Scope

验证本次存量工程记忆文档迁移到最新版 Harness canonical artifact 约束：

- Feature 使用 `docs/features/Fxxx-slug.md`。
- ADR 使用 `docs/decisions/ADR-xxx-slug.md`。
- Evidence 使用 `docs/evidence/EV-xxx-slug.md`。
- `docs/superpowers/**` 仅保留 legacy spec/plan/evidence 历史材料，不再携带会被 validator 识别为 Harness artifact 的伪 frontmatter。

## Commands

```text
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
```

## Results

Pass. The migrated canonical artifact set passed strict Harness validation with zero errors and zero warnings.

## Harness Validation

Observed output:

```text
Scanned 19 markdown file(s). Checked 8 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Artifacts

- `docs/features/F001-equal-room-host-core.md`
- `docs/features/F002-reference-architecture-adoption.md`
- `docs/features/F003-public-hygiene-gate.md`
- `docs/decisions/ADR-001-reference-architecture-adoption-boundary.md`
- `docs/evidence/EV-001-local-reference-runtime-validation.md`
- `docs/evidence/EV-002-architecture-mapping.md`
- `docs/evidence/EV-003-public-hygiene-gate.md`
- `docs/evidence/EV-004-harness-knowledge-migration.md`

## Notes

Legacy documents are preserved for historical context and linked from canonical Features/Evidence. This migration intentionally does not rewrite old specs or plans into new prose.
