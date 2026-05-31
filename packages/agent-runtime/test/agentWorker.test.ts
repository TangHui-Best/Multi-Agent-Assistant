import { expect, test, vi } from 'vitest';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentJob, AgentSeat, InvocationAuditRecord, InvocationRecord, MessageRecord, RoomEvent } from '@multi-agent-assi/shared';
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

function createHarness(
  options: { seat?: AgentSeat; adapter?: RuntimeAdapter; jobs?: Array<{ streamId: string; job: AgentJob }>; timeoutMs?: number } = {},
) {
  const messages: MessageRecord[] = [];
  const events: RoomEvent[] = [];
  const statusUpdates: Array<{ id: string; status: InvocationRecord['status']; error?: string }> = [];
  const audits: InvocationAuditRecord[] = [];
  const acknowledgements: Array<{ consumerGroup: string; streamId: string }> = [];
  const runtimeOrder: string[] = [];
  let roomEventHandler: ((event: RoomEvent) => void) | undefined;
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
    createRound: vi.fn(),
    createRoundSteps: vi.fn(),
    listRoundsByThread: vi.fn(() => []),
    listRoundSteps: vi.fn(() => []),
    updateRoundStatus: vi.fn(),
    updateRoundStepStatus: vi.fn(),
    updateInvocationRecoveryMetadata: vi.fn(),
    appendInvocationAudit: vi.fn((entry: InvocationAuditRecord) => {
      audits.push(entry);
    }),
    listInvocationAudit: vi.fn((invocationId: string) => audits.filter((entry) => entry.invocationId === invocationId)),
    tryStartInvocation: vi.fn(() => true),
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
      runtimeOrder.push(`ack:${streamId}`);
      acknowledgements.push({ consumerGroup, streamId });
    }),
    acquireAgentSlotLease: vi.fn(async () => true),
    releaseAgentSlotLease: vi.fn(async (agentId: string) => {
      runtimeOrder.push(`release:${agentId}`);
    }),
    subscribeRoomEvents: vi.fn(async (handler) => {
      roomEventHandler = handler;
      return async () => {
        roomEventHandler = undefined;
      };
    }),
    close: vi.fn(async () => {}),
  };

  return {
    acknowledgements,
    eventBus,
    events,
    messages,
    repositories,
    runtimeOrder,
    statusUpdates,
    audits,
    publishRoomEventToWorker(event: RoomEvent) {
      roomEventHandler?.(event);
    },
    worker: createAgentWorker({
      repositories,
      eventBus,
      adapters: options.adapter ? [options.adapter] : [],
      consumerGroup: 'runtime-workers',
      pollIntervalMs: 60_000,
      timeoutMs: options.timeoutMs,
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
  const { acknowledgements, events, messages, repositories, statusUpdates, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(adapter.run).toHaveBeenCalledWith(expect.objectContaining({ job, seat: expect.objectContaining({ id: 'architect' }) }));
  expect(repositories.tryStartInvocation).toHaveBeenCalledWith(job.invocationId);
  expect(statusUpdates.map((update) => update.status)).toEqual(['succeeded']);
  expect(events.map((event) => event.type)).toEqual(['invocation.running', 'agent.delta', 'invocation.completed']);
  expect(events[1]).toMatchObject({ type: 'agent.delta', delta: 'codex delta' });
  expect(messages[0]).toMatchObject({
    kind: 'agent_message',
    sender: { type: 'agent', agentId: 'architect' },
    body: 'codex final answer',
    invocationId: job.invocationId,
  });
});

test('persists runtime recovery metadata and lifecycle audit entries after adapter success', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async () => ({
      body: 'codex final answer',
      runtimeSessionId: 'codex-session-1',
      resumeMetadata: { runtime: 'codex-cli', sessionId: 'codex-session-1' },
    })),
  };
  const { acknowledgements, audits, repositories, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(repositories.updateInvocationRecoveryMetadata).toHaveBeenCalledWith(job.invocationId, {
    runtimeSessionId: 'codex-session-1',
    resumeMetadata: { runtime: 'codex-cli', sessionId: 'codex-session-1' },
  });
  expect(audits.map((audit) => audit.eventType)).toEqual([
    'invocation.running',
    'runtime.session_captured',
    'invocation.succeeded',
  ]);
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

test('does not run or ack an active invocation when the agent slot lease is unavailable', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async () => ({ body: 'should not run' })),
  };
  const { acknowledgements, eventBus, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });
  vi.mocked(eventBus.acquireAgentSlotLease).mockResolvedValue(false);

  worker.start();
  await vi.waitFor(() =>
    expect(eventBus.acquireAgentSlotLease).toHaveBeenCalledWith('architect', expect.any(String), expect.any(Number)),
  );
  await worker.stop();

  expect(adapter.run).not.toHaveBeenCalled();
  expect(acknowledgements).toEqual([]);
  expect(eventBus.releaseAgentSlotLease).not.toHaveBeenCalled();
});

test('acks an already canceled queued job without requiring an agent slot lease', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async () => ({ body: 'should not run' })),
  };
  const { acknowledgements, eventBus, repositories, worker } = createHarness({
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

  expect(eventBus.acquireAgentSlotLease).not.toHaveBeenCalled();
  expect(adapter.run).not.toHaveBeenCalled();
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

test('aborts a running adapter when a matching invocation cancellation event arrives', async () => {
  const job = createJob();
  let receivedSignal: AbortSignal | undefined;
  let resolveStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          receivedSignal = signal;
          resolveStarted?.();
          signal.addEventListener('abort', () => reject(new Error('adapter canceled')));
        }),
    ),
  };
  const { acknowledgements, publishRoomEventToWorker, repositories, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await started;
  vi.mocked(repositories.getInvocation).mockReturnValue({
    id: job.invocationId,
    roomId: job.roomId,
    threadId: job.threadId,
    sourceMessageId: job.sourceMessageId,
    agentId: job.agentId,
    status: 'canceled',
    createdAt: 1,
    updatedAt: 2,
  });
  publishRoomEventToWorker({
    type: 'invocation.canceled',
    roomId: job.roomId,
    threadId: job.threadId,
    invocationId: job.invocationId,
    agentId: job.agentId,
    reason: 'user requested stop',
    occurredAt: 2,
  });
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(receivedSignal?.aborted).toBe(true);
  expect(repositories.tryStartInvocation).toHaveBeenCalledWith(job.invocationId);
  expect(repositories.updateInvocationStatus).not.toHaveBeenCalledWith(job.invocationId, 'failed', expect.anything());
});

test('does not overwrite a canceled invocation when an adapter ignores abort and resolves late', async () => {
  const job = createJob();
  let resolveStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async () => {
      resolveStarted?.();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { body: 'late success' };
    }),
  };
  const { acknowledgements, messages, publishRoomEventToWorker, repositories, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await started;
  vi.mocked(repositories.getInvocation).mockReturnValue({
    id: job.invocationId,
    roomId: job.roomId,
    threadId: job.threadId,
    sourceMessageId: job.sourceMessageId,
    agentId: job.agentId,
    status: 'canceled',
    createdAt: 1,
    updatedAt: 2,
  });
  publishRoomEventToWorker({
    type: 'invocation.canceled',
    roomId: job.roomId,
    threadId: job.threadId,
    invocationId: job.invocationId,
    agentId: job.agentId,
    occurredAt: 2,
  });
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(messages).toEqual([]);
  expect(repositories.updateInvocationStatus).not.toHaveBeenCalledWith(job.invocationId, 'succeeded');
});

test('times out a runtime adapter through the shared worker contract', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(() => new Promise(() => {})),
  };
  const { acknowledgements, events, statusUpdates, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
    timeoutMs: 10,
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(statusUpdates).toEqual([
    { id: job.invocationId, status: 'failed', error: 'Invocation timed out after 10ms' },
  ]);
  expect(events).toContainEqual(expect.objectContaining({ type: 'invocation.failed', error: 'Invocation timed out after 10ms' }));
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

test('releases an acquired agent slot lease after adapter success', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async () => ({ body: 'final' })),
  };
  const { acknowledgements, eventBus, runtimeOrder, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(eventBus.acquireAgentSlotLease).toHaveBeenCalledWith('architect', expect.any(String), expect.any(Number));
  expect(eventBus.releaseAgentSlotLease).toHaveBeenCalledWith(
    'architect',
    vi.mocked(eventBus.acquireAgentSlotLease).mock.calls[0]?.[1],
  );
  expect(runtimeOrder).toEqual(['ack:stream-1', 'release:architect']);
});

test('releases an acquired agent slot lease after adapter failure', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async () => {
      throw new Error('adapter failed');
    }),
  };
  const { acknowledgements, eventBus, runtimeOrder, statusUpdates, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(statusUpdates).toContainEqual({ id: job.invocationId, status: 'failed', error: 'adapter failed' });
  expect(eventBus.releaseAgentSlotLease).toHaveBeenCalledWith(
    'architect',
    vi.mocked(eventBus.acquireAgentSlotLease).mock.calls[0]?.[1],
  );
  expect(runtimeOrder).toEqual(['ack:stream-1', 'release:architect']);
});

test('acks a terminal invocation without acquiring a slot lease or rerunning the adapter', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async () => ({ body: 'should not run' })),
  };
  const { acknowledgements, eventBus, repositories, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });
  vi.mocked(repositories.getInvocation).mockReturnValue({
    id: job.invocationId,
    roomId: job.roomId,
    threadId: job.threadId,
    sourceMessageId: job.sourceMessageId,
    agentId: job.agentId,
    status: 'succeeded',
    createdAt: 1,
    updatedAt: 2,
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(eventBus.acquireAgentSlotLease).not.toHaveBeenCalled();
  expect(adapter.run).not.toHaveBeenCalled();
});

test('acks without running when queued to running transition is rejected by persistence', async () => {
  const job = createJob();
  const adapter: RuntimeAdapter = {
    kind: 'codex-cli',
    run: vi.fn(async () => ({ body: 'should not run' })),
  };
  const { acknowledgements, repositories, statusUpdates, worker } = createHarness({
    adapter,
    jobs: [{ streamId: 'stream-1', job }],
  });
  vi.mocked(repositories.tryStartInvocation).mockReturnValue(false);
  vi.mocked(repositories.getInvocation).mockReturnValue({
    id: job.invocationId,
    roomId: job.roomId,
    threadId: job.threadId,
    sourceMessageId: job.sourceMessageId,
    agentId: job.agentId,
    status: 'canceled',
    createdAt: 1,
    updatedAt: 2,
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'runtime-workers', streamId: 'stream-1' }]));
  await worker.stop();

  expect(adapter.run).not.toHaveBeenCalled();
  expect(statusUpdates).toEqual([]);
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
      { id: 'invocation-1', status: 'failed', error: 'architect failed' },
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
