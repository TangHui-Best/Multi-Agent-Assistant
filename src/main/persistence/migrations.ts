import type { DatabaseSync } from 'node:sqlite'

export function runMigrations(db: DatabaseSync) {
  db.exec(`
    create table if not exists rooms (
      room_id text primary key,
      title text not null,
      mode text not null
    );

    create table if not exists room_agents (
      room_id text not null,
      agent_id text not null,
      primary key (room_id, agent_id)
    );
  `)
}
