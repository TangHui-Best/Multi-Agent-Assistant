export interface ControlledRound {
  roundId: string
  allowedAgentIds: string[]
  replyBudget: number
  repliesUsed: number
}

export function canReply(round: ControlledRound | null, agentId: string) {
  if (!round) {
    return true
  }

  return round.allowedAgentIds.includes(agentId) && round.repliesUsed < round.replyBudget
}

