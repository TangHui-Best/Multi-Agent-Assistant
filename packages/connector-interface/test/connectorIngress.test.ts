import { describe, expect, it, vi } from 'vitest';
import type { InvocationRecord, MessageRecord } from '@multi-agent-assi/shared';
import { createConnectorIngress } from '../src/connectorIngress.js';

describe('connector ingress', () => {
  it('submits remote-origin messages only through Room Hub', async () => {
    const message: MessageRecord = {
      id: 'message-1',
      roomId: 'default-room',
      threadId: 'thread-1',
      kind: 'user_message',
      sender: { type: 'user', userId: 'connector:mobile:user-1', source: 'connector' },
      body: '@architect review this',
      createdAt: 1,
    };
    const invocation: InvocationRecord = {
      id: 'invocation-1',
      roomId: 'default-room',
      threadId: 'thread-1',
      sourceMessageId: 'message-1',
      agentId: 'architect',
      status: 'queued',
      createdAt: 1,
      updatedAt: 1,
    };
    const roomHub = {
      submitMessage: vi.fn(async () => ({ message, invocations: [invocation] })),
    };
    const ingress = createConnectorIngress({ roomHub });

    const result = await ingress.submit({
      connectorId: 'mobile',
      externalUserId: 'user-1',
      roomId: 'default-room',
      threadId: 'thread-1',
      body: '@architect review this',
      target: { mode: 'mention', agentIds: ['architect'] },
      idempotencyKey: 'mobile-msg-1',
    });

    expect(roomHub.submitMessage).toHaveBeenCalledWith({
      roomId: 'default-room',
      threadId: 'thread-1',
      userId: 'connector:mobile:user-1',
      source: 'connector',
      body: '@architect review this',
      target: { mode: 'mention', agentIds: ['architect'] },
      idempotencyKey: 'mobile-msg-1',
    });
    expect(result.invocations).toEqual([invocation]);
  });
});
