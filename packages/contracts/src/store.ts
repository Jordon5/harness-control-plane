import type {
  ApprovalRecord,
  ApprovalStatus,
  ArtifactRecord,
  ContextRecord,
  EventRecord,
  ProjectRecord,
  RunRecord,
  StageRecord,
  StageStatus,
  TaskRecord,
  TaskStatus,
} from './records.js';
import type { UsageRecord } from './usage.js';

/** Run 的可变字段集合（创建后仅这些可更新）。 */
export interface RunPatch {
  harnessId?: string | null;
  model?: string | null;
  pid?: number | null;
  status?: RunRecord['status'];
  exitCode?: number | null;
  startedAt?: string | null;
  endedAt?: string | null;
  result?: RunRecord['result'];
  error?: string | null;
  configRef?: string | null;
}

/**
 * 持久化接口。首期实现：内存（测试）/ SQLite（node:sqlite）。
 * 同步签名：两种实现底层均为同步驱动。
 */
export interface Store {
  upsertProject(project: ProjectRecord): void;
  getProject(id: string): ProjectRecord | null;

  createTask(task: TaskRecord): void;
  getTask(id: string): TaskRecord | null;
  updateTaskStatus(id: string, status: TaskStatus, updatedAt: string): void;

  createStage(stage: StageRecord): void;
  getStage(id: string): StageRecord | null;
  listStagesByTask(taskId: string): StageRecord[];
  updateStageStatus(id: string, status: StageStatus, workspace?: string | null): void;

  createRun(run: RunRecord): void;
  getRun(id: string): RunRecord | null;
  listRunsByStage(stageId: string): RunRecord[];
  updateRun(id: string, patch: RunPatch): void;

  /** 追加事件，返回自增 id（ADR-008 全量保留，无清理接口）。 */
  appendEvent(event: Omit<EventRecord, 'id'>): number;
  listEvents(runId: string, afterId?: number): EventRecord[];

  createArtifact(artifact: ArtifactRecord): void;
  listArtifactsByRun(runId: string): ArtifactRecord[];

  createApproval(approval: ApprovalRecord): void;
  getApproval(id: string): ApprovalRecord | null;
  updateApproval(id: string, status: ApprovalStatus, decidedAt: string, note?: string): void;

  /** 桩 D6：用量采集。 */
  appendUsage(usage: UsageRecord): void;
  listUsageByRun(runId: string): UsageRecord[];

  /** 桩 D9：项目级上下文记录（M1 只写；注入在 M3）。 */
  appendContext(context: ContextRecord): void;
  listContextByProject(projectId: string): ContextRecord[];

  close(): void;
}
