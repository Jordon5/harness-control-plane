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

/** adapter 支持的注入通道（core 只交 ContextPack，不拼具体 CLI）。 */
export type InjectionChannel =
  | 'argv-prompt'
  | 'system-prompt'
  | 'append-system-prompt'
  | 'file-refs'
  | 'context-files'
  | 'stdin'
  | 'json-body'
  | 'env';

export interface InjectionProfile {
  channels: InjectionChannel[];
  /** 上下文文件是否由 harness 自行发现；为 true 时调度侧可关掉自动发现避免双份。 */
  discoversContextFiles?: boolean;
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
  /** 可选：注入通道（旧 adapter 缺省时 core 仅送 prompt）。 */
  injection?: InjectionProfile;
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
