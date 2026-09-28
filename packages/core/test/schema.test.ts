import { describe, expect, it } from 'vitest';
import { parseTask } from '../src/index.js';

const VALID = `
id: auth-refactor
project: ./my-repo
goal: 重构认证模块并补充测试
stages:
  - id: analyze
    harness: { preferred: [claude-code], requires: [repository-analysis] }
    mode: read-only
    output: analysis.md
  - id: implement
    depends_on: [analyze]
    harness: { preferred: [codex, claude-code], requires: [coding] }
    mode: write
    owned_paths: ["src/auth/**", "tests/auth/**"]
    timeout: 30m
    retry: { max: 1 }
  - id: verify
    depends_on: [implement]
    kind: local-command
    command: npm test
`;

describe('parseTask', () => {
  it('解析合法 YAML：映射 camelCase 并填默认值', () => {
    const r = parseTask(VALID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = r.value;

    expect(t.id).toBe('auth-refactor');
    expect(t.project).toBe('./my-repo');
    expect(t.goal).toBe('重构认证模块并补充测试');
    expect(t.stages).toHaveLength(3);

    const analyze = t.stages[0]!;
    expect(analyze.dependsOn).toEqual([]);
    expect(analyze.kind).toBe('harness');
    expect(analyze.retry).toEqual({ max: 0 });
    expect(analyze.ownedPaths).toEqual([]);
    expect(analyze.harness).toEqual({
      preferred: ['claude-code'],
      requires: ['repository-analysis'],
    });

    const impl = t.stages[1]!;
    expect(impl.dependsOn).toEqual(['analyze']);
    expect(impl.mode).toBe('write');
    expect(impl.timeout).toBe('30m');
    expect(impl.retry).toEqual({ max: 1 });
    expect(impl.ownedPaths).toEqual(['src/auth/**', 'tests/auth/**']);

    const verify = t.stages[2]!;
    expect(verify.kind).toBe('local-command');
    expect(verify.command).toBe('npm test');
    expect(verify.harness).toBeNull();
  });

  it('拒绝未知的 depends_on 引用', () => {
    const r = parseTask(`
id: t
project: .
stages:
  - id: a
    depends_on: [nope]
    harness: { preferred: [pi] }
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toContain('nope');
  });

  it('检测循环依赖', () => {
    const r = parseTask(`
id: t
project: .
stages:
  - id: a
    depends_on: [b]
    harness: { preferred: [pi] }
  - id: b
    depends_on: [a]
    harness: { preferred: [pi] }
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toContain('循环依赖');
  });

  it('拒绝重复的 stage id', () => {
    const r = parseTask(`
id: t
project: .
stages:
  - id: a
    harness: { preferred: [pi] }
  - id: a
    harness: { preferred: [pi] }
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toContain('重复');
  });

  it('local-command 缺 command 报错', () => {
    const r = parseTask(`
id: t
project: .
stages:
  - id: a
    kind: local-command
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toContain('command');
  });

  it('kind=harness 缺 harness 字段报错', () => {
    const r = parseTask(`
id: t
project: .
stages:
  - id: a
`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toContain('harness');
  });

  it('缺 stages 报错', () => {
    const r = parseTask(`
id: t
project: .
stages: []
`);
    expect(r.ok).toBe(false);
  });

  it('可选 schema 版本缺省为 1', () => {
    const r = parseTask(VALID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.schema).toBe(1);
  });

  it('intent/done 缺省为 null 且显式值生效', () => {
    const r = parseTask(`
schema: 1
id: t
project: .
stages:
  - id: a
    harness: { preferred: [pi] }
    intent: 做某事
    done: 检查点通过
  - id: b
    kind: local-command
    command: npm test
`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.stages[0]?.intent).toBe('做某事');
    expect(r.value.stages[0]?.done).toBe('检查点通过');
    expect(r.value.stages[1]?.intent).toBeNull();
    expect(r.value.stages[1]?.done).toBeNull();
  });

  it('YAML 语法错误给出可读信息', () => {
    const r = parseTask('id: t\n  bad: [');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]).toContain('YAML');
  });
});
