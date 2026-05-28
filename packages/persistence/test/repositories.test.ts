import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src/database.js';
import { createRepositories } from '../src/repositories.js';

describe('persistence repositories', () => {
  it('stores idempotency keys with durable messages and returns matching invocations', () => {
    const repositories = createRepositories(createDatabase(':memory:'));
    repositories.ensureDefaultState();

    repositories.appendMessage(
      {
        id: 'message-1',
        roomId: 'default-room',
        threadId: 'default-thread',
        kind: 'user_message',
        sender: { type: 'user', userId: 'local-user', source: 'web' },
        body: 'Review the plan',
        createdAt: 1,
      },
      { idempotencyKey: 'idem-123456' },
    );
    repositories.createInvocation({
      id: 'invocation-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'message-1',
      agentId: 'architect',
      status: 'queued',
      createdAt: 2,
      updatedAt: 2,
    });

    const message = repositories.findMessageByIdempotencyKey('default-room', 'default-thread', 'idem-123456');
    const invocations = repositories.listInvocationsBySourceMessage('message-1');

    expect(message?.id).toBe('message-1');
    expect(invocations.map((invocation) => invocation.id)).toEqual(['invocation-1']);
  });
});
