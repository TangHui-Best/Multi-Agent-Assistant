---
doc_kind: spec
status: active
created: 2026-05-25
feature_refs: []
updates:
  - doc: docs/superpowers/specs/2026-05-24-reference-architecture-adoption-design.md
    section: Migration And Adoption Order
    reason: Expands the Phase 1 architecture mapping step into a public, source-neutral design.
---

# Phase 1 Architecture Mapping Design

## Summary

Phase 1 turns the validated reference-architecture lessons into this project's own module map.

The output is not a migration diary and not a source-to-source inventory. It is a neutral design record that says which capabilities matter, which project module owns them, how they should be adopted, what must be deferred, and how later implementation can be verified without exposing any private reference source.

This phase intentionally stops before broad code migration. The first-principles reason is control: if the project copies runtime shape before naming the target contracts, it risks importing private product assumptions, provider sprawl, or a second state model. A small, explicit mapping keeps the next implementation slice on the final architecture path.

## Source Boundary

Public artifacts may say that a private local reference exists and that it informed engineering choices. Public artifacts must not include:

- private repository names, URLs, paths, branch names, commit hashes, or checkout layout
- source-specific product identity, persona system, visual identity, or module names
- private raw logs, archives, prompts, audit entries, or copied code
- migration notes that require private context to understand

The only public unit of discussion is a capability expressed in this project's language, such as `invocation lifecycle`, `runtime binding`, or `connector interface`.

## Inputs

- `AGENTS.md`
- `docs/superpowers/specs/2026-05-24-reference-architecture-adoption-design.md`
- `docs/superpowers/evidence/2026-05-25-local-reference-runtime-validation.md`
- `docs/superpowers/specs/2026-05-25-public-hygiene-gate.md`
- `docs/superpowers/evidence/2026-05-25-public-hygiene-gate.md`

## Mapping Principles

1. Map capabilities to project-owned module contracts, not to private source files.
2. Keep Room Hub as the only canonical inbound path for user and connector input.
3. Keep SQLite as the durable fact source and Redis as the runtime coordination layer.
4. Keep agent seats independent from runtime bindings so Codex CLI is first, not forever.
5. Keep connectors as low-trust clients, never state owners.
6. Keep governance and Harness as long-term architecture, with only explicit local development bypasses.
7. Reject any adoption path that requires public docs to know private names or private product semantics.

## Capability Map

| Capability | Project Owner | Phase 1 Decision | Why |
| --- | --- | --- | --- |
| Agent roster / catalog | Agent Seat Catalog, Shared Protocol, Persistence | Adopt as `Agent Seat -> Runtime Binding`; seed `architect`, `reviewer`, and `implementer`. | The project needs equal collaborators with independent identity, but should not hard-code them to one runtime forever. |
| Runtime binding abstraction | Agent Runtime, Shared Protocol | Adopt a lean binding model with Codex CLI as the first concrete binding and extension points for later CLI runtimes. | This preserves future Claude Code, OpenCode, and Gemini CLI paths without building a marketplace. |
| CLI subprocess invocation | Agent Runtime, Codex Adapter | Adopt behind a runtime adapter contract; implement after the skeleton path is mapped and tested. | CLI process details belong at the edge, not in Room Hub, UI, or Persistence. |
| Streaming event normalization | Shared Protocol, Event Bus, Host API | Adopt project-native `RoomEvent` and agent stream events. | Web, future connectors, persistence, and reviews need one normalized event language. |
| Invocation lifecycle | Room Hub, Persistence, Event Bus, Agent Runtime | Adopt as a first-order model: `queued`, `running`, `succeeded`, `failed`, `canceled`. | Invocation traceability is the backbone of equal-agent work and failure recovery. |
| Mention routing | Room Hub, Orchestration | Adopt in Room Hub, with orchestration policies layered above it. | Routing is core runtime behavior, not a frontend convention. |
| Invocation queue and per-agent slot control | Event Bus, Agent Runtime | Adopt with Redis-backed queues and explicit per-agent runtime state. | A single slow or failed agent must not block the room or corrupt another agent's context. |
| Session continuity | Persistence, Runtime Adapter | Adopt as durable runtime metadata, not UI state. | Independent agent context only works if session chains are explicit and recoverable. |
| Raw runtime archives and audit logs | Codex Adapter, Persistence, Audit Log | Adopt the need for auditability, but keep private raw artifacts out of public docs. | Debugging CLI behavior needs evidence; public hygiene forbids leaking source-specific runtime traces. |
| WebSocket streaming | Host API, Event Bus, Web Console | Adopt as the return path from Event Bus to local Web Console. | The UI should observe room events, not own the message channel. |
| Connector outbound hook | Connector Interface, Event Bus | Preserve the interface; defer Feishu implementation until local Web flow is stable. | Remote clients are long-term requirements, but Phase 1 should not split the runtime path. |
| Governance / bootstrap guard | Governance / Harness layer | Preserve as architecture; allow only named local development bypasses with recovery notes. | Removing governance would optimize for early demo speed while weakening traceability and safety. |

## Target Module Map

### Web Console

First local client for rooms, threads, members, messages, and invocation status. It can display and submit through Host API, but it must not own routing, durable truth, runtime state, or connector-specific logic.

### Host API

HTTP and WebSocket boundary. It validates client requests, forwards accepted input to Room Hub, exposes bootstrap/read endpoints, and streams normalized room events from Event Bus.

### Shared Protocol

Project-owned schemas and types for rooms, threads, messages, members, runtime bindings, invocations, room events, agent jobs, and connector envelopes. This is where neutral public vocabulary must be enforced.

### Room Hub

Canonical inbound boundary. It persists user messages, resolves targets, creates invocations, enqueues jobs, emits room events, and applies high-risk confirmation rules when needed.

### Persistence

SQLite-backed durable source of truth for rooms, threads, messages, agents, runtime bindings, sessions, invocations, rounds, and audit logs.

### Event Bus

Redis-backed runtime coordination for room event streams, invocation queues, active invocation state, per-agent slot state, heartbeats, idempotency keys, and WebSocket fan-out.

### Agent Runtime

Worker layer that consumes invocation jobs, resolves runtime bindings, manages lifecycle transitions, enforces cancellation/timeout/failure isolation, and dispatches to concrete runtime adapters.

### Codex Adapter

First concrete runtime adapter. It owns Codex CLI spawn/resume, stream parsing, timeout, cancellation, session id capture, error normalization, and runtime-specific diagnostics.

### Orchestration

Policy layer for controlled equal-room workflows, including mention routing behavior, broadcast behavior, reviewer gates, reply budgets, and anti-loop boundaries.

### Connector Interface

Low-trust boundary for Feishu and future remote/mobile clients. Connectors submit inbound messages to Room Hub and receive outbound room events; they never own core state.

## Adoption Order After Mapping

1. Revise the architecture skeleton plan against this mapping before large code creation.
2. Define project-native Shared Protocol contracts for room events, invocations, agent seats, and runtime bindings.
3. Build the mock main path through Room Hub, SQLite, Redis, Agent Runtime, WebSocket, and Web Console.
4. Replace the mock runtime with Codex Adapter only after the invocation lifecycle and event path are test-covered.
5. Add controlled routing and orchestration policies.
6. Add Feishu or other remote connectors only after local Web flow uses the same core runtime path.

## Rejected Paths

- Direct source-to-source migration: rejected because it would make private structure part of public project memory.
- Web-first bypass demo: rejected because it would create a second routing and state channel.
- Memory-only runtime as the project spine: rejected because it violates the Redis/SQLite split.
- Broad provider platform in Phase 1: rejected because it adds complexity before the first Codex-backed room proves the main path.
- Deleting governance/bootstrap behavior: rejected because it removes a long-term safety and traceability layer.

## Verification

Phase 1 Architecture Mapping is accepted when:

- this spec names only neutral capabilities and project-owned module boundaries
- no source-specific private identifier appears in tracked files, file paths, or commit messages
- `python -m unittest tests.test_public_hygiene` passes
- `python scripts/public_hygiene.py --root .` passes locally
- the Harness knowledge check passes for `docs`
- after push, the remote Public Hygiene workflow passes

## Open Follow-Ups

- The existing architecture skeleton plan should be revised or superseded so it follows this mapping and the newer reference-architecture adoption design.
- The first implementation plan should define exact package names, test boundaries, and commit slices for Shared Protocol, Persistence, Event Bus, Room Hub, Agent Runtime, Host API, and Web Console.
- Codex Adapter contract tests should be designed before wiring real Codex CLI process management into the room path.
