import { describe, expect, it } from 'vitest'
import { createRoomService } from '../../src/main/room-hub/roomService'

describe('controlled rounds', () => {
  it('allows only nominated agents to answer during a controlled round', () => {
    const room = createRoomService()
    room.seedAgents([
      { id: 'builder', status: 'idle' },
      { id: 'critic', status: 'idle' }
    ])

    room.startControlledRound({
      roundId: 'round-1',
      allowedAgentIds: ['critic'],
      replyBudget: 1
    })

    expect(room.canAgentReply('builder')).toBe(false)
    expect(room.canAgentReply('critic')).toBe(true)
  })

  it('ends the round when the reply budget is exhausted', () => {
    const room = createRoomService()
    room.seedAgents([{ id: 'critic', status: 'idle' }])

    room.startControlledRound({
      roundId: 'round-1',
      allowedAgentIds: ['critic'],
      replyBudget: 1
    })

    room.recordAgentReply('critic')

    expect(room.getSnapshot().mode).toBe('open')
  })

  it('marks the round as timed out when the orchestrator expires it', () => {
    const room = createRoomService()
    room.seedAgents([{ id: 'critic', status: 'idle' }])

    room.startControlledRound({
      roundId: 'round-1',
      allowedAgentIds: ['critic'],
      replyBudget: 1
    })

    room.markRoundTimedOut()

    expect(room.getSnapshot()).toMatchObject({
      mode: 'open',
      lastRoundResult: 'timed_out'
    })
  })
})
