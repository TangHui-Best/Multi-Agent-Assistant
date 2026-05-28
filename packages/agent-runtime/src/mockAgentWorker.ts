import { randomUUID } from 'node:crypto';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentJob, MessageRecord } from '@multi-agent-assi/shared';

const CONSUMER_GROUP = 'mock-agent-workers';

export interface MockAgentWorker {
  start(): void;
  stop(): Promise<void>;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function markAndPublishFailure(
  deps: { repositories: PersistenceRepositories; eventBus: EventBus },
  job: AgentJob,
  error: string,
): Promise<void> {
  try {
    deps.repositories.updateInvocationStatus(job.invocationId, 'failed', error);
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

async function processJob(deps: { repositories: PersistenceRepositories; eventBus: EventBus }, streamId: string, job: AgentJob): Promise<void> {
  let durableSuccess = false;
  try {
    deps.repositories.updateInvocationStatus(job.invocationId, 'running');
    await deps.eventBus.publishRoomEvent({
      type: 'invocation.running',
      roomId: job.roomId,
      threadId: job.threadId,
      invocationId: job.invocationId,
      agentId: job.agentId,
      occurredAt: Date.now(),
    });

    const body = `[${job.agentId}] received: ${job.prompt}`;
    await deps.eventBus.publishRoomEvent({
      type: 'agent.delta',
      roomId: job.roomId,
      threadId: job.threadId,
      invocationId: job.invocationId,
      agentId: job.agentId,
      delta: body,
      occurredAt: Date.now(),
    });

    const message: MessageRecord = {
      id: randomUUID(),
      roomId: job.roomId,
      threadId: job.threadId,
      kind: 'agent_message',
      sender: { type: 'agent', agentId: job.agentId },
      body,
      invocationId: job.invocationId,
      createdAt: Date.now(),
    };
    deps.repositories.appendMessage(message);
    deps.repositories.updateInvocationStatus(job.invocationId, 'succeeded');
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
      await markAndPublishFailure(deps, job, getErrorMessage(err));
    } else {
      console.warn(`Mock agent completed durable output but a later event publish failed: ${streamId}`, err);
    }
  }

  await deps.eventBus.ackAgentJob(CONSUMER_GROUP, streamId);
}

export function createMockAgentWorker(deps: {
  repositories: PersistenceRepositories;
  eventBus: EventBus;
  pollIntervalMs?: number;
}): MockAgentWorker {
  let stopped = true;
  let timer: NodeJS.Timeout | null = null;
  let activeTick: Promise<void> | null = null;
  const consumerName = `worker-${process.pid}`;

  function scheduleNextTick(): void {
    if (stopped) return;
    timer = setTimeout(() => {
      activeTick = tick();
    }, deps.pollIntervalMs ?? 250);
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      const jobs = await deps.eventBus.readAgentJobs(CONSUMER_GROUP, consumerName, 100);
      if (stopped) return;
      for (const { streamId, job } of jobs) {
        if (stopped) return;
        await processJob(deps, streamId, job);
      }
    } catch (err) {
      console.warn('Mock agent worker tick failed; polling will continue', err);
    } finally {
      scheduleNextTick();
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      activeTick = tick();
    },
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await activeTick;
    },
  };
}
