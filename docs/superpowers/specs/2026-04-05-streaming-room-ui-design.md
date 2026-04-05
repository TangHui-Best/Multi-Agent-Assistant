# Streaming Room UI Design

## Summary

Add a true conversation-flow layer on top of the current room shell so agent replies can appear as continuous, streaming chat messages instead of static one-shot responses.

The goal is not merely to animate text. The goal is to establish a message-event model that supports:

- thinking state before content arrives
- incremental reply expansion inside one message bubble
- multiple agents streaming in parallel by default
- optional host-controlled sequential speaking
- an internal transport shape that feels like SSE even when Electron IPC is used underneath

## Problem

The current UI shell looks more like a static dashboard than a chat application. Even though there is already a room layout, it does not yet convey live collaborative dialogue because:

- messages are currently hard-coded view-model data
- agent replies are not modeled as progressive events
- there is no distinction between queued, thinking, streaming, completed, and failed states
- the timeline does not yet express multi-agent parallel conversation

This breaks the product goal of replacing manual relay with a believable shared conversation surface.

## Goals

- Make the center panel behave like a real conversation timeline.
- Represent each agent reply as one evolving message bubble rather than repeated fragments.
- Support `thinking` before streamed content begins.
- Support multiple agents streaming simultaneously by default.
- Preserve the ability to switch into host-controlled sequential speaking.
- Define a transport/event model that can later be reused by real Codex adapters and a future web transport.

## Non-Goals

- Full visual redesign of the whole app.
- Pixel-perfect imitation of WeChat or QQ.
- Real CodexCLI streaming integration in this sub-project.
- Network SSE server implementation for V1.

## Core Decision

Use an internal event-stream protocol with SSE-style semantics, but do not force Electron to literally use HTTP SSE.

### Why

- The product need is streaming conversational behavior, not HTTP compliance for its own sake.
- Electron main-to-renderer communication is more direct through IPC.
- A transport-neutral event shape keeps the system reusable for future adapters and possible web delivery.

## Approaches Considered

### A. Fake Typing Animation

Renderer receives a full reply and reveals it slowly.

Rejected because it creates the illusion of streaming without establishing a real streaming state model. It would be mostly throwaway work once real adapters begin producing progressive output.

### B. Polling For Message Progress

Renderer polls the main process for the latest message snapshot.

Rejected because it weakens continuity, adds timing jitter, and complicates parallel multi-agent updates.

### C. Event-Driven Streaming Messages

Recommended.

Main process emits message lifecycle events, renderer reduces them into timeline state, and each active message bubble updates in place.

This directly supports live conversation while keeping transport details replaceable.

## Event Model

The room should expose a small set of streaming events.

### Required Events

- `message.started`
  Creates a streaming message shell for one agent reply.
- `message.delta`
  Appends text to that in-progress message.
- `message.completed`
  Marks the message as finished.
- `message.failed`
  Marks the message as failed.
- `message.status`
  Conveys transient state such as `queued` or `thinking`.

## Event Envelope

Each event should carry enough information for the renderer to reconcile the correct message:

- `eventId`
- `roomId`
- `messageId`
- `senderId`
- `eventType`
- `timestamp`
- payload fields specific to the event

### Payload Examples

- `message.started`
  - `kind`
  - `target`
- `message.delta`
  - `delta`
- `message.status`
  - `status`
- `message.completed`
  - no additional payload required
- `message.failed`
  - `error`

## Timeline State Model

The renderer should stop treating messages as static rows and instead maintain message records with lifecycle state.

### Message States

- `queued`
- `thinking`
- `streaming`
- `completed`
- `failed`

### Renderer Rule

One logical agent reply equals one bubble.

As `message.delta` events arrive, the renderer appends the text to the same bubble rather than creating multiple message rows. This is what creates the "continuous response" feeling.

## Conversation Behavior

### Default Mode

Parallel streaming is allowed.

If two or more agents begin responding, each gets its own in-progress bubble. The timeline should clearly distinguish them by sender identity and preserve arrival order.

### Host-Controlled Mode

The host can force sequential speaking.

This does not require a different message model. It only changes which agent is allowed to emit `message.started` at a given time.

## Main Process Responsibilities

The main process should:

- own the canonical room timeline state
- emit streaming lifecycle events for the renderer
- translate adapter output into event-stream messages
- keep host-control policy separate from renderer presentation

The main process should not emit renderer-specific styling concepts.

## Renderer Responsibilities

The renderer should:

- subscribe to room streaming events
- reduce those events into message timeline state
- render one evolving bubble per reply
- surface thinking, streaming, completed, and failed states clearly
- keep the reading experience focused on the middle timeline

## UI Behavior

### Message Creation

When an agent is selected to reply, the renderer should show a pending bubble quickly, even before text arrives.

### Thinking State

If a `message.status` event with `thinking` arrives before content, show a lightweight thinking indicator inside the bubble.

### Streaming State

When `message.delta` arrives, the bubble transitions from `thinking` to `streaming` and appends text continuously.

### Completion

When `message.completed` arrives, the bubble becomes a normal settled chat message.

### Failure

If `message.failed` arrives, the bubble should remain visible but show a subdued failed state rather than disappearing.

## Data Flow

1. User sends a room message.
2. Room policy decides which agent or agents may respond.
3. An adapter begins generating output.
4. Main process converts adapter output into streaming events.
5. Renderer receives those events through IPC and reduces them into room UI state.
6. Timeline updates the matching bubble in place.

## IPC Shape

Inside Electron, use push-style IPC events rather than polling.

Suggested conceptual channels:

- snapshot request channel for initial room state
- event subscription channel for streaming room updates

The initial snapshot hydrates the UI. Incremental events keep it live.

## Mock Adapter Extension

Before integrating real CodexCLI streams, extend the mock adapter path to simulate:

- delayed thinking state
- multiple deltas
- completed event

This gives the renderer a trustworthy event stream to build against without coupling the UI redesign to real Codex output parsing.

## Testing Strategy

### Reducer Tests

Verify that:

- `message.started` creates one pending bubble
- `message.delta` appends into the same bubble
- `message.completed` settles it
- `message.failed` marks failure cleanly

### Room Event Tests

Verify that host-controlled sequential mode restricts `message.started` ordering without changing event semantics.

### Component Tests

Verify that the timeline renders:

- thinking state
- streamed partial text
- final completed content
- parallel in-progress bubbles

### Integration Tests

Use a mock adapter stream to verify:

- user sends one message
- one or more agents enter thinking
- content streams into bubbles
- completion updates state correctly

## Risks

### Fragmented Message Identity

If message ids are not stable, the renderer will create multiple bubbles instead of one evolving bubble.

### Renderer-Only Streaming

If streaming is faked only in the renderer, future real adapter integration will force a redesign.

### Overloaded Main Process

If room policy, transport, and UI formatting are mixed together, the streaming layer will become difficult to evolve.

## Success Criteria

This sub-project is successful if:

- the room timeline is driven by live state instead of hard-coded message data
- one agent reply appears as one evolving bubble
- a thinking state appears before text when appropriate
- multiple agents can stream in parallel
- host-controlled sequential mode can gate who begins streaming
- the internal event shape remains compatible with future SSE-like external transports
