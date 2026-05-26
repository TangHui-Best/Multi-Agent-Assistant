import { randomUUID } from 'node:crypto';
import type { EventBus } from '@multi-agent-assi/event-bus';
import type { PersistenceRepositories } from '@multi-agent-assi/persistence';
import type { AgentId, AgentJob, InvocationRecord, MessageRecord, SubmitMessageInput } from '@multi-agent-assi/shared';

export interface RoomHub {
  submitMessage(input: SubmitMessageInput): Promise<{ message: MessageRecord; invocations: InvocationRecord[] }>;
  listMessages(threadId: string): Promise<MessageRecord[]>;
}

const BROADCAST_TARGETS: AgentId[] = ['architect', 'reviewer', 'implementer'];
const ORCHESTRATED_TARGETS: AgentId[] = ['architect', 'reviewer'];

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

  return ORCHESTRATED_TARGETS.filter((agentId) => knownAgentIds.has(agentId));
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

export function createRoomHub(deps: { repositories: PersistenceRepositories; eventBus: EventBus }): RoomHub {
  return {
    async submitMessage(input) {
      const now = Date.now();
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
      deps.repositories.appendMessage(message);

      const invocations: InvocationRecord[] = [];
      for (const agentId of targetAgentIds) {
        const invocation: InvocationRecord = {
          id: randomUUID(),
          roomId: input.roomId,
          threadId: input.threadId,
          sourceMessageId: message.id,
          agentId,
          status: 'queued',
          createdAt: now,
          updatedAt: now,
        };
        deps.repositories.createInvocation(invocation);
        invocations.push(invocation);
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
        markInvocationsFailed(deps.repositories, invocations, 0, getErrorMessage(err));
        throw err;
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
          await deps.eventBus.enqueueAgentJob(job);
        } catch (err) {
          markInvocationsFailed(deps.repositories, invocations, index, getErrorMessage(err));
          throw err;
        }
        try {
          await deps.eventBus.publishRoomEvent({
            type: 'invocation.queued',
            roomId: input.roomId,
            threadId: input.threadId,
            invocation,
            occurredAt: Date.now(),
          });
        } catch (err) {
          markInvocationsFailed(deps.repositories, invocations, index + 1, getErrorMessage(err));
          throw err;
        }
      }

      return { message, invocations };
    },

    async listMessages(threadId) {
      return deps.repositories.listMessages(threadId);
    },
  };
}
