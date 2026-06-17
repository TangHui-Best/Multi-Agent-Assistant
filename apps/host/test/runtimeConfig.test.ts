import { describe, expect, it } from 'vitest';
import { readDefaultRuntimeKind } from '../src/runtimeConfig.js';

describe('runtime config', () => {
  it('defaults default agent runtime to mock', () => {
    expect(readDefaultRuntimeKind({})).toBe('mock');
  });

  it('accepts codex-cli as the default agent runtime', () => {
    expect(readDefaultRuntimeKind({ DEFAULT_AGENT_RUNTIME_KIND: 'codex-cli' })).toBe('codex-cli');
  });

  it('rejects unsupported default runtime kinds', () => {
    expect(() => readDefaultRuntimeKind({ DEFAULT_AGENT_RUNTIME_KIND: 'provider-market' })).toThrow(
      'Unsupported DEFAULT_AGENT_RUNTIME_KIND: provider-market',
    );
  });
});
