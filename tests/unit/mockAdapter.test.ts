import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '../../src/main/adapters/mockAdapter'
import { createRoomService } from '../../src/main/room-hub/roomService'

describe('mock adapter', () => {
  it('publishes a synthetic agent reply back into the room', async () => {
    const room = createRoomService()
    const adapter = createMockAdapter({ agentId: 'critic' })

    room.registerAdapter(adapter)

    const reply = await room.dispatchToAgent('critic', 'stress test this plan')

    expect(reply.senderId).toBe('critic')
    expect(reply.body).toContain('stress test this plan')
  })
})
