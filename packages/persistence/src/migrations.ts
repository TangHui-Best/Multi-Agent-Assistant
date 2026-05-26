import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    create table if not exists rooms (
      id text primary key,
      title text not null,
      created_at integer not null
    );

    create table if not exists threads (
      id text primary key,
      room_id text not null,
      title text not null,
      created_at integer not null,
      unique (room_id, id),
      foreign key (room_id) references rooms(id)
    );

    create table if not exists agents (
      id text primary key,
      display_name text not null,
      role text not null check (role in ('architect', 'reviewer', 'implementer', 'custom')),
      runtime_json text not null
    );

    create table if not exists messages (
      id text primary key,
      room_id text not null,
      thread_id text not null,
      kind text not null check (kind in ('user_message', 'agent_message', 'system_event')),
      sender_json text not null,
      body text not null,
      invocation_id text,
      created_at integer not null,
      unique (room_id, thread_id, id),
      foreign key (room_id, thread_id) references threads(room_id, id),
      foreign key (room_id, thread_id, invocation_id) references invocations(room_id, thread_id, id)
    );

    create table if not exists invocations (
      id text primary key,
      room_id text not null,
      thread_id text not null,
      source_message_id text not null,
      agent_id text not null,
      status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
      error text,
      created_at integer not null,
      updated_at integer not null,
      unique (room_id, thread_id, id),
      foreign key (room_id, thread_id) references threads(room_id, id),
      foreign key (room_id, thread_id, source_message_id) references messages(room_id, thread_id, id),
      foreign key (agent_id) references agents(id)
    );
  `);
}
