---
id: F003
doc_kind: feature
status: completed
created: 2026-05-26
updated: 2026-05-26
---

# F003: Public Hygiene Gate

## Goal

保护公开仓库不泄露私有参考实现的 source-specific trace，同时允许公开文档承认“private local reference”这一工程事实。

## Vision Anchor

- 原始请求或来源：`docs/superpowers/specs/2026-05-25-public-hygiene-gate.md`。
- 用户痛点或工程问题：项目会借鉴本地私有参考实现；如果没有 fail-closed gate，文件内容、路径、commit message、CI 日志或 denylist 本身都可能泄露私有来源。
- 期望结果：`scripts/public_hygiene.py`、`.public-hygiene/forbidden-patterns.txt`、`.public-hygiene/forbidden-patterns.local.txt`、`PUBLIC_HYGIENE_FORBIDDEN_PATTERNS` 和 GitHub Actions 共同覆盖 tracked files、repository-relative paths、commit messages，并且失败输出脱敏。
- 非目标或边界：公开 denylist 不提交真实私有标识；generic phrase `private local reference` 保持允许。
- Exit Gate 对照来源：本 Feature 的验收标准和 EV-003。

## Current Status

Completed. The implemented gate was recorded on 2026-05-25, local review-hardening evidence is recorded in EV-003, canonical Harness migration validation is recorded in EV-004, and remote GitHub Actions success is recorded in EV-005.

## Links

- Legacy spec: [2026-05-25 public hygiene gate](../superpowers/specs/2026-05-25-public-hygiene-gate.md)
- Evidence: [EV-003 public hygiene gate](../evidence/EV-003-public-hygiene-gate.md)
- Evidence: [EV-004 harness knowledge migration](../evidence/EV-004-harness-knowledge-migration.md)
- Evidence: [EV-005 public hygiene remote actions](../evidence/EV-005-public-hygiene-remote-actions.md)

## Acceptance Criteria

- [x] Scanner can run locally against repository text files.
- [x] Scanner covers repository-relative file paths.
- [x] Scanner can scan commit messages over an explicit commit range.
- [x] CI can require loaded rules, env-injected private rules, and commit range scanning.
- [x] Failure output redacts forbidden pattern values and raw file paths.
- [x] Public committed denylist contains no real private reference identifiers.
- [x] Remote GitHub Actions run has been observed after push.

## Patch History

| Patch | Date | Commit | Symptom | Root Cause | Protection | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F003.1 | 2026-05-25 | `827d4fb` | CI failure logs could echo forbidden pattern values; commit messages were not scanned; CI could pass with zero effective rules. | Initial gate proved file-content matching but did not treat failure output, commit history, or fail-closed CI as first-class acceptance surfaces. | Redacted rule labels, commit-message scanning, `--require-rules`, `--require-commit-range`, full-history CI checkout, and regression tests. | fixed |
| F003.2 | 2026-05-25 | `e5e91fe` | Private traces in repository-relative file paths were not scanned, and raw paths could leak in failure output; public rules could satisfy `--require-rules` when env private rules were missing. | The gate treated paths as report locations rather than scan surfaces, and counted all rule sources together for CI readiness. | Path scanning, redacted file-number locators, `--require-env-rules`, CI env-rule requirement, and regression tests. | fixed |

## Evidence

- [EV-003 public hygiene gate](../evidence/EV-003-public-hygiene-gate.md) records local unit, scanner, env-rule, commit-message, path-scan, and Harness validation evidence from the original gate implementation.
- [EV-004 harness knowledge migration](../evidence/EV-004-harness-knowledge-migration.md) records current strict Harness validator compatibility after migration.
- [EV-005 public hygiene remote actions](../evidence/EV-005-public-hygiene-remote-actions.md) records the observed remote GitHub Actions success for Public Hygiene run `#3`.

## Next Step

Before relying on this workflow after GitHub's Node.js 20 runner deprecation window, re-check whether `actions/checkout` and `actions/setup-python` need version updates.
