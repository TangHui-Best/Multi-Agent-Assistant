# Multi-Agent Assi

Local-first desktop collaboration layer for running multiple Codex CLI sessions in one shared room without manual copy-paste relay.

## Current Status

- independent project rules written
- reference-architecture adoption design written
- independent Multi-Agent room direction retained
- architecture skeleton plan exists and will be revised against the new design
- repository baseline initialized for Git/GitHub workflow

## Phase 1 Architecture Skeleton

The first executable spine is:

`Web Console -> Host API -> Room Hub -> SQLite -> Redis Event Bus / Queue -> mock Agent Runtime -> Redis Event Bus -> WebSocket -> Web Console`.

Redis is runtime coordination. SQLite is durable truth. The mock agent runtime exists only to prove the main path before Codex CLI adapter work begins.

## Verified Phase 1 Skeleton

- Web submits a message to Host API.
- Room Hub persists the user message to SQLite.
- Room Hub enqueues invocation jobs through Redis.
- Mock Agent Runtime consumes Redis jobs.
- Agent output returns through Redis room events and WebSocket.
- Agent messages persist to SQLite.
