import { describe, expect, it } from 'vitest';
import type { AgentSeat, RuntimeBinding, SubmitMessageInput } from './protocol.js';
import { submitMessageSchema } from './schemas.js';

describe('shared protocol', () => {
  it('models default seats with mock runtime bindings', () => {
    const binding: RuntimeBinding = { kind: 'mock', profile: 'architect' };
    const seat: AgentSeat = {
      id: 'architect',
      displayName: 'Architect',
      role: 'architect',
      runtime: binding,
    };

    expect(seat.runtime.kind).toBe('mock');
  });

  it('accepts abstract connector sources and rejects concrete remote entry names', () => {
    const input: SubmitMessageInput = {
      roomId: 'default-room',
      threadId: 'default-thread',
      userId: 'local-user',
      source: 'connector',
      body: '@architect review boundary',
      target: { mode: 'mention', agentIds: ['architect'] },
      idempotencyKey: 'idem-123456',
    };

    expect(submitMessageSchema.safeParse(input).success).toBe(true);
    expect(submitMessageSchema.safeParse({ ...input, source: 'feishu' }).success).toBe(false);
  });
});
