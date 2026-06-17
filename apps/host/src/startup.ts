import type { AgentWorker } from '@multi-agent-assi/agent-runtime';
import type { RoomHub } from '@multi-agent-assi/room-hub';

export async function recoverBeforeWorkerStart(input: { roomHub: RoomHub; worker: AgentWorker; threadIds: string[] }): Promise<void> {
  for (const threadId of input.threadIds) {
    await input.roomHub.recoverThreadContinuity(threadId);
  }
  input.worker.start();
}
