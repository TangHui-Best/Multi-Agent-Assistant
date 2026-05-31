import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentJob, AgentSeat, InvocationAuditRecord, InvocationRecord, MessageRecord, RoomEvent } from '@multi-agent-assi/shared';
import { createMockAgentWorker } from '../src/mockAgentWorker.js';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
  options: {
    jobs?: Array<{ streamId: string; job: AgentJob }>;
    failOnEventType?: RoomEvent['type'];
    onReadAgentJobs?: () => void;
  } = {},
) {
  const messages: MessageRecord[] = [];
  const events: RoomEvent[] = [];
  const statusUpdates: Array<{ id: string; status: InvocationRecord['status']; error?: string }> = [];
  const audits: InvocationAuditRecord[] = [];
  const acknowledgements: Array<{ consumerGroup: string; streamId: string }> = [];
  const agents: AgentSeat[] = [
    { id: 'architect', displayName: 'Architect', role: 'architect', runtime: { kind: 'mock', profile: 'architect' } },
  ];
  const repositories: PersistenceRepositories = {
    ensureDefaultState: vi.fn(),
    appendMessage: vi.fn((message: MessageRecord) => {
      messages.push(message);
    }),
    listMessages: vi.fn(() => []),
    createInvocation: vi.fn(),
    findMessageByIdempotencyKey: vi.fn(() => null),
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
    updateInvocationStatus: vi.fn((id: string, status: InvocationRecord['status'], error?: string) => {
      statusUpdates.push({ id, status, error });
    }),
    getInvocation: vi.fn(() => null),
    listAgents: vi.fn((): AgentSeat[] => agents),
  };
  const eventBus: EventBus = {
    publishRoomEvent: vi.fn(async (event: RoomEvent) => {
      if (event.type === options.failOnEventType) {
        throw new Error(`publish failed for ${event.type}`);
      }
      events.push(event);
    }),
    enqueueAgentJob: vi.fn(async () => {}),
    readAgentJobs: vi.fn(async () => {
      options.onReadAgentJobs?.();
      return options.jobs ?? [];
    }),
    ackAgentJob: vi.fn(async (consumerGroup: string, streamId: string) => {
      acknowledgements.push({ consumerGroup, streamId });
    }),
    acquireAgentSlotLease: vi.fn(async () => true),
    releaseAgentSlotLease: vi.fn(async () => {}),
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
    worker: createMockAgentWorker({ repositories, eventBus, pollIntervalMs: 60_000 }),
  };
}

test('processes a job through running, delta, message, succeeded, completed, and ack', async () => {
  const job = createJob();
  const { acknowledgements, events, messages, statusUpdates, worker } = createHarness({
    jobs: [{ streamId: 'stream-1', job }],
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'mock-agent-workers', streamId: 'stream-1' }]));
  worker.stop();

  expect(statusUpdates.map((update) => update.status)).toEqual(['running', 'succeeded']);
  expect(events.map((event) => event.type)).toEqual(['invocation.running', 'agent.delta', 'invocation.completed']);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    roomId: job.roomId,
    threadId: job.threadId,
    kind: 'agent_message',
    sender: { type: 'agent', agentId: job.agentId },
    body: '[architect] received: Review this plan',
    invocationId: job.invocationId,
  });
  expect(events[2]).toMatchObject({ type: 'invocation.completed', message: messages[0] });
});

test('pre-success failure marks failed and acks the job', async () => {
  const job = createJob();
  const { acknowledgements, events, statusUpdates, worker } = createHarness({
    jobs: [{ streamId: 'stream-1', job }],
    failOnEventType: 'agent.delta',
  });

  worker.start();
  await vi.waitFor(() => expect(events.map((event) => event.type)).toContain('invocation.failed'));
  worker.stop();

  expect(statusUpdates).toEqual([
    { id: job.invocationId, status: 'running', error: undefined },
    { id: job.invocationId, status: 'failed', error: 'publish failed for agent.delta' },
  ]);
  expect(events).toEqual([
    expect.objectContaining({ type: 'invocation.running' }),
    expect.objectContaining({
      type: 'invocation.failed',
      invocationId: job.invocationId,
      error: 'publish failed for agent.delta',
    }),
  ]);
  expect(acknowledgements).toEqual([{ consumerGroup: 'mock-agent-workers', streamId: 'stream-1' }]);
});

test('completed publish failure after durable success still acks without marking failed', async () => {
  const job = createJob();
  const { acknowledgements, events, messages, statusUpdates, worker } = createHarness({
    jobs: [{ streamId: 'stream-1', job }],
    failOnEventType: 'invocation.completed',
  });

  worker.start();
  await vi.waitFor(() => expect(acknowledgements).toEqual([{ consumerGroup: 'mock-agent-workers', streamId: 'stream-1' }]));
  worker.stop();

  expect(messages).toHaveLength(1);
  expect(statusUpdates).toEqual([
    { id: job.invocationId, status: 'running', error: undefined },
    { id: job.invocationId, status: 'succeeded', error: undefined },
  ]);
  expect(events.map((event) => event.type)).toEqual(['invocation.running', 'agent.delta']);
});

test('stop after read returns prevents beginning job processing or acking', async () => {
  const job = createJob();
  let worker: ReturnType<typeof createMockAgentWorker>;
  const harness = createHarness({
    jobs: [{ streamId: 'stream-1', job }],
    onReadAgentJobs: () => worker.stop(),
  });
  worker = harness.worker;

  worker.start();
  await vi.waitFor(() => expect(harness.eventBus.readAgentJobs).toHaveBeenCalledTimes(1));

  expect(harness.statusUpdates).toEqual([]);
  expect(harness.messages).toEqual([]);
  expect(harness.events).toEqual([]);
  expect(harness.acknowledgements).toEqual([]);
});

test('stop waits for an active read before resolving', async () => {
  let releaseRead: (() => void) | undefined;
  const harness = createHarness({
    onReadAgentJobs: () => undefined,
  });
  vi.mocked(harness.eventBus.readAgentJobs).mockImplementation(
    () =>
      new Promise((resolve) => {
        releaseRead = () => resolve([]);
      }),
  );

  harness.worker.start();
  await vi.waitFor(() => expect(harness.eventBus.readAgentJobs).toHaveBeenCalledTimes(1));

  let stopResolved = false;
  const stopPromise = harness.worker.stop().then(() => {
    stopResolved = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(stopResolved).toBe(false);
  releaseRead?.();
  await stopPromise;
  expect(stopResolved).toBe(true);
});
