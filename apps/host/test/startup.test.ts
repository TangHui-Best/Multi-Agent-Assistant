import { describe, expect, it, vi } from 'vitest';
import { recoverBeforeWorkerStart } from '../src/startup.js';

describe('host startup recovery', () => {
  it('runs recovery before starting the worker', async () => {
    const order: string[] = [];
    const roomHub = {
      recoverThreadContinuity: vi.fn(async () => {
        order.push('recover');
      }),
    };
    const worker = {
      start: vi.fn(() => {
        order.push('start');
      }),
    };

    await recoverBeforeWorkerStart({ roomHub, worker, threadId: 'default-thread' });

    expect(roomHub.recoverThreadContinuity).toHaveBeenCalledWith('default-thread');
    expect(worker.start).toHaveBeenCalled();
    expect(order).toEqual(['recover', 'start']);
  });
});
