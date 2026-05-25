# Multi-Codex Equal-Room Host Design

## Summary

Build a host runtime on the user's primary computer that coordinates multiple independent Codex CLI sessions as equal collaborators in one shared room.

The system exists because current subagent workflows isolate context but usually preserve a master-subagent hierarchy. That makes it hard for agents to challenge each other as peers. This project should create a room where agents keep separate context, expose their reasoning and outputs to each other through controlled routing, critique each other, and converge under user control.

The first implementation should be a local Web app backed by a Node/TypeScript Host Runtime. It should use multiple Codex CLI processes because the user currently has Codex subscription access. Feishu and other mobile/IM entry points come later as connectors into the same Host Runtime.

## Goals

- Run multiple Codex CLI sessions on the user's primary computer.
- Model those sessions as equal agents, not hidden subagents.
- Preserve separate agent context and session state.
- Remove manual copy/paste relay between Codex windows.
- Support `@agent`, broadcast, and controlled collaborative rounds.
- Make reviewer-style challenge a first-class workflow step.
- Use one core runtime that can later serve Web, Feishu, and mobile clients.
- Build the final architecture as a thin first implementation, not a bypass MVP.

## Non-Goals

- Do not base the public project identity on any external repository.
- Do not support Claude, Gemini, or opencode in the first implementation.
- Do not build a native mobile app in the first implementation.
- Do not add Feishu in the first implementation, beyond connector interface boundaries.
- Do not expose an unrestricted public remote shell.
- Do not build a full PTY terminal emulator.
- Do not build an autonomous long-running agent society without user control.
- Do not import voice, signals, games, marketplace, or unrelated platform scope.

## First-Principles Position

The product is not "multi-open Codex windows with a nicer UI." The UI is secondary.

The original problem is that multiple agents can improve quality only if they can hold independent context and still challenge each other's outputs. A subagent hierarchy weakens that relationship because the parent agent decides what is asked, what is returned, and what is visible. This system should instead let separate Codex sessions become peers in a shared room with explicit routing, controlled rounds, and user-owned final decisions.

## Architecture

The architecture is a host-centered system:

```text
Web Console
  -> Host API
  -> Room Hub
  -> SQLite durable store
  -> Redis Event Bus / Queue
  -> Agent Runtime
  -> Codex Adapter
  -> Redis Event Bus
  -> WebSocket Broadcaster
  -> Web Console
```

Future Feishu and mobile entry points connect to the same Host Runtime:

```text
Feishu / Future Mobile
  -> Connector Interface
  -> Room Hub
  -> Agent Runtime
  -> Event Bus
  -> Connector Outbound Delivery
```

The Web Console is the first client, not the owner of the system. Feishu later becomes another connector/client, not a second implementation of room state.

## Logical Modules

The physical directory layout is provisional. The logical module boundaries are mandatory.

### Web Console

Local browser UI for room operation:

- timeline
- composer
- agent roster and status
- invocation state
- round controls
- risk confirmation UI

It must not own routing, agent state, or durable message truth.

### Host Runtime

The Node/TypeScript process that owns API, WebSocket, Redis, SQLite, and agent runtime bootstrapping.

### Shared Protocol

Shared types and schemas for rooms, threads, messages, events, agents, invocations, rounds, and connector envelopes.

### Room Hub

Canonical entry point for all user/client input. It validates messages, writes user messages, creates invocations, invokes routing, and emits events.

### Event Bus

Redis-backed runtime coordination layer:

- event streams
- low-latency pub/sub notifications
- invocation job queue
- idempotency keys
- active runtime state
- agent heartbeat
- round runtime counters

### Persistence

SQLite-backed durable source of truth:

- rooms
- threads
- messages
- agents
- sessions
- invocations
- rounds
- audit logs

### Agent Runtime

Consumes invocation jobs and manages agent lifecycle:

- dispatch to the right agent
- cancellation
- timeout
- status transitions
- failure isolation
- stream event publication

### Codex Adapter

Codex-specific subprocess adapter:

- spawn new Codex sessions
- resume existing Codex sessions
- parse `codex exec --json` events
- transform raw events into shared AgentEvents
- surface CLI errors safely

### Orchestration

Policy layer for controlled collaboration:

- controlled rounds
- reply budgets
- role ordering
- reviewer gates
- anti-loop limits
- synthesis and convergence prompts

### Connector Interface

Shared boundary for future Feishu and mobile/IM inputs. Connectors submit inbound messages to Room Hub and receive outbound events from Event Bus. Connectors do not own state.

## Core Data Model

### Room

A collaboration space containing agents, threads, and runtime settings.

### Thread

A task or discussion line within a room. Future Feishu `/new` should create a thread through Room Hub.

### Message

Durable timeline entry from user, agent, or system.

### Agent

An equal collaborator. First-stage agents are Codex CLI variants such as:

- `architect`
- `reviewer`
- `implementer`

These are separate Codex CLI sessions with different identity prompts and independent context.

### Invocation

A single agent execution request. It records target agent, source message, status, session linkage, timestamps, errors, and output relationship.

Invocation statuses:

- `queued`
- `running`
- `succeeded`
- `failed`
- `canceled`

### Round

A controlled collaboration turn. It defines allowed agents, reply budgets, end conditions, and workflow stage.

### Event

Runtime event for streaming and coordination:

- message created
- invocation queued/running/done
- agent text delta
- agent tool event
- agent error
- round started/updated/ended
- connector delivery event

## Data Flow

### Inbound Message

```text
Web Console / Future Feishu
  -> submitMessage()
  -> RoomHub
  -> SQLite writes user message
  -> Redis publishes message.created
  -> MessageRouter resolves target agents
  -> InvocationStore creates invocations
  -> Redis queue receives agent jobs
  -> AgentRuntime consumes jobs
```

### Agent Execution

```text
AgentRuntime
  -> CodexAdapter spawn/resume
  -> Codex CLI stdout NDJSON
  -> CodexAdapter parser
  -> shared AgentEvent
  -> Redis event stream
  -> MessageAccumulator
  -> SQLite writes agent message
  -> WebSocket broadcaster
  -> Web Console timeline
```

### Future Connector Outbound

```text
Redis event stream
  -> Connector outbound worker
  -> Feishu message/card
```

## Redis And SQLite Split

Redis is part of the main architecture from the first implementation. It is not postponed as a later scaling tool.

Use Redis for runtime coordination:

- Streams for room and agent events
- Queue for invocation jobs
- Pub/Sub or stream consumers for WebSocket fan-out
- Key/value for idempotency keys
- Key/value for active invocation and round runtime state
- Heartbeat keys for agent workers

Use SQLite for durable facts:

- Room and thread metadata
- Full messages
- Agent definitions
- Session IDs and summaries
- Invocation records
- Round records
- Audit logs

Redis can be rebuilt or reconciled from SQLite after host restart. SQLite remains the source of durable truth.

## Equal-Agent Collaboration

The default workflow should be structured enough to create real critique:

```text
design_review_execute
  1. architect proposes a plan
  2. reviewer challenges risks, gaps, and missing tests
  3. architect revises or explains rejected feedback
  4. implementer executes
  5. reviewer performs final review
  6. system or summarizer records the conclusion
```

The first implementation may ship only one workflow, but it must live in Orchestration rather than being hard-coded into the UI.

Other future workflow policies:

- `free_discussion`
- `parallel_brainstorm`
- `review_only`
- `implementation_pair`

## Safety And Control

- Every invocation must be cancelable.
- Every controlled round must have an end condition.
- Agent-to-agent triggering must be bounded.
- Reviewer stages must not be silently skipped in review workflows.
- Remote connector commands are lower trust than local Web UI actions.
- High-risk remote actions require confirmation.
- System events should be low-noise but auditable.

## Local Reference Boundary

Local reference implementations may be used privately to validate hard engineering paths, but this project should remain an independent implementation with its own architecture, naming, and public history.

Borrow:

- CLI subprocess lessons
- AgentService streaming abstraction
- Codex CLI event parsing
- mention routing
- invocation lifecycle
- session continuity
- connector-as-edge architecture

Do not copy in the first implementation:

- all provider integrations
- full Redis-heavy platform scope beyond the needed runtime layer
- all IM connectors
- voice/TTS
- Signals
- games
- marketplace
- broad persona/brand systems unrelated to the core collaboration loop

Every borrowed pattern must be rechecked against this project's first-principles goal.

## Development Phases

These are module delivery phases, not throwaway MVPs. Each phase must stay on the final architecture path.

### Phase 0: Project Constitution And Design

Deliver:

- `AGENTS.md`
- this design spec
- module boundary agreement
- Redis/SQLite role agreement
- independent implementation boundary

Acceptance:

- Future agents can understand the project goal and constraints.
- The design distinguishes architecture skeleton work from bypass demos.

### Phase 1: Architecture Skeleton

Deliver the main path:

```text
Web Console
  -> Host API
  -> Room Hub
  -> SQLite
  -> Redis Event Bus / Queue
  -> mock Agent Runtime
  -> Redis Event Bus
  -> WebSocket
  -> Web Console
```

Acceptance:

- Web can submit a message.
- Room Hub persists the user message.
- Redis publishes a room event.
- Agent job enters Redis queue.
- Mock agent consumes job and emits agent events.
- Agent message persists to SQLite.
- WebSocket updates timeline in real time.

### Phase 2: Multi-Codex Runtime

Deliver:

- at least `architect`, `reviewer`, and `implementer`
- independent Codex CLI sessions
- spawn and resume support
- Codex stream parsing
- cancellation
- timeout and error handling
- failure isolation

Acceptance:

- Each role can run independently.
- One role failure does not collapse the room.
- Invocation states persist correctly.

### Phase 3: Equal-Agent Orchestration

Deliver:

- `@agent` routing
- broadcast routing
- controlled round
- default `design_review_execute` workflow
- reply budgets
- anti-loop guard

Acceptance:

- Reviewer stages are enforced in the default workflow.
- Controlled rounds end predictably.
- Agents cannot trigger infinite conversation loops.

### Phase 4: Developer Quality Loop

Deliver:

- unit tests for core modules
- integration tests for Room Hub, Event Bus, and Codex Adapter
- documented verification practice
- deliberate subagent use for review, opposing analysis, tests, or isolated implementation
- appropriately small commits with development-continuity context

Acceptance:

- Completion claims include evidence.
- Commit history can locate architecture pivots and regressions.

### Phase 5: Feishu Connector

Deliver:

- Feishu inbound connector
- Feishu outbound delivery
- `/new`
- `/status`
- `/stop`
- `@architect`, `@reviewer`, `@implementer`
- remote confirmation for high-risk actions

Acceptance:

- Feishu messages enter the same Room Hub.
- Feishu does not own core state.
- Agent output can return to Feishu.

## Development Rules

The root `AGENTS.md` is part of this design. It defines project rules for:

- first-principles design
- equal-agent collaboration
- no bypass MVPs
- Redis/SQLite responsibilities
- module boundaries
- deliberate subagent usage
- traceable commits using development-continuity before substantive commits
- verified completion
- remote-entry trust boundaries
- independent implementation and local reference discipline

## Open Questions

These are intentionally deferred until implementation planning:

- Exact physical directory layout.
- Whether to use Fastify, Express, Hono, or another HTTP framework.
- Whether to use raw Redis streams or a small local wrapper package.
- How much Codex CLI event parsing should be implemented directly versus isolated behind reusable adapter tests.
- Exact local development commands and Redis startup workflow.

These questions should not change the architecture boundaries above.

## Success Criteria

The project is on track when a user can:

- open the local Web Console
- submit one task to a room
- route it to multiple independent Codex roles
- watch live output return through the shared event path
- force reviewer critique before implementation
- cancel failed or unwanted invocations
- recover message and invocation history after restart

The project is off track if:

- Web UI owns core state
- agent output bypasses Redis Event Bus
- durable messages exist only in Redis or memory
- Feishu requires a second routing system
- controlled rounds are only UI conventions
- the first implementation works only by avoiding the final architecture
