# EV-2026-05-25: Phase 1 Architecture Mapping

## Scope

验证 Phase 1 Architecture Mapping 设计：

- 架构映射以本项目模块边界和能力语言表达，不记录私有参考来源。
- 映射覆盖 reference adoption 设计要求的核心能力：agent roster、runtime binding、CLI invocation、streaming events、invocation lifecycle、mention routing、queue/slot control、session continuity、connector boundary、governance。
- 设计明确拒绝 source-to-source migration、Web bypass demo、memory-only spine、Phase 1 provider platform、删除 governance/bootstrap 等偏离路径。
- Public Hygiene Gate 可扫描新增公开文档和 commit message。
- Harness knowledge check 可以识别新增 spec/evidence。

## Commands

```text
python -m unittest tests.test_public_hygiene
python scripts/public_hygiene.py --root .
python scripts/public_hygiene.py --root . docs/superpowers/specs/2026-05-25-architecture-mapping-design.md
$env:PUBLIC_HYGIENE_FORBIDDEN_PATTERNS='<redacted env rule not committed to repository>'; python scripts/public_hygiene.py --root . --require-rules --require-env-rules --require-commit-range --commit-range origin/main..HEAD
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs
```

## Results

Result: Pass for the Phase 1 Architecture Mapping design slice.

Observed artifacts:

- Spec: `docs/superpowers/specs/2026-05-25-architecture-mapping-design.md`
- Commit: `6299a2e docs: map architecture adoption phase`

Verification results:

- Unit tests passed: 10 tests.
- Public hygiene scan passed for 18 tracked files with 1 env-injected rule over `origin/main..HEAD`.
- Public hygiene scan passed for the new architecture mapping spec file.
- Env-injected public hygiene scan passed with `--require-rules`, `--require-env-rules`, and `--require-commit-range` over `origin/main..HEAD`.
- Harness knowledge check passed for `docs`.

## Boundary

The design intentionally does not expose private repository names, URLs, paths, branch names, commit hashes, checkout layouts, product identity markers, raw logs, prompts, archives, or source module names.

The phrase "private local reference" remains allowed because the public architecture already permits private engineering references while requiring this project to keep an independent public identity.

## Artifacts

- `docs/superpowers/specs/2026-05-25-architecture-mapping-design.md`
- `docs/superpowers/evidence/2026-05-25-architecture-mapping.md`
- Commit `6299a2e docs: map architecture adoption phase`

## Next Step

Revise or supersede `docs/superpowers/plans/2026-05-01-architecture-skeleton-v1.md` before large implementation work. The revised plan should follow the new mapping order:

1. project-native Shared Protocol contracts
2. mock main path through Room Hub, SQLite, Redis, Agent Runtime, WebSocket, and Web Console
3. Codex Adapter contract tests before real Codex CLI wiring

## Unverified

- Remote GitHub Actions Public Hygiene has not yet run for this new commit at the time this Evidence record is written.
- The existing architecture skeleton plan has not yet been revised against the mapping.

## Notes

This Evidence covers the mapping/design slice only. It does not claim that the architecture skeleton has been implemented or that Codex Adapter behavior has been migrated.
