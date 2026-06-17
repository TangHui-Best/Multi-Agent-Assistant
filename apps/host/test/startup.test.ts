import { describe, expect, it, vi } from 'vitest';
import { recoverBeforeWorkerStart } from '../src/startup.js';

describe('host startup recovery', () => {
  it('runs recovery for each persisted thread before starting the worker', async () => {
    const order: string[] = [];
    const roomHub = {
      recoverThreadContinuity: vi.fn(async (threadId: string) => {
        order.push(`recover:${threadId}`);
      }),
    };
    const worker = {
      start: vi.fn(() => {
        order.push('start');
      }),
    };

    await recoverBeforeWorkerStart({ roomHub, worker, threadIds: ['default-thread', 'review-thread'] });

    expect(roomHub.recoverThreadContinuity).toHaveBeenNthCalledWith(1, 'default-thread');
    expect(roomHub.recoverThreadContinuity).toHaveBeenNthCalledWith(2, 'review-thread');
    expect(worker.start).toHaveBeenCalled();
    expect(order).toEqual(['recover:default-thread', 'recover:review-thread', 'start']);
  });
});
