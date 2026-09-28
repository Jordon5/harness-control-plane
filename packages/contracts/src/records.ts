import type { EventType } from './event.js';
import type { UnifiedResult } from './result.js';
import type { StageMode } from './task.js';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type StageStatus = TaskStatus;
export type RunState = TaskStatus;

export interface ProjectRecord {
  id: string;
  root: string;
  createdAt: string;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  /** 原始 YAML 快照（定义不可变，便于回放）。 */
  definition: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StageRecord {
  id: string;
  taskId: string;
  harnessId: string | null;
  mode: StageMode;
  dependsOn: string[];
  ownedPaths: string[];
  status: StageStatus;
  workspace: string | null;
}

export interface RunRecord {
  id: string;
  stageId: string;
  harnessId: string | null;
  model: string | null;
  pid: number | null;
  status: RunState;
  exitCode: number | null;
  startedAt: string | null;
  endedAt: string | null;
  result: UnifiedResult | null;
  error: string | null;
  /** 本次 Run 使用的 prompt / 配置版本（桩 D7，晚做不可回溯）。 */
  configRef: string | null;
}

export type ArtifactKind = 'markdown' | 'patch' | 'report' | 'other';

export interface ArtifactRecord {
  id: string;
  runId: string;
  kind: ArtifactKind;
  path: string;
  createdAt: string;
}

export type ApprovalGate = 'first-write' | 'merge' | 'push' | 'destructive' | 'path-conflict';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalRecord {
  id: string;
  runId: string | null;
  taskId: string | null;
  gate: ApprovalGate;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt: string | null;
  note: string | null;
}

/** 事件全量保留（ADR-008）；raw 为 RawEvent 的 JSON 序列化。 */
export interface EventRecord {
  id: number;
  runId: string;
  type: EventType;
  timestamp: string;
  message: string | null;
  raw: string;
}

export type ContextKind = 'decision' | 'convention' | 'gotcha' | 'note';

/** 项目级上下文条目（桩 D9，M1 只记录、不注入）。 */
export interface ContextRecord {
  id: string;
  projectId: string;
  kind: ContextKind;
  key: string;
  value: string;
  sourceRunId: string | null;
  createdAt: string;
}

/** 注入用瘦上下文：不把整条 ContextRecord 交给 adapter。 */
export interface ContextItem {
  kind: ContextKind;
  key: string;
  value: string;
}

/** 上游产物引用；harness 需要内容时自行读取。 */
export interface ArtifactRef {
  stageId: string;
  runId: string;
  path: string;
  kind: ArtifactKind;
}

/** 结构化注入给 harness 的一次 Run 上下文。 */
export interface ContextPack {
  goal: string | null;
  stageIntent: string;
  upstream: ArtifactRef[];
  projectContext: ContextItem[];
  ownedPaths: string[];
  doneCriteria: string | null;
}
