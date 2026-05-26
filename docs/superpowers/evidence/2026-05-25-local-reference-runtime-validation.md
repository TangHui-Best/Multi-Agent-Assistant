# EV-2026-05-25: 私有本地参考运行时验证

## Scope

验证一个私有本地参考运行时是否具备本项目可借鉴的核心运行能力：

- 本地 Web + API 可以启动并保持运行。
- 可以配置多个 Codex-bound agent。
- 单条用户消息可以路由到一个 Codex agent 并持久化回复。
- 单条用户消息可以同时路由到多个 Codex agent，并让它们以独立 turn invocation 返回到同一个 thread。
- Governance bootstrap guard 对外部项目路径会阻断运行链路，迁移时需要保留长期价值但提供明确的本地开发策略。

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
```

## Results

Result: Pass for local reference-runtime validation.

Observed environment:

- Web: `http://localhost:3003`
- API: `http://localhost:3004`
- Start mode: memory runtime
- API health returned `status: ok`.
- Configured Codex-bound agents: `architect`, `reviewer`, `implementer`.

Single-agent evidence:

- Thread: `thread_mpjvv5q0t2t3t2ya`
- User message shape: single `architect` mention with an exact `OK` response request.
- Parent invocation: `cf66c419-588a-4e01-ab17-dd93cadc70ca`
- Internal turn invocation: `3709d03f-cbab-46fb-b7f4-9288d6b6508d`
- Result: assistant message from `architect` persisted with content `OK`.
- Parent invocation status: `succeeded`.

Two-agent evidence:

- User message shape: `architect` + `reviewer` mentions with an exact `OK` response request.
- Parent invocation: `ddd99a04-0477-4169-9e71-8be86c81d5e2`
- Target agents: `architect`, `reviewer`
- Internal turn invocation for `architect`: `891b4b1f-297b-4fb5-95cd-2cba97945a84`
- Internal turn invocation for `reviewer`: `dda28f02-cd2e-4e38-bbde-16aeca68d394`
- Result: both assistant messages persisted with content `OK`.
- Parent invocation status: `succeeded`.

Session evidence:

- `architect` reused session chain `019e5a6d-2226-7440-9807-77528bb93328`.
- `reviewer` created/bound session chain `019e5abb-4069-7202-a4a3-d3d818782446`.

## Harness Validation

Passed.

```text
python C:\Users\HUAWEI\.codex\skills\using-harness\scripts\knowledge_check.py --root E:\Self-Project\Multi-Agent-Assi --docs-path docs
Scanned 7 markdown file(s). Checked 1 knowledge artifact(s). Errors: 0. Warnings: 0.
```

## Artifacts

- Private local reference runtime logs and raw CLI archives.
- Audit log entries for the invocation ids listed above.
- Public project artifacts intentionally avoid naming or linking the private reference source.

## Notes

关键结论：

- 私有本地参考运行时支持将多个 CLI-backed agent 放进同一个会话窗口，并能把同一条消息拆成多个 agent turn invocation。
- 这个能力与本项目“多个独立 Agent 在同一个房间平等协作”的核心愿景高度匹配，适合作为迁移参考。
- 可借鉴的能力边界包括 agent catalog、mention routing、invocation lifecycle、session chain、raw archive、audit log、connector outbound hook。
- 当前验证使用 memory runtime，不代表 Redis/SQLite 生产职责已经满足；迁移到本项目时仍应坚持 Redis 做运行时协调、SQLite 做持久事实源。
- 外部项目路径触发 governance guard，说明 governance guard 真实生效。短期开发需要 local-only bypass 或 test fixture 项目，长期不应删除该机制。
- Codex CLI 在 Windows 上出现过多次 child process exit 等待超时并重连，但最终仍能返回并落库。迁移时需要把 CLI 超时、重连和取消视为一等状态，不要只做 happy path。
