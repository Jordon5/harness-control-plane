import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import type {
  HarnessRequirement,
  StageDefinition,
  TaskDefinition,
} from '@hcp/contracts';

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const HarnessRequirementInput = z.object({
  preferred: z.array(z.string().min(1)).min(1),
  requires: z.array(z.string().min(1)).default([]),
});

const StageInput = z.object({
  id: z.string().min(1),
  depends_on: z.array(z.string().min(1)).default([]),
  kind: z.enum(['harness', 'local-command']).default('harness'),
  harness: HarnessRequirementInput.optional(),
  command: z.string().min(1).optional(),
  mode: z.enum(['read-only', 'write', 'review']).default('read-only'),
  owned_paths: z.array(z.string().min(1)).default([]),
  timeout: z.string().min(1).optional(),
  retry: z.object({ max: z.number().int().min(0) }).default({ max: 0 }),
  output: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  intent: z.string().min(1).optional(),
  done: z.string().min(1).optional(),
});

const TaskInput = z.object({
  schema: z.number().int().min(1).default(1),
  id: z.string().min(1),
  project: z.string().min(1),
  goal: z.string().optional(),
  stages: z.array(StageInput).min(1),
});

type StageInputT = z.infer<typeof StageInput>;
type TaskInputT = z.infer<typeof TaskInput>;

/** 解析 YAML 文本为归一化任务定义。 */
export function parseTask(yamlText: string): ParseResult<TaskDefinition> {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (e) {
    return { ok: false, errors: [`YAML 解析失败：${(e as Error).message}`] };
  }
  return parseTaskObject(raw);
}

/** 校验已解析对象并归一化；同时做 DAG 完整性检查。 */
export function parseTaskObject(input: unknown): ParseResult<TaskDefinition> {
  const parsed = TaskInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: formatZodIssues(parsed.error) };
  }
  const task = parsed.data;

  const errors: string[] = [];

  for (const s of task.stages) {
    if (s.kind === 'harness' && !s.harness) {
      errors.push(`stages.${s.id}: kind=harness 需要 harness 字段`);
    }
    if (s.kind === 'local-command' && !s.command) {
      errors.push(`stages.${s.id}: kind=local-command 需要 command 字段`);
    }
  }

  const ids = new Set<string>();
  for (const s of task.stages) {
    if (ids.has(s.id)) errors.push(`stages.${s.id}: 重复的 stage id`);
    ids.add(s.id);
  }

  for (const s of task.stages) {
    for (const dep of s.depends_on) {
      if (dep === s.id) errors.push(`stages.${s.id}: 不能依赖自身`);
      else if (!ids.has(dep)) errors.push(`stages.${s.id}: depends_on 引用了不存在的 stage "${dep}"`);
    }
  }

  const cycle = detectCycle(task.stages);
  if (cycle) errors.push(`stages: 检测到循环依赖 ${cycle.join(' → ')}`);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: normalize(task) };
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

function detectCycle(stages: StageInputT[]): string[] | null {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const state = new Map<string, 'white' | 'gray' | 'black'>();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    const color = state.get(id) ?? 'white';
    if (color === 'black') return null;
    if (color === 'gray') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'gray');
    stack.push(id);
    for (const dep of byId.get(id)?.depends_on ?? []) {
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 'black');
    return null;
  }

  for (const s of stages) {
    const found = visit(s.id);
    if (found) return found;
  }
  return null;
}

function normalize(task: TaskInputT): TaskDefinition {
  return {
    schema: task.schema,
    id: task.id,
    project: task.project,
    goal: task.goal ?? null,
    stages: task.stages.map(normalizeStage),
  };
}

function normalizeStage(s: StageInputT): StageDefinition {
  const harness: HarnessRequirement | null = s.harness
    ? { preferred: s.harness.preferred, requires: s.harness.requires }
    : null;
  return {
    id: s.id,
    dependsOn: s.depends_on,
    kind: s.kind,
    harness,
    command: s.command ?? null,
    mode: s.mode,
    ownedPaths: s.owned_paths,
    timeout: s.timeout ?? null,
    retry: { max: s.retry.max },
    output: s.output ?? null,
    model: s.model ?? null,
    intent: s.intent ?? null,
    done: s.done ?? null,
  };
}
