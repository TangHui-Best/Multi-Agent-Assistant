import type { AgentSeat, MessageRecord, SubmitMessageInput } from '@multi-agent-assi/shared';

export interface BootstrapState {
  agents: AgentSeat[];
  messages: MessageRecord[];
}

export async function fetchBootstrap(): Promise<BootstrapState> {
  const response = await fetch('/api/bootstrap');
  if (!response.ok) {
    throw new Error(`Bootstrap failed: ${response.status}`);
  }
  return response.json() as Promise<BootstrapState>;
}

export async function submitMessage(input: SubmitMessageInput): Promise<void> {
  const response = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Message submit failed: ${response.status}`);
  }
}
