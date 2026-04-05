import type { RoomAdapter } from './types'

export function createMockAdapter(input: { agentId: string }): RoomAdapter {
  return {
    agentId: input.agentId,
    async send(message: string) {
      return {
        senderId: input.agentId,
        body: `[mock:${input.agentId}] ${message}`
      }
    }
  }
}

