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
    listInvocationsByThread: vi.fn(() => []),
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

test('acks a queued job without running the adapter when the invocation is already canceled', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async () => ({ body: 'should not run' })),
  };
  const { acknowledgements, repositories, statusUpdates, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });
  vi.mocked(repositories.getInvocation).mockReturnValue({
    id: job.invocationId,
    roomId: job.roomId,
    threadId: job.threadId,
    sourceMessageId: job.sourceMessageId,
    agentId: job.agentId,
    status: 'canceled',
    error: 'user requested stop',
    createdAt: 1,
    updatedAt: 2,
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(adapter.run).not.toHaveBeenCalled();
  expect(statusUpdates).toEqual([]);
});

test('passes an abort signal to the runtime adapter', async () => {
  const job = createJob();
  let receivedSignal: AbortSignal | undefined;
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async ({ signal }) => {
      receivedSignal = signal;
      return { body: 'final' };
    }),
  };
  const { acknowledgements, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(receivedSignal).toBeInstanceOf(AbortSignal);
  expect(receivedSignal?.aborted).toBe(false);
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

test('serializes jobs for the same agent seat', async () => {
  const jobs = [
    { streamId: 'stream-1', job: createJob({ invocationId: 'invocation-1', agentId: 'architect' }) },
    { streamId: 'stream-2', job: createJob({ invocationId: 'invocation-2', agentId: 'architect' }) },
  ];
  let activeForSeat = 0;
  let maxActiveForSeat = 0;
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    async run({ job }) {
      activeForSeat += 1;
      maxActiveForSeat = Math.max(maxActiveForSeat, activeForSeat);
      await new Promise((resolve) => setTimeout(resolve, 5));
      activeForSeat -= 1;
      return { body: `final ${job.invocationId}` };
    },
  };
  const { acknowledgements, worker } = createHarness({ adapter, jobs });

  worker.start();
  await vi.waitFor(() =>
    expect(acknowledgements.map((ack) => ack.streamId)).toEqual(['stream-1', 'stream-2']),
  );
  await worker.stop();

  expect(maxActiveForSeat).toBe(1);
});

test('runs jobs for different agent seats concurrently', async () => {
  const jobs = [
    { streamId: 'stream-1', job: createJob({ invocationId: 'invocation-1', agentId: 'architect' }) },
    { streamId: 'stream-2', job: createJob({ invocationId: 'invocation-2', agentId: 'reviewer' }) },
  ];
  const seats: AgentSeat[] = [
    { id: 'architect', displayName: 'Architect', role: 'architect', runtime: { kind: 'codex-cli', profile: 'architect' } },
    { id: 'reviewer', displayName: 'Reviewer', role: 'reviewer', runtime: { kind: 'codex-cli', profile: 'reviewer' } },
  ];
  let active = 0;
  let maxActive = 0;
  let release: (() => void) | undefined;
  const bothStarted = new Promise<void>((resolve) => {
    release = resolve;
  });
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    async run({ job }) {
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (active === 2) {
        release?.();
      }
      await bothStarted;
      active -= 1;
      return { body: `final ${job.invocationId}` };
    },
  };
  const { acknowledgements, repositories, worker } = createHarness({ adapter, jobs });
  vi.mocked(repositories.listAgents).mockReturnValue(seats);

  worker.start();
  await vi.waitFor(() =>
    expect(acknowledgements.map((ack) => ack.streamId).sort()).toEqual(['stream-1', 'stream-2']),
  );
  await worker.stop();

  expect(maxActive).toBe(2);
});

test('isolates one agent failure while another agent in the same batch succeeds', async () => {
  const jobs = [
    { streamId: 'stream-1', job: createJob({ invocationId: 'invocation-1', agentId: 'architect' }) },
    { streamId: 'stream-2', job: createJob({ invocationId: 'invocation-2', agentId: 'reviewer' }) },
  ];
  const seats: AgentSeat[] = [
    { id: 'architect', displayName: 'Architect', role: 'architect', runtime: { kind: 'codex-cli', profile: 'architect' } },
    { id: 'reviewer', displayName: 'Reviewer', role: 'reviewer', runtime: { kind: 'codex-cli', profile: 'reviewer' } },
  ];
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    async run({ job }) {
      if (job.agentId === 'architect') {
        throw new Error('architect failed');
      }
      return { body: 'reviewer final' };
    },
  };
  const { acknowledgements, events, messages, repositories, statusUpdates, worker } = createHarness({ adapter, jobs });
  vi.mocked(repositories.listAgents).mockReturnValue(seats);

  worker.start();
  await vi.waitFor(() =>
    expect(acknowledgements.map((ack) => ack.streamId).sort()).toEqual(['stream-1', 'stream-2']),
  );
  await worker.stop();

  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({ sender: { type: 'agent', agentId: 'reviewer' }, body: 'reviewer final' });
  expect(statusUpdates).toEqual(
    expect.arrayContaining([
      { id: 'invocation-1', status: 'running', error: undefined },
      { id: 'invocation-1', status: 'failed', error: 'architect failed' },
      { id: 'invocation-2', status: 'running', error: undefined },
      { id: 'invocation-2', status: 'succeeded', error: undefined },
    ]),
  );
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'invocation.failed', invocationId: 'invocation-1', error: 'architect failed' }),
      expect.objectContaining({ type: 'invocation.completed', invocationId: 'invocation-2' }),
    ]),
  );
});
