import { describe, expect, it } from 'vitest'
import { createDatabase } from '../../src/main/persistence/database'
import { createRoomRepository } from '../../src/main/persistence/roomRepository'

describe('roomRepository', () => {
  it('persists a room snapshot and reloads it', () => {
    const db = createDatabase(':memory:')
    const repo = createRoomRepository(db)

    repo.saveSnapshot({
      roomId: 'room-1',
      title: 'Design Review',
      mode: 'controlled',
      agentIds: ['builder', 'critic']
    })

    expect(repo.getSnapshot('room-1')).toEqual({
      roomId: 'room-1',
      title: 'Design Review',
      mode: 'controlled',
      agentIds: ['builder', 'critic']
    })
  })
})
