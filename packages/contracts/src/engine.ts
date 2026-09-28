import type { Store } from './store.js';
import type { UnifiedResult } from './result.js';
import type { ProjectRecord } from './records.js';
import type { StageDefinition, StageKind } from './task.js';
import type { HarnessAdapter } from './adapter.js';

/** 工作区抽象：Scheduler 不直接依赖 git。 */
export interface Workspace {
  /** 写入型：创建或复用 worktree，返回绝对路径。 */
  acquireWrite(project: ProjectRecord, taskId: string, stageId: string): Promise<string>;
  /** 只读型：返回该 project 的主工作区。 */
  acquireRead(project: ProjectRecord): Promise<string>;
  release(stageId: string): Promise<void>;
}

/** 非 harness 节点执行器（如 local-command）。 */
export interface StageExecutor {
  kind: StageKind;
  run(
    stage: StageDefinition,
    ctx: { workspace: string; timeoutMs: number | null },
  ): Promise<UnifiedResult>;
}

export interface SchedulerDeps {
  store: Store;
  workspace: Workspace;
  /** 按 harnessId 解析 adapter；Scheduler 不 new 具体类。 */
  resolveAdapter(harnessId: string): HarnessAdapter;
  /** 非 harness 节点；缺省时该类 Stage 直接失败。 */
  resolveExecutor?(kind: StageKind): StageExecutor;
  /** 可注入时钟，便于测试。 */
  now?: () => Date;
}

export interface Scheduler {
  submit(task: import('./task.js').TaskDefinition): Promise<{ taskId: string }>;
  interrupt(taskId: string): Promise<void>;
}
