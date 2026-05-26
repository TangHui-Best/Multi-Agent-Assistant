import type Database from 'better-sqlite3';
import type { AgentSeat, InvocationRecord, MessageRecord } from '@multi-agent-assi/shared';

export interface PersistenceRepositories {
  ensureDefaultState(): void;
  appendMessage(message: MessageRecord): void;
  listMessages(threadId: string): MessageRecord[];
  createInvocation(invocation: InvocationRecord): void;
  updateInvocationStatus(id: string, status: InvocationRecord['status'], error?: string): void;
  getInvocation(id: string): InvocationRecord | null;
  listAgents(): AgentSeat[];
}

export function createRepositories(db: Database.Database): PersistenceRepositories {
  return {
    ensureDefaultState() {
      const now = Date.now();
      db.prepare('insert or ignore into rooms (id, title, created_at) values (?, ?, ?)').run('default-room', 'Default Room', now);
      db.prepare('insert or ignore into threads (id, room_id, title, created_at) values (?, ?, ?, ?)').run('default-thread', 'default-room', 'Default Thread', now);
      const insertAgent = db.prepare('insert or replace into agents (id, display_name, role, runtime_json) values (?, ?, ?, ?)');
      insertAgent.run('architect', 'Architect', 'architect', JSON.stringify({ kind: 'mock', profile: 'architect' }));
      insertAgent.run('reviewer', 'Reviewer', 'reviewer', JSON.stringify({ kind: 'mock', profile: 'reviewer' }));
      insertAgent.run('implementer', 'Implementer', 'implementer', JSON.stringify({ kind: 'mock', profile: 'implementer' }));
    },

    appendMessage(message) {
      db.prepare(`
        insert into messages (id, room_id, thread_id, kind, sender_json, body, invocation_id, created_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        message.id,
        message.roomId,
        message.threadId,
        message.kind,
        JSON.stringify(message.sender),
        message.body,
        message.invocationId ?? null,
        message.createdAt,
      );
    },

    listMessages(threadId) {
      return db.prepare('select * from messages where thread_id = ? order by created_at asc, rowid asc').all(threadId).map((row) => {
        const r = row as {
          id: string;
          room_id: string;
          thread_id: string;
          kind: MessageRecord['kind'];
          sender_json: string;
          body: string;
          invocation_id: string | null;
          created_at: number;
        };
        return {
          id: r.id,
          roomId: r.room_id,
          threadId: r.thread_id,
          kind: r.kind,
          sender: JSON.parse(r.sender_json) as MessageRecord['sender'],
          body: r.body,
          ...(r.invocation_id ? { invocationId: r.invocation_id } : {}),
          createdAt: r.created_at,
        };
      });
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

    updateInvocationStatus(id, status, error) {
      const result = db.prepare('update invocations set status = ?, error = ?, updated_at = ? where id = ?').run(status, error ?? null, Date.now(), id);
      if (result.changes === 0) {
        throw new Error(`Invocation not found: ${id}`);
      }
    },

    getInvocation(id) {
      const row = db.prepare('select * from invocations where id = ?').get(id) as
        | {
            id: string;
            room_id: string;
            thread_id: string;
            source_message_id: string;
            agent_id: string;
            status: InvocationRecord['status'];
            error: string | null;
            created_at: number;
            updated_at: number;
          }
        | undefined;
      if (!row) return null;
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
    },

    listAgents() {
      return db.prepare('select * from agents order by id asc').all().map((row) => {
        const r = row as { id: string; display_name: string; role: AgentSeat['role']; runtime_json: string };
        return { id: r.id, displayName: r.display_name, role: r.role, runtime: JSON.parse(r.runtime_json) as AgentSeat['runtime'] };
      });
    },
  };
}
