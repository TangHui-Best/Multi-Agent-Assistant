import { randomUUID } from 'node:crypto';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { AgentJobEnvelope } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentJob, AgentSeat, MessageRecord, RuntimeKind } from '@multi-agent-assi/shared';

export interface AgentWorker {
  start(): void;
  stop(): Promise<void>;
}

export interface RuntimeAdapterRunContext {
  job: AgentJob;
  seat: AgentSeat;
  signal: AbortSignal;
  emitDelta(delta: string): Promise<void>;
}

export interface RuntimeAdapterRunResult {
  body: string;
  runtimeSessionId?: string;
  resumeMetadata?: Record<string, unknown>;
}

export interface RuntimeAdapter {
  kind: RuntimeKind;
  run(context: RuntimeAdapterRunContext): Promise<RuntimeAdapterRunResult>;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function appendInvocationAudit(
  repositories: PersistenceRepositories,
  invocationId: string,
  eventType: string,
  options: { reason?: string; metadata?: Record<string, unknown> } = {},
): void {
  repositories.appendInvocationAudit({
    id: randomUUID(),
    invocationId,
    eventType,
    occurredAt: Date.now(),
    ...(options.reason ? { reason: options.reason } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  });
}

async function markAndPublishFailure(
  deps: { repositories: PersistenceRepositories; eventBus: EventBus },
  job: AgentJob,
  error: string,
): Promise<void> {
  try {
    deps.repositories.updateInvocationStatus(job.invocationId, 'failed', error);
    appendInvocationAudit(deps.repositories, job.invocationId, 'invocation.failed', { reason: error });
  } catch (err) {
    console.warn(`Unable to mark invocation failed: ${job.invocationId}`, err);
  }

  try {
    await deps.eventBus.publishRoomEvent({
      type: 'invocation.failed',
      roomId: job.roomId,
      threadId: job.threadId,
      invocationId: job.invocationId,
      agentId: job.agentId,
      error,
      occurredAt: Date.now(),
    });
  } catch (err) {
    console.warn(`Unable to publish invocation failure: ${job.invocationId}`, err);
  }
}

function findSeat(repositories: PersistenceRepositories, agentId: string): AgentSeat {
  const seat = repositories.listAgents().find((candidate) => candidate.id === agentId);
  if (!seat) {
    throw new Error(`Agent seat not found: ${agentId}`);
  }
  return seat;
}

function findAdapter(adapters: Map<RuntimeKind, RuntimeAdapter>, kind: RuntimeKind): RuntimeAdapter {
  const adapter = adapters.get(kind);
  if (!adapter) {
    throw new Error(`No runtime adapter registered for ${kind}`);
  }
  return adapter;
}

async function processJob(
  deps: {
    repositories: PersistenceRepositories;
    eventBus: EventBus;
    adapters: Map<RuntimeKind, RuntimeAdapter>;
    abortControllers: Map<string, AbortController>;
  },
  streamId: string,
  job: AgentJob,
): Promise<void> {
  let durableSuccess = false;
  try {
    const currentInvocation = deps.repositories.getInvocation(job.invocationId);
    if (currentInvocation?.status === 'canceled') {
      return;
    }

    const seat = findSeat(deps.repositories, job.agentId);
    const adapter = findAdapter(deps.adapters, seat.runtime.kind);
    const abortController = new AbortController();
    deps.abortControllers.set(job.invocationId, abortController);

    deps.repositories.updateInvocationStatus(job.invocationId, 'running');
    appendInvocationAudit(deps.repositories, job.invocationId, 'invocation.running');
    await deps.eventBus.publishRoomEvent({
      type: 'invocation.running',
      roomId: job.roomId,
      threadId: job.threadId,
      invocationId: job.invocationId,
      agentId: job.agentId,
      occurredAt: Date.now(),
    });

    const result = await adapter.run({
      job,
      seat,
      signal: abortController.signal,
      emitDelta: async (delta) => {
        await deps.eventBus.publishRoomEvent({
          type: 'agent.delta',
          roomId: job.roomId,
          threadId: job.threadId,
          invocationId: job.invocationId,
          agentId: job.agentId,
          delta,
          occurredAt: Date.now(),
        });
      },
    });

    if (result.runtimeSessionId || result.resumeMetadata) {
      deps.repositories.updateInvocationRecoveryMetadata(job.invocationId, {
        ...(result.runtimeSessionId ? { runtimeSessionId: result.runtimeSessionId } : {}),
        ...(result.resumeMetadata ? { resumeMetadata: result.resumeMetadata } : {}),
      });
      appendInvocationAudit(deps.repositories, job.invocationId, 'runtime.session_captured', {
        metadata: {
          ...(result.runtimeSessionId ? { runtimeSessionId: result.runtimeSessionId } : {}),
          ...(result.resumeMetadata ? { resumeMetadata: result.resumeMetadata } : {}),
        },
      });
    }

    const message: MessageRecord = {
      id: randomUUID(),
      roomId: job.roomId,
      threadId: job.threadId,
      kind: 'agent_message',
      sender: { type: 'agent', agentId: job.agentId },
      body: result.body,
      invocationId: job.invocationId,
      createdAt: Date.now(),
    };
    deps.repositories.appendMessage(message);
    deps.repositories.updateInvocationStatus(job.invocationId, 'succeeded');
    appendInvocationAudit(deps.repositories, job.invocationId, 'invocation.succeeded');
    durableSuccess = true;
    await deps.eventBus.publishRoomEvent({
      type: 'invocation.completed',
      roomId: job.roomId,
      threadId: job.threadId,
      invocationId: job.invocationId,
      message,
      occurredAt: Date.now(),
    });
  } catch (err) {
    if (!durableSuccess) {
      if (deps.repositories.getInvocation(job.invocationId)?.status === 'canceled') {
        return;
      }
      await markAndPublishFailure(deps, job, getErrorMessage(err));
    } else {
      console.warn(`Agent worker completed durable output but a later event publish failed: ${streamId}`, err);
    }
  } finally {
    deps.abortControllers.delete(job.invocationId);
  }
}

export function createAgentWorker(deps: {
  repositories: PersistenceRepositories;
  eventBus: EventBus;
  adapters: RuntimeAdapter[];
  consumerGroup?: string;
  pollIntervalMs?: number;
}): AgentWorker {
  let stopped = true;
  let timer: NodeJS.Timeout | null = null;
  let activeTick: Promise<void> | null = null;
  let unsubscribeRoomEvents: (() => Promise<void>) | null = null;
  let subscriptionReady: Promise<void> | null = null;
  const consumerGroup = deps.consumerGroup ?? 'agent-runtime-workers';
  const consumerName = `worker-${process.pid}`;
  const adapters = new Map(deps.adapters.map((adapter) => [adapter.kind, adapter]));
  const abortControllers = new Map<string, AbortController>();

  async function processJobGroup(group: AgentJobEnvelope[]): Promise<void> {
    for (const { streamId, job } of group) {
      if (stopped) return;
      await processJob({ repositories: deps.repositories, eventBus: deps.eventBus, adapters, abortControllers }, streamId, job);
      await deps.eventBus.ackAgentJob(consumerGroup, streamId);
    }
  }

  async function processJobsByAgentSlot(jobs: AgentJobEnvelope[]): Promise<void> {
    const groups = new Map<string, AgentJobEnvelope[]>();
    for (const envelope of jobs) {
      const group = groups.get(envelope.job.agentId) ?? [];
      group.push(envelope);
      groups.set(envelope.job.agentId, group);
    }
    await Promise.all([...groups.values()].map((group) => processJobGroup(group)));
  }

  function scheduleNextTick(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      activeTick = tick();
    }, deps.pollIntervalMs ?? 250);
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const jobs = await deps.eventBus.readAgentJobs(consumerGroup, consumerName, 100);
      if (stopped) return;
      await processJobsByAgentSlot(jobs);
    } catch (err) {
      console.warn('Agent worker tick failed; polling will continue', err);
    } finally {
      scheduleNextTick();
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      subscriptionReady = deps.eventBus
        .subscribeRoomEvents((event) => {
          if (event.type === 'invocation.canceled') {
            abortControllers.get(event.invocationId)?.abort(new Error(event.reason ?? 'invocation canceled'));
          }
        })
        .then((unsubscribe) => {
          if (stopped) {
            void unsubscribe();
            return;
          }
          unsubscribeRoomEvents = unsubscribe;
        })
        .catch((err) => {
          console.warn('Agent worker cancellation subscription failed; polling will continue', err);
        });
      activeTick = tick();
    },
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      for (const controller of abortControllers.values()) {
        controller.abort(new Error('agent worker stopped'));
      }
      if (unsubscribeRoomEvents) {
        const unsubscribe = unsubscribeRoomEvents;
        unsubscribeRoomEvents = null;
        await unsubscribe();
      } else {
        await subscriptionReady;
      }
      await activeTick;
    },
  };
}
