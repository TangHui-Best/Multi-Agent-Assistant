import { beforeEach, expect, test, vi } from 'vitest';
import type { EventBus } from '@multi-agent-assi/event-bus';
import { createDatabase, createRepositories, type PersistenceRepositories } from '@multi-agent-assi/persistence';
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
  const audits: import('@multi-agent-assi/shared').InvocationAuditRecord[] = [];
  const rounds: import('@multi-agent-assi/shared').RoundRecord[] = [];
  const roundSteps: import('@multi-agent-assi/shared').RoundStepRecord[] = [];
  const actions: string[] = [];
  const repositories: PersistenceRepositories = {
    ensureDefaultState: vi.fn(),
    appendMessage: vi.fn((message: MessageRecord) => {
      messages.push(message);
    }),
    findMessageByIdempotencyKey: vi.fn(() => null),
    listMessages: vi.fn((threadId: string) => messages.filter((message) => message.threadId === threadId)),
    createInvocation: vi.fn((invocation: InvocationRecord) => {
      invocations.push(invocation);
    }),
    createRound: vi.fn((round) => {
      rounds.push(round);
    }),
    createRoundSteps: vi.fn((steps) => {
      roundSteps.push(...steps);
    }),
    listRoundsByThread: vi.fn((threadId: string) => rounds.filter((round) => round.threadId === threadId)),
    listRoundSteps: vi.fn((roundId: string) => roundSteps.filter((step) => step.roundId === roundId)),
    updateRoundStatus: vi.fn(),
    updateRoundStepStatus: vi.fn(),
    updateInvocationRecoveryMetadata: vi.fn(),
    appendInvocationAudit: vi.fn((entry) => {
      audits.push(entry);
    }),
    listInvocationAudit: vi.fn((invocationId: string) => audits.filter((entry) => entry.invocationId === invocationId)),
    listInvocationsBySourceMessage: vi.fn((sourceMessageId: string) =>
      invocations.filter((invocation) => invocation.sourceMessageId === sourceMessageId),
    ),
    listInvocationsByThread: vi.fn((threadId: string) => invocations.filter((invocation) => invocation.threadId === threadId)),
    updateInvocationStatus: vi.fn((id: string, status: InvocationRecord['status'], error?: string) => {
      statusUpdates.push({ id, status, error });
    }),
    getInvocation: vi.fn((id: string) => invocations.find((invocation) => invocation.id === id) ?? null),
    listAgents: vi.fn(() => agentIds.map(createAgent)),
  };
  const eventBus: EventBus = {
    publishRoomEvent: vi.fn(async (event: RoomEvent) => {
      actions.push(`event:${event.type}:${event.type === 'invocation.queued' ? event.invocation.agentId : ''}`);
      events.push(event);
    }),
    enqueueAgentJob: vi.fn(async (job: AgentJob) => {
      actions.push(`job:${job.agentId}`);
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
    actions,
    statusUpdates,
    rounds,
    roundSteps,
    audits,
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
  const { eventBus, events, invocations, repositories, roomHub, statusUpdates } = createHarness(['architect']);
  vi.mocked(eventBus.enqueueAgentJob).mockRejectedValueOnce(new Error('redis down'));

  await expect(roomHub.submitMessage(createInput({ mode: 'mention', agentIds: ['architect'] }))).rejects.toThrow('redis down');

  expect(repositories.updateInvocationStatus).toHaveBeenCalledWith(invocations[0]?.id, 'failed', 'redis down');
  expect(statusUpdates).toEqual([{ id: invocations[0]?.id, status: 'failed', error: 'redis down' }]);
  expect(events.map((event) => event.type)).toContain('invocation.failed');
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

test('invocation.queued publish failure prevents the job from becoming consumable and fails all pending invocations', async () => {
  const { eventBus, invocations, jobs, roomHub, statusUpdates } = createHarness(['architect', 'reviewer', 'implementer']);
  vi.mocked(eventBus.publishRoomEvent)
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error('queue event publish failed'));

  await expect(roomHub.submitMessage(createInput({ mode: 'broadcast' }))).rejects.toThrow('queue event publish failed');

  expect(jobs).toEqual([]);
  expect(statusUpdates).toEqual([
    { id: invocations[0]?.id, status: 'failed', error: 'queue event publish failed' },
    { id: invocations[1]?.id, status: 'failed', error: 'queue event publish failed' },
    { id: invocations[2]?.id, status: 'failed', error: 'queue event publish failed' },
  ]);
});

test('successful broadcast queues three known agents', async () => {
  const { actions, events, jobs, roomHub } = createHarness(['reviewer', 'architect', 'implementer', 'observer']);

  const result = await roomHub.submitMessage(createInput({ mode: 'broadcast' }));

  expect(result.invocations.map((invocation) => invocation.agentId)).toEqual(['architect', 'reviewer', 'implementer']);
  expect(jobs.map((job) => job.agentId)).toEqual(['architect', 'reviewer', 'implementer']);
  expect(events.map((event) => event.type)).toEqual(['message.created', 'invocation.queued', 'invocation.queued', 'invocation.queued']);
  expect(actions).toEqual([
    'event:message.created:',
    'event:invocation.queued:architect',
    'job:architect',
    'event:invocation.queued:reviewer',
    'job:reviewer',
    'event:invocation.queued:implementer',
    'job:implementer',
  ]);
});

test('design_review_execute creates a persisted round and queues only the architect step first', async () => {
  const { events, invocations, jobs, roomHub, rounds, roundSteps } = createHarness(['architect', 'reviewer', 'implementer']);

  const result = await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));

  expect(rounds).toEqual([
    expect.objectContaining({ workflow: 'design_review_execute', status: 'running', sourceMessageId: result.message.id }),
  ]);
  expect(roundSteps.map((step) => [step.stepIndex, step.agentId, step.status, step.dependsOnStepId])).toEqual([
    [0, 'architect', 'queued', undefined],
    [1, 'reviewer', 'pending', roundSteps[0].id],
    [2, 'implementer', 'pending', roundSteps[1].id],
  ]);
  expect(result.invocations).toHaveLength(1);
  expect(invocations[0]).toMatchObject({ agentId: 'architect', roundId: rounds[0].id, roundStepId: roundSteps[0].id });
  expect(jobs.map((job) => job.agentId)).toEqual(['architect']);
  expect(events.map((event) => event.type)).toContain('round.created');
});

test('same idempotency key returns the original message and invocations without duplicate jobs', async () => {
  const repositories = createRepositories(createDatabase(':memory:'));
  repositories.ensureDefaultState();
  const eventBus: EventBus & { jobs: AgentJob[] } = {
    jobs: [],
    publishRoomEvent: vi.fn(async () => {}),
    enqueueAgentJob: vi.fn(async (job: AgentJob) => {
      eventBus.jobs.push(job);
    }),
    readAgentJobs: vi.fn(async () => []),
    ackAgentJob: vi.fn(async () => {}),
    subscribeRoomEvents: vi.fn(async () => async () => {}),
    close: vi.fn(async () => {}),
  };
  const roomHub = createRoomHub({ repositories, eventBus });
  const input: SubmitMessageInput = {
    ...createInput({ mode: 'mention', agentIds: ['architect'] }),
    roomId: 'default-room',
    threadId: 'default-thread',
  };

  const first = await roomHub.submitMessage(input);
  const second = await roomHub.submitMessage(input);

  expect(second.message.id).toBe(first.message.id);
  expect(second.invocations.map((invocation) => invocation.id)).toEqual(first.invocations.map((invocation) => invocation.id));
  expect(repositories.listMessages('default-thread')).toHaveLength(1);
  expect(eventBus.jobs).toHaveLength(1);
});

test('cancelInvocation marks the target invocation canceled and publishes a cancellation event', async () => {
  const { events, invocations, repositories, roomHub, statusUpdates } = createHarness(['architect']);
  await roomHub.submitMessage(createInput({ mode: 'mention', agentIds: ['architect'] }));

  const result = await roomHub.cancelInvocation(invocations[0].id, 'user requested stop');

  expect(result).toMatchObject({ id: invocations[0].id, status: 'canceled' });
  expect(statusUpdates).toEqual([{ id: invocations[0].id, status: 'canceled', error: 'user requested stop' }]);
  expect(events.at(-1)).toMatchObject({
    type: 'invocation.canceled',
    invocationId: invocations[0].id,
    agentId: 'architect',
    reason: 'user requested stop',
  });
  expect(repositories.updateInvocationStatus).toHaveBeenCalledWith(invocations[0].id, 'canceled', 'user requested stop');
});
