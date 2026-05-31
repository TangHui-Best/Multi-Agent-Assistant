import { describe, expect, it } from 'vitest';
import type { InvocationRecord, MessageRecord, RoomEvent, RoundRecord, RoundStepRecord } from '@multi-agent-assi/shared';
import {
  deriveRoundStepStatus,
  findRoundStepInvocation,
  formatRecoveryMetadata,
  mergeInvocationEvent,
  mergeRoomEvent,
  mergeRoundEvent,
} from './App.js';

const message: MessageRecord = {
  id: 'msg-1',
  roomId: 'default-room',
  threadId: 'default-thread',
  kind: 'user_message',
  sender: { type: 'user', userId: 'local-user', source: 'web' },
  body: '@architect review boundary',
  createdAt: 1,
};

describe('mergeRoomEvent', () => {
  it('appends created and completed messages without duplicating existing records', () => {
    const created: RoomEvent = {
      type: 'message.created',
      roomId: 'default-room',
      threadId: 'default-thread',
      message,
      occurredAt: 1,
    };
    const completed: RoomEvent = {
      type: 'invocation.completed',
      roomId: 'default-room',
      threadId: 'default-thread',
      invocationId: 'inv-1',
      message: { ...message, id: 'msg-2', kind: 'agent_message', sender: { type: 'agent', agentId: 'architect' } },
      occurredAt: 2,
    };

    const first = mergeRoomEvent([], created);
    const duplicate = mergeRoomEvent(first, created);
    const final = mergeRoomEvent(duplicate, completed);

    expect(final.map((item) => item.id)).toEqual(['msg-1', 'msg-2']);
  });
});

describe('mergeInvocationEvent', () => {
  const invocation: InvocationRecord = {
    id: 'inv-1',
    roomId: 'default-room',
    threadId: 'default-thread',
    sourceMessageId: 'msg-1',
    agentId: 'architect',
    status: 'queued',
    createdAt: 1,
    updatedAt: 1,
  };

  it('adds queued invocations and updates later lifecycle events', () => {
    const queued: RoomEvent = {
      type: 'invocation.queued',
      roomId: 'default-room',
      threadId: 'default-thread',
      invocation,
      occurredAt: 1,
    };
    const running: RoomEvent = {
      type: 'invocation.running',
      roomId: 'default-room',
      threadId: 'default-thread',
      invocationId: 'inv-1',
      agentId: 'architect',
      occurredAt: 2,
    };
    const canceled: RoomEvent = {
      type: 'invocation.canceled',
      roomId: 'default-room',
      threadId: 'default-thread',
      invocationId: 'inv-1',
      agentId: 'architect',
      reason: 'user requested stop',
      occurredAt: 3,
    };

    const first = mergeInvocationEvent([], queued);
    const second = mergeInvocationEvent(first, running);
    const final = mergeInvocationEvent(second, canceled);

    expect(final).toEqual([
      expect.objectContaining({ id: 'inv-1', agentId: 'architect', status: 'canceled', error: 'user requested stop' }),
    ]);
  });
});

describe('mergeRoundEvent', () => {
  const round: RoundRecord = {
    id: 'round-1',
    roomId: 'default-room',
    threadId: 'default-thread',
    sourceMessageId: 'msg-1',
    workflow: 'design_review_execute',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
  };
  const steps: RoundStepRecord[] = [
    {
      id: 'step-1',
      roundId: 'round-1',
      stepIndex: 0,
      agentId: 'architect',
      status: 'queued',
      invocationId: 'inv-1',
      createdAt: 1,
      updatedAt: 1,
    },
  ];

  it('adds round.created events without duplicating rounds or steps', () => {
    const event: RoomEvent = { type: 'round.created', roomId: 'default-room', threadId: 'default-thread', round, steps, occurredAt: 1 };

    const first = mergeRoundEvent({ rounds: [], roundSteps: [] }, event);
    const duplicate = mergeRoundEvent(first, event);

    expect(duplicate.rounds.map((item) => item.id)).toEqual(['round-1']);
    expect(duplicate.roundSteps.map((item) => item.id)).toEqual(['step-1']);
  });
});

describe('deriveRoundStepStatus', () => {
  it('prefers linked invocation status over persisted step status', () => {
    const step: RoundStepRecord = {
      id: 'step-1',
      roundId: 'round-1',
      stepIndex: 0,
      agentId: 'architect',
      status: 'queued',
      invocationId: 'inv-1',
      createdAt: 1,
      updatedAt: 1,
    };
    const invocation: InvocationRecord = {
      id: 'inv-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'msg-1',
      agentId: 'architect',
      status: 'failed',
      error: 'adapter failed',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(deriveRoundStepStatus(step, [invocation])).toBe('failed');
  });

  it('uses invocation roundStepId when live steps do not have invocationId yet', () => {
    const step: RoundStepRecord = {
      id: 'step-1',
      roundId: 'round-1',
      stepIndex: 0,
      agentId: 'architect',
      status: 'pending',
      createdAt: 1,
      updatedAt: 1,
    };
    const invocation: InvocationRecord = {
      id: 'inv-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'msg-1',
      agentId: 'architect',
      status: 'running',
      roundStepId: 'step-1',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(deriveRoundStepStatus(step, [invocation])).toBe('running');
  });

  it('falls back to invocation roundStepId when step invocationId is not in the projection', () => {
    const step: RoundStepRecord = {
      id: 'step-1',
      roundId: 'round-1',
      stepIndex: 0,
      agentId: 'architect',
      status: 'queued',
      invocationId: 'missing-invocation',
      createdAt: 1,
      updatedAt: 1,
    };
    const invocation: InvocationRecord = {
      id: 'inv-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'msg-1',
      agentId: 'architect',
      status: 'succeeded',
      roundStepId: 'step-1',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(deriveRoundStepStatus(step, [invocation])).toBe('succeeded');
  });
});

describe('findRoundStepInvocation', () => {
  it('finds linked invocations through either step invocationId or invocation roundStepId', () => {
    const step: RoundStepRecord = {
      id: 'step-1',
      roundId: 'round-1',
      stepIndex: 0,
      agentId: 'architect',
      status: 'queued',
      invocationId: 'missing-invocation',
      createdAt: 1,
      updatedAt: 1,
    };
    const invocation: InvocationRecord = {
      id: 'inv-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'msg-1',
      agentId: 'architect',
      status: 'running',
      roundStepId: 'step-1',
      createdAt: 1,
      updatedAt: 2,
    };

    expect(findRoundStepInvocation(step, [invocation])?.id).toBe('inv-1');
  });
});

describe('formatRecoveryMetadata', () => {
  it('prints stable JSON for resume metadata and a clear empty state', () => {
    expect(formatRecoveryMetadata({ runtime: 'codex-cli', sessionId: 'codex-session-1' })).toBe(
      '{\n  "runtime": "codex-cli",\n  "sessionId": "codex-session-1"\n}',
    );
    expect(formatRecoveryMetadata(undefined)).toBe('No resume metadata captured');
  });
});
