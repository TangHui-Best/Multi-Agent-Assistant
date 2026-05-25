---
doc_kind: spec
status: active
created: 2026-05-25
feature_refs: []
---

# Public Hygiene Gate

## Goal

The public repository may mention that a private local reference exists, but it must not expose the private reference source itself.

The gate protects against committing source-specific names, URLs, local checkout paths, migration notes, or product identity markers from a private reference implementation.

## Design

`scripts/public_hygiene.py` scans repository text files and selected commit messages for forbidden patterns.

Forbidden patterns are loaded from three places:

- `.public-hygiene/forbidden-patterns.txt` for public, non-sensitive rules.
- `.public-hygiene/forbidden-patterns.local.txt` for local private rules. This file is ignored by Git.
- `PUBLIC_HYGIENE_FORBIDDEN_PATTERNS` for CI secret injection.

Rules are exact literals by default. Prefix a rule with `regex:` when a regular expression is needed.

Finding output must not print the forbidden pattern itself. Rules are reported by redacted source and index, such as `env rule #1`, so a CI failure does not turn the secret denylist into a log leak.

CI must run with `--require-rules` and `--require-commit-range`. A green CI job with zero loaded private rules, or with commit-message scanning silently skipped, is a false gate and should fail closed.

## Boundary

The committed denylist must not contain real private reference identifiers. A denylist that names the private source would itself become a public leak.

Generic phrases such as "private local reference" are allowed because the public architecture explicitly documents that private references may be used for learning. The forbidden content is the source-specific trace: concrete names, URLs, local paths, or copied identity markers.

## Verification

Run:

```text
python -m unittest tests.test_public_hygiene
python scripts/public_hygiene.py --root .
PUBLIC_HYGIENE_FORBIDDEN_PATTERNS='<secret>' python scripts/public_hygiene.py --root . --require-rules --require-commit-range --commit-range origin/main..HEAD
```

GitHub Actions runs the scanner on pushes to `main` and pull requests. It checks out full history so commit messages can be scanned over the push or pull request range.
