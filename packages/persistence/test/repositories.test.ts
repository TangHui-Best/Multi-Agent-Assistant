import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../src/database.js';
import { runMigrations } from '../src/migrations.js';
import { createRepositories } from '../src/repositories.js';

describe('persistence repositories', () => {
  it('can seed default seats with a configured runtime binding', () => {
    const repositories = createRepositories(createDatabase(':memory:'));

    repositories.ensureDefaultState({ runtimeKind: 'codex-cli' });

    expect(repositories.listAgents().map((agent) => agent.runtime.kind)).toEqual(['codex-cli', 'codex-cli', 'codex-cli']);
  });

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

  it('lists invocations for a thread in creation order', () => {
    const repositories = createRepositories(createDatabase(':memory:'));
    repositories.ensureDefaultState();
    repositories.appendMessage({
      id: 'message-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      kind: 'user_message',
      sender: { type: 'user', userId: 'local-user', source: 'web' },
      body: 'Review the plan',
      createdAt: 1,
    });
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

    expect(repositories.listInvocationsByThread('default-thread').map((invocation) => invocation.id)).toEqual(['invocation-1']);
  });

  it('migrates legacy message tables before creating the idempotency index', () => {
    const db = new Database(':memory:');
    db.exec(`
      create table rooms (id text primary key, title text not null, created_at integer not null);
      create table threads (
        id text primary key,
        room_id text not null,
        title text not null,
        created_at integer not null,
        unique (room_id, id)
      );
      create table messages (
        id text primary key,
        room_id text not null,
        thread_id text not null,
        kind text not null check (kind in ('user_message', 'agent_message', 'system_event')),
        sender_json text not null,
        body text not null,
        invocation_id text,
        created_at integer not null,
        unique (room_id, thread_id, id)
      );
    `);

    expect(() => runMigrations(db)).not.toThrow();
    expect(db.prepare("select name from pragma_table_info('messages') where name = 'idempotency_key'").get()).toEqual({
      name: 'idempotency_key',
    });
  });

  it('stores rounds with ordered steps', () => {
    const repositories = createRepositories(createDatabase(':memory:'));
    repositories.ensureDefaultState();
    repositories.appendMessage({
      id: 'message-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      kind: 'user_message',
      sender: { type: 'user', userId: 'local-user', source: 'web' },
      body: 'Design review execute',
      createdAt: 1,
    });

    repositories.createRound({
      id: 'round-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'message-1',
      workflow: 'design_review_execute',
      status: 'running',
      createdAt: 2,
      updatedAt: 2,
    });
    repositories.createRoundSteps([
      {
        id: 'step-1',
        roundId: 'round-1',
        stepIndex: 0,
        agentId: 'architect',
        status: 'queued',
        createdAt: 2,
        updatedAt: 2,
      },
      {
        id: 'step-2',
        roundId: 'round-1',
        stepIndex: 1,
        agentId: 'reviewer',
        dependsOnStepId: 'step-1',
        status: 'pending',
        createdAt: 2,
        updatedAt: 2,
      },
    ]);

    expect(repositories.listRoundsByThread('default-thread').map((round) => round.id)).toEqual(['round-1']);
    expect(repositories.listRoundSteps('round-1').map((step) => [step.id, step.agentId, step.dependsOnStepId])).toEqual([
      ['step-1', 'architect', undefined],
      ['step-2', 'reviewer', 'step-1'],
    ]);
  });

  it('stores invocation recovery metadata and audit entries', () => {
    const repositories = createRepositories(createDatabase(':memory:'));
    repositories.ensureDefaultState();
    repositories.appendMessage({
      id: 'message-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      kind: 'user_message',
      sender: { type: 'user', userId: 'local-user', source: 'web' },
      body: 'Review the plan',
      createdAt: 1,
    });
    repositories.createInvocation({
      id: 'invocation-1',
      roomId: 'default-room',
      threadId: 'default-thread',
      sourceMessageId: 'message-1',
      agentId: 'architect',
      status: 'running',
      createdAt: 2,
      updatedAt: 2,
    });

    repositories.updateInvocationRecoveryMetadata('invocation-1', {
      runtimeSessionId: 'codex-session-1',
      resumeMetadata: { command: 'codex resume codex-session-1' },
    });
    repositories.appendInvocationAudit({
      id: 'audit-1',
      invocationId: 'invocation-1',
      eventType: 'runtime.session_captured',
      reason: 'codex session id observed',
      metadata: { runtimeSessionId: 'codex-session-1' },
      occurredAt: 3,
    });

    expect(repositories.getInvocation('invocation-1')).toMatchObject({
      runtimeSessionId: 'codex-session-1',
      resumeMetadata: { command: 'codex resume codex-session-1' },
    });
    expect(repositories.listInvocationAudit('invocation-1')).toEqual([
      expect.objectContaining({
        id: 'audit-1',
        eventType: 'runtime.session_captured',
        reason: 'codex session id observed',
        metadata: { runtimeSessionId: 'codex-session-1' },
      }),
    ]);
  });
});
