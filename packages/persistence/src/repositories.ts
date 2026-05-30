import type Database from 'better-sqlite3';
import type { AgentSeat, InvocationRecord, MessageRecord, RuntimeKind } from '@multi-agent-assi/shared';

export interface PersistenceRepositories {
  ensureDefaultState(options?: { runtimeKind?: RuntimeKind }): void;
  appendMessage(message: MessageRecord, options?: { idempotencyKey?: string }): void;
  findMessageByIdempotencyKey(roomId: string, threadId: string, idempotencyKey: string): MessageRecord | null;
  listMessages(threadId: string): MessageRecord[];
  createInvocation(invocation: InvocationRecord): void;
  listInvocationsBySourceMessage(sourceMessageId: string): InvocationRecord[];
  updateInvocationStatus(id: string, status: InvocationRecord['status'], error?: string): void;
  getInvocation(id: string): InvocationRecord | null;
  listAgents(): AgentSeat[];
}

type MessageRow = {
  id: string;
  room_id: string;
  thread_id: string;
  kind: MessageRecord['kind'];
  sender_json: string;
  body: string;
  invocation_id: string | null;
  created_at: number;
};

type InvocationRow = {
  id: string;
  room_id: string;
  thread_id: string;
  source_message_id: string;
  agent_id: string;
  status: InvocationRecord['status'];
  error: string | null;
  created_at: number;
  updated_at: number;
};

function toMessageRecord(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    roomId: row.room_id,
    threadId: row.thread_id,
    kind: row.kind,
    sender: JSON.parse(row.sender_json) as MessageRecord['sender'],
    body: row.body,
    ...(row.invocation_id ? { invocationId: row.invocation_id } : {}),
    createdAt: row.created_at,
  };
}

function toInvocationRecord(row: InvocationRow): InvocationRecord {
  return {
    id: row.id,
    roomId: row.room_id,
    threadId: row.thread_id,
    sourceMessageId: row.source_message_id,
    agentId: row.agent_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.error ? { error: row.error } : {}),
  };
}

export function createRepositories(db: Database.Database): PersistenceRepositories {
  return {
    ensureDefaultState(options) {
      const now = Date.now();
      const runtimeKind = options?.runtimeKind ?? 'mock';
      db.prepare('insert or ignore into rooms (id, title, created_at) values (?, ?, ?)').run('default-room', 'Default Room', now);
      db.prepare('insert or ignore into threads (id, room_id, title, created_at) values (?, ?, ?, ?)').run('default-thread', 'default-room', 'Default Thread', now);
      const insertAgent = db.prepare('insert or replace into agents (id, display_name, role, runtime_json) values (?, ?, ?, ?)');
      insertAgent.run('architect', 'Architect', 'architect', JSON.stringify({ kind: runtimeKind, profile: 'architect' }));
      insertAgent.run('reviewer', 'Reviewer', 'reviewer', JSON.stringify({ kind: runtimeKind, profile: 'reviewer' }));
      insertAgent.run('implementer', 'Implementer', 'implementer', JSON.stringify({ kind: runtimeKind, profile: 'implementer' }));
    },

    appendMessage(message, options) {
      db.prepare(`
        insert into messages (id, room_id, thread_id, kind, sender_json, body, invocation_id, idempotency_key, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.id,
        message.roomId,
        message.threadId,
        message.kind,
        JSON.stringify(message.sender),
        message.body,
        message.invocationId ?? null,
        options?.idempotencyKey ?? null,
        message.createdAt,
      );
    },

    findMessageByIdempotencyKey(roomId, threadId, idempotencyKey) {
      const row = db
        .prepare('select * from messages where room_id = ? and thread_id = ? and idempotency_key = ?')
        .get(roomId, threadId, idempotencyKey) as MessageRow | undefined;
      return row ? toMessageRecord(row) : null;
    },

    listMessages(threadId) {
      return db
        .prepare('select * from messages where thread_id = ? order by created_at asc, rowid asc')
        .all(threadId)
        .map((row) => toMessageRecord(row as MessageRow));
    },

    createInvocation(invocation) {
      db.prepare(`
        insert into invocations (id, room_id, thread_id, source_message_id, agent_id, status, error, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        invocation.id,
        invocation.roomId,
        invocation.threadId,
        invocation.sourceMessageId,
        invocation.agentId,
        invocation.status,
        invocation.error ?? null,
        invocation.createdAt,
        invocation.updatedAt,
      );
    },

    listInvocationsBySourceMessage(sourceMessageId) {
      return db
        .prepare('select * from invocations where source_message_id = ? order by created_at asc, rowid asc')
        .all(sourceMessageId)
        .map((row) => toInvocationRecord(row as InvocationRow));
    },

    updateInvocationStatus(id, status, error) {
      const result = db.prepare('update invocations set status = ?, error = ?, updated_at = ? where id = ?').run(status, error ?? null, Date.now(), id);
      if (result.changes === 0) {
        throw new Error(`Invocation not found: ${id}`);
      }
    },

    getInvocation(id) {
      const row = db.prepare('select * from invocations where id = ?').get(id) as InvocationRow | undefined;
      if (!row) return null;
      return toInvocationRecord(row);
    },

    listAgents() {
      return db.prepare('select * from agents order by id asc').all().map((row) => {
        const r = row as { id: string; display_name: string; role: AgentSeat['role']; runtime_json: string };
        return { id: r.id, displayName: r.display_name, role: r.role, runtime: JSON.parse(r.runtime_json) as AgentSeat['runtime'] };
      });
    },
  };
}
