import { describe, expect, it } from 'vitest'
import { createRoomService } from '../../src/main/room-hub/roomService'

describe('roomService', () => {
  it('broadcasts a user message to every active agent in open mode', () => {
    const room = createRoomService()
    room.seedAgents([
      { id: 'builder', status: 'idle' },
      { id: 'critic', status: 'idle' }
    ])

    const delivery = room.acceptUserMessage({
      roomId: 'room-1',
      senderId: 'user',
      body: 'review this design',
      target: { mode: 'broadcast' }
    })

    expect(delivery.recipientIds).toEqual(['builder', 'critic'])
  })

  it('routes a mention only to the selected agent', () => {
    const room = createRoomService()
    room.seedAgents([
      { id: 'builder', status: 'idle' },
      { id: 'critic', status: 'idle' }
    ])

    const delivery = room.acceptUserMessage({
      roomId: 'room-1',
      senderId: 'user',
      body: '@critic pressure test this',
      target: { mode: 'mention', agentIds: ['critic'] }
    })

    expect(delivery.recipientIds).toEqual(['critic'])
  })
})
