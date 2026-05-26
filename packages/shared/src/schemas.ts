import { z } from 'zod';

export const targetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('broadcast') }),
  z.object({ mode: z.literal('mention'), agentIds: z.array(z.string().min(1)).min(1) }),
  z.object({ mode: z.literal('orchestrated'), workflow: z.literal('design_review_execute') }),
]);

export const submitMessageSchema = z.object({
  roomId: z.string().min(1),
  threadId: z.string().min(1),
  userId: z.string().min(1),
  source: z.enum(['web', 'connector']),
  body: z.string().min(1).max(20000),
  target: targetSchema,
  idempotencyKey: z.string().min(8),
});
