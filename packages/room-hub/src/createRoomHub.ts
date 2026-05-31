import { randomUUID } from 'node:crypto';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentId, AgentJob, InvocationRecord, MessageRecord, RoundRecord, RoundStepRecord, SubmitMessageInput } from '@multi-agent-assi/shared';

export interface RoomHub {
  submitMessage(input: SubmitMessageInput): Promise<{ message: MessageRecord; invocations: InvocationRecord[] }>;
  cancelInvocation(invocationId: string, reason?: string): Promise<InvocationRecord>;
  listMessages(threadId: string): Promise<MessageRecord[]>;
}

const BROADCAST_TARGETS: AgentId[] = ['architect', 'reviewer', 'implementer'];
const DESIGN_REVIEW_EXECUTE_STEPS: AgentId[] = ['architect', 'reviewer', 'implementer'];

function dedupeTargets(agentIds: AgentId[]): AgentId[] {
  const seen = new Set<AgentId>();
  return agentIds.filter((agentId) => {
    if (seen.has(agentId)) return false;
    seen.add(agentId);
    return true;
  });
}

function resolveTargets(input: SubmitMessageInput, knownAgentIds: Set<AgentId>): AgentId[] {
  if (input.target.mode === 'mention') {
    for (const agentId of input.target.agentIds) {
      if (!knownAgentIds.has(agentId)) {
        throw new Error(`Unknown target agent: ${agentId}`);
      }
    }
    return dedupeTargets(input.target.agentIds);
  }

  if (input.target.mode === 'broadcast') {
    return BROADCAST_TARGETS.filter((agentId) => knownAgentIds.has(agentId));
  }

  return DESIGN_REVIEW_EXECUTE_STEPS.filter((agentId) => knownAgentIds.has(agentId));
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function markInvocationsFailed(
  repositories: PersistenceRepositories,
  invocations: InvocationRecord[],
  startIndex: number,
  error: string,
): void {
  for (const invocation of invocations.slice(startIndex)) {
    repositories.updateInvocationStatus(invocation.id, 'failed', error);
  }
}

async function publishInvocationFailed(
  deps: { repositories: PersistenceRepositories; eventBus: EventBus },
  invocation: InvocationRecord,
  error: string,
): Promise<void> {
  deps.repositories.updateInvocationStatus(invocation.id, 'failed', error);
  try {
    await deps.eventBus.publishRoomEvent({
      type: 'invocation.failed',
      roomId: invocation.roomId,
      threadId: invocation.threadId,
      invocationId: invocation.id,
      agentId: invocation.agentId,
      error,
      occurredAt: Date.now(),
    });
  } catch {
    // The durable failed status is the source of truth; event replay can be recovered from persistence later.
  }
}

async function failInvocationsFrom(
  deps: { repositories: PersistenceRepositories; eventBus: EventBus },
  invocations: InvocationRecord[],
  startIndex: number,
  error: string,
): Promise<void> {
  for (const invocation of invocations.slice(startIndex)) {
    await publishInvocationFailed(deps, invocation, error);
  }
}

function createInvocation(input: {
  message: MessageRecord;
  agentId: AgentId;
  now: number;
  roundId?: string;
  roundStepId?: string;
}): InvocationRecord {
  return {
    id: randomUUID(),
    roomId: input.message.roomId,
    threadId: input.message.threadId,
    sourceMessageId: input.message.id,
    agentId: input.agentId,
    status: 'queued',
    createdAt: input.now,
    updatedAt: input.now,
    ...(input.roundId ? { roundId: input.roundId } : {}),
    ...(input.roundStepId ? { roundStepId: input.roundStepId } : {}),
  };
}

function createDesignReviewRound(message: MessageRecord, knownAgentIds: Set<AgentId>, now: number): {
  round: RoundRecord;
  steps: RoundStepRecord[];
  firstStep: RoundStepRecord;
} {
  const missingAgent = DESIGN_REVIEW_EXECUTE_STEPS.find((agentId) => !knownAgentIds.has(agentId));
  if (missingAgent) {
    throw new Error(`Unknown target agent: ${missingAgent}`);
  }

  const round: RoundRecord = {
    id: randomUUID(),
    roomId: message.roomId,
    threadId: message.threadId,
    sourceMessageId: message.id,
    workflow: 'design_review_execute',
    status: 'running',
    createdAt: now,
    updatedAt: now,
  };
  const steps = DESIGN_REVIEW_EXECUTE_STEPS.map((agentId, index): RoundStepRecord => ({
    id: randomUUID(),
    roundId: round.id,
    stepIndex: index,
    agentId,
    status: index === 0 ? 'queued' : 'pending',
    createdAt: now,
    updatedAt: now,
    ...(index > 0 ? { dependsOnStepId: '' } : {}),
  }));
  return {
    round,
    steps: steps.map((step, index) => (index > 0 ? { ...step, dependsOnStepId: steps[index - 1].id } : step)),
    firstStep: steps[0],
  };
}

export function createRoomHub(deps: { repositories: PersistenceRepositories; eventBus: EventBus }): RoomHub {
  return {
    async submitMessage(input) {
      const now = Date.now();
      const existingMessage = deps.repositories.findMessageByIdempotencyKey(input.roomId, input.threadId, input.idempotencyKey);
      if (existingMessage) {
        return {
          message: existingMessage,
          invocations: deps.repositories.listInvocationsBySourceMessage(existingMessage.id),
        };
      }

      const knownAgentIds = new Set(deps.repositories.listAgents().map((agent) => agent.id));
      const targetAgentIds = resolveTargets(input, knownAgentIds);
      const message: MessageRecord = {
        id: randomUUID(),
        roomId: input.roomId,
        threadId: input.threadId,
        kind: 'user_message',
        sender: { type: 'user', userId: input.userId, source: input.source },
        body: input.body,
        createdAt: now,
      };
      deps.repositories.appendMessage(message, { idempotencyKey: input.idempotencyKey });

      const invocations: InvocationRecord[] = [];
      let roundContext: { round: RoundRecord; steps: RoundStepRecord[] } | undefined;
      if (input.target.mode === 'orchestrated') {
        const { round, steps } = createDesignReviewRound(message, knownAgentIds, now);
        const firstStep = steps[0];
        deps.repositories.createRound(round);
        deps.repositories.createRoundSteps(steps);
        const invocation = createInvocation({ message, agentId: firstStep.agentId, now, roundId: round.id, roundStepId: firstStep.id });
        deps.repositories.createInvocation(invocation);
        deps.repositories.appendInvocationAudit({
          id: randomUUID(),
          invocationId: invocation.id,
          eventType: 'invocation.queued',
          occurredAt: now,
          metadata: { roundId: round.id, roundStepId: firstStep.id },
        });
        deps.repositories.updateRoundStepStatus(firstStep.id, 'queued', { invocationId: invocation.id });
        invocations.push(invocation);
        roundContext = { round, steps };
      } else {
        for (const agentId of targetAgentIds) {
          const invocation = createInvocation({ message, agentId, now });
          deps.repositories.createInvocation(invocation);
          deps.repositories.appendInvocationAudit({
            id: randomUUID(),
            invocationId: invocation.id,
            eventType: 'invocation.queued',
            occurredAt: now,
          });
          invocations.push(invocation);
        }
      }

      try {
        await deps.eventBus.publishRoomEvent({
          type: 'message.created',
          roomId: input.roomId,
          threadId: input.threadId,
          message,
          occurredAt: now,
        });
      } catch (err) {
        await failInvocationsFrom(deps, invocations, 0, getErrorMessage(err));
        throw err;
      }

      if (roundContext) {
        try {
          await deps.eventBus.publishRoomEvent({
            type: 'round.created',
            roomId: input.roomId,
            threadId: input.threadId,
            round: roundContext.round,
            steps: roundContext.steps,
            occurredAt: Date.now(),
          });
        } catch (err) {
          await failInvocationsFrom(deps, invocations, 0, getErrorMessage(err));
          throw err;
        }
      }

      for (const [index, invocation] of invocations.entries()) {
        const job: AgentJob = {
          invocationId: invocation.id,
          roomId: input.roomId,
          threadId: input.threadId,
          sourceMessageId: message.id,
          agentId: invocation.agentId,
          prompt: input.body,
        };
        try {
          await deps.eventBus.publishRoomEvent({
            type: 'invocation.queued',
            roomId: input.roomId,
            threadId: input.threadId,
            invocation,
            occurredAt: Date.now(),
          });
        } catch (err) {
          await failInvocationsFrom(deps, invocations, index, getErrorMessage(err));
          throw err;
        }
        try {
          await deps.eventBus.enqueueAgentJob(job);
        } catch (err) {
          await failInvocationsFrom(deps, invocations, index, getErrorMessage(err));
          throw err;
        }
      }

      return { message, invocations };
    },

    async cancelInvocation(invocationId, reason) {
      const invocation = deps.repositories.getInvocation(invocationId);
      if (!invocation) {
        throw new Error(`Invocation not found: ${invocationId}`);
      }
      if (invocation.status !== 'canceled') {
        deps.repositories.updateInvocationStatus(invocation.id, 'canceled', reason);
        deps.repositories.appendInvocationAudit({
          id: randomUUID(),
          invocationId: invocation.id,
          eventType: 'invocation.canceled',
          occurredAt: Date.now(),
          ...(reason ? { reason } : {}),
        });
      }
      const canceled = { ...invocation, status: 'canceled' as const, error: reason, updatedAt: Date.now() };
      await deps.eventBus.publishRoomEvent({
        type: 'invocation.canceled',
        roomId: invocation.roomId,
        threadId: invocation.threadId,
        invocationId: invocation.id,
        agentId: invocation.agentId,
        ...(reason ? { reason } : {}),
        occurredAt: Date.now(),
      });
      return canceled;
    },

    async listMessages(threadId) {
      return deps.repositories.listMessages(threadId);
    },
  };
}
