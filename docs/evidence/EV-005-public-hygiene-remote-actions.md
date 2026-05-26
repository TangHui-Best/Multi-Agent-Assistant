---
id: EV-005
doc_kind: evidence
scope: project
feature_ids:
  - F003
feature_refs:
  - docs/features/F003-public-hygiene-gate.md
created: 2026-05-26
---

# EV-005: Public Hygiene Remote Actions

## Scope

验证 F003 的远程闭环项：Public Hygiene GitHub Actions workflow 已在 push 后运行，并且结果为 success。

## Commands

```text
Invoke-RestMethod -Uri 'https://api.github.com/repos/TangHui-Best/Multi-Agent-Assistant/actions/runs?per_page=20' -Headers @{ 'User-Agent' = 'codex' } | ConvertTo-Json -Depth 6
Open https://github.com/TangHui-Best/Multi-Agent-Assistant/actions/runs/26409981225
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
```

## Results

Pass.

Observed remote GitHub Actions run:

- Workflow: `Public Hygiene`
- Run: `#3`
- Event: `push`
- Branch: `main`
- Head commit: `2cded26f32aeadf4e14b0ae6bf83394704f9af5b`
- Display title: `docs: record architecture mapping evidence`
- Created: `2026-05-25T16:21:20Z`
- Updated: `2026-05-25T16:21:32Z`
- Status: `completed`
- Conclusion: `success`
- URL: `https://github.com/TangHui-Best/Multi-Agent-Assistant/actions/runs/26409981225`

The public run page also showed `Status Success`, trigger `push`, timestamp `May 25, 2026 16:21`, commit `2cded26`, and job `Scan public repository traces`.

## Harness Validation

Observed output after adding this Evidence record and updating F003:

```text
Scanned 20 markdown file(s). Checked 9 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Artifacts

- Remote run: `https://github.com/TangHui-Best/Multi-Agent-Assistant/actions/runs/26409981225`
- Workflow file: `.github/workflows/public-hygiene.yml`
- Feature: `docs/features/F003-public-hygiene-gate.md`

## Notes

The GitHub page displayed one warning about Node.js 20 deprecation for `actions/checkout@v4` and `actions/setup-python@v5`. This does not invalidate the 2026-05-25 Public Hygiene run, but the workflow should be checked again before GitHub removes Node.js 20 runner support.
