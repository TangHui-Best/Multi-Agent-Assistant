import { randomUUID } from 'node:crypto';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentId, AgentJob, InvocationRecord, MessageRecord, RoundRecord, RoundStepRecord, SubmitMessageInput } from '@multi-agent-assi/shared';
import {
  buildArchitectPrompt,
  buildImplementerPrompt,
  buildReviewerPrompt,
  DESIGN_REVIEW_EXECUTE_STEP_AGENT_IDS,
  parseReviewerVerdict,
} from './orchestrationPolicy.js';

export interface RoomHub {
  submitMessage(input: SubmitMessageInput): Promise<{ message: MessageRecord; invocations: InvocationRecord[] }>;
  cancelInvocation(invocationId: string, reason?: string): Promise<InvocationRecord>;
  continueRoundAfterInvocation(invocationId: string): Promise<InvocationRecord | null>;
  settleRoundAfterInvocation(invocationId: string, status: 'failed' | 'canceled', reason?: string): Promise<void>;
  recoverThreadContinuity(threadId: string): Promise<{ requeued: string[]; failed: string[]; continued: string[]; settled: string[] }>;
  listMessages(threadId: string): Promise<MessageRecord[]>;
}

const BROADCAST_TARGETS: AgentId[] = ['architect', 'reviewer', 'implementer'];
const DESIGN_REVIEW_EXECUTE_STEPS: AgentId[] = [...DESIGN_REVIEW_EXECUTE_STEP_AGENT_IDS];

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

async function publishAndEnqueueInvocation(deps: { eventBus: EventBus }, invocation: InvocationRecord, prompt: string): Promise<void> {
  await deps.eventBus.publishRoomEvent({
    type: 'invocation.queued',
    roomId: invocation.roomId,
    threadId: invocation.threadId,
    invocation,
    occurredAt: Date.now(),
  });
  await deps.eventBus.enqueueAgentJob({
    invocationId: invocation.id,
    roomId: invocation.roomId,
    threadId: invocation.threadId,
    sourceMessageId: invocation.sourceMessageId,
    agentId: invocation.agentId,
    prompt,
  });
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

function findInvocationMessage(messages: MessageRecord[], invocationId: string): MessageRecord | undefined {
  return messages.find((message) => message.invocationId === invocationId);
}

function findStepInvocation(invocations: InvocationRecord[], stepId: string): InvocationRecord | undefined {
  return invocations.find((invocation) => invocation.roundStepId === stepId);
}

function getDependentSteps(steps: RoundStepRecord[], currentStep: RoundStepRecord): RoundStepRecord[] {
  return steps.filter((step) => step.stepIndex > currentStep.stepIndex && (step.status === 'pending' || step.status === 'queued'));
}

function isTerminalRoundStatus(status: RoundRecord['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function isTerminalStepStatus(status: RoundStepRecord['status']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function appendRecoveryAudit(
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
  function reconstructPrompt(invocation: InvocationRecord, messages: MessageRecord[], invocations: InvocationRecord[]): string | null {
    const sourceMessage = messages.find((message) => message.id === invocation.sourceMessageId);
    if (!sourceMessage) return null;
    if (!invocation.roundId || !invocation.roundStepId) {
      return sourceMessage.body;
    }

    const steps = deps.repositories.listRoundSteps(invocation.roundId);
    const step = steps.find((candidate) => candidate.id === invocation.roundStepId);
    if (!step) return null;
    if (step.agentId === 'architect') {
      return buildArchitectPrompt(sourceMessage);
    }

    const architectInvocation = findStepInvocation(invocations, steps[0].id);
    const architectMessage = architectInvocation ? findInvocationMessage(messages, architectInvocation.id) : undefined;
    if (step.agentId === 'reviewer') {
      return buildReviewerPrompt({ sourceMessage, architectMessage });
    }

    const reviewerStep = steps.find((candidate) => candidate.agentId === 'reviewer');
    const reviewerInvocation = reviewerStep ? findStepInvocation(invocations, reviewerStep.id) : undefined;
    const reviewerMessage = reviewerInvocation ? findInvocationMessage(messages, reviewerInvocation.id) : undefined;
    if (!reviewerMessage) return null;
    return buildImplementerPrompt({ sourceMessage, architectMessage, reviewerMessage });
  }

  async function publishRoundUpdated(input: {
    roundId: string;
    threadId: string;
    status?: RoundRecord['status'];
    error?: string;
    stepUpdates?: Record<string, Partial<Pick<RoundStepRecord, 'status' | 'error' | 'invocationId' | 'updatedAt'>>>;
  }): Promise<void> {
    const round = deps.repositories.listRoundsByThread(input.threadId).find((candidate) => candidate.id === input.roundId);
    if (!round) return;
    const occurredAt = Date.now();
    const stepUpdates = input.stepUpdates ?? {};
    const steps = deps.repositories.listRoundSteps(input.roundId).map((step) => ({
      ...step,
      ...stepUpdates[step.id],
      updatedAt: stepUpdates[step.id]?.updatedAt ?? step.updatedAt,
    }));
    try {
      await deps.eventBus.publishRoomEvent({
        type: 'round.updated',
        roomId: round.roomId,
        threadId: round.threadId,
        round: {
          ...round,
          ...(input.status ? { status: input.status } : {}),
          ...(input.error ? { error: input.error } : {}),
          updatedAt: occurredAt,
        },
        steps,
        occurredAt,
      });
    } catch {
      // Persistence remains the source of truth; clients can recover updated round state from bootstrap.
    }
  }

  async function settleRoundAfterInvocation(invocationId: string, status: 'failed' | 'canceled', reason?: string): Promise<void> {
    const invocation = deps.repositories.getInvocation(invocationId);
    if (!invocation?.roundId || !invocation.roundStepId) {
      return;
    }

    const round = deps.repositories.listRoundsByThread(invocation.threadId).find((candidate) => candidate.id === invocation.roundId);
    if (!round || isTerminalRoundStatus(round.status)) {
      return;
    }

    const steps = deps.repositories.listRoundSteps(invocation.roundId);
    const currentStep = steps.find((step) => step.id === invocation.roundStepId);
    if (!currentStep) {
      throw new Error(`Round step not found for invocation: ${invocationId}`);
    }
    if (isTerminalStepStatus(currentStep.status)) {
      return;
    }

    const terminalReason = reason ?? (status === 'failed' ? 'Invocation failed' : 'Invocation canceled');
    deps.repositories.updateRoundStepStatus(currentStep.id, status, { invocationId, error: terminalReason });
    const stepUpdates: Record<string, Partial<Pick<RoundStepRecord, 'status' | 'error' | 'invocationId' | 'updatedAt'>>> = {
      [currentStep.id]: { status, invocationId, error: terminalReason, updatedAt: Date.now() },
    };
    for (const step of getDependentSteps(steps, currentStep)) {
      const error = `Blocked by ${status} ${currentStep.agentId} step`;
      deps.repositories.updateRoundStepStatus(step.id, 'canceled', { error });
      stepUpdates[step.id] = { status: 'canceled', error, updatedAt: Date.now() };
    }
    deps.repositories.updateRoundStatus(invocation.roundId, status, terminalReason);
    await publishRoundUpdated({ roundId: invocation.roundId, threadId: invocation.threadId, status, error: terminalReason, stepUpdates });
  }

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
          await deps.eventBus.enqueueAgentJob({
            invocationId: invocation.id,
            roomId: input.roomId,
            threadId: input.threadId,
            sourceMessageId: message.id,
            agentId: invocation.agentId,
            prompt: input.target.mode === 'orchestrated' ? buildArchitectPrompt(message) : input.body,
          });
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
      if (invocation.status === 'succeeded' || invocation.status === 'failed') {
        return invocation;
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
      await settleRoundAfterInvocation(invocation.id, 'canceled', reason);
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

    settleRoundAfterInvocation,

    async recoverThreadContinuity(threadId) {
      const result = { requeued: [] as string[], failed: [] as string[], continued: [] as string[], settled: [] as string[] };
      const messages = deps.repositories.listMessages(threadId);
      const invocations = deps.repositories.listInvocationsByThread(threadId);
      const rounds = deps.repositories.listRoundsByThread(threadId);
      const nonTerminalRoundIds = new Set(rounds.filter((round) => !isTerminalRoundStatus(round.status)).map((round) => round.id));

      for (const invocation of invocations) {
        if (invocation.status === 'queued') {
          const prompt = reconstructPrompt(invocation, messages, invocations);
          if (!prompt) {
            const error = 'Unable to reconstruct prompt during startup recovery';
            deps.repositories.updateInvocationStatus(invocation.id, 'failed', error);
            appendRecoveryAudit(deps.repositories, invocation.id, 'recovery.prompt_reconstruction_failed', { reason: error });
            await publishInvocationFailed(deps, invocation, error);
            result.failed.push(invocation.id);
            continue;
          }
          appendRecoveryAudit(deps.repositories, invocation.id, 'recovery.requeued', { metadata: { threadId } });
          await publishAndEnqueueInvocation(deps, invocation, prompt);
          result.requeued.push(invocation.id);
          continue;
        }

        if (invocation.status === 'running') {
          const error = 'Recovered stale running invocation after host restart';
          deps.repositories.updateInvocationStatus(invocation.id, 'failed', error);
          appendRecoveryAudit(deps.repositories, invocation.id, 'recovery.stale_running_failed', { reason: error });
          await deps.eventBus.publishRoomEvent({
            type: 'invocation.failed',
            roomId: invocation.roomId,
            threadId: invocation.threadId,
            invocationId: invocation.id,
            agentId: invocation.agentId,
            error,
            occurredAt: Date.now(),
          });
          await settleRoundAfterInvocation(invocation.id, 'failed', error);
          result.failed.push(invocation.id);
          continue;
        }

        if (invocation.roundId && nonTerminalRoundIds.has(invocation.roundId) && invocation.status === 'succeeded') {
          const nextInvocation = await this.continueRoundAfterInvocation(invocation.id);
          if (nextInvocation) {
            result.continued.push(invocation.id);
          } else {
            const latestRound = deps.repositories.listRoundsByThread(threadId).find((round) => round.id === invocation.roundId);
            if (latestRound?.status === 'succeeded') {
              result.continued.push(invocation.id);
            }
          }
          continue;
        }

        if (invocation.roundId && nonTerminalRoundIds.has(invocation.roundId) && (invocation.status === 'failed' || invocation.status === 'canceled')) {
          const beforeRound = deps.repositories.listRoundsByThread(threadId).find((round) => round.id === invocation.roundId);
          const beforeRoundSnapshot = beforeRound ? { status: beforeRound.status, error: beforeRound.error } : undefined;
          await settleRoundAfterInvocation(invocation.id, invocation.status, invocation.error);
          const afterRound = deps.repositories.listRoundsByThread(threadId).find((round) => round.id === invocation.roundId);
          if (beforeRoundSnapshot?.status !== afterRound?.status || beforeRoundSnapshot?.error !== afterRound?.error) {
            result.settled.push(invocation.id);
          }
        }
      }

      return result;
    },

    async continueRoundAfterInvocation(invocationId) {
      const completedInvocation = deps.repositories.getInvocation(invocationId);
      if (!completedInvocation?.roundId || !completedInvocation.roundStepId) {
        return null;
      }
      if (completedInvocation.status !== 'succeeded') {
        return null;
      }

      const round = deps.repositories.listRoundsByThread(completedInvocation.threadId).find((candidate) => candidate.id === completedInvocation.roundId);
      if (!round || isTerminalRoundStatus(round.status)) {
        return null;
      }

      const steps = deps.repositories.listRoundSteps(completedInvocation.roundId);
      const currentStep = steps.find((step) => step.id === completedInvocation.roundStepId);
      if (!currentStep) {
        throw new Error(`Round step not found for invocation: ${invocationId}`);
      }
      if (isTerminalStepStatus(currentStep.status)) {
        return null;
      }
      deps.repositories.updateRoundStepStatus(currentStep.id, 'succeeded', { invocationId: completedInvocation.id });

      const dependentStep = steps.find((step) => step.dependsOnStepId === currentStep.id);
      if (!dependentStep) {
        deps.repositories.updateRoundStatus(completedInvocation.roundId, 'succeeded');
        await publishRoundUpdated({
          roundId: completedInvocation.roundId,
          threadId: completedInvocation.threadId,
          status: 'succeeded',
          stepUpdates: {
            [currentStep.id]: { status: 'succeeded', invocationId: completedInvocation.id, updatedAt: Date.now() },
          },
        });
        return null;
      }
      if (dependentStep.status !== 'pending') {
        return null;
      }
      const nextStep = dependentStep;

      const threadMessages = deps.repositories.listMessages(completedInvocation.threadId);
      const sourceMessage = threadMessages.find((message) => message.id === completedInvocation.sourceMessageId);
      if (!sourceMessage) {
        throw new Error(`Source message not found: ${completedInvocation.sourceMessageId}`);
      }
      const currentMessage = findInvocationMessage(threadMessages, completedInvocation.id);
      const roundInvocations = deps.repositories.listInvocationsBySourceMessage(sourceMessage.id);
      const architectInvocation = findStepInvocation(roundInvocations, steps[0].id);
      const architectMessage = architectInvocation ? findInvocationMessage(threadMessages, architectInvocation.id) : undefined;
      const prompt = nextStep.agentId === 'reviewer'
        ? buildReviewerPrompt({ sourceMessage, architectMessage: currentMessage })
        : buildImplementerPrompt({ sourceMessage, architectMessage, reviewerMessage: currentMessage ?? sourceMessage });

      if (currentStep.agentId === 'reviewer') {
        const verdict = currentMessage ? parseReviewerVerdict(currentMessage.body) : null;
        if (verdict !== 'approved') {
          const error = `Reviewer gate stopped round: ${verdict ?? 'missing verdict'}`;
          deps.repositories.updateRoundStepStatus(nextStep.id, 'canceled', { error });
          deps.repositories.updateRoundStatus(completedInvocation.roundId, 'failed', error);
          await publishRoundUpdated({
            roundId: completedInvocation.roundId,
            threadId: completedInvocation.threadId,
            status: 'failed',
            error,
            stepUpdates: {
              [currentStep.id]: { status: 'succeeded', invocationId: completedInvocation.id, updatedAt: Date.now() },
              [nextStep.id]: { status: 'canceled', error, updatedAt: Date.now() },
            },
          });
          return null;
        }
      }
      const nextInvocation = createInvocation({
        message: sourceMessage,
        agentId: nextStep.agentId,
        now: Date.now(),
        roundId: completedInvocation.roundId,
        roundStepId: nextStep.id,
      });
      deps.repositories.createInvocation(nextInvocation);
      deps.repositories.appendInvocationAudit({
        id: randomUUID(),
        invocationId: nextInvocation.id,
        eventType: 'invocation.queued',
        occurredAt: Date.now(),
        metadata: { roundId: completedInvocation.roundId, roundStepId: nextStep.id },
      });
      deps.repositories.updateRoundStepStatus(nextStep.id, 'queued', { invocationId: nextInvocation.id });
      try {
        await publishAndEnqueueInvocation(deps, nextInvocation, prompt);
        await publishRoundUpdated({
          roundId: completedInvocation.roundId,
          threadId: completedInvocation.threadId,
          status: 'running',
          stepUpdates: {
            [currentStep.id]: { status: 'succeeded', invocationId: completedInvocation.id, updatedAt: Date.now() },
            [nextStep.id]: { status: 'queued', invocationId: nextInvocation.id, updatedAt: Date.now() },
          },
        });
      } catch (err) {
        const error = getErrorMessage(err);
        await publishInvocationFailed(deps, nextInvocation, error);
        deps.repositories.updateRoundStepStatus(nextStep.id, 'failed', { invocationId: nextInvocation.id, error });
        const stepUpdates: Record<string, Partial<Pick<RoundStepRecord, 'status' | 'error' | 'invocationId' | 'updatedAt'>>> = {
          [currentStep.id]: { status: 'succeeded', invocationId: completedInvocation.id, updatedAt: Date.now() },
          [nextStep.id]: { status: 'failed', invocationId: nextInvocation.id, error, updatedAt: Date.now() },
        };
        for (const step of getDependentSteps(steps, nextStep)) {
          const dependentError = `Blocked by failed ${nextStep.agentId} step`;
          deps.repositories.updateRoundStepStatus(step.id, 'canceled', { error: dependentError });
          stepUpdates[step.id] = { status: 'canceled', error: dependentError, updatedAt: Date.now() };
        }
        deps.repositories.updateRoundStatus(completedInvocation.roundId, 'failed', error);
        await publishRoundUpdated({ roundId: completedInvocation.roundId, threadId: completedInvocation.threadId, status: 'failed', error, stepUpdates });
        throw err;
      }
      return nextInvocation;
    },

    async listMessages(threadId) {
      return deps.repositories.listMessages(threadId);
    },
  };
}
