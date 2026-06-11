import type { RoomHub } from '@multi-agent-assi/room-hub';
import type { SubmitMessageInput, Target } from '@multi-agent-assi/shared';

export interface ConnectorSubmitInput {
  connectorId: string;
  externalUserId: string;
  roomId: string;
  threadId: string;
  body: string;
  target: Target;
  idempotencyKey: string;
}

export interface ConnectorIngress {
  submit(input: ConnectorSubmitInput): ReturnType<RoomHub['submitMessage']>;
}

function connectorUserId(input: Pick<ConnectorSubmitInput, 'connectorId' | 'externalUserId'>): string {
  return `connector:${input.connectorId}:${input.externalUserId}`;
}

export function createConnectorIngress(deps: { roomHub: Pick<RoomHub, 'submitMessage'> }): ConnectorIngress {
  return {
    submit(input) {
      const submitInput: SubmitMessageInput = {
        roomId: input.roomId,
        threadId: input.threadId,
        userId: connectorUserId(input),
        source: 'connector',
        body: input.body,
        target: input.target,
        idempotencyKey: input.idempotencyKey,
      };
      return deps.roomHub.submitMessage(submitInput);
    },
  };
}
