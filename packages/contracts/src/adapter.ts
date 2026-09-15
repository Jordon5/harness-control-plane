import type { UnifiedEvent } from './event.js';
import type { HarnessConfig, HarnessManifest, HealthReport, ValidationResult } from './harness.js';
import type { RunState } from './records.js';
import type { UnifiedResult } from './result.js';

export interface CreateRunArgs {
  runId: string;
  taskId: string;
  stageId: string;
  harnessId: string;
  config: HarnessConfig;
  /** 执行工作目录（写入型为 worktree）。 */
  workspace: string;
  /** 任务态注入后的输入（M1 仅占位；组装在 M3）。 */
  prompt: string;
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
}
