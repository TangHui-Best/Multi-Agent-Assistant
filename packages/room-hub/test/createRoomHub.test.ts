import { beforeEach, expect, test, vi } from 'vitest';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentJob, AgentSeat, InvocationRecord, MessageRecord, RoomEvent, SubmitMessageInput } from '@multi-agent-assi/shared';
import { createRoomHub } from '../src/createRoomHub.js';

function createInput(target: SubmitMessageInput['target']): SubmitMessageInput {
  return {
    roomId: 'room-1',
    threadId: 'thread-1',
    userId: 'user-1',
    source: 'web',
    body: 'Review the plan',
    target,
    idempotencyKey: 'idempotency-key-1',
  };
}

function createAgent(id: string): AgentSeat {
  return {
    id,
    displayName: id,
    role: id === 'architect' || id === 'reviewer' || id === 'implementer' ? id : 'custom',
    runtime: { kind: 'mock', profile: id },
  };
}

function createHarness(agentIds = ['architect', 'reviewer', 'implementer']) {
  const messages: MessageRecord[] = [];
  const invocations: InvocationRecord[] = [];
  const jobs: AgentJob[] = [];
  const events: RoomEvent[] = [];
  const statusUpdates: Array<{ id: string; status: InvocationRecord['status']; error?: string }> = [];
  const repositories: PersistenceRepositories = {
    ensureDefaultState: vi.fn(),
    appendMessage: vi.fn((message: MessageRecord) => {
      messages.push(message);
    }),
    listMessages: vi.fn((threadId: string) => messages.filter((message) => message.threadId === threadId)),
    createInvocation: vi.fn((invocation: InvocationRecord) => {
      invocations.push(invocation);
    }),
    updateInvocationStatus: vi.fn((id: string, status: InvocationRecord['status'], error?: string) => {
      statusUpdates.push({ id, status, error });
    }),
    getInvocation: vi.fn((id: string) => invocations.find((invocation) => invocation.id === id) ?? null),
    listAgents: vi.fn(() => agentIds.map(createAgent)),
  };
  const eventBus: EventBus = {
    publishRoomEvent: vi.fn(async (event: RoomEvent) => {
      events.push(event);
    }),
    enqueueAgentJob: vi.fn(async (job: AgentJob) => {
      jobs.push(job);
    }),
    readAgentJobs: vi.fn(async () => []),
    ackAgentJob: vi.fn(async () => {}),
    subscribeRoomEvents: vi.fn(async () => async () => {}),
    close: vi.fn(async () => {}),
  };

  return {
    eventBus,
    jobs,
    messages,
    invocations,
    repositories,
    events,
    statusUpdates,
    roomHub: createRoomHub({ repositories, eventBus }),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

test('unknown mentioned agent rejects before durable writes or Redis side effects', async () => {
  const { eventBus, repositories, roomHub } = createHarness(['architect']);

  await expect(roomHub.submitMessage(createInput({ mode: 'mention', agentIds: ['unknown-agent'] }))).rejects.toThrow(
    'Unknown target agent: unknown-agent',
  );

  expect(repositories.appendMessage).not.toHaveBeenCalled();
  expect(repositories.createInvocation).not.toHaveBeenCalled();
  expect(eventBus.publishRoomEvent).not.toHaveBeenCalled();
  expect(eventBus.enqueueAgentJob).not.toHaveBeenCalled();
});

test('duplicate mention ids are deduped while preserving target order', async () => {
  const { jobs, roomHub } = createHarness(['architect', 'reviewer']);

  const result = await roomHub.submitMessage(createInput({ mode: 'mention', agentIds: ['reviewer', 'architect', 'reviewer'] }));

  expect(result.invocations.map((invocation) => invocation.agentId)).toEqual(['reviewer', 'architect']);
  expect(jobs.map((job) => job.agentId)).toEqual(['reviewer', 'architect']);
});

test('enqueue failure marks invocation failed before rethrowing', async () => {
  const { eventBus, invocations, repositories, roomHub, statusUpdates } = createHarness(['architect']);
  vi.mocked(eventBus.enqueueAgentJob).mockRejectedValueOnce(new Error('redis down'));

  await expect(roomHub.submitMessage(createInput({ mode: 'mention', agentIds: ['architect'] }))).rejects.toThrow('redis down');

  expect(repositories.updateInvocationStatus).toHaveBeenCalledWith(invocations[0]?.id, 'failed', 'redis down');
  expect(statusUpdates).toEqual([{ id: invocations[0]?.id, status: 'failed', error: 'redis down' }]);
});

test('multi-target enqueue failure marks the failed and later not-yet-enqueued invocations failed', async () => {
  const { eventBus, invocations, jobs, roomHub, statusUpdates } = createHarness(['architect', 'reviewer', 'implementer']);
  vi.mocked(eventBus.enqueueAgentJob)
    .mockImplementationOnce(async (job: AgentJob) => {
      jobs.push(job);
    })
    .mockRejectedValueOnce(new Error('redis down'));

  await expect(roomHub.submitMessage(createInput({ mode: 'broadcast' }))).rejects.toThrow('redis down');

  expect(jobs.map((job) => job.agentId)).toEqual(['architect']);
  expect(statusUpdates).toEqual([
    { id: invocations[1]?.id, status: 'failed', error: 'redis down' },
    { id: invocations[2]?.id, status: 'failed', error: 'redis down' },
  ]);
});

test('message.created publish failure marks all invocations failed and enqueues no jobs', async () => {
  const { eventBus, invocations, jobs, roomHub, statusUpdates } = createHarness(['architect', 'reviewer', 'implementer']);
  vi.mocked(eventBus.publishRoomEvent).mockRejectedValueOnce(new Error('publish failed'));

  await expect(roomHub.submitMessage(createInput({ mode: 'broadcast' }))).rejects.toThrow('publish failed');

  expect(jobs).toEqual([]);
  expect(eventBus.enqueueAgentJob).not.toHaveBeenCalled();
  expect(statusUpdates).toEqual([
    { id: invocations[0]?.id, status: 'failed', error: 'publish failed' },
    { id: invocations[1]?.id, status: 'failed', error: 'publish failed' },
    { id: invocations[2]?.id, status: 'failed', error: 'publish failed' },
  ]);
});

test('invocation.queued publish failure keeps the enqueued invocation queued and fails later invocations', async () => {
  const { eventBus, invocations, jobs, roomHub, statusUpdates } = createHarness(['architect', 'reviewer', 'implementer']);
  vi.mocked(eventBus.publishRoomEvent)
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error('queue event publish failed'));

  await expect(roomHub.submitMessage(createInput({ mode: 'broadcast' }))).rejects.toThrow('queue event publish failed');

  expect(jobs.map((job) => job.agentId)).toEqual(['architect']);
  expect(statusUpdates).toEqual([
    { id: invocations[1]?.id, status: 'failed', error: 'queue event publish failed' },
    { id: invocations[2]?.id, status: 'failed', error: 'queue event publish failed' },
  ]);
  expect(statusUpdates.some((update) => update.id === invocations[0]?.id)).toBe(false);
});

test('successful broadcast queues three known agents', async () => {
  const { events, jobs, roomHub } = createHarness(['reviewer', 'architect', 'implementer', 'observer']);

  const result = await roomHub.submitMessage(createInput({ mode: 'broadcast' }));

  expect(result.invocations.map((invocation) => invocation.agentId)).toEqual(['architect', 'reviewer', 'implementer']);
  expect(jobs.map((job) => job.agentId)).toEqual(['architect', 'reviewer', 'implementer']);
  expect(events.map((event) => event.type)).toEqual(['message.created', 'invocation.queued', 'invocation.queued', 'invocation.queued']);
});
