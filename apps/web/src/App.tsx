import { useEffect, useMemo, useState } from 'react';
import type {
  AgentSeat,
  InvocationRecord,
  InvocationStatus,
  MessageRecord,
  RoomEvent,
  RoundRecord,
  RoundStepRecord,
  RoundStepStatus,
} from '@multi-agent-assi/shared';
import { fetchBootstrap, submitMessage } from './api.js';
import './styles.css';

const DEFAULT_TARGET = 'architect';

export function mergeRoomEvent(messages: MessageRecord[], event: RoomEvent): MessageRecord[] {
  const nextMessage = event.type === 'message.created' || event.type === 'invocation.completed' ? event.message : null;
  if (!nextMessage || messages.some((message) => message.id === nextMessage.id)) {
    return messages;
  }
  return [...messages, nextMessage].sort((a, b) => a.createdAt - b.createdAt);
}

export interface RoundProjectionState {
  rounds: RoundRecord[];
  roundSteps: RoundStepRecord[];
}

function upsertById<T extends { id: string; createdAt: number }>(items: T[], next: T): T[] {
  const existingIndex = items.findIndex((item) => item.id === next.id);
  if (existingIndex < 0) {
    return [...items, next].sort((a, b) => a.createdAt - b.createdAt);
  }
  return items.map((item, index) => (index === existingIndex ? { ...item, ...next } : item));
}

function upsertInvocation(invocations: InvocationRecord[], next: InvocationRecord): InvocationRecord[] {
  return upsertById(invocations, next);
}

function updateInvocation(
  invocations: InvocationRecord[],
  event: Extract<RoomEvent, { invocationId: string }>,
  statusValue: InvocationStatus,
  error?: string,
): InvocationRecord[] {
  const existing = invocations.find((invocation) => invocation.id === event.invocationId);
  const base: InvocationRecord =
    existing ??
    ({
      id: event.invocationId,
      roomId: event.roomId,
      threadId: event.threadId,
      sourceMessageId: '',
      agentId: 'agentId' in event ? event.agentId : 'unknown',
      status: statusValue,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
    } satisfies InvocationRecord);
  return upsertInvocation(invocations, { ...base, status: statusValue, updatedAt: event.occurredAt, ...(error ? { error } : {}) });
}

export function mergeInvocationEvent(invocations: InvocationRecord[], event: RoomEvent): InvocationRecord[] {
  if (event.type === 'invocation.queued') {
    return upsertInvocation(invocations, event.invocation);
  }
  if (event.type === 'invocation.running') {
    return updateInvocation(invocations, event, 'running');
  }
  if (event.type === 'invocation.completed') {
    return updateInvocation(invocations, event, 'succeeded');
  }
  if (event.type === 'invocation.failed') {
    return updateInvocation(invocations, event, 'failed', event.error);
  }
  if (event.type === 'invocation.canceled') {
    return updateInvocation(invocations, event, 'canceled', event.reason);
  }
  return invocations;
}

export function mergeRoundEvent(state: RoundProjectionState, event: RoomEvent): RoundProjectionState {
  if (event.type !== 'round.created') return state;
  return {
    rounds: upsertById(state.rounds, event.round),
    roundSteps: event.steps.reduce((steps, step) => upsertById(steps, step), state.roundSteps),
  };
}

export function deriveRoundStepStatus(step: RoundStepRecord, invocations: InvocationRecord[]): RoundStepStatus {
  const linkedInvocation = step.invocationId ? invocations.find((invocation) => invocation.id === step.invocationId) : undefined;
  return linkedInvocation?.status ?? step.status;
}

function senderLabel(message: MessageRecord): string {
  if (message.sender.type === 'agent') return message.sender.agentId;
  if (message.sender.type === 'user') return 'you';
  return 'system';
}

function seatStatus(seat: AgentSeat): string {
  return `${seat.role} · ${seat.runtime.kind}`;
}

function latestInvocationForSeat(invocations: InvocationRecord[], agentId: string): InvocationRecord | undefined {
  return invocations
    .filter((invocation) => invocation.agentId === agentId)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0];
}

export default function App() {
  const [agents, setAgents] = useState<AgentSeat[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [invocations, setInvocations] = useState<InvocationRecord[]>([]);
  const [body, setBody] = useState('@architect review the boundary');
  const [targetAgent, setTargetAgent] = useState(DEFAULT_TARGET);
  const [status, setStatus] = useState('Connecting');

  useEffect(() => {
    void fetchBootstrap()
      .then((state) => {
        setAgents(state.agents);
        setMessages(state.messages);
        setInvocations(state.invocations ?? []);
        setStatus('Ready');
      })
      .catch((err: unknown) => setStatus(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socket.addEventListener('open', () => setStatus('Live'));
    socket.addEventListener('message', (event) => {
      const roomEvent = JSON.parse(event.data as string) as RoomEvent;
      setMessages((current) => mergeRoomEvent(current, roomEvent));
      setInvocations((current) => mergeInvocationEvent(current, roomEvent));
    });
    socket.addEventListener('close', () => setStatus('Disconnected'));
    socket.addEventListener('error', () => setStatus('Connection issue'));
    return () => socket.close();
  }, []);

  const visibleMessages = useMemo(() => messages, [messages]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setStatus('Sending');
    await submitMessage({
      roomId: 'default-room',
      threadId: 'default-thread',
      userId: 'local-user',
      source: 'web',
      body: trimmed,
      target: { mode: 'mention', agentIds: [targetAgent] },
      idempotencyKey: `web-${crypto.randomUUID()}`,
    });
    setBody('');
    setStatus('Live');
  }

  return (
    <main className="room-shell">
      <aside className="roster" aria-label="Room members">
        <div>
          <p className="eyebrow">Room</p>
          <h1>Equal-Room Host</h1>
        </div>
        <div className="seat-list">
          {agents.map((agent) => (
            <button
              className={agent.id === targetAgent ? 'seat selected' : 'seat'}
              key={agent.id}
              onClick={() => setTargetAgent(agent.id)}
              type="button"
            >
              <span>{agent.displayName}</span>
              <small>{seatStatus(agent)}</small>
              <span className={`invocation-pill ${latestInvocationForSeat(invocations, agent.id)?.status ?? 'idle'}`}>
                {latestInvocationForSeat(invocations, agent.id)?.status ?? 'idle'}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="thread" aria-label="Thread timeline">
        <header className="thread-header">
          <div>
            <p className="eyebrow">Thread</p>
            <h2>default-thread</h2>
          </div>
          <span className="status">{status}</span>
        </header>

        <div className="timeline">
          {visibleMessages.length === 0 ? (
            <div className="empty-state">Start with a focused task or review request.</div>
          ) : (
            visibleMessages.map((message) => (
              <article className={`message ${message.sender.type}`} key={message.id}>
                <div className="message-meta">
                  <strong>{senderLabel(message)}</strong>
                  <span>{message.kind.replace('_', ' ')}</span>
                </div>
                <p>{message.body}</p>
              </article>
            ))
          )}
        </div>

        <form className="composer" onSubmit={onSubmit}>
          <label htmlFor="message">Task</label>
          <div className="composer-row">
            <textarea id="message" value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
            <button type="submit">Send</button>
          </div>
        </form>
      </section>
    </main>
  );
}
