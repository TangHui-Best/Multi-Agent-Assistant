import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { RuntimeAdapter } from './agentWorker.js';

export interface CodexProcess {
  stdout: Readable;
  stderr: Readable;
  kill(signal?: NodeJS.Signals | number): unknown;
  on(event: 'close', listener: (code: number | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export type SpawnCodexProcess = (command: string, args: string[], options: SpawnOptions) => CodexProcess;

export interface CodexCliAdapterOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  spawn?: SpawnCodexProcess;
}

function defaultCodexCommand(): string {
  return defaultWindowsCodexJsPath() ? process.execPath : 'codex';
}

function defaultWindowsCodexJsPath(): string | null {
  if (process.platform !== 'win32' || !process.env.APPDATA) return null;
  const candidate = join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
  return existsSync(candidate) ? candidate : null;
}

function defaultCodexArgs(command: string): string[] {
  const windowsCodexJsPath = defaultWindowsCodexJsPath();
  const baseArgs = ['-a', 'never', 'exec', '--json', '--sandbox', 'workspace-write'];
  return windowsCodexJsPath && command === process.execPath ? [windowsCodexJsPath, ...baseArgs] : baseArgs;
}

function shouldUseShell(command: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
}

function quoteWindowsArg(value: string): string {
  if (/^[A-Za-z0-9._:/\\=-]+$/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
}

function resolveSpawnInvocation(command: string, args: string[]): { command: string; args: string[] } {
  if (!shouldUseShell(command)) {
    return { command, args };
  }
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', [command, ...args.map(quoteWindowsArg)].join(' ')],
  };
}

function abortReasonMessage(signal: AbortSignal): string {
  const reason = signal.reason as unknown;
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  return 'aborted';
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

function sessionIdFrom(record: Record<string, unknown>): string | null {
  if (typeof record.session_id === 'string') return record.session_id;
  if (typeof record.sessionId === 'string') return record.sessionId;
  const session = asRecord(record.session);
  if (typeof session?.id === 'string') return session.id;
  return null;
}

function normalizeJsonLine(line: string): { delta?: string; final?: string; sessionId?: string } | null {
  const parsed = JSON.parse(line) as unknown;
  const record = asRecord(parsed);
  if (!record) return null;
  const type = typeof record.type === 'string' ? record.type : '';
  const sessionId = sessionIdFrom(record);
  if (sessionId) {
    return { sessionId };
  }

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
  const args = options.args ?? defaultCodexArgs(command);
  const spawn = options.spawn ?? ((cmd, cmdArgs, spawnOptions) => nodeSpawn(cmd, cmdArgs, spawnOptions) as CodexProcess);
  const timeoutMs = options.timeoutMs ?? 300_000;

  return {
    kind: 'codex-cli',
    run({ job, signal, emitDelta }) {
      return new Promise((resolve, reject) => {
        let settled = false;
        let stdoutBuffer = '';
        let stderr = '';
        let plainStdout = '';
        let finalOutput = '';
        let runtimeSessionId = '';
        let sawJson = false;
        const pendingDeltas: Promise<void>[] = [];

        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          signal?.removeEventListener('abort', handleAbort);
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
            if (normalized?.sessionId) {
              runtimeSessionId = normalized.sessionId;
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

        const invocation = resolveSpawnInvocation(command, [...args, job.prompt]);
        const proc = spawn(invocation.command, invocation.args, {
          cwd: options.cwd,
          env: options.env,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });

        const timeout = setTimeout(() => {
          proc.kill();
          finish(() => reject(new Error(`Codex CLI timed out after ${timeoutMs}ms`)));
        }, timeoutMs);

        const handleAbort = () => {
          proc.kill();
          finish(() => reject(new Error(`Codex CLI canceled: ${abortReasonMessage(signal)}`)));
        };

        if (signal?.aborted) {
          handleAbort();
          return;
        }
        signal?.addEventListener('abort', handleAbort, { once: true });

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
                resolve({
                  body,
                  ...(runtimeSessionId
                    ? {
                        runtimeSessionId,
                        resumeMetadata: { runtime: 'codex-cli', sessionId: runtimeSessionId },
                      }
                    : {}),
                });
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
