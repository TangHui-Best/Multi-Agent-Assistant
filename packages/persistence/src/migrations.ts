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
      idempotency_key text,
      created_at integer not null,
      unique (room_id, thread_id, id),
      foreign key (room_id, thread_id) references threads(room_id, id),
      foreign key (room_id, thread_id, invocation_id) references invocations(room_id, thread_id, id)
    );

    create table if not exists rounds (
      id text primary key,
      room_id text not null,
      thread_id text not null,
      source_message_id text not null,
      workflow text not null check (workflow in ('design_review_execute')),
      status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
      error text,
      created_at integer not null,
      updated_at integer not null,
      unique (room_id, thread_id, id),
      foreign key (room_id, thread_id) references threads(room_id, id),
      foreign key (room_id, thread_id, source_message_id) references messages(room_id, thread_id, id)
    );

    create table if not exists round_steps (
      id text primary key,
      round_id text not null,
      step_index integer not null,
      agent_id text not null,
      status text not null check (status in ('pending', 'queued', 'running', 'succeeded', 'failed', 'canceled')),
      invocation_id text,
      depends_on_step_id text,
      error text,
      created_at integer not null,
      updated_at integer not null,
      unique (round_id, step_index),
      foreign key (round_id) references rounds(id),
      foreign key (agent_id) references agents(id)
    );

    create table if not exists invocations (
      id text primary key,
      room_id text not null,
      thread_id text not null,
      source_message_id text not null,
      agent_id text not null,
      status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
      error text,
      round_id text,
      round_step_id text,
      created_at integer not null,
      updated_at integer not null,
      unique (room_id, thread_id, id),
      foreign key (room_id, thread_id) references threads(room_id, id),
      foreign key (room_id, thread_id, source_message_id) references messages(room_id, thread_id, id),
      foreign key (agent_id) references agents(id)
    );

  `);

  const messageColumns = db.prepare('pragma table_info(messages)').all() as Array<{ name: string }>;
  if (!messageColumns.some((column) => column.name === 'idempotency_key')) {
    db.prepare('alter table messages add column idempotency_key text').run();
  }

  const invocationColumns = db.prepare('pragma table_info(invocations)').all() as Array<{ name: string }>;
  if (!invocationColumns.some((column) => column.name === 'round_id')) {
    db.prepare('alter table invocations add column round_id text').run();
  }
  if (!invocationColumns.some((column) => column.name === 'round_step_id')) {
    db.prepare('alter table invocations add column round_step_id text').run();
  }

  db.exec(`
    create unique index if not exists idx_messages_idempotency
      on messages(room_id, thread_id, idempotency_key)
      where idempotency_key is not null;
  `);
}
