import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { expect, test, vi } from 'vitest';
import type { AgentJob, AgentSeat } from '@multi-agent-assi/shared';
import { createCodexCliAdapter, type SpawnCodexProcess } from '../src/codexCliAdapter.js';

function createJob(): AgentJob {
  return {
    invocationId: 'invocation-1',
    roomId: 'room-1',
    threadId: 'thread-1',
    sourceMessageId: 'message-1',
    agentId: 'architect',
    prompt: 'Review this plan',
  };
}

function createSeat(): AgentSeat {
  return {
    id: 'architect',
    displayName: 'Architect',
    role: 'architect',
    runtime: { kind: 'codex-cli', profile: 'architect' },
  };
}

function createFakeProcess() {
  const proc = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  return proc;
}

test('spawns codex exec and normalizes JSONL deltas plus final output', async () => {
  const proc = createFakeProcess();
  const spawn: SpawnCodexProcess = vi.fn(() => proc);
  const adapter = createCodexCliAdapter({ command: 'codex.cmd', spawn });
  const deltas: string[] = [];

  const resultPromise = adapter.run({
    job: createJob(),
    seat: createSeat(),
    emitDelta: async (delta) => {
      deltas.push(delta);
    },
  });
  proc.stdout.write('{"type":"agent.delta","delta":"hello"}\n');
  proc.stdout.write('{"type":"agent.final","content":"final answer"}\n');
  proc.emit('close', 0);

  await expect(resultPromise).resolves.toEqual({ body: 'final answer' });
  expect(deltas).toEqual(['hello']);
  expect(spawn).toHaveBeenCalledWith(
    'codex.cmd',
    ['exec', '--json', '--sandbox', 'workspace-write', '--ask-for-approval', 'never', 'Review this plan'],
    expect.objectContaining({ windowsHide: true }),
  );
});

test('falls back to plain stdout as final output when output is not JSONL', async () => {
  const proc = createFakeProcess();
  const adapter = createCodexCliAdapter({ spawn: vi.fn(() => proc) });

  const resultPromise = adapter.run({
    job: createJob(),
    seat: createSeat(),
    emitDelta: async () => {},
  });
  proc.stdout.write('plain final output');
  proc.emit('close', 0);

  await expect(resultPromise).resolves.toEqual({ body: 'plain final output' });
});

test('fails on non-zero exit with stderr diagnostics', async () => {
  const proc = createFakeProcess();
  const adapter = createCodexCliAdapter({ spawn: vi.fn(() => proc) });

  const resultPromise = adapter.run({
    job: createJob(),
    seat: createSeat(),
    emitDelta: async () => {},
  });
  proc.stderr.write('bad auth');
  proc.emit('close', 2);

  await expect(resultPromise).rejects.toThrow('Codex CLI exited with code 2: bad auth');
});

test('kills the process and fails on timeout', async () => {
  vi.useFakeTimers();
  const proc = createFakeProcess();
  const adapter = createCodexCliAdapter({ spawn: vi.fn(() => proc), timeoutMs: 100 });

  const resultPromise = adapter.run({
    job: createJob(),
    seat: createSeat(),
    emitDelta: async () => {},
  });
  const rejection = expect(resultPromise).rejects.toThrow('Codex CLI timed out after 100ms');
  await vi.advanceTimersByTimeAsync(100);

  expect(proc.kill).toHaveBeenCalledOnce();
  await rejection;
  vi.useRealTimers();
});
