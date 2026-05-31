import { EventEmitter } from 'node:events';
import { beforeEach, expect, test, vi } from 'vitest';
import type { AgentJob, RoomEvent } from '@multi-agent-assi/shared';

const redisInstances: FakeRedis[] = [];

class FakeRedis extends EventEmitter {
  xgroupCalls: unknown[][] = [];
  evalCalls: unknown[][] = [];
  xreadgroupResponse: unknown = null;
  subscribeCalls = 0;
  unsubscribeCalls = 0;
  keys = new Map<string, string>();

  constructor(public readonly redisUrl: string) {
    super();
    redisInstances.push(this);
  }

  async xgroup(...args: unknown[]): Promise<void> {
    this.xgroupCalls.push(args);
  }

  async xadd(): Promise<void> {}

  async publish(channel: string, payload: string): Promise<void> {
    for (const instance of redisInstances) {
      instance.emit('message', channel, payload);
    }
  }

  async xreadgroup(): Promise<unknown> {
    return this.xreadgroupResponse;
  }

  async xack(): Promise<void> {}

  async set(key: string, value: string, ttlMode: string, _ttlMs: number, mode: string): Promise<'OK' | null> {
    if (ttlMode !== 'PX' || mode !== 'NX') throw new Error(`Unsupported fake set mode: ${ttlMode} ${mode}`);
    if (this.keys.has(key)) return null;
    this.keys.set(key, value);
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.keys.get(key) ?? null;
  }

  async del(key: string): Promise<number> {
    const existed = this.keys.delete(key);
    return existed ? 1 : 0;
  }

  async eval(_script: string, keyCount: number, key: string, ownerId: string): Promise<number> {
    this.evalCalls.push([keyCount, key, ownerId]);
    if (this.keys.get(key) !== ownerId) return 0;
    this.keys.delete(key);
    return 1;
  }

  async subscribe(): Promise<void> {
    this.subscribeCalls += 1;
  }

  async unsubscribe(): Promise<void> {
    this.unsubscribeCalls += 1;
  }

  disconnect(): void {}
}

vi.mock('ioredis', () => ({
  Redis: FakeRedis,
}));

const { createRedisEventBus } = await import('../src/redisEventBus.js');

beforeEach(() => {
  redisInstances.length = 0;
});

test('readAgentJobs returns stream ids with parsed jobs', async () => {
  const eventBus = createRedisEventBus('redis://localhost:6379');
  const redis = redisInstances[0];
  const job: AgentJob = {
    invocationId: 'invocation-1',
    roomId: 'room-1',
    threadId: 'thread-1',
    sourceMessageId: 'message-1',
    agentId: 'architect',
    prompt: 'Review this plan',
  };
  redis.xreadgroupResponse = [['mas:agent-jobs', [['123-0', ['job', JSON.stringify(job)]]]]];

  await expect(eventBus.readAgentJobs('workers', 'worker-1', 1)).resolves.toEqual([
    { streamId: '123-0', job },
  ]);
});

test('readAgentJobs creates consumer group from the beginning of the job stream', async () => {
  const eventBus = createRedisEventBus('redis://localhost:6379');
  const redis = redisInstances[0];
  redis.xreadgroupResponse = [];

  await eventBus.readAgentJobs('workers', 'worker-1', 1);

  expect(redis.xgroupCalls).toContainEqual(['CREATE', 'mas:agent-jobs', 'workers', '0', 'MKSTREAM']);
});

test('one room event unsubscribe leaves other local subscribers active', async () => {
  const eventBus = createRedisEventBus('redis://localhost:6379');
  const subscriber = redisInstances[1];
  const firstEvents: RoomEvent[] = [];
  const secondEvents: RoomEvent[] = [];
  const event: RoomEvent = {
    type: 'agent.delta',
    roomId: 'room-1',
    threadId: 'thread-1',
    invocationId: 'invocation-1',
    agentId: 'architect',
    delta: 'hello',
    occurredAt: 1,
  };

  const unsubscribeFirst = await eventBus.subscribeRoomEvents((roomEvent) => firstEvents.push(roomEvent));
  const unsubscribeSecond = await eventBus.subscribeRoomEvents((roomEvent) => secondEvents.push(roomEvent));

  await unsubscribeFirst();
  subscriber.emit('message', 'mas:room-events:pubsub', JSON.stringify(event));

  expect(firstEvents).toEqual([]);
  expect(secondEvents).toEqual([event]);
  expect(subscriber.unsubscribeCalls).toBe(0);

  await unsubscribeSecond();

  expect(subscriber.unsubscribeCalls).toBe(1);
});

test('agent slot leases are exclusive until released by the owner', async () => {
  const eventBus = createRedisEventBus('redis://localhost:6379');

  await expect(eventBus.acquireAgentSlotLease('architect', 'worker-1', 30_000)).resolves.toBe(true);
  await expect(eventBus.acquireAgentSlotLease('architect', 'worker-2', 30_000)).resolves.toBe(false);
  await eventBus.releaseAgentSlotLease('architect', 'worker-2');
  await expect(eventBus.acquireAgentSlotLease('architect', 'worker-2', 30_000)).resolves.toBe(false);
  await eventBus.releaseAgentSlotLease('architect', 'worker-1');
  expect(redisInstances[0].evalCalls).toContainEqual([1, 'mas:agent-slot-lease:architect', 'worker-1']);
  await expect(eventBus.acquireAgentSlotLease('architect', 'worker-2', 30_000)).resolves.toBe(true);
});
