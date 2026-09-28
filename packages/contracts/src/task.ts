import type { Capability } from './harness.js';

export type StageKind = 'harness' | 'local-command';
export type StageMode = 'read-only' | 'write' | 'review';

/** Stage 对 harness 的需求：能力集 requires，优先序 preferred。 */
export interface HarnessRequirement {
  preferred: string[];
  requires: Capability[];
}

export interface RetryPolicy {
  max: number;
}

/**
 * 归一化后的 Stage 定义（默认值已填入）。
 * YAML 原始形态 → 经 schema 层解析 → 本类型。
 */
export interface StageDefinition {
  id: string;
  dependsOn: string[];
  kind: StageKind;
  harness: HarnessRequirement | null;
  command: string | null;
  mode: StageMode;
  ownedPaths: string[];
  timeout: string | null;
  retry: RetryPolicy;
  output: string | null;
  model: string | null;
  /** 本节点意图；缺省回退到任务 goal。 */
  intent: string | null;
  /** 完成判据（自然语言）。 */
  done: string | null;
}

/** 归一化后的任务定义。 */
export interface TaskDefinition {
  /** 可选版本号；缺省视为 1。 */
  schema: number;
  id: string;
  project: string;
  goal: string | null;
  stages: StageDefinition[];
}
