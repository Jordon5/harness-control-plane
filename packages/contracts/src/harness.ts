/** 传输类型：决定用哪种 adapter 基类接入。 */
export type TransportKind = 'cli' | 'local-server' | 'remote-service';

/** 已知能力 + 允许自定义字符串；路由按集合包含匹配。 */
export type Capability =
  | 'coding'
  | 'repository-analysis'
  | 'code-review'
  | 'fast-scan'
  | (string & {});

/** harness 的执行特性，供路由按约束过滤（如写入型需 supportsWorktree）。 */
export interface ExecutionProfile {
  supportsStreaming: boolean;
  supportsResume: boolean;
  supportsWorktree: boolean;
  supportsJsonResult: boolean;
}

export interface HarnessDefaults {
  model?: string;
}

/** 一个 harness 的能力声明（由 adapter 的 manifest() 返回）。 */
export interface HarnessManifest {
  id: string;
  adapter: string;
  kind: TransportKind;
  capabilities: Capability[];
  execution: ExecutionProfile;
  defaults?: HarnessDefaults;
}

/** 某个 harness 在配置中的实例化参数。 */
export interface HarnessConfig {
  adapter: string;
  type: TransportKind;
  command?: string;
  endpoint?: string;
  options?: Record<string, unknown>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface HealthReport {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
}
