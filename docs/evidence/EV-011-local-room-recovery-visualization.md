---
id: EV-011
doc_kind: evidence
scope: project
feature_ids:
  - F001
  - F005
feature_refs:
  - docs/features/F001-equal-room-host-core.md
  - docs/features/F005-local-room-productization-recovery-visualization.md
created: 2026-05-31
---

# EV-011: Local Room Recovery Visualization

## Scope

本证据记录 `Local Room Productization + Recovery 可视化` 的完成状态。验证范围包括 Host read projection、Web Console round/recovery 投影、audit timeline 读取、bootstrap 与 WebSocket 合并、视觉检查、独立 review，以及 Harness knowledge validation。

本证据不声明自动 retry/resume、Feishu connector 或 Claude/OpenCode/Gemini runtime binding 已完成；这些仍属于后续阶段。

## Commits

```text
56ce1f2 docs: anchor local room recovery visualization
3cc882e docs: plan local room recovery visualization
5c1265e feat: expose room recovery read projections
f5e7b01 test: cover empty invocation audit response
8452374 feat: add room round projection helpers
c1a3152 fix: derive live round step status from invocation link
966b461 fix: fall back to round step invocation lookup
ede0cf6 feat: visualize round recovery details
7cc1421 fix: harden recovery visualization projection
```

## Results

Pass.

- Host bootstrap now includes persisted rounds and round steps for the default thread.
- Host exposes a read-only invocation audit endpoint backed by SQLite `invocation_audit_logs`.
- Web Console renders a room health strip, ordered round progress, step state, selected recovery target, invocation metadata, resume metadata, and audit timeline.
- Web projection state is derived from Host bootstrap and room events; it does not become a second core state owner.
- `mergeBootstrapState` preserves newer live invocation status/timestamps while backfilling durable bootstrap fields such as `sourceMessageId`, `roundId`, `roundStepId`, `runtimeSessionId`, and `resumeMetadata`.
- Audit loading now clears stale entries during refresh and is keyed by selected invocation plus update timestamp.

## Commands

```text
docker compose exec -T redis redis-cli -n 15 FLUSHDB
$env:REDIS_URL='redis://127.0.0.1:6379/15'; pnpm.cmd exec vitest run tests/integration/architecture-skeleton.test.ts
docker compose exec -T redis redis-cli -n 15 FLUSHDB
$env:REDIS_URL='redis://127.0.0.1:6379/15'; pnpm.cmd test
pnpm.cmd build
python -m unittest tests.test_public_hygiene
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
```

## Verification Results

```text
Focused architecture integration run: 1 test passed.
pnpm.cmd test: 11 test files passed, 81 tests passed.
pnpm.cmd build: passed; 7 workspace projects built, including apps/web and apps/host.
python -m unittest tests.test_public_hygiene: Ran 10 tests, OK.
knowledge_check.py --strict: Scanned 35 markdown file(s). Checked 18 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Harness Validation

```text
python <harness-skill>/scripts/knowledge_check.py --root <repo> --docs-path docs --strict
Scanned 35 markdown file(s). Checked 18 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Independent Review

Independent spec review approved the initial visual slice.

Independent UX/code review found four issues:

- bootstrap replacement could overwrite newer live WebSocket events;
- audit detail could show old entries while a refreshed invocation was loading;
- the round container looked like a card containing card-like step buttons;
- selected seat/step state was only visual and lacked semantic pressed state.

Those were addressed with projection merge helpers, audit loading helpers, flatter round styling, and `aria-pressed` states.

Final re-review then found one more important projection bug: preserving an entire newer synthetic live invocation could prevent older bootstrap data from backfilling durable fields. `7cc1421` added a regression test and changed the merge to preserve newer volatile status/timestamps while filling missing durable fields from bootstrap. Final reviewer re-check reported no remaining blocking issues.

## Visual Check

Manual visual verification used a local Vite dev server and controlled Host API seed message to render a `design_review_execute` round. Screenshot artifact:

```text
<repo>\.tmp\f005-ui-review-fixed.png
```

The screenshot showed the room health strip, round progress, flattened round-step controls, recovery detail panel, and audit area without obvious text overlap or nested-card visual clutter at a 1440x1000 viewport.

## Recovery Path

- If the F005 UI causes user confusion, the API additions remain read-only and can be hidden from Web Console without mutating persisted facts.
- If bootstrap/live merge regressions appear, focused tests in `apps/web/src/App.test.ts` cover status derivation, live-newer preservation, durable-field backfill, audit loading, and recovery metadata formatting.
- Retry/resume execution remains intentionally out of scope; Recovery / Session Continuity 2.0 should build on this read projection rather than duplicating state in the UI.

## Residual Risks

- Visual verification covered desktop width only. A future UI hardening pass should add mobile/browser checks if the Web Console becomes a primary mobile surface.
- Audit endpoint is read-only and scoped to invocation id; it does not yet provide broader recovery filtering or operational search.
- Round convergence is still workflow-specific and hardcoded. Orchestration Policy Layer must make reviewer gates, verdicts, and round stop rules explicit before automatic recovery is added.

## Artifacts

- `apps/host/src/index.ts`
- `apps/host/test/createServer.test.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.ts`
- `apps/web/src/styles.css`
- `packages/shared/src/protocol.ts`
- `docs/features/F005-local-room-productization-recovery-visualization.md`
- `docs/superpowers/specs/2026-05-31-local-room-productization-recovery-visualization-design.md`
- `docs/superpowers/plans/2026-05-31-local-room-productization-recovery-visualization.md`
- `.tmp/f005-ui-review-fixed.png`

## Notes

本阶段的关键判断是先把“能看见事实和恢复依据”做实，而不是直接做自动恢复。这样下一阶段 Orchestration Policy Layer 可以基于可观察的 round/step/audit 数据定义 reviewer gate 和收敛策略，避免把 recovery 变成不可解释的后台重试。
