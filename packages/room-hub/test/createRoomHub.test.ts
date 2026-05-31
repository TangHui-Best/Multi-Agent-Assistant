import { beforeEach, expect, test, vi } from 'vitest';
import type { EventBus } from '@multi-agent-assi/event-bus';
import { createDatabase, createRepositories, type PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentJob, AgentSeat, InvocationRecord, MessageRecord, RoomEvent, SubmitMessageInput } from '@multi-agent-assi/shared';
import { createRoomHub } from '../src/createRoomHub.js';
import { parseReviewerVerdict } from '../src/orchestrationPolicy.js';

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

function createAgentMessage(input: { invocation: InvocationRecord; body: string; createdAt?: number }): MessageRecord {
  return {
    id: `message-${input.invocation.id}`,
    roomId: input.invocation.roomId,
    threadId: input.invocation.threadId,
    kind: 'agent_message',
    sender: { type: 'agent', agentId: input.invocation.agentId },
    body: input.body,
    invocationId: input.invocation.id,
    createdAt: input.createdAt ?? Date.now(),
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
    updateRoundStatus: vi.fn((id, status, error) => {
      const round = rounds.find((item) => item.id === id);
      if (round) {
        round.status = status;
        round.error = error;
        round.updatedAt = Date.now();
      }
    }),
    updateRoundStepStatus: vi.fn((id, status, options) => {
      const step = roundSteps.find((item) => item.id === id);
      if (step) {
        step.status = status;
        step.updatedAt = Date.now();
        if (options?.invocationId) step.invocationId = options.invocationId;
        step.error = options?.error;
      }
    }),
    updateInvocationRecoveryMetadata: vi.fn(),
    appendInvocationAudit: vi.fn((entry) => {
      audits.push(entry);
    }),
    listInvocationAudit: vi.fn((invocationId: string) => audits.filter((entry) => entry.invocationId === invocationId)),
    listInvocationsBySourceMessage: vi.fn((sourceMessageId: string) =>
      invocations.filter((invocation) => invocation.sourceMessageId === sourceMessageId),
    ),
    listInvocationsByThread: vi.fn((threadId: string) => invocations.filter((invocation) => invocation.threadId === threadId)),
    tryStartInvocation: vi.fn(() => true),
    updateInvocationStatus: vi.fn((id: string, status: InvocationRecord['status'], error?: string) => {
      statusUpdates.push({ id, status, error });
      const invocation = invocations.find((item) => item.id === id);
      if (invocation) {
        invocation.status = status;
        invocation.error = error;
        invocation.updatedAt = Date.now();
      }
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
    acquireAgentSlotLease: vi.fn(async () => true),
    releaseAgentSlotLease: vi.fn(async () => {}),
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

test('parseReviewerVerdict accepts only explicit reviewer verdict lines', () => {
  expect(parseReviewerVerdict('No blocking issues.\nVERDICT: approved')).toBe('approved');
  expect(parseReviewerVerdict(' verdict: approve ')).toBe('approved');
  expect(parseReviewerVerdict('Missing failure tests.\nVERDICT: changes_requested')).toBe('changes_requested');
  expect(parseReviewerVerdict('VERDICT: request_changes')).toBe('changes_requested');
  expect(parseReviewerVerdict('VERDICT: approved\nNo blocking issues.')).toBeNull();
  expect(parseReviewerVerdict('Looks good to me.')).toBeNull();
  expect(parseReviewerVerdict('VERDICT: changes_requested\n...\nVERDICT: approved')).toBeNull();
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

test('continueRoundAfterInvocation queues reviewer then approved implementer and publishes live round updates', async () => {
  const { events, invocations, jobs, messages, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  const architectInvocation = invocations[0];
  architectInvocation.status = 'succeeded';
  messages.push(createAgentMessage({ invocation: architectInvocation, body: 'Architecture plan v1' }));

  const reviewerInvocation = await roomHub.continueRoundAfterInvocation(architectInvocation.id);
  expect(reviewerInvocation).toMatchObject({ agentId: 'reviewer', roundId: rounds[0].id, roundStepId: roundSteps[1].id });
  expect(jobs.map((job) => job.agentId)).toEqual(['architect', 'reviewer']);
  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[0].id, 'succeeded', { invocationId: architectInvocation.id });
  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[1].id, 'queued', { invocationId: reviewerInvocation?.id });
  expect(events.at(-1)).toMatchObject({
    type: 'round.updated',
    round: expect.objectContaining({ id: rounds[0].id, status: 'running' }),
  });

  messages.push(createAgentMessage({ invocation: reviewerInvocation!, body: 'No blockers.\nVERDICT: approved' }));
  reviewerInvocation!.status = 'succeeded';
  const implementerInvocation = await roomHub.continueRoundAfterInvocation(reviewerInvocation!.id);
  expect(implementerInvocation).toMatchObject({ agentId: 'implementer', roundId: rounds[0].id, roundStepId: roundSteps[2].id });
  expect(events.at(-1)).toMatchObject({
    type: 'round.updated',
    steps: expect.arrayContaining([expect.objectContaining({ id: roundSteps[2].id, status: 'queued' })]),
  });

  implementerInvocation!.status = 'succeeded';
  const done = await roomHub.continueRoundAfterInvocation(implementerInvocation!.id);
  expect(done).toBeNull();
  expect(repositories.updateRoundStatus).toHaveBeenCalledWith(rounds[0].id, 'succeeded');
  expect(events.at(-1)).toMatchObject({
    type: 'round.updated',
    round: expect.objectContaining({ id: rounds[0].id, status: 'succeeded' }),
  });
});

test('design_review_execute prompts reviewer with architect output and requires verdict before implementer', async () => {
  const { invocations, jobs, messages, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  const architectInvocation = invocations[0];
  architectInvocation.status = 'succeeded';
  messages.push(createAgentMessage({ invocation: architectInvocation, body: 'Architecture plan v1' }));

  const reviewerInvocation = await roomHub.continueRoundAfterInvocation(architectInvocation.id);

  expect(reviewerInvocation).toMatchObject({ agentId: 'reviewer', roundId: rounds[0].id, roundStepId: roundSteps[1].id });
  expect(jobs.at(-1)).toMatchObject({
    agentId: 'reviewer',
    prompt: expect.stringContaining('Architect output:\nArchitecture plan v1'),
  });
  expect(jobs.at(-1)?.prompt).toContain('VERDICT: approved or VERDICT: changes_requested');

  messages.push(createAgentMessage({ invocation: reviewerInvocation!, body: 'Ship it.\nVERDICT: approved' }));
  reviewerInvocation!.status = 'succeeded';
  const implementerInvocation = await roomHub.continueRoundAfterInvocation(reviewerInvocation!.id);

  expect(implementerInvocation).toMatchObject({ agentId: 'implementer', roundId: rounds[0].id, roundStepId: roundSteps[2].id });
  expect(jobs.at(-1)).toMatchObject({
    agentId: 'implementer',
    prompt: expect.stringContaining('Reviewer output:\nShip it.\nVERDICT: approved'),
  });
});

test('reviewer changes requested verdict stops the round without queuing implementer', async () => {
  const { events, invocations, jobs, messages, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'succeeded';
  messages.push(createAgentMessage({ invocation: invocations[0], body: 'Architecture plan v1' }));
  const reviewerInvocation = await roomHub.continueRoundAfterInvocation(invocations[0].id);
  reviewerInvocation!.status = 'succeeded';
  messages.push(createAgentMessage({ invocation: reviewerInvocation!, body: 'Missing recovery tests.\nVERDICT: changes_requested' }));

  const result = await roomHub.continueRoundAfterInvocation(reviewerInvocation!.id);

  expect(result).toBeNull();
  expect(jobs.map((job) => job.agentId)).toEqual(['architect', 'reviewer']);
  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[1].id, 'succeeded', { invocationId: reviewerInvocation!.id });
  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[2].id, 'canceled', {
    error: 'Reviewer gate stopped round: changes_requested',
  });
  expect(repositories.updateRoundStatus).toHaveBeenCalledWith(rounds[0].id, 'failed', 'Reviewer gate stopped round: changes_requested');
  expect(events.at(-1)).toMatchObject({ type: 'round.updated', round: expect.objectContaining({ id: rounds[0].id, status: 'failed' }) });
});

test('missing reviewer verdict stops the round without queuing implementer', async () => {
  const { invocations, jobs, messages, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'succeeded';
  messages.push(createAgentMessage({ invocation: invocations[0], body: 'Architecture plan v1' }));
  const reviewerInvocation = await roomHub.continueRoundAfterInvocation(invocations[0].id);
  reviewerInvocation!.status = 'succeeded';
  messages.push(createAgentMessage({ invocation: reviewerInvocation!, body: 'Looks good, but no explicit verdict.' }));

  const result = await roomHub.continueRoundAfterInvocation(reviewerInvocation!.id);

  expect(result).toBeNull();
  expect(jobs.map((job) => job.agentId)).toEqual(['architect', 'reviewer']);
  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[2].id, 'canceled', {
    error: 'Reviewer gate stopped round: missing verdict',
  });
  expect(repositories.updateRoundStatus).toHaveBeenCalledWith(rounds[0].id, 'failed', 'Reviewer gate stopped round: missing verdict');
});

test('settleRoundAfterInvocation fails current step, cancels dependents, and fails the round', async () => {
  const { invocations, messages, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'succeeded';
  messages.push(createAgentMessage({ invocation: invocations[0], body: 'Architecture plan v1' }));
  const reviewerInvocation = await roomHub.continueRoundAfterInvocation(invocations[0].id);

  await roomHub.settleRoundAfterInvocation(reviewerInvocation!.id, 'failed', 'reviewer runtime failed');

  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[1].id, 'failed', {
    invocationId: reviewerInvocation!.id,
    error: 'reviewer runtime failed',
  });
  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[2].id, 'canceled', {
    error: 'Blocked by failed reviewer step',
  });
  expect(repositories.updateRoundStatus).toHaveBeenCalledWith(rounds[0].id, 'failed', 'reviewer runtime failed');
});

test('duplicate continuation for a non-final step is a no-op after the next step is already queued', async () => {
  const { invocations, messages, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'succeeded';
  messages.push(createAgentMessage({ invocation: invocations[0], body: 'Architecture plan v1' }));
  await roomHub.continueRoundAfterInvocation(invocations[0].id);

  const duplicate = await roomHub.continueRoundAfterInvocation(invocations[0].id);

  expect(duplicate).toBeNull();
  expect(repositories.updateRoundStatus).not.toHaveBeenCalledWith(rounds[0].id, 'succeeded');
  expect(roundSteps.map((step) => step.status)).toEqual(['succeeded', 'queued', 'pending']);
});

test('stale failure for an already succeeded step does not overwrite downstream progress', async () => {
  const { invocations, messages, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'succeeded';
  messages.push(createAgentMessage({ invocation: invocations[0], body: 'Architecture plan v1' }));
  const reviewerInvocation = await roomHub.continueRoundAfterInvocation(invocations[0].id);
  reviewerInvocation!.status = 'running';

  await roomHub.settleRoundAfterInvocation(invocations[0].id, 'failed', 'late stale architect failure');

  expect(repositories.updateRoundStepStatus).not.toHaveBeenCalledWith(roundSteps[0].id, 'failed', expect.anything());
  expect(roundSteps.map((step) => step.status)).toEqual(['succeeded', 'queued', 'pending']);
  expect(rounds[0].status).toBe('running');
});

test('next-step enqueue failure fails that step, cancels later pending steps, and publishes a round update', async () => {
  const { eventBus, events, invocations, messages, repositories, roomHub, roundSteps, rounds } = createHarness([
    'architect',
    'reviewer',
    'implementer',
  ]);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'succeeded';
  messages.push(createAgentMessage({ invocation: invocations[0], body: 'Architecture plan v1' }));
  vi.mocked(eventBus.enqueueAgentJob).mockRejectedValueOnce(new Error('redis down'));

  await expect(roomHub.continueRoundAfterInvocation(invocations[0].id)).rejects.toThrow('redis down');

  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[1].id, 'failed', {
    invocationId: expect.any(String),
    error: 'redis down',
  });
  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[2].id, 'canceled', {
    error: 'Blocked by failed reviewer step',
  });
  expect(repositories.updateRoundStatus).toHaveBeenCalledWith(rounds[0].id, 'failed', 'redis down');
  expect(events.at(-1)).toMatchObject({
    type: 'round.updated',
    round: expect.objectContaining({ id: rounds[0].id, status: 'failed', error: 'redis down' }),
  });
});

test('cancelInvocation settles a round-linked invocation and cancels dependent steps', async () => {
  const { invocations, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));

  await roomHub.cancelInvocation(invocations[0].id, 'user requested stop');

  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[0].id, 'canceled', {
    invocationId: invocations[0].id,
    error: 'user requested stop',
  });
  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[1].id, 'canceled', {
    error: 'Blocked by canceled architect step',
  });
  expect(repositories.updateRoundStepStatus).toHaveBeenCalledWith(roundSteps[2].id, 'canceled', {
    error: 'Blocked by canceled architect step',
  });
  expect(repositories.updateRoundStatus).toHaveBeenCalledWith(rounds[0].id, 'canceled', 'user requested stop');
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
    acquireAgentSlotLease: vi.fn(async () => true),
    releaseAgentSlotLease: vi.fn(async () => {}),
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

test('cancelInvocation does not overwrite an already succeeded invocation', async () => {
  const { events, invocations, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'succeeded';
  roundSteps[0].status = 'succeeded';

  const result = await roomHub.cancelInvocation(invocations[0].id, 'late cancel');

  expect(result.status).toBe('succeeded');
  expect(repositories.updateInvocationStatus).not.toHaveBeenCalledWith(invocations[0].id, 'canceled', 'late cancel');
  expect(roundSteps.map((step) => step.status)).toEqual(['succeeded', 'pending', 'pending']);
  expect(rounds[0].status).toBe('running');
  expect(events.at(-1)).not.toMatchObject({ type: 'invocation.canceled' });
});

test('recoverThreadContinuity re-enqueues queued invocations from persisted source messages', async () => {
  const { audits, invocations, jobs, roomHub } = createHarness(['architect']);
  await roomHub.submitMessage(createInput({ mode: 'mention', agentIds: ['architect'] }));
  jobs.length = 0;

  const result = await roomHub.recoverThreadContinuity('thread-1');

  expect(result.requeued).toEqual([invocations[0].id]);
  expect(jobs).toEqual([
    expect.objectContaining({
      invocationId: invocations[0].id,
      agentId: 'architect',
      prompt: 'Review the plan',
    }),
  ]);
  expect(audits).toContainEqual(expect.objectContaining({ invocationId: invocations[0].id, eventType: 'recovery.requeued' }));
});

test('recoverThreadContinuity fails stale running invocations and settles linked rounds', async () => {
  const { audits, events, invocations, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'running';

  const result = await roomHub.recoverThreadContinuity('thread-1');

  expect(result.failed).toEqual([invocations[0].id]);
  expect(repositories.updateInvocationStatus).toHaveBeenCalledWith(
    invocations[0].id,
    'failed',
    'Recovered stale running invocation after host restart',
  );
  expect(repositories.updateRoundStatus).toHaveBeenCalledWith(
    rounds[0].id,
    'failed',
    'Recovered stale running invocation after host restart',
  );
  expect(roundSteps.map((step) => step.status)).toEqual(['failed', 'canceled', 'canceled']);
  expect(audits).toContainEqual(expect.objectContaining({ invocationId: invocations[0].id, eventType: 'recovery.stale_running_failed' }));
  expect(events).toContainEqual(expect.objectContaining({ type: 'invocation.failed', invocationId: invocations[0].id }));
});

test('recoverThreadContinuity continues succeeded round-linked invocations through policy', async () => {
  const { invocations, jobs, messages, roomHub, roundSteps } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'succeeded';
  messages.push(createAgentMessage({ invocation: invocations[0], body: 'Architecture plan v1' }));
  jobs.length = 0;

  const result = await roomHub.recoverThreadContinuity('thread-1');

  expect(result.continued).toEqual([invocations[0].id]);
  expect(jobs).toEqual([
    expect.objectContaining({
      agentId: 'reviewer',
      prompt: expect.stringContaining('Architect output:\nArchitecture plan v1'),
    }),
  ]);
  expect(roundSteps.map((step) => step.status)).toEqual(['succeeded', 'queued', 'pending']);
});

test('recoverThreadContinuity settles failed round-linked invocations left before round convergence', async () => {
  const { invocations, repositories, roomHub, roundSteps, rounds } = createHarness(['architect', 'reviewer', 'implementer']);
  await roomHub.submitMessage(createInput({ mode: 'orchestrated', workflow: 'design_review_execute' }));
  invocations[0].status = 'failed';
  invocations[0].error = 'adapter failed before settle callback';

  const result = await roomHub.recoverThreadContinuity('thread-1');

  expect(result.settled).toEqual([invocations[0].id]);
  expect(repositories.updateRoundStatus).toHaveBeenCalledWith(rounds[0].id, 'failed', 'adapter failed before settle callback');
  expect(roundSteps.map((step) => step.status)).toEqual(['failed', 'canceled', 'canceled']);
});
