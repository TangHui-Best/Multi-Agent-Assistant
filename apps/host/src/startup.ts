import type { AgentWorker } from '@multi-agent-assi/agent-runtime';
import type { RoomHub } from '@multi-agent-assi/room-hub';

export async function recoverBeforeWorkerStart(input: { roomHub: RoomHub; worker: AgentWorker; threadId: string }): Promise<void> {
  await input.roomHub.recoverThreadContinuity(input.threadId);
  input.worker.start();
}
