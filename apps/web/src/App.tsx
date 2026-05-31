import { useEffect, useMemo, useState } from 'react';
import type {
  AgentSeat,
  InvocationAuditRecord,
  InvocationRecord,
  InvocationStatus,
  MessageRecord,
  RoomEvent,
  RoundRecord,
  RoundStepRecord,
  RoundStepStatus,
} from '@multi-agent-assi/shared';
import { fetchBootstrap, fetchInvocationAudit, submitMessage, type BootstrapState } from './api.js';
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

export interface RoomProjectionState {
  messages: MessageRecord[];
  invocations: InvocationRecord[];
  roundProjection: RoundProjectionState;
}

function upsertById<T extends { id: string; createdAt: number }>(items: T[], next: T): T[] {
  const existingIndex = items.findIndex((item) => item.id === next.id);
  if (existingIndex < 0) {
    return [...items, next].sort((a, b) => a.createdAt - b.createdAt);
  }
  return items.map((item, index) => (index === existingIndex ? { ...item, ...next } : item));
}

function recordTimestamp(record: { createdAt: number; updatedAt?: number }): number {
  return record.updatedAt ?? record.createdAt;
}

function upsertNewestById<T extends { id: string; createdAt: number; updatedAt?: number }>(items: T[], next: T): T[] {
  const existing = items.find((item) => item.id === next.id);
  const newer = existing && recordTimestamp(existing) > recordTimestamp(next) ? existing : next;
  return upsertById(items, newer);
}

function mergeInvocationProjection(existing: InvocationRecord | undefined, next: InvocationRecord): InvocationRecord {
  if (!existing) return next;
  const newer = recordTimestamp(existing) > recordTimestamp(next) ? existing : next;
  const older = newer === existing ? next : existing;
  return {
    ...older,
    ...newer,
    sourceMessageId: newer.sourceMessageId || older.sourceMessageId,
    ...(newer.roundId ?? older.roundId ? { roundId: newer.roundId ?? older.roundId } : {}),
    ...(newer.roundStepId ?? older.roundStepId ? { roundStepId: newer.roundStepId ?? older.roundStepId } : {}),
    ...(newer.runtimeSessionId ?? older.runtimeSessionId ? { runtimeSessionId: newer.runtimeSessionId ?? older.runtimeSessionId } : {}),
    ...(newer.resumeMetadata ?? older.resumeMetadata ? { resumeMetadata: newer.resumeMetadata ?? older.resumeMetadata } : {}),
  };
}

function upsertInvocationProjection(invocations: InvocationRecord[], next: InvocationRecord): InvocationRecord[] {
  const existing = invocations.find((invocation) => invocation.id === next.id);
  return upsertById(invocations, mergeInvocationProjection(existing, next));
}

export function mergeBootstrapState(current: RoomProjectionState, bootstrap: BootstrapState): RoomProjectionState {
  return {
    messages: bootstrap.messages.reduce((messages, message) => upsertNewestById(messages, message), current.messages),
    invocations: bootstrap.invocations.reduce((invocations, invocation) => upsertInvocationProjection(invocations, invocation), current.invocations),
    roundProjection: {
      rounds: bootstrap.rounds.reduce((rounds, round) => upsertNewestById(rounds, round), current.roundProjection.rounds),
      roundSteps: bootstrap.roundSteps.reduce((steps, step) => upsertNewestById(steps, step), current.roundProjection.roundSteps),
    },
  };
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

export function findRoundStepInvocation(step: RoundStepRecord, invocations: InvocationRecord[]): InvocationRecord | undefined {
  return (
    (step.invocationId ? invocations.find((invocation) => invocation.id === step.invocationId) : undefined) ??
    invocations.find((invocation) => invocation.roundStepId === step.id)
  );
}

export function deriveRoundStepStatus(step: RoundStepRecord, invocations: InvocationRecord[]): RoundStepStatus {
  const linkedInvocation = findRoundStepInvocation(step, invocations);
  return linkedInvocation?.status ?? step.status;
}

export function formatRecoveryMetadata(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return 'No resume metadata captured';
  return JSON.stringify(metadata, null, 2);
}

export function createAuditLoadingState(): { auditEntries: InvocationAuditRecord[]; auditStatus: string } {
  return { auditEntries: [], auditStatus: 'Loading audit' };
}

export function auditRefreshKey(invocation: InvocationRecord | undefined): string {
  return invocation ? `${invocation.id}:${invocation.updatedAt}` : '';
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
  const [roundProjection, setRoundProjection] = useState<RoundProjectionState>({ rounds: [], roundSteps: [] });
  const [selectedInvocationId, setSelectedInvocationId] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<InvocationAuditRecord[]>([]);
  const [auditStatus, setAuditStatus] = useState('Select an invocation');
  const [body, setBody] = useState('@architect review the boundary');
  const [targetAgent, setTargetAgent] = useState(DEFAULT_TARGET);
  const [status, setStatus] = useState('Connecting');

  useEffect(() => {
    void fetchBootstrap()
      .then((state) => {
        const emptyRoundProjection = { rounds: [], roundSteps: [] };
        setAgents(state.agents);
        setMessages((current) => mergeBootstrapState({ messages: current, invocations: [], roundProjection: emptyRoundProjection }, state).messages);
        setInvocations((current) => mergeBootstrapState({ messages: [], invocations: current, roundProjection: emptyRoundProjection }, state).invocations);
        setRoundProjection((current) => mergeBootstrapState({ messages: [], invocations: [], roundProjection: current }, state).roundProjection);
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
      setRoundProjection((current) => mergeRoundEvent(current, roomEvent));
    });
    socket.addEventListener('close', () => setStatus('Disconnected'));
    socket.addEventListener('error', () => setStatus('Connection issue'));
    return () => socket.close();
  }, []);

  const visibleMessages = useMemo(() => messages, [messages]);
  const selectedInvocation = selectedInvocationId ? invocations.find((invocation) => invocation.id === selectedInvocationId) : undefined;
  const selectedAuditRefreshKey = auditRefreshKey(selectedInvocation);

  useEffect(() => {
    if (!selectedInvocationId) {
      setAuditEntries([]);
      setAuditStatus('Select an invocation');
      return;
    }

    let canceled = false;
    const loadingState = createAuditLoadingState();
    setAuditEntries(loadingState.auditEntries);
    setAuditStatus(loadingState.auditStatus);
    void fetchInvocationAudit(selectedInvocationId)
      .then((entries) => {
        if (canceled) return;
        setAuditEntries(entries);
        setAuditStatus(entries.length === 0 ? 'No audit entries yet' : 'Audit loaded');
      })
      .catch((err: unknown) => {
        if (canceled) return;
        setAuditEntries([]);
        setAuditStatus(err instanceof Error ? err.message : String(err));
      });

    return () => {
      canceled = true;
    };
  }, [selectedInvocationId, selectedAuditRefreshKey]);

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
              aria-pressed={agent.id === targetAgent}
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

        <div className="workbench">
          <div className="main-column">
            <section className="round-panel" aria-label="Round progress">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Rounds</p>
                  <h3>design review</h3>
                </div>
              </div>
              {roundProjection.rounds.length === 0 ? (
                <p className="subtle">No controlled rounds yet.</p>
              ) : (
                roundProjection.rounds.map((round) => (
                  <article className="round-card" key={round.id}>
                    <div className="round-title">
                      <strong>{round.workflow.replaceAll('_', ' ')}</strong>
                      <span className={`invocation-pill ${round.status}`}>{round.status}</span>
                    </div>
                    <div className="step-list">
                      {roundProjection.roundSteps
                        .filter((step) => step.roundId === round.id)
                        .sort((a, b) => a.stepIndex - b.stepIndex)
                        .map((step) => {
                          const linkedInvocation = findRoundStepInvocation(step, invocations);
                          const visibleStatus = deriveRoundStepStatus(step, invocations);
                          return (
                            <button
                              aria-pressed={selectedInvocationId === linkedInvocation?.id}
                              className={selectedInvocationId === linkedInvocation?.id ? 'round-step selected' : 'round-step'}
                              disabled={!linkedInvocation}
                              key={step.id}
                              onClick={() => setSelectedInvocationId(linkedInvocation?.id ?? null)}
                              type="button"
                            >
                              <span>
                                {step.stepIndex + 1}. {step.agentId}
                              </span>
                              <small>{linkedInvocation?.id ?? 'waiting'}</small>
                              <span className={`invocation-pill ${visibleStatus}`}>{visibleStatus}</span>
                            </button>
                          );
                        })}
                    </div>
                  </article>
                ))
              )}
            </section>

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
          </div>

          <aside className="recovery-panel" aria-label="Recovery detail">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Recovery</p>
                <h3>{selectedInvocation?.agentId ?? 'No invocation selected'}</h3>
              </div>
            </div>
            {selectedInvocation ? (
              <div className="recovery-detail">
                <dl>
                  <dt>Invocation</dt>
                  <dd>{selectedInvocation.id}</dd>
                  <dt>Status</dt>
                  <dd>{selectedInvocation.status}</dd>
                  <dt>Source message</dt>
                  <dd>{selectedInvocation.sourceMessageId}</dd>
                  <dt>Runtime session</dt>
                  <dd>{selectedInvocation.runtimeSessionId ?? 'No session captured'}</dd>
                </dl>
                <pre>{formatRecoveryMetadata(selectedInvocation.resumeMetadata)}</pre>
                <div className="audit-list">
                  <strong>{auditStatus}</strong>
                  {auditEntries.map((entry) => (
                    <article className="audit-entry" key={entry.id}>
                      <span>{entry.eventType}</span>
                      <small>{entry.reason ?? entry.invocationId}</small>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <p className="subtle">Select a round step to inspect recovery facts.</p>
            )}
          </aside>
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
