import type { RuntimeKind } from '@multi-agent-assi/shared';

const SUPPORTED_DEFAULT_RUNTIME_KINDS = new Set<RuntimeKind>(['mock', 'codex-cli']);

export function readDefaultRuntimeKind(env: NodeJS.ProcessEnv): RuntimeKind {
  const value = env.DEFAULT_AGENT_RUNTIME_KIND ?? 'mock';
  if (SUPPORTED_DEFAULT_RUNTIME_KINDS.has(value as RuntimeKind)) {
    return value as RuntimeKind;
  }
  throw new Error(`Unsupported DEFAULT_AGENT_RUNTIME_KIND: ${value}`);
}
