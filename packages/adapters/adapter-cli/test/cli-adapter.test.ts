import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  CreateRunArgs,
  HarnessManifest,
  RunHandle,
  UnifiedEvent,
  UnifiedResult,
} from '@hcp/contracts';
import { CliAdapter, type LineContext, type ResultContext } from '../src/index.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/fake-cli.mjs', import.meta.url));

class FakeAdapter extends CliAdapter {
  manifest(): HarnessManifest {
    return {
      id: 'fake',
      adapter: 'fake',
      kind: 'cli',
      capabilities: ['coding'],
      execution: {
        supportsStreaming: true,
        supportsResume: false,
        supportsWorktree: true,
        supportsJsonResult: true,
      },
    };
  }

  protected buildArgs(args: CreateRunArgs): string[] {
    return [FIXTURE, args.prompt];
  }

  protected parseLine(line: string, ctx: LineContext): UnifiedEvent[] {
    const obj = JSON.parse(line) as { type: string; text?: string };
    if (obj.type === 'line') {
      return [
        {
          runId: ctx.runId,
          taskId: ctx.taskId,
          harness: ctx.harnessId,
          type: 'run.output',
          timestamp: new Date().toISOString(),
          message: obj.text ?? null,
          raw: { source: 'stdout', payload: line },
        },
      ];
    }
    return [];
  }

  protected extractResult(ctx: ResultContext): UnifiedResult {
    return {
      taskId: ctx.taskId,
      harness: ctx.harnessId,
      status: ctx.cancelled ? 'cancelled' : ctx.exitCode === 0 ? 'completed' : 'failed',
      workspace: ctx.workspace,
      changedFiles: [],
      commit: null,
      summary: `stdout=${ctx.stdoutLines.length}`,
      artifacts: [],
      tests: null,
      error: ctx.error,
    };
  }
}

function makeAdapter(): FakeAdapter {
  return new FakeAdapter({ adapter: 'fake', type: 'cli', command: process.execPath });
}

function makeArgs(over: Partial<CreateRunArgs> = {}): CreateRunArgs {
  return {
    runId: 'r1',
    taskId: 't1',
    stageId: 's1',
    harnessId: 'fake',
    config: { adapter: 'fake', type: 'cli', command: process.execPath },
    workspace: process.cwd(),
    prompt: 'ok',
    ownedPaths: [],
    model: null,
    timeoutMs: null,
    ...over,
  };
}

async function collect(adapter: FakeAdapter, handle: RunHandle): Promise<UnifiedEvent[]> {
  const out: UnifiedEvent[] = [];
  for await (const ev of adapter.streamEvents(handle)) out.push(ev);
  return out;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('CliAdapter', () => {
  it('正常链路：spawn → 行缓冲事件 → 退出 0 → 结果', async () => {
    const adapter = makeAdapter();
    const handle = await adapter.createRun(makeArgs({ prompt: 'ok' }));
    const events = await collect(adapter, handle);

    expect(events[0]?.type).toBe('run.started');
    expect(events.at(-1)?.type).toBe('run.completed');

    const outputs = events.filter((e) => e.type === 'run.output').map((e) => e.message);
    expect(outputs).toContain('one'); // 被 parseLine 识别
    expect(outputs).toContain('plain-not-json'); // 降级保留
    expect(outputs).toContain('warn-line'); // stderr 降级保留

    const result = await adapter.collectResult(handle);
    expect(result.status).toBe('completed');
    expect(result.summary).toBe('stdout=2');
    await adapter.cleanup(handle);
  });

  it('退出码非 0 → run.failed 与 failed 结果', async () => {
    const adapter = makeAdapter();
    const handle = await adapter.createRun(makeArgs({ prompt: 'fail' }));
    const events = await collect(adapter, handle);
    expect(events.at(-1)?.type).toBe('run.failed');

    const result = await adapter.collectResult(handle);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('2');
    await adapter.cleanup(handle);
  });

  it('超时 → 进程被 kill 且判为 failed/ timeout', async () => {
    const adapter = makeAdapter();
    const handle = await adapter.createRun(makeArgs({ prompt: 'hang', timeoutMs: 150 }));
    const events = await collect(adapter, handle);
    const last = events.at(-1);
    expect(last?.type).toBe('run.failed');
    expect(last?.message).toBe('timeout');

    const result = await adapter.collectResult(handle);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('timeout');
    await adapter.cleanup(handle);
  });

  it('interrupt → run.cancelled', async () => {
    const adapter = makeAdapter();
    const handle = await adapter.createRun(makeArgs({ prompt: 'hang' }));
    await delay(60);
    expect(await adapter.getStatus(handle)).toBe('running');
    await adapter.interrupt(handle);
    const events = await collect(adapter, handle);
    expect(events.at(-1)?.type).toBe('run.cancelled');

    const result = await adapter.collectResult(handle);
    expect(result.status).toBe('cancelled');
    await adapter.cleanup(handle);
  });

  it('healthCheck 用 --version 探活', async () => {
    const adapter = makeAdapter();
    const report = await adapter.healthCheck();
    expect(report.ok).toBe(true);
  });
});
