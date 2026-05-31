import { describe, expect, it } from 'vitest';
import type { InvocationRecord, MessageRecord, RoomEvent } from '@multi-agent-assi/shared';
import { mergeInvocationEvent, mergeRoomEvent } from './App.js';

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
