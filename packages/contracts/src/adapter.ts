import type { UnifiedEvent } from './event.js';
import type { HarnessConfig, HarnessManifest, HealthReport, ValidationResult } from './harness.js';
import type { ContextPack, RunState } from './records.js';
import type { UnifiedResult } from './result.js';
import type { UsageRecord } from './usage.js';

export interface CreateRunArgs {
  runId: string;
  taskId: string;
  stageId: string;
  harnessId: string;
  config: HarnessConfig;
  /** 执行工作目录（写入型为 worktree）。 */
  workspace: string;
  /** 任务态注入后的输入（旧 adapter 降级用）。 */
  prompt: string;
  /** 可选：结构化上下文；与 prompt 并列（M3 起）。 */
  context?: ContextPack;
  ownedPaths: string[];
  model: string | null;
  timeoutMs: number | null;
}

export interface RunHandle {
  runId: string;
  harnessId: string;
  pid: number | null;
}

/** 所有 harness 适配器实现的统一生命周期接口（见 architecture §4.1）。 */
export interface HarnessAdapter {
  manifest(): HarnessManifest;
  validateConfig(config: HarnessConfig): Promise<ValidationResult>;
  healthCheck(config: HarnessConfig): Promise<HealthReport>;

  createRun(args: CreateRunArgs): Promise<RunHandle>;
  streamEvents(handle: RunHandle): AsyncIterable<UnifiedEvent>;
  getStatus(handle: RunHandle): Promise<RunState>;
  interrupt(handle: RunHandle): Promise<void>;
  collectResult(handle: RunHandle): Promise<UnifiedResult>;
  cleanup(handle: RunHandle): Promise<void>;

  /** 可选：上报本次 Run 的用量（D6）。不支持的 adapter 可省略。 */
  collectUsage?(handle: RunHandle): Promise<UsageRecord[]>;
}
