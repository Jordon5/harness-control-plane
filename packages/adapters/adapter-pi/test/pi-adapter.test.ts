import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CreateRunArgs, HarnessManifest, UnifiedEvent } from '@hcp/contracts';
import { PiAdapter } from '../src/index.js';
import type { LineContext, ResultContext } from '@hcp/adapter-cli';

const SAMPLE = fileURLToPath(new URL('./fixtures/pi-sample.jsonl', import.meta.url));
const REAL_SAMPLE = fileURLToPath(new URL('./fixtures/pi-sample-real.jsonl', import.meta.url));

const CTX: LineContext = { runId: 'r1', taskId: 't1', harnessId: 'pi' };

class ExposedPi extends PiAdapter {
  args(a: CreateRunArgs): string[] {
    return this.buildArgs(a);
  }
  line(l: string, c: LineContext): UnifiedEvent[] {
    return this.parseLine(l, c);
  }
  usage(l: string, c: LineContext) {
    return this.parseUsage?.(l, c) ?? null;
  }
  result(c: ResultContext) {
    return this.extractResult(c);
  }
}

function makePi(options: Record<string, unknown> = {}): ExposedPi {
  return new ExposedPi({ adapter: '@hcp/adapter-pi', type: 'cli', command: 'pi', options });
}

function makeArgs(over: Partial<CreateRunArgs> = {}): CreateRunArgs {
  return {
    runId: 'r1',
    taskId: 't1',
    stageId: 's1',
    harnessId: 'pi',
    config: { adapter: '@hcp/adapter-pi', type: 'cli', command: 'pi' },
    workspace: '/repo',
    prompt: 'do the thing',
    ownedPaths: [],
    model: null,
    timeoutMs: null,
    ...over,
  };
}

describe('PiAdapter', () => {
  it('manifest 声明 pi 的能力与执行特性', () => {
    const m: HarnessManifest = makePi().manifest();
    expect(m.id).toBe('pi');
    expect(m.kind).toBe('cli');
    expect(m.capabilities).toContain('fast-scan');
    expect(m.execution.supportsJsonResult).toBe(true);
  });

  it('buildArgs 映射 pi 参数，prompt 置于末尾（不传 -p）', () => {
    const argv = makePi({ provider: 'anthropic', model: 'claude-haiku-4-5' }).args(makeArgs());
    expect(argv).toEqual([
      '--mode',
      'json',
      '--no-session',
      '--provider',
      'anthropic',
      '--model',
      'claude-haiku-4-5',
      'do the thing',
    ]);
  });

  it('buildArgs 中 args.model 覆盖 options.model', () => {
    const argv = makePi({ model: 'claude-haiku-4-5' }).args(makeArgs({ model: 'claude-opus-4-8' }));
    expect(argv).toContain('claude-opus-4-8');
    expect(argv).not.toContain('claude-haiku-4-5');
  });

  it('事件映射：pi 事件 → 统一事件类型', () => {
    expect(makePi().line('{"type":"session","id":"x"}', CTX)[0]?.type).toBe('run.progress');
    expect(makePi().line('{"type":"agent_start"}', CTX)[0]?.type).toBe('run.progress');
    expect(
      makePi().line('{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hi"}}', CTX)[0]
        ?.type,
    ).toBe('run.output');
    expect(makePi().line('{"type":"tool_execution_start","toolName":"bash"}', CTX)[0]?.type).toBe('tool.started');
    expect(makePi().line('{"type":"tool_execution_end","toolName":"bash","isError":false}', CTX)[0]?.type).toBe(
      'tool.completed',
    );
  });

  it('未知/非 JSON 行降级：parseLine 返回空，交由基类记为 run.output', () => {
    expect(makePi().line('not json at all', CTX)).toEqual([]);
    expect(makePi().line('{"type":"mystery"}', CTX)).toEqual([]);
  });

  it('usage 抽取自 message_update.usage（累计）', () => {
    const snap = makePi().usage(
      '{"type":"message_update","usage":{"input":120,"output":9,"totalTokens":129}}',
      CTX,
    );
    expect(snap).toEqual({ inputTokens: 120, outputTokens: 9, totalTokens: 129, raw: { input: 120, output: 9, totalTokens: 129 } });
    expect(makePi().usage('{"type":"agent_start"}', CTX)).toBeNull();
  });

  it('extractResult：summary 取最后 assistant 正文，status 按退出码', () => {
    const lines = readFileSync(SAMPLE, 'utf8').split('\n').filter(Boolean);
    const res = makePi().result({
      runId: 'r1',
      taskId: 't1',
      harnessId: 'pi',
      workspace: '/repo',
      exitCode: 0,
      cancelled: false,
      error: null,
      stdoutLines: lines,
      stderrLines: [],
    });
    expect(res.status).toBe('completed');
    expect(res.summary).toBe('Hello world');
  });

  it('样本整体解析：事件类型序列符合预期', () => {
    const lines = readFileSync(SAMPLE, 'utf8').split('\n').filter(Boolean);
    const types = lines.flatMap((l) => makePi().line(l, CTX).map((e) => e.type));
    expect(types).toEqual([
      'run.progress', // session
      'run.progress', // agent_start
      'run.progress', // turn_start
      // message_start → [] (无映射)
      'run.output', // text_delta Hello
      'tool.started',
      'tool.completed',
      'run.output', // text_delta " world"
      'run.progress', // message_end
      'run.progress', // turn_end
      'run.progress', // agent_end
    ]);
  });

  it('真实样本（抓取自本机 pi）解析不抛错，agent_settled 归为 progress', () => {
    const lines = readFileSync(REAL_SAMPLE, 'utf8').split('\n').filter(Boolean);
    const events = lines.flatMap((l) => makePi().line(l, CTX));
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(typeof e.raw.payload).toBe('string');

    const settled = lines
      .filter((l) => l.includes('"agent_settled"'))
      .flatMap((l) => makePi().line(l, CTX));
    expect(settled[0]?.type).toBe('run.progress');
  });
});
