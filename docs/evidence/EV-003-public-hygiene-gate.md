---
id: EV-003
doc_kind: evidence
scope: project
feature_ids:
  - F003
feature_refs:
  - docs/features/F003-public-hygiene-gate.md
created: 2026-05-26
---

# EV-003: Public Hygiene Gate

## Scope

迁移 legacy evidence `docs/superpowers/evidence/2026-05-25-public-hygiene-gate.md` 的可恢复验证结论：Public Hygiene Gate 可扫描公开仓库中的私有来源痕迹，覆盖文件内容、repository-relative path、commit message、env-injected private rules，并且失败输出不打印 forbidden pattern 原文或 raw file path。

## Commands

```text
python -m unittest tests.test_public_hygiene
python scripts/public_hygiene.py --root .
$env:PUBLIC_HYGIENE_FORBIDDEN_PATTERNS='<secret pattern not committed to this repository>'; python scripts/public_hygiene.py --root .
$env:PUBLIC_HYGIENE_FORBIDDEN_PATTERNS='<commit subject pattern not committed to this repository>'; python scripts/public_hygiene.py --root . --commit-range HEAD
$env:PUBLIC_HYGIENE_FORBIDDEN_PATTERNS='<secret pattern not committed to this repository>'; python scripts/public_hygiene.py --root . --require-rules --require-env-rules --require-commit-range --commit-range origin/main..HEAD
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs
```

## Results

Pass, based on the original 2026-05-25 record.

- Initial scanner and tests were committed in `cb66348`.
- CI/spec/evidence gate wiring was committed in `cdabb56` and `ca89103`.
- First review hardening was committed in `827d4fb` and is recorded as F003.1.
- Second review hardening was committed in `e5e91fe` and is recorded as F003.2.
- Unit tests passed first with 4 tests, then after review patches with 7 tests and 10 tests.
- Scanner passed public and env-injected local scans.
- Commit-message scanning detected an injected pattern in `HEAD` without printing the pattern value.
- `--require-rules`, `--require-env-rules`, and `--require-commit-range` failed closed when their prerequisites were missing.
- File path scanning detected path-only forbidden traces and reported redacted file-number locations.
- GitHub Actions workflow was configured to run full-history scans with required env rules and commit ranges.

## Harness Validation

Current strict validation for the migrated canonical artifact set is recorded in `docs/evidence/EV-004-harness-knowledge-migration.md`.

## Artifacts

- Scanner: `scripts/public_hygiene.py`
- Unit tests: `tests/test_public_hygiene.py`
- Public config: `.public-hygiene/forbidden-patterns.txt`
- Local secret config: `.public-hygiene/forbidden-patterns.local.txt`
- CI workflow: `.github/workflows/public-hygiene.yml`
- Legacy spec: `docs/superpowers/specs/2026-05-25-public-hygiene-gate.md`
- Legacy evidence: `docs/superpowers/evidence/2026-05-25-public-hygiene-gate.md`

## Notes

The original record did not verify remote GitHub Actions after push. The real private-source denylist contents were intentionally not committed or printed into evidence.
