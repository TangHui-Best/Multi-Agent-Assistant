export function useRoomViewModel() {
  return {
    roomTitle: 'Design Review',
    agents: [
      { id: 'builder', status: 'idle' },
      { id: 'critic', status: 'idle' },
      { id: 'synthesizer', status: 'offline' }
    ],
    messages: [
      { id: 'm1', senderId: 'user', body: 'hello', kind: 'user_message' },
      {
        id: 'm2',
        senderId: 'critic',
        body: 'I can stress test the current architecture and call out weak boundaries.',
        kind: 'agent_message'
      }
    ],
    mode: 'open' as const
  }
}

