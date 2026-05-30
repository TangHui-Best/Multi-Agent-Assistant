import { expect, test, vi } from 'vitest';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentJob, AgentSeat, InvocationRecord, MessageRecord, RoomEvent } from '@multi-agent-assi/shared';
import { createAgentWorker, type RuntimeAdapter } from '../src/agentWorker.js';

function createJob(overrides: Partial<AgentJob> = {}): AgentJob {
  return {
    invocationId: 'invocation-1',
    roomId: 'room-1',
    threadId: 'thread-1',
    sourceMessageId: 'message-1',
    agentId: 'architect',
    prompt: 'Review this plan',
    ...overrides,
  };
}

function createHarness(options: { seat?: AgentSeat; adapter?: RuntimeAdapter; jobs?: Array<{ streamId: string; job: AgentJob }> } = {}) {
  const messages: MessageRecord[] = [];
  const events: RoomEvent[] = [];
  const statusUpdates: Array<{ id: string; status: InvocationRecord['status']; error?: string }> = [];
  const acknowledgements: Array<{ consumerGroup: string; streamId: string }> = [];
  const seat =
    options.seat ??
    ({
      id: 'architect',
      displayName: 'Architect',
      role: 'architect',
      runtime: { kind: 'codex-cli', profile: 'architect' },
    } satisfies AgentSeat);
  const repositories: PersistenceRepositories = {
    ensureDefaultState: vi.fn(),
    appendMessage: vi.fn((message: MessageRecord) => {
      messages.push(message);
    }),
    findMessageByIdempotencyKey: vi.fn(() => null),
    listMessages: vi.fn(() => []),
    createInvocation: vi.fn(),
    listInvocationsBySourceMessage: vi.fn(() => []),
    updateInvocationStatus: vi.fn((id: string, status: InvocationRecord['status'], error?: string) => {
      statusUpdates.push({ id, status, error });
    }),
    getInvocation: vi.fn(() => null),
    listAgents: vi.fn(() => [seat]),
  };
  const eventBus: EventBus = {
    publishRoomEvent: vi.fn(async (event: RoomEvent) => {
      events.push(event);
    }),
    enqueueAgentJob: vi.fn(async () => {}),
    readAgentJobs: vi.fn(async () => options.jobs ?? []),
    ackAgentJob: vi.fn(async (consumerGroup: string, streamId: string) => {
      acknowledgements.push({ consumerGroup, streamId });
    }),
    subscribeRoomEvents: vi.fn(async () => async () => {}),
    close: vi.fn(async () => {}),
  };

  return {
    acknowledgements,
    eventBus,
    events,
    messages,
    repositories,
    statusUpdates,
    worker: createAgentWorker({
      repositories,
      eventBus,
      adapters: options.adapter ? [options.adapter] : [],
      consumerGroup: 'runtime-workers',
      pollIntervalMs: 60_000,
    }),
  };
}

test('dispatches a job to the adapter that matches the agent runtime binding', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async ({ emitDelta }) => {
      await emitDelta('codex delta');
      return { body: 'codex final answer' };
    }),
  };
  const { acknowledgements, events, messages, statusUpdates, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(adapter.run).toHaveBeenCalledWith(expect.objectContaining({ job, seat: expect.objectContaining({ id: 'architect' }) }));
  expect(statusUpdates.map((update) => update.status)).toEqual(['running', 'succeeded']);
  expect(events.map((event) => event.type)).toEqual(['invocation.running', 'agent.delta', 'invocation.completed']);
  expect(events[1]).toMatchObject({ type: 'agent.delta', delta: 'codex delta' });
  expect(messages[0]).toMatchObject({
    kind: 'agent_message',
    sender: { type: 'agent', agentId: 'architect' },
    body: 'codex final answer',
    invocationId: job.invocationId,
  });
});

test('fails and acks only the current invocation when no adapter exists for the seat runtime', async () => {
  const job = createJob();
  const { acknowledgements, events, messages, statusUpdates, worker } = createHarness({
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(messages).toEqual([]);
  expect(statusUpdates).toEqual([{ id: job.invocationId, status: 'failed', error: 'No runtime adapter registered for codex-cli' }]);
  expect(events).toEqual([
    expect.objectContaining({
      type: 'invocation.failed',
      invocationId: job.invocationId,
      agentId: job.agentId,
      error: 'No runtime adapter registered for codex-cli',
    }),
  ]);
});
