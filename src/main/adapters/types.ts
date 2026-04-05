export interface AgentReply {
  senderId: string
  body: string
}

export interface RoomAdapter {
  agentId: string
  send(message: string): Promise<AgentReply>
}

