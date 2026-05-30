import { spawn as nodeSpawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { RuntimeAdapter } from './agentWorker.js';

export interface CodexProcess {
  stdout: Readable;
  stderr: Readable;
  kill(signal?: NodeJS.Signals | number): unknown;
  on(event: 'close', listener: (code: number | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export type SpawnCodexProcess = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => CodexProcess;

export interface CodexCliAdapterOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  spawn?: SpawnCodexProcess;
}

function defaultCodexCommand(): string {
  return process.platform === 'win32' ? 'codex.cmd' : 'codex';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function textFrom(value: unknown): string | null {
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ['content', 'text', 'message', 'delta', 'output']) {
    const next = record[key];
    if (typeof next === 'string') return next;
  }
  return null;
}

function normalizeJsonLine(line: string): { delta?: string; final?: string } | null {
  const parsed = JSON.parse(line) as unknown;
  const record = asRecord(parsed);
  if (!record) return null;
  const type = typeof record.type === 'string' ? record.type : '';

  if (typeof record.delta === 'string') {
    return { delta: record.delta };
  }

  const directText = textFrom(record);
  const nestedText = textFrom(record.message) ?? textFrom(record.item);
  const text = directText ?? nestedText;
  if (!text) return null;

  if (type.includes('delta')) {
    return { delta: text };
  }
  if (type.includes('final') || type.includes('completed') || type.includes('message')) {
    return { final: text };
  }
  return null;
}

export function createCodexCliAdapter(options: CodexCliAdapterOptions = {}): RuntimeAdapter {
  const command = options.command ?? defaultCodexCommand();
  const args = options.args ?? ['exec', '--json', '--sandbox', 'workspace-write', '--ask-for-approval', 'never'];
  const spawn = options.spawn ?? ((cmd, cmdArgs, spawnOptions) => nodeSpawn(cmd, cmdArgs, spawnOptions));
  const timeoutMs = options.timeoutMs ?? 120_000;

  return {
    kind: 'codex-cli',
    run({ job, emitDelta }) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let stdoutBuffer = '';
        let stderr = '';
        let plainStdout = '';
        let finalOutput = '';
        let sawJson = false;
        const pendingDeltas: Promise<void>[] = [];

        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          fn();
        };

        const handleLine = (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          try {
            const normalized = normalizeJsonLine(trimmed);
            sawJson = true;
            if (normalized?.delta) {
              pendingDeltas.push(emitDelta(normalized.delta));
            }
            if (normalized?.final) {
              finalOutput = normalized.final;
            }
          } catch {
            plainStdout += line;
          }
        };

        const flushStdout = () => {
          if (!stdoutBuffer) return;
          handleLine(stdoutBuffer);
          stdoutBuffer = '';
        };

        const proc = spawn(command, [...args, job.prompt], {
          cwd: options.cwd,
          env: options.env,
          windowsHide: true,
        });

        const timeout = setTimeout(() => {
          proc.kill();
          finish(() => reject(new Error(`Codex CLI timed out after ${timeoutMs}ms`)));
        }, timeoutMs);

        proc.stdout.on('data', (chunk: Buffer | string) => {
          const text = String(chunk);
          stdoutBuffer += text;
          const lines = stdoutBuffer.split(/\r?\n/);
          stdoutBuffer = lines.pop() ?? '';
          for (const line of lines) {
            handleLine(line);
          }
        });

        proc.stderr.on('data', (chunk: Buffer | string) => {
          stderr += String(chunk);
        });

        proc.on('error', (error) => {
          finish(() => reject(error));
        });

        proc.on('close', (code) => {
          flushStdout();
          void Promise.all(pendingDeltas).then(
            () => {
              finish(() => {
                if (code !== 0) {
                  const detail = stderr.trim() || 'no stderr';
                  reject(new Error(`Codex CLI exited with code ${code ?? 'unknown'}: ${detail}`));
                  return;
                }
                const body = finalOutput || (sawJson ? '' : plainStdout.trim());
                resolve({ body });
              });
            },
            (error: unknown) => {
              finish(() => reject(error instanceof Error ? error : new Error(String(error))));
            },
          );
        });
      });
    },
  };
}
