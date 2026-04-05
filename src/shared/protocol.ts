export type AgentStatus = 'starting' | 'idle' | 'thinking' | 'replying' | 'errored' | 'offline'
export type RoomMode = 'open' | 'controlled'
export type MessageKind = 'user_message' | 'agent_message' | 'system_event' | 'control_command'

export type Target =
  | { mode: 'broadcast' }
  | { mode: 'mention'; agentIds: string[] }
  | { mode: 'orchestrated'; agentIds: string[] }

export interface AgentParticipant {
  id: string
  status: AgentStatus
}

export interface IncomingUserMessage {
  roomId: string
  senderId: string
  body: string
  target: Target
}

