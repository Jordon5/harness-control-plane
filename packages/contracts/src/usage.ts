/** 用量来源：harness 自报 / 外部网关 / 上游账单——支撑 UsageProvider 可插拔（需求 D6）。 */
export type UsageSource = 'harness' | 'gateway' | 'upstream-account';

/** 一次 Run 的用量记录；采集须在运行时落库，晚做不可回溯。 */
export interface UsageRecord {
  id: string;
  runId: string;
  stageId: string;
  harnessId: string;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  source: UsageSource;
  timestamp: string;
  raw: unknown | null;
}
