export type RunOutcome = 'completed' | 'failed' | 'cancelled';

export interface TestOutcome {
  command: string;
  status: 'passed' | 'failed' | 'unknown';
}

/** 一次 Run 的统一结果模型（见 architecture §4.5）。 */
export interface UnifiedResult {
  taskId: string;
  harness: string;
  status: RunOutcome;
  workspace: string | null;
  changedFiles: string[];
  commit: string | null;
  summary: string;
  artifacts: string[];
  tests: TestOutcome | null;
  error: string | null;
}
