import type { DatabaseSync } from 'node:sqlite'

export function createRoomRepository(db: DatabaseSync) {
  return {
    saveSnapshot(snapshot: { roomId: string; title: string; mode: string; agentIds: string[] }) {
      db.prepare('insert or replace into rooms (room_id, title, mode) values (?, ?, ?)')
        .run(snapshot.roomId, snapshot.title, snapshot.mode)

      db.prepare('delete from room_agents where room_id = ?').run(snapshot.roomId)

      const insertAgent = db.prepare('insert into room_agents (room_id, agent_id) values (?, ?)')

      for (const agentId of snapshot.agentIds) {
        insertAgent.run(snapshot.roomId, agentId)
      }
    },
    getSnapshot(roomId: string) {
      const room = db
        .prepare('select room_id, title, mode from rooms where room_id = ?')
        .get(roomId) as { room_id: string; title: string; mode: string } | undefined

      if (!room) {
        return null
      }

      const agentIds = db
        .prepare('select agent_id from room_agents where room_id = ? order by agent_id')
        .all(roomId)
        .map((row: { agent_id: string }) => row.agent_id)

      return {
        roomId: room.room_id,
        title: room.title,
        mode: room.mode,
        agentIds
      }
    }
  }
}
