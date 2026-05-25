# Independent Multi-Codex Equal-Room Host Design

## Summary

Build an independent local-first collaboration host for running multiple Codex CLI sessions as equal agents in one shared room.

The project should not be a public wrapper or rebrand of another repository. External implementations may be used as private local references for engineering learning, but the public project must have its own architecture, naming, history, documentation, and module boundaries.

The first product surface is a local Web app backed by a host runtime on the user's primary computer. Later mobile access should enter through Feishu or another IM connector, but remote clients must remain lower-trust clients of the same host runtime.

## Product Goal

The core problem is not "open several Codex windows." The core problem is that current multi-agent workflows often preserve a master-subagent hierarchy. That hierarchy gives useful context isolation but makes peer correction weak: one parent decides what each subagent sees, what gets summarized back, and which challenge survives.

This project should create an equal-room workflow:

- each role runs as an independent Codex CLI session
- agents keep isolated context and session history
- agents can see selected room events and challenge each other
- reviewer challenge is a first-class workflow step
- the user owns final convergence and high-risk decisions
- Web, Feishu, and future mobile surfaces all use the same host runtime

## Public Independence Rules

The repository should remain clean and self-contained.

- Do not keep a permanent external remote relationship in this project.
- Do not describe the project as a derivative of another repository in public docs.
- Do not copy another project's brand, product identity, persona system, or visual identity.
- Do not commit private reference checkouts, migration notes, or source-specific research notes.
- Do not copy large source files mechanically. Reimplement narrow capabilities against this project's contracts.
- If a directly reused file is ever intentionally imported, handle authorization and license requirements before committing it.

Private local reference is allowed for learning hard implementation details, but public artifacts should describe only this project's decisions.

## Target Architecture

The stable runtime path is:

```text
Web Console
  -> Host API
  -> Room Hub
  -> SQLite Persistence
  -> Redis Event Bus / Invocation Queue
  -> Agent Runtime
  -> Codex Adapter
  -> Redis Event Bus
  -> WebSocket Broadcaster
  -> Web Console
```

Future Feishu or mobile access uses the same path:

```text
Feishu / IM Connector
  -> Connector Interface
  -> Room Hub
  -> Invocation Queue
  -> Agent Runtime
  -> Event Bus
  -> Connector Outbound Delivery
```

Remote entry points must not own room state, routing state, or durable message history.

## Core Modules

### Web Console

Local desktop-oriented Web UI for operating rooms, threads, agents, invocations, and controlled rounds.

It should provide:

- timeline with user, agent, and system events
- composer with `@agent`, broadcast, and workflow controls
- agent roster and live invocation status
- cancellation and retry controls
- reviewer-gate and round progress visibility
- later UI polish based on a dedicated design pass

The Web Console must not own routing, durable truth, or agent state.

### Host API

HTTP and WebSocket boundary for local clients and future connectors. It validates requests, forwards user input to Room Hub, exposes bootstrap data, and streams room events.

### Room Hub

Canonical entry point for all user and connector input.

Responsibilities:

- validate inbound messages
- persist user messages
- resolve targets or workflows
- create invocations
- enqueue agent jobs
- emit room events
- enforce high-risk confirmation boundaries

### Persistence

SQLite is the durable source of truth.

Store:

- rooms
- threads
- messages
- agents
- sessions
- invocations
- rounds
- audit logs

No durable fact should exist only in Redis or frontend state.

### Event Bus And Queue

Redis is the runtime coordination layer.

Use it for:

- room event streams
- invocation queue
- WebSocket fan-out
- active invocation state
- agent heartbeat
- round runtime counters
- idempotency keys

Redis state should be rebuildable or reconcilable from SQLite after restart.

### Agent Registry

Maps logical agent ids to agent service instances.

First expected agents:

- `architect`
- `reviewer`
- `implementer`

All three may use the Codex CLI provider, but each must have its own identity, invocation lifecycle, and session chain.

### Codex Adapter

Responsible for Codex CLI subprocess integration.

Responsibilities:

- spawn `codex exec --json`
- resume by session id when appropriate
- parse NDJSON stream events
- normalize text, tool, error, usage, and session events
- isolate CLI errors from other agents
- support cancellation and timeout
- record session ids and invocation metadata

The adapter should be tested through contract tests before being wired into orchestration.

### Orchestration

Policy layer for equal-agent workflows.

Initial workflow:

```text
design_review_execute
  1. architect proposes a plan
  2. reviewer challenges risks, missing tests, and unclear boundaries
  3. architect revises or rejects feedback with reasons
  4. implementer executes approved work
  5. reviewer performs final review
  6. user accepts, redirects, or requests another round
```

Workflow rules must live in orchestration, not only in the UI.

## Multiple Codex Sessions In One Room

The intended model is multiple Codex-family agent instances in one room, not one Codex session shared by all roles.

Each role should have:

- a distinct agent id
- a distinct identity prompt
- an independent Codex session chain
- independent invocation records
- independent failure and cancellation handling

This preserves context isolation while allowing controlled information exchange through room messages, mentions, and workflow stages.

## UI Direction

The UI may privately study mature multi-agent room products for interaction patterns, but the product experience should be redesigned for this project.

Initial UI priorities:

- efficient local desktop work surface
- dense but readable room timeline
- clear agent status and invocation state
- fast cancellation and retry
- no marketing landing page
- no decorative product identity before the core workflow works

Later UI optimization should get its own design pass covering:

- information architecture
- thread and room navigation
- agent roster and status model
- invocation cards
- controlled-round visualization
- mobile/Feishu-friendly message summaries

## Development Strategy

This is not a throwaway MVP. Delivery slices must stay on the final architecture path.

### Capability 1: Public Project Constitution

Deliver:

- independent project rules
- this design spec
- no-bypass architecture constraints
- public documentation without source-specific reference traces

Acceptance:

- a future agent can understand the project without private context
- public docs describe this project directly
- private reference use does not leak into public project identity

### Capability 2: Private Local Reference Validation

This work happens outside the public project repository.

Validate:

- local source setup
- Redis startup path
- Web room startup path
- multiple Codex-family agents in one thread
- session id behavior
- parallel and serial routing behavior
- streaming and persistence behavior

Acceptance:

- we know which patterns are proven and worth reimplementing
- we know which complexity should be avoided
- no private reference checkout or notes are committed to this repo

### Capability 3: Host Runtime Skeleton

Deliver the main path with a mock agent:

```text
Web Console
  -> Host API
  -> Room Hub
  -> SQLite
  -> Redis Queue/Event Bus
  -> Mock Agent Runtime
  -> Redis Event Bus
  -> WebSocket
  -> Web Console
```

Acceptance:

- Web submits a message through Room Hub
- SQLite persists user and agent messages
- Redis queues an invocation
- mock agent emits stream events
- WebSocket updates the timeline
- no alternate routing or state channel is introduced

### Capability 4: Codex Runtime

Replace the mock runtime with Codex CLI sessions.

Deliver:

- `architect`, `reviewer`, and `implementer` Codex agents
- spawn and resume
- stream parsing
- session persistence
- timeout and cancellation
- per-agent failure isolation

Acceptance:

- one room can run multiple independent Codex agents
- one failed agent does not collapse the room
- invocation state and messages survive restart

### Capability 5: Equal-Room Workflow

Deliver:

- `@agent` routing
- broadcast routing
- `design_review_execute`
- reviewer gate
- bounded rounds
- anti-loop limits
- user-controlled convergence

Acceptance:

- reviewer challenge cannot be silently skipped in review workflows
- rounds end predictably
- agent-to-agent triggering is bounded

### Capability 6: Remote Connector

Add Feishu after the local Web flow is stable.

Deliver:

- inbound connector
- outbound delivery
- `/new`
- `/status`
- `/stop`
- `@architect`, `@reviewer`, `@implementer`
- confirmation for high-risk remote actions

Acceptance:

- Feishu messages enter the same Room Hub
- Feishu does not own durable state
- high-risk actions require confirmation

## Verification Strategy

Use verification proportional to risk.

Minimum expected checks:

- unit tests for routing, target resolution, event parsing, persistence repositories
- integration test for the Web -> Room Hub -> Redis -> Agent Runtime -> SQLite -> WebSocket path
- contract tests for Codex Adapter NDJSON parsing
- restart recovery test for persisted sessions and messages
- manual local run notes for multi-Codex room behavior
- UI screenshot checks after the Web Console exists

Completion claims require evidence, not only implemented files.

## Risks

### Complexity Leakage

Private reference implementations may contain broad product scope. Importing too much will slow this project and blur boundaries.

Mitigation: reimplement narrow capabilities behind this project's module contracts.

### False Independence

Changing names while copying structure blindly would create a hidden dependency and future maintenance confusion.

Mitigation: document this project's own module contracts and write tests against those contracts.

### Session Confusion

Multiple Codex roles can accidentally share identity, session ids, or prompt context.

Mitigation: each agent has explicit id, session chain, invocation records, and identity prompt.

### Remote Overreach

Feishu can become an accidental remote shell if it is treated like the local Web UI.

Mitigation: remote connector has lower trust and confirmation gates for high-risk actions.

## Open Questions

- Exact package layout.
- Whether the first implementation uses Fastify, Hono, or another HTTP framework.
- Whether Redis streams alone are enough or a queue wrapper is useful.
- Exact SQLite schema migrations.
- Exact Codex CLI flags for the user's installed version.
- UI design language and layout details.

These questions should be resolved in the implementation plan or later UI design pass without changing the architecture boundaries above.
