# Multi-Codex Room V1 Design

## Summary

Build a single-machine desktop app that lets multiple CodexCLI sessions join the same chat room so the user no longer has to manually relay context between terminals.

The first version focuses on the smallest system that removes the human from the message bus:

- a room-centric local app
- lightweight wrapper-launched adapters for each CodexCLI session
- a shared message hub with `broadcast`, `@agent`, and controlled speaking rounds
- an optional orchestrator layer for debate and summarization

The first version explicitly does not try to become a full PTY host or terminal manager.

## Problem

Today the user often runs two or more CodexCLI sessions with different perspectives and manually copies messages between them. That creates three costs:

- context relay is slow and error-prone
- parallel discussion becomes fragmented across terminals
- the user gets trapped in transport work instead of steering the collaboration

The product should remove the user from that transport role while preserving control over how agents debate, complement each other, and converge.

## Goals

- Let multiple local CodexCLI sessions participate in one shared room.
- Let the user send one message that reaches the right agents without manual copy-paste.
- Support both open group discussion and controlled rounds.
- Support directional collaboration with `@agent`.
- Keep the architecture clean enough to evolve later into richer process hosting without rewriting the core.
- Establish the project from day one as a Git-managed codebase suitable for later open-source publication on GitHub.

## Non-Goals

- Full PTY terminal hosting in V1.
- Remote or multi-machine operation.
- Multi-user collaboration over the network.
- Deep terminal output mirroring.
- Autonomous unrestricted agent-to-agent conversation loops.

## Repository Strategy

The project should be initialized immediately as a local `git` repository and published through GitHub once the initial baseline is ready.

This is the preferred path, not an afterthought, because:

- the project is intended for later open-source release
- design and implementation will likely evolve quickly and need disciplined history
- issue tracking, collaboration, and release packaging become simpler if the repository shape is correct from the start

### Repository Principles

- Use `git` as the canonical local version-control system from the beginning.
- Treat GitHub as the default remote and future public home of the project.
- Keep repository structure, naming, and docs suitable for eventual outside contributors.
- Avoid local-only conventions that will become liabilities when the repository is published.

### Open-Source Readiness Expectations

The initial repository baseline should make room for:

- a clear `README`
- a suitable `.gitignore`
- an explicit license
- contribution guidance once the project reaches a shareable state

These are not the core product features, but they are part of the project's intended shape and should influence how the codebase is organized.

## Product Shape

V1 is a local desktop product with three conceptual layers:

1. Desktop App Shell
   Owns the visible product surface, local settings, room lifecycle, agent list, and message history.
2. Room Hub
   The canonical source of truth for room state and message routing.
3. Adapter Layer
   A thin wrapper around each launched CodexCLI instance that connects one CLI session to the room protocol.

An optional Orchestrator sits on top of the Room Hub and adds controlled turn-taking, debate windows, and summary requests. The system must still work if the Orchestrator is disabled.

## Approaches Considered

### A. Room Hub + Local Adapters

Recommended.

The desktop app owns rooms and routes messages. Each CodexCLI is launched through a wrapper and joins the room through a lightweight adapter.

Why this is preferred:

- directly solves the user's relay pain
- keeps boundaries clear
- avoids V1 PTY complexity
- leaves a clean upgrade path for richer hosting later

### B. Full Terminal Host

Rejected for V1.

The app owns PTY sessions and embeds or mirrors each terminal directly.

Why it is rejected:

- terminal compatibility and process-control complexity dominate the release
- high implementation cost before core value is proven
- risks turning the product into a terminal manager instead of a collaboration layer

### C. Loose Clipboard/File Automation

Rejected for V1.

The app coordinates existing CLIs through weak side channels with minimal ownership.

Why it is rejected:

- unreliable state recovery
- blurred system boundaries
- likely to regress back into manual intervention

## Architecture

### Desktop App Shell

Responsibilities:

- room list and room lifecycle
- agent roster
- main conversation timeline
- control panel for round state
- local persistence and settings

The shell must present collaboration as a room, not as a pile of terminals.

### Room Hub

Responsibilities:

- maintain canonical room state
- accept messages from user, adapters, and system
- route messages by targeting mode
- track current round state
- persist message history and room metadata

The Room Hub is the single source of truth. Adapters do not own room state and cannot invent it.

### Orchestrator

Responsibilities:

- open and close controlled rounds
- nominate which agents should reply
- request summaries or synthesis
- help converge a discussion when requested

The Orchestrator is optional and policy-oriented. It must not be required for baseline room messaging to work.

### Adapter Layer

Each adapter connects exactly one wrapper-launched CodexCLI session to the Room Hub.

Responsibilities:

- launch the CLI with room/identity context
- ingest room messages and transform them into CLI input
- observe CLI output and emit publishable agent replies
- report lifecycle and status changes

The adapter is intentionally narrow. It is not a second orchestrator and not a terminal recorder.

## Core Data Model

### Room

A collaboration container with:

- room id
- title
- participant list
- message timeline
- round state
- local settings

### Participant

Three participant kinds:

- `user`
- `agent`
- `system`

This keeps the timeline unified while still distinguishing origin and privileges.

### Message

Four message kinds:

- `user_message`
- `agent_message`
- `system_event`
- `control_command`

Messages may also carry metadata such as:

- sender id
- target mode
- referenced message id
- round id
- intent
- timestamps

Special activities like summary, critique, proposal, or synthesis should initially be represented through metadata rather than a growing list of bespoke message types.

### Round

Room speaking state supports:

- `open`
- `controlled`

In `open`, any eligible agent may answer.
In `controlled`, only nominated agents may answer within the defined limits.

## Message Routing Rules

Each outbound user or system instruction uses one of three targeting modes:

- `broadcast`: sent to all active agents in the room
- `mention`: sent to one or more explicitly tagged agents such as `@critic`
- `orchestrated`: sent according to orchestrator-controlled speaking permissions

These modes allow one unified message flow instead of splitting the system into separate chat and orchestration channels.

## Controlled Collaboration Rules

V1 should default to controlled behavior with the option to temporarily open discussion.

### Required Rules

- Every controlled round must have an explicit end condition.
- Each participating agent has bounded reply opportunities per round.
- Agent-to-agent chain depth is limited to prevent runaway loops.
- Timeout becomes an explicit state, not an invisible hang.
- The user can interrupt or end any round manually.

### Examples of End Conditions

- each nominated agent replies once
- orchestrator receives required replies and requests synthesis
- a timeout threshold is reached
- the user ends the round

## Adapter Contract

The first version keeps the adapter contract small and strict.

### 1. Launch

Start a CodexCLI session through a wrapper with:

- agent identity
- room identity
- connection information
- role-specific system prompt or startup instructions

### 2. Ingest

Receive room messages from the hub and convert them into input suitable for that specific CodexCLI session.

### 3. Observe

Read the CodexCLI output stream and extract responses that should enter the room as agent messages.

V1 should publish only structured, user-relevant replies. It should not dump the raw terminal transcript into the shared room.

### 4. Status

Continuously report adapter/session state, including:

- `starting`
- `idle`
- `thinking`
- `replying`
- `errored`
- `offline`

## UI Design

The primary interaction model is a room with mixed collaboration modes, not a terminal dashboard.

### Left Panel

- rooms
- agent list
- agent status
- active/inactive indicators

### Center Panel

Main collaboration timeline containing:

- user messages
- agent replies
- system events

Supported actions:

- send to room
- `@agent` targeting
- start a controlled round
- request summary or arbitration

### Right Panel

Control surface for round management:

- current round mode
- who may speak this round
- remaining reply budget
- timeout/round status
- end round
- request synthesis

The center panel should stay focused on collaborative output. Control state and low-level operational detail belong in the side panel or subdued system-event styling.

## Error Handling

### Adapter Failure Isolation

If one adapter fails, the room must continue operating. The failed agent is marked `offline` or `errored` without collapsing the rest of the session.

### Explicit System Events

Operational events should appear in the timeline as low-noise `system_event` entries, including:

- agent launched
- adapter disconnected
- round started
- round ended
- summary requested
- timeout triggered

### Timeout Handling

When an agent does not answer in time during a controlled round, the state should transition to `timed_out` so the room can continue.

### Manual Override

The user must always be able to:

- stop a round
- pause an agent
- ignore orchestrator suggestions
- talk directly to a specific agent

## Persistence

V1 persists local room state on the user's machine, including:

- room metadata
- participant roster
- message history
- round metadata
- last-known adapter status

Persistence exists to preserve collaboration continuity across app restarts. It should not try to archive full terminal logs in V1.

## Project Baseline Requirements

Before or alongside implementation, the project baseline should include:

- initialization as a `git` repository
- a GitHub-oriented repository layout
- foundational project documentation

This is a project-management requirement rather than a product feature, but it should be planned from the start because the current directory is not yet a git repository.

## Testing Strategy

### Protocol Tests

Verify:

- `broadcast`
- `mention`
- `controlled` round permissions
- reply limits
- timeout transitions
- synthesis requests

### Adapter Contract Tests

Use mock adapters to verify:

- launch lifecycle
- message ingestion
- reply publication
- disconnect behavior
- status transitions

### Room State Tests

Verify:

- timeline correctness
- participant state changes
- round state transitions
- correct emission of system events

### End-to-End Tests

Keep a small number of critical scenario tests:

- launch two agents
- send a room message
- target one agent with `@agent`
- open a controlled round
- receive replies
- request summary

## Implementation Risks

### Output Extraction Drift

Different CodexCLI behaviors may make it difficult to reliably extract only the room-worthy reply. V1 should keep the publishable-output contract explicit and conservative.

### Over-Automation

If orchestration gains too much authority too early, the system becomes harder to predict and control. Keep orchestration optional and bounded.

### UI Noise

If raw operational events or terminal-like details enter the main chat stream unchecked, the room will become unreadable. Keep the main timeline human-legible.

## Success Criteria

V1 is successful if:

- the user can launch multiple local CodexCLI sessions through wrappers
- all launched agents appear in one room
- one user message can reach the intended agents automatically
- the user no longer has to manually relay messages between terminals
- the user can switch between open and controlled collaboration
- a failed agent does not break the room

## Deferred Work

The following are explicitly postponed until after V1 proves value:

- full PTY ownership and embedded terminals
- multi-machine connectivity
- multi-user collaboration
- advanced autonomous debate policies
- rich transcript capture of raw terminal output
- internet-facing deployment
