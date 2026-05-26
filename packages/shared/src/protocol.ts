export type RoomId = string;
export type ThreadId = string;
export type MessageId = string;
export type AgentId = string;
export type InvocationId = string;

export type RuntimeKind = 'codex-cli' | 'claude-code' | 'opencode' | 'gemini-cli' | 'mock';

export interface RuntimeBinding {
  kind: RuntimeKind;
  profile: string;
}

export type MessageSender =
  | { type: 'user'; userId: string; source: 'web' | 'connector' }
  | { type: 'agent'; agentId: AgentId }
  | { type: 'system' };

export type MessageKind = 'user_message' | 'agent_message' | 'system_event';

export interface MessageRecord {
  id: MessageId;
  roomId: RoomId;
  threadId: ThreadId;
  kind: MessageKind;
  sender: MessageSender;
  body: string;
  createdAt: number;
  invocationId?: InvocationId;
}

export interface AgentSeat {
  id: AgentId;
  displayName: string;
  role: 'architect' | 'reviewer' | 'implementer' | 'custom';
  runtime: RuntimeBinding;
}

export type Target =
  | { mode: 'broadcast' }
  | { mode: 'mention'; agentIds: AgentId[] }
  | { mode: 'orchestrated'; workflow: 'design_review_execute' };

export interface SubmitMessageInput {
  roomId: RoomId;
  threadId: ThreadId;
  userId: string;
  source: 'web' | 'connector';
  body: string;
  target: Target;
  idempotencyKey: string;
}

export type InvocationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

export interface InvocationRecord {
  id: InvocationId;
  roomId: RoomId;
  threadId: ThreadId;
  sourceMessageId: MessageId;
  agentId: AgentId;
  status: InvocationStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export type RoomEvent =
  | { type: 'message.created'; roomId: RoomId; threadId: ThreadId; message: MessageRecord; occurredAt: number }
  | { type: 'invocation.queued'; roomId: RoomId; threadId: ThreadId; invocation: InvocationRecord; occurredAt: number }
  | { type: 'invocation.running'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; agentId: AgentId; occurredAt: number }
  | { type: 'agent.delta'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; agentId: AgentId; delta: string; occurredAt: number }
  | { type: 'invocation.completed'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; message: MessageRecord; occurredAt: number }
  | { type: 'invocation.failed'; roomId: RoomId; threadId: ThreadId; invocationId: InvocationId; agentId: AgentId; error: string; occurredAt: number };

export interface AgentJob {
  invocationId: InvocationId;
  roomId: RoomId;
  threadId: ThreadId;
  sourceMessageId: MessageId;
  agentId: AgentId;
  prompt: string;
}
