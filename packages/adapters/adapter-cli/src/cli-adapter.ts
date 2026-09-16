import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import crossSpawn from 'cross-spawn';
import type {
  CreateRunArgs,
  HarnessAdapter,
  HarnessConfig,
  HarnessManifest,
  HealthReport,
  RunHandle,
  RunState,
  UnifiedEvent,
  UnifiedResult,
  UsageRecord,
  ValidationResult,
} from '@hcp/contracts';

export interface LineContext {
  runId: string;
  taskId: string;
  harnessId: string;
}

export interface ResultContext {
  runId: string;
  taskId: string;
  harnessId: string;
  workspace: string;
  exitCode: number | null;
  cancelled: boolean;
  error: string | null;
  stdoutLines: string[];
  stderrLines: string[];
}

/** 累计用量快照（D6）；provider 常上报累计值，故基类只保留最近一次。 */
export interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model?: string | null;
  raw?: unknown;
}

interface RunRuntime {
  args: CreateRunArgs;
  proc: ChildProcess;
  state: RunState;
  queue: UnifiedEvent[];
  waiters: Array<() => void>;
  stdoutLines: string[];
  stderrLines: string[];
  exitCode: number | null;
  cancelled: boolean;
  timedOut: boolean;
  error: string | null;
  usage: UsageSnapshot | null;
  done: boolean;
  donePromise: Promise<void>;
  resolveDone: () => void;
  timer: NodeJS.Timeout | null;
}

/**
 * CLI 型 harness 的通用基类（ADR-002）。
 * 公共部分（进程、行缓冲、超时、kill、退出码、事件队列、结果骨架）在此实现；
 * 子类只实现差异部分：buildArgs / parseLine / extractResult。
 *
 * 事件归属约定：基类负责 emit `run.started`（spawn 时）与终结事件
 * （`run.completed` / `run.failed` / `run.cancelled`，按退出码）；子类的 parseLine
 * 只产出中间事件（run.output / tool.* / run.progress 等），不产出终结事件。
 */
export abstract class CliAdapter implements HarnessAdapter {
  protected readonly config: HarnessConfig;
  private readonly runs = new Map<string, RunRuntime>();

  constructor(config: HarnessConfig) {
    this.config = config;
  }

  abstract manifest(): HarnessManifest;
  protected abstract buildArgs(args: CreateRunArgs): string[];
  protected abstract parseLine(line: string, ctx: LineContext): UnifiedEvent[];
  /** 可选：从行中抽取累计用量快照（D6）。基类保留最近一次。 */
  protected parseUsage?(line: string, ctx: LineContext): UsageSnapshot | null;
  protected abstract extractResult(ctx: ResultContext): UnifiedResult;

  /** 子类可覆盖：解析可执行文件（默认取配置 command，回退 manifest.id）。 */
  protected resolveCommand(): string {
    return this.config.command ?? this.manifest().id;
  }

  /** 子类可覆盖：注入环境变量（凭据走 env，不入库）。 */
  protected resolveEnv(): NodeJS.ProcessEnv {
    return process.env;
  }

  async validateConfig(config: HarnessConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    const command = config.command ?? this.manifest().id;
    if (!command) errors.push('未配置 command');
    return { ok: errors.length === 0, errors };
  }

  async healthCheck(): Promise<HealthReport> {
    const command = this.resolveCommand();
    const started = Date.now();
    return await new Promise<HealthReport>((resolve) => {
      let done = false;
      const finish = (ok: boolean, detail?: string): void => {
        if (done) return;
        done = true;
        resolve({ ok, latencyMs: Date.now() - started, detail });
      };
      let proc: ChildProcess;
      try {
        proc = crossSpawn(command, ['--version'], { windowsHide: true, stdio: 'ignore' });
      } catch (e) {
        finish(false, (e as Error).message);
        return;
      }
      const timer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        finish(false, 'timeout');
      }, 5000);
      proc.on('error', (e) => {
        clearTimeout(timer);
        finish(false, e.message);
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        finish(code === 0, code === 0 ? undefined : `exit ${code}`);
      });
    });
  }

  async createRun(args: CreateRunArgs): Promise<RunHandle> {
    const command = this.resolveCommand();
    const argv = this.buildArgs(args);
    // cross-spawn：在 Windows 上正确解析 npm 的 .cmd shim 并对参数转义
    const proc = crossSpawn(command, argv, {
      cwd: args.workspace,
      env: this.resolveEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let resolveDone!: () => void;
    const donePromise = new Promise<void>((res) => {
      resolveDone = res;
    });

    const rt: RunRuntime = {
      args,
      proc,
      state: 'running',
      queue: [],
      waiters: [],
      stdoutLines: [],
      stderrLines: [],
      exitCode: null,
      cancelled: false,
      timedOut: false,
      error: null,
      usage: null,
      done: false,
      donePromise,
      resolveDone,
      timer: null,
    };
    this.runs.set(args.runId, rt);

    this.emit(rt, this.makeEvent(args, 'run.started', `spawn ${command}`, 'stdout', ''));

    if (proc.stdout) this.bindLines(proc.stdout, rt, 'stdout');
    if (proc.stderr) this.bindLines(proc.stderr, rt, 'stderr');

    proc.on('error', (err) => {
      rt.error = err.message;
      this.finalize(rt, null);
    });
    proc.on('close', (code) => this.finalize(rt, code));

    if (args.timeoutMs && args.timeoutMs > 0) {
      rt.timer = setTimeout(() => {
        rt.timedOut = true;
        try {
          proc.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }, args.timeoutMs);
    }

    return { runId: args.runId, harnessId: args.harnessId, pid: proc.pid ?? null };
  }

  async *streamEvents(handle: RunHandle): AsyncIterable<UnifiedEvent> {
    const rt = this.runs.get(handle.runId);
    if (!rt) return;
    let i = 0;
    for (;;) {
      while (i < rt.queue.length) {
        const ev = rt.queue[i];
        i++;
        yield ev as UnifiedEvent;
      }
      if (rt.done) return;
      await new Promise<void>((res) => rt.waiters.push(res));
    }
  }

  async getStatus(handle: RunHandle): Promise<RunState> {
    return this.runs.get(handle.runId)?.state ?? 'pending';
  }

  async interrupt(handle: RunHandle): Promise<void> {
    const rt = this.runs.get(handle.runId);
    if (!rt || rt.done) return;
    rt.cancelled = true;
    try {
      rt.proc.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }

  async collectResult(handle: RunHandle): Promise<UnifiedResult> {
    const rt = this.runs.get(handle.runId);
    if (!rt) throw new Error(`unknown run: ${handle.runId}`);
    await rt.donePromise;
    return this.extractResult({
      runId: rt.args.runId,
      taskId: rt.args.taskId,
      harnessId: rt.args.harnessId,
      workspace: rt.args.workspace,
      exitCode: rt.exitCode,
      cancelled: rt.cancelled,
      error: rt.error,
      stdoutLines: rt.stdoutLines,
      stderrLines: rt.stderrLines,
    });
  }

  async collectUsage(handle: RunHandle): Promise<UsageRecord[]> {
    const rt = this.runs.get(handle.runId);
    if (!rt || !rt.usage) return [];
    const u = rt.usage;
    return [
      {
        id: randomUUID(),
        runId: rt.args.runId,
        stageId: rt.args.stageId,
        harnessId: rt.args.harnessId,
        model: u.model ?? rt.args.model ?? null,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        totalTokens: u.totalTokens,
        source: 'harness',
        timestamp: new Date().toISOString(),
        raw: u.raw ?? null,
      },
    ];
  }

  async cleanup(handle: RunHandle): Promise<void> {
    const rt = this.runs.get(handle.runId);
    if (!rt) return;
    if (!rt.done) {
      try {
        rt.proc.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
    if (rt.timer) clearTimeout(rt.timer);
    this.runs.delete(handle.runId);
  }

  private bindLines(stream: NodeJS.ReadableStream, rt: RunRuntime, source: 'stdout' | 'stderr'): void {
    let buf = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buf += chunk;
      let idx = buf.indexOf('\n');
      while (idx >= 0) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        this.handleLine(rt, source, line);
        idx = buf.indexOf('\n');
      }
    });
    stream.on('end', () => {
      if (buf.length > 0) {
        this.handleLine(rt, source, buf);
        buf = '';
      }
    });
  }

  private handleLine(rt: RunRuntime, source: 'stdout' | 'stderr', line: string): void {
    if (source === 'stdout') rt.stdoutLines.push(line);
    else rt.stderrLines.push(line);
    if (line.length === 0) return;

    const ctx: LineContext = {
      runId: rt.args.runId,
      taskId: rt.args.taskId,
      harnessId: rt.args.harnessId,
    };

    let events: UnifiedEvent[] = [];
    try {
      events = this.parseLine(line, ctx);
    } catch {
      events = [];
    }

    if (this.parseUsage) {
      try {
        const snap = this.parseUsage(line, ctx);
        if (snap) rt.usage = snap;
      } catch {
        /* 用量解析失败不影响事件流 */
      }
    }

    if (events.length === 0) {
      // 降级：无法归类的内容一律映射为 run.output，保留 raw（ADR-003）
      this.emit(rt, this.makeEvent(rt.args, 'run.output', line, source, line));
      return;
    }
    for (const ev of events) this.emit(rt, ev);
  }

  private makeEvent(
    args: CreateRunArgs,
    type: UnifiedEvent['type'],
    message: string,
    source: 'stdout' | 'stderr',
    payload: string,
  ): UnifiedEvent {
    return {
      runId: args.runId,
      taskId: args.taskId,
      harness: args.harnessId,
      type,
      timestamp: new Date().toISOString(),
      message,
      raw: { source, payload },
    };
  }

  private emit(rt: RunRuntime, ev: UnifiedEvent): void {
    rt.queue.push(ev);
    this.flush(rt);
  }

  private flush(rt: RunRuntime): void {
    const waiters = rt.waiters;
    rt.waiters = [];
    for (const w of waiters) w();
  }

  private finalize(rt: RunRuntime, exitCode: number | null): void {
    if (rt.done) return;
    if (rt.timer) {
      clearTimeout(rt.timer);
      rt.timer = null;
    }
    rt.exitCode = exitCode;

    if (rt.cancelled) {
      rt.state = 'cancelled';
      this.emit(rt, this.makeEvent(rt.args, 'run.cancelled', 'cancelled', 'stdout', ''));
    } else if (rt.timedOut) {
      rt.error = 'timeout';
      rt.state = 'failed';
      this.emit(rt, this.makeEvent(rt.args, 'run.failed', 'timeout', 'stdout', ''));
    } else if (exitCode === 0) {
      rt.state = 'completed';
      this.emit(rt, this.makeEvent(rt.args, 'run.completed', 'exit 0', 'stdout', ''));
    } else {
      rt.error = rt.error ?? `exit code ${exitCode}`;
      rt.state = 'failed';
      this.emit(rt, this.makeEvent(rt.args, 'run.failed', rt.error, 'stdout', ''));
    }

    rt.done = true;
    rt.resolveDone();
    this.flush(rt);
  }
}
