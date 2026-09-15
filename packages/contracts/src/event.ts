/** 统一事件类型集（最小集，见 architecture §4.4）。 */
export type EventType =
  | 'run.started'
  | 'run.progress'
  | 'run.output'
  | 'tool.started'
  | 'tool.completed'
  | 'artifact.created'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled';

export type EventSource = 'stdout' | 'stderr' | 'server';

export interface RawEvent {
  source: EventSource;
  payload: string;
}

/** 所有 adapter 必须把原始输出归一化为该形态；raw 保留原文不丢信息。 */
export interface UnifiedEvent {
  runId: string;
  taskId: string;
  harness: string;
  type: EventType;
  timestamp: string;
  message: string | null;
  raw: RawEvent;
}
