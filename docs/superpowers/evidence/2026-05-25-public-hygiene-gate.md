---
id: EV-2026-05-25-public-hygiene-gate
doc_kind: evidence
scope: project
feature_refs: []
created: 2026-05-25
---

# EV-2026-05-25: Public Hygiene Gate

## Scope

验证 Phase 0 Public Hygiene Gate：

- 公开仓库具备可重复运行的私有参考来源痕迹扫描器。
- 真实私有来源 denylist 不进入公开仓库。
- GitHub Actions 可以在 push 和 pull request 上运行公开扫描门禁。
- 本地和 CI 可以通过 secret/env 注入私有来源模式。
- 扫描器失败输出不会打印 forbidden pattern 原文。
- 扫描器覆盖 commit message，不只覆盖 tracked files。
- CI 在没有有效规则时 fail closed。
- CI 在 commit range 无法扫描时 fail closed。
- 扫描器覆盖 repository-relative file path，不只覆盖文件内容。
- 扫描器失败输出不会打印 raw file path，避免路径本身泄露私有来源。
- CI 明确要求 env-injected private rules，公开规则不能替代 secret denylist。

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

Result: Pass for the implemented public hygiene gate.

Observed implementation:

- Scanner: `scripts/public_hygiene.py`
- Unit tests: `tests/test_public_hygiene.py`
- Public config: `.public-hygiene/forbidden-patterns.txt`
- Local secret config: `.public-hygiene/forbidden-patterns.local.txt` ignored by Git
- CI workflow: `.github/workflows/public-hygiene.yml`
- CI secret input: `PUBLIC_HYGIENE_FORBIDDEN_PATTERNS`

Verification results:

- Unit tests passed: 4 tests.
- Public scan passed on 17 tracked files with 0 committed public denylist rules.
- Public scan passed on 17 tracked files with 1 env-injected rule whose value was not committed to this repository.
- Harness knowledge check passed after adding this Evidence record.

Patch verification after first code review:

- Unit tests passed: 7 tests.
- Failure output redacts rule values and reports redacted rule ids.
- Commit-message scanning detects an injected pattern in `HEAD` without printing the pattern value.
- `--require-rules` returns failure when no forbidden patterns are loaded.
- `--require-commit-range` returns failure when commit messages cannot be scanned.
- GitHub Actions uses full history and runs `--require-rules` plus `--require-commit-range` with an explicit push or pull request commit range.

Patch verification after second code review:

- Unit tests passed: 10 tests.
- File path scanning detects path-only forbidden traces and reports redacted file-number locations.
- Failure output does not print raw file paths.
- `--require-env-rules` returns failure when only public file rules are loaded.
- GitHub Actions uses full history and runs `--require-rules`, `--require-env-rules`, and `--require-commit-range` with an explicit push or pull request commit range.

## Boundary

The committed denylist intentionally contains no real private reference identifiers.

This is a safety boundary, not a missing rule: committing the real private source name, URL, path, or product-specific marker would itself expose the source in public history.

The effective private-source denylist must be supplied through either:

- `.public-hygiene/forbidden-patterns.local.txt` on the local machine, or
- the GitHub secret `PUBLIC_HYGIENE_FORBIDDEN_PATTERNS`.

## Artifacts

- `scripts/public_hygiene.py`
- `tests/test_public_hygiene.py`
- `.public-hygiene/forbidden-patterns.txt`
- `.github/workflows/public-hygiene.yml`
- `docs/superpowers/specs/2026-05-25-public-hygiene-gate.md`

## Unverified

- GitHub Actions has not yet run remotely for this workflow because the branch has not been pushed at the time this Evidence record is written.
- The real private-source denylist contents were not committed or printed into this evidence.

## Notes

Generic wording such as "private local reference" remains allowed. The gate is meant to block source-specific traces, not the architecture principle that private references may be used for learning while the public project keeps an independent identity.
