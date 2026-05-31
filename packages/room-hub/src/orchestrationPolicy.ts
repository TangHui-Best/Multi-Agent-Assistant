import type { AgentId, MessageRecord } from '@multi-agent-assi/shared';

export type ReviewerVerdict = 'approved' | 'changes_requested';

export const DESIGN_REVIEW_EXECUTE_STEP_AGENT_IDS = ['architect', 'reviewer', 'implementer'] as const satisfies readonly AgentId[];

export function parseReviewerVerdict(body: string): ReviewerVerdict | null {
  const match = body.match(/^\s*VERDICT:\s*(approved|approve|changes_requested|request_changes)\b/im);
  if (!match) return null;
  return match[1] === 'approved' || match[1] === 'approve' ? 'approved' : 'changes_requested';
}

export function buildArchitectPrompt(sourceMessage: MessageRecord): string {
  return `Original request:\n${sourceMessage.body}\n\nRole: architect\nProduce the implementation plan, boundaries, and risks for this request.`;
}

export function buildReviewerPrompt(input: { sourceMessage: MessageRecord; architectMessage?: MessageRecord }): string {
  return [
    `Original request:\n${input.sourceMessage.body}`,
    input.architectMessage ? `Architect output:\n${input.architectMessage.body}` : undefined,
    'Role: reviewer',
    'Review for blockers, missing tests, architecture drift, recovery risks, and user-intent mismatch.',
    'End with exactly one verdict line: VERDICT: approved or VERDICT: changes_requested.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildImplementerPrompt(input: {
  sourceMessage: MessageRecord;
  architectMessage?: MessageRecord;
  reviewerMessage: MessageRecord;
}): string {
  return [
    `Original request:\n${input.sourceMessage.body}`,
    input.architectMessage ? `Architect output:\n${input.architectMessage.body}` : undefined,
    `Reviewer output:\n${input.reviewerMessage.body}`,
    'Role: implementer',
    'Implement only after the reviewer approved. Preserve the agreed boundaries and verification expectations.',
  ]
    .filter(Boolean)
    .join('\n\n');
}
