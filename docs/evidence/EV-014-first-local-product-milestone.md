---
id: EV-014
doc_kind: evidence
scope: project
feature_ids:
  - F008
feature_refs:
  - docs/features/F008-first-local-product-milestone.md
created: 2026-06-11
updated: 2026-06-12
---

# EV-014: First Local Product Milestone

## Scope

This evidence records the implementation and verification for F008 `First Local Product Milestone`.

The milestone covers:

- Host startup recovery enumerating persisted thread ids instead of relying on a single fixed recovery thread.
- A source-neutral Connector Interface baseline that submits connector-originated input through Room Hub.
- A productized Web Console room workbench shell with the required five visible regions.
- Public source-neutral hygiene for tracked project files.
- F001/F002 split into a concrete milestone Feature plus explicit follow-up Features for remaining scope.
- A runtime queue recovery fix for stale Redis jobs whose persisted invocation no longer exists.

This evidence does not claim completion for a full Feishu connector, Claude Code/OpenCode/Gemini CLI adapters, or explicit runtime resume.

## Commits

```text
0a395ea feat: add connector ingress and recover persisted threads
fc52314 feat: productize room workbench shell
```

The closeout batch containing stale Redis job recovery and F008/F009/F010/F011 documentation updates is identified by the commit that adds or updates this evidence.

## Results

Pass for the first local product milestone.

- `apps/host/src/index.ts` calls `recoverBeforeWorkerStart` with `repositories.listThreadIds()`.
- `packages/persistence/src/repositories.ts` exposes a deterministic persisted thread id list for startup recovery.
- `packages/connector-interface` defines the source-neutral connector ingress boundary. Connector-originated input is converted to `SubmitMessageInput` with `source: 'connector'` and submitted through Room Hub.
- `apps/web/src/App.tsx` exposes five visible room workbench regions: members/seats, thread timeline, round progress, invocation/recovery detail, and task composer.
- Web Console state remains derived from bootstrap and room events; no new UI-owned state source was introduced.
- F001 and F002 remain active umbrella Features, while milestone-specific closure and future gaps are represented by F008, F009, F010, and F011.
- `packages/agent-runtime/src/agentWorker.ts` now acknowledges stale Redis jobs whose invocation is missing from persistence, so old queue entries cannot block a fresh in-memory test or local recovery run.

## Commands

```text
pnpm.cmd exec vitest run packages/persistence/test/repositories.test.ts apps/host/test/startup.test.ts packages/connector-interface/test/connectorIngress.test.ts
pnpm.cmd exec vitest run apps/web/src/App.test.ts
pnpm.cmd exec vitest run packages/agent-runtime/test/agentWorker.test.ts packages/agent-runtime/test/mockAgentWorker.test.ts
pnpm.cmd test
pnpm.cmd build
python -m unittest tests.test_public_hygiene
python C:\Users\HUAWEI\.codex\skills-backup\harness-before-f31d980-20260526-113424\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
```

## Verification Results

```text
Focused startup recovery + connector run: 3 test files passed, 10 tests passed.
Web Console projection and shell run: 1 test file passed, 14 tests passed.
Focused agent runtime stale-job run: 2 test files passed, 26 tests passed.
pnpm.cmd test: 13 test files passed, 111 tests passed.
pnpm.cmd build: passed; 8 workspace projects built, including connector-interface.
python -m unittest tests.test_public_hygiene: Ran 10 tests, OK.
knowledge_check.py --strict: Scanned 48 markdown file(s). Checked 27 knowledge artifact(s). Errors: 0. Warnings: 0.
```

`pnpm.cmd build` and `python -m unittest tests.test_public_hygiene` passed in a non-sandbox run in this Codex desktop environment. The sandboxed build had failed with `spawn EPERM` when `pnpm -r build` spawned child processes, and the sandboxed hygiene test had failed because Python temporary directories were created under an AppData temp path that the sandbox cannot write.

## Manual Verification

```text
Started the Web dev server at http://127.0.0.1:5174/.
HTTP check returned 200.
The rendered App shell is covered by apps/web/src/App.test.ts, which asserts the five required workbench regions:
- aria-label="成员与席位"
- aria-label="线程时间线"
- aria-label="Round 进度"
- aria-label="Invocation 与恢复详情"
- aria-label="任务 Composer"
```

The in-app Browser tool was not exposed in the available tool list during this run, and local Playwright dependencies were not installed, so no screenshot artifact was produced in this evidence record.

## Harness Validation

```text
python C:\Users\HUAWEI\.codex\skills-backup\harness-before-f31d980-20260526-113424\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs --strict
Scanned 48 markdown file(s). Checked 27 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Residual Risks

- Full `pnpm.cmd test` requires Redis availability. If Docker Desktop or Redis is not running, the integration architecture skeleton test will fail with `ECONNREFUSED 127.0.0.1:6379`.
- Host bootstrap still reads the default thread for the current local Web Console view. F008 removes the startup recovery correctness issue; full multi-thread Web navigation remains future product work.
- Connector Interface is intentionally minimal and does not implement concrete Feishu authentication, signing, confirmation, or callback transport.
- Web Console productization in F008 is a first source-neutral room workbench shell. It does not migrate a full reference UI component library.

## Follow-Up Features

- [F009 Feishu connector](../features/F009-feishu-connector.md)
- [F010 multi-runtime adapters](../features/F010-multi-runtime-adapters.md)
- [F011 explicit runtime resume](../features/F011-explicit-runtime-resume.md)

## Artifacts

- `apps/host/src/index.ts`
- `apps/host/src/startup.ts`
- `apps/host/test/startup.test.ts`
- `packages/persistence/src/repositories.ts`
- `packages/persistence/test/repositories.test.ts`
- `packages/connector-interface/src/connectorIngress.ts`
- `packages/connector-interface/test/connectorIngress.test.ts`
- `packages/agent-runtime/src/agentWorker.ts`
- `packages/agent-runtime/test/agentWorker.test.ts`
- `packages/agent-runtime/test/mockAgentWorker.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.ts`
- `apps/web/src/styles.css`
- `docs/features/F008-first-local-product-milestone.md`
- `docs/features/F009-feishu-connector.md`
- `docs/features/F010-multi-runtime-adapters.md`
- `docs/features/F011-explicit-runtime-resume.md`

## Notes

The milestone closes the first local usable product baseline without expanding the scope into remote connector implementation, multiple runtime adapters, or explicit runtime resume. That keeps Room Hub, Event Bus, Persistence, Agent Runtime, Web Console, and Connector Interface boundaries clear while giving the remaining work independent Harness Feature anchors.
