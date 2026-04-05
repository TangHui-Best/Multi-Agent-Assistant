import type { AgentParticipant, IncomingUserMessage, RoomMode } from '../../shared/protocol'
import type { RoomAdapter } from '../adapters/types'
import { canReply, type ControlledRound } from './orchestrator'

interface RoomState {
  mode: RoomMode
  agents: AgentParticipant[]
}

export function createRoomService() {
  const state: RoomState = {
    mode: 'open',
    agents: []
  }
  const adapters = new Map<string, RoomAdapter>()
  let controlledRound: ControlledRound | null = null
  let lastRoundResult: 'completed' | 'timed_out' | null = null

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
    },
    startControlledRound(input: Omit<ControlledRound, 'repliesUsed'>) {
      lastRoundResult = null
      controlledRound = { ...input, repliesUsed: 0 }
    },
    canAgentReply(agentId: string) {
      return canReply(controlledRound, agentId)
    },
    recordAgentReply(agentId: string) {
      if (!controlledRound || !canReply(controlledRound, agentId)) {
        return
      }

      controlledRound.repliesUsed += 1

      if (controlledRound.repliesUsed >= controlledRound.replyBudget) {
        lastRoundResult = 'completed'
        controlledRound = null
      }
    },
    markRoundTimedOut() {
      if (!controlledRound) {
        return
      }

      lastRoundResult = 'timed_out'
      controlledRound = null
    },
    registerAdapter(adapter: RoomAdapter) {
      adapters.set(adapter.agentId, adapter)
    },
    async dispatchToAgent(agentId: string, message: string) {
      const adapter = adapters.get(agentId)

      if (!adapter) {
        throw new Error(`Missing adapter for ${agentId}`)
      }

      return adapter.send(message)
    },
    getSnapshot() {
      return {
        mode: controlledRound ? 'controlled' : 'open' as RoomMode,
        agents: state.agents,
        lastRoundResult
      }
    }
  }
}
