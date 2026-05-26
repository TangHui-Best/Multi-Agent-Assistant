import { Redis } from 'ioredis';
import type { AgentJob, RoomEvent } from '@multi-agent-assi/shared';

const ROOM_EVENTS_STREAM = 'mas:room-events';
const AGENT_JOBS_STREAM = 'mas:agent-jobs';

type RedisStreamEntry = [streamId: string, fields: string[]];
type RedisStreamReadResponse = Array<[stream: string, entries: RedisStreamEntry[]]>;
type RoomEventHandler = (event: RoomEvent) => void;

const ROOM_EVENTS_PUBSUB_CHANNEL = 'mas:room-events:pubsub';

export interface AgentJobEnvelope {
  streamId: string;
  job: AgentJob;
}

export interface EventBus {
  publishRoomEvent(event: RoomEvent): Promise<void>;
  enqueueAgentJob(job: AgentJob): Promise<void>;
  readAgentJobs(consumerGroup: string, consumerName: string, blockMs: number): Promise<AgentJobEnvelope[]>;
  ackAgentJob(consumerGroup: string, streamId: string): Promise<void>;
  subscribeRoomEvents(onEvent: (event: RoomEvent) => void): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

export function createRedisEventBus(redisUrl: string): EventBus {
  const redis = new Redis(redisUrl);
  const subscriber = new Redis(redisUrl);
  const roomEventHandlers = new Set<RoomEventHandler>();

  const redisRoomEventHandler = (_channel: string, payload: string) => {
    let event: RoomEvent;
    try {
      event = JSON.parse(payload) as RoomEvent;
    } catch (err) {
      console.warn('Ignoring invalid Redis room event payload', err);
      return;
    }

    for (const handler of roomEventHandlers) {
      handler(event);
    }
  };

  async function ensureGroup(stream: string, group: string): Promise<void> {
    try {
      await redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) {
        throw err;
      }
    }
  }

  return {
    async publishRoomEvent(event) {
      await redis.xadd(ROOM_EVENTS_STREAM, '*', 'event', JSON.stringify(event));
      await redis.publish(ROOM_EVENTS_PUBSUB_CHANNEL, JSON.stringify(event));
    },

    async enqueueAgentJob(job) {
      await redis.xadd(AGENT_JOBS_STREAM, '*', 'job', JSON.stringify(job));
    },

    async readAgentJobs(consumerGroup, consumerName, blockMs) {
      await ensureGroup(AGENT_JOBS_STREAM, consumerGroup);
      const response = (await redis.xreadgroup(
        'GROUP',
        consumerGroup,
        consumerName,
        'COUNT',
        10,
        'BLOCK',
        blockMs,
        'STREAMS',
        AGENT_JOBS_STREAM,
        '>',
      )) as RedisStreamReadResponse | null;
      if (!response) return [];
      const jobs: AgentJobEnvelope[] = [];
      for (const [, entries] of response) {
        for (const [streamId, fields] of entries) {
          const fieldValues = fields;
          const jobFieldIndex = fieldValues.findIndex((value) => value === 'job');
          if (jobFieldIndex >= 0) {
            try {
              jobs.push({ streamId, job: JSON.parse(fieldValues[jobFieldIndex + 1] ?? '{}') as AgentJob });
            } catch (err) {
              throw new Error(`Invalid agent job payload in Redis stream entry ${streamId}`, { cause: err });
            }
          }
        }
      }
      return jobs;
    },

    async ackAgentJob(consumerGroup, streamId) {
      await redis.xack(AGENT_JOBS_STREAM, consumerGroup, streamId);
    },

    async subscribeRoomEvents(onEvent) {
      if (roomEventHandlers.size === 0) {
        subscriber.on('message', redisRoomEventHandler);
        await subscriber.subscribe(ROOM_EVENTS_PUBSUB_CHANNEL);
      }
      roomEventHandlers.add(onEvent);
      let isUnsubscribed = false;
      return async () => {
        if (isUnsubscribed) return;
        isUnsubscribed = true;
        roomEventHandlers.delete(onEvent);
        if (roomEventHandlers.size === 0) {
          subscriber.off('message', redisRoomEventHandler);
          await subscriber.unsubscribe(ROOM_EVENTS_PUBSUB_CHANNEL);
        }
      };
    },

    async close() {
      redis.disconnect();
      subscriber.disconnect();
    },
  };
}
