import type { AgentParticipant, IncomingUserMessage, RoomMode } from '../../shared/protocol'

interface RoomState {
  mode: RoomMode
  agents: AgentParticipant[]
}

export function createRoomService() {
  const state: RoomState = {
    mode: 'open',
    agents: []
  }

  return {
    seedAgents(agents: AgentParticipant[]) {
      state.agents = agents
    },
    acceptUserMessage(message: IncomingUserMessage) {
      const recipientIds =
        message.target.mode === 'broadcast'
          ? state.agents.filter((agent) => agent.status !== 'offline').map((agent) => agent.id)
          : message.target.agentIds

      return {
        roomId: message.roomId,
        messageBody: message.body,
        recipientIds
      }
    }
  }
}
