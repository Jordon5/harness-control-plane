import { describe, expect, it } from 'vitest';
import type {
  ContextRecord,
  RunRecord,
  StageRecord,
  Store,
  TaskRecord,
  UsageRecord,
} from '@hcp/contracts';
import { createMemoryStore, createSqliteStore } from '../src/index.js';

const factories: Array<[string, () => Store]> = [
  ['memory', createMemoryStore],
  ['sqlite', () => createSqliteStore(':memory:')],
];

const task: TaskRecord = {
  id: 'task1',
  projectId: 'proj1',
  definition: 'id: task1',
  status: 'pending',
  createdAt: '2026-09-15T00:00:00Z',
  updatedAt: '2026-09-15T00:00:00Z',
};

const stage: StageRecord = {
  id: 'stage1',
  taskId: 'task1',
  harnessId: 'pi',
  mode: 'write',
  dependsOn: ['stage0'],
  ownedPaths: ['src/**'],
  status: 'pending',
  workspace: null,
};

const run: RunRecord = {
  id: 'run1',
  stageId: 'stage1',
  harnessId: 'pi',
  model: 'glm',
  pid: null,
  status: 'running',
  exitCode: null,
  startedAt: null,
  endedAt: null,
  result: null,
  error: null,
  configRef: 'cfg@1',
};

for (const [implName, make] of factories) {
  describe(`Store (${implName})`, () => {
    it('任务 / stage / run 往返与状态更新', () => {
      const store = make();
      store.createTask(task);
      expect(store.getTask('task1')).toMatchObject({ id: 'task1', status: 'pending' });

      store.updateTaskStatus('task1', 'running', '2026-09-15T01:00:00Z');
      expect(store.getTask('task1')).toMatchObject({
        status: 'running',
        updatedAt: '2026-09-15T01:00:00Z',
      });

      store.createStage(stage);
      expect(store.getStage('stage1')).toMatchObject({
        dependsOn: ['stage0'],
        ownedPaths: ['src/**'],
        mode: 'write',
      });
      expect(store.listStagesByTask('task1')).toHaveLength(1);

      store.updateStageStatus('stage1', 'running', 'worktrees/stage1');
      expect(store.getStage('stage1')).toMatchObject({
        status: 'running',
        workspace: 'worktrees/stage1',
      });

      store.createRun(run);
      expect(store.getRun('run1')).toMatchObject({ status: 'running', configRef: 'cfg@1' });

      store.updateRun('run1', { status: 'completed', exitCode: 0, endedAt: '2026-09-15T02:00:00Z' });
      expect(store.getRun('run1')).toMatchObject({
        status: 'completed',
        exitCode: 0,
        configRef: 'cfg@1',
      });
      expect(store.listRunsByStage('stage1')).toHaveLength(1);
      store.close();
    });

    it('事件全量追加、递增 id 与 afterId 过滤（桩：全量保留）', () => {
      const store = make();
      const first = store.appendEvent({
        runId: 'run1',
        type: 'run.started',
        timestamp: 't1',
        message: null,
        raw: '{"source":"stdout","payload":""}',
      });
      const second = store.appendEvent({
        runId: 'run1',
        type: 'run.output',
        timestamp: 't2',
        message: 'hi',
        raw: '{"source":"stdout","payload":"hi"}',
      });
      expect(second).toBeGreaterThan(first);
      expect(store.listEvents('run1')).toHaveLength(2);
      expect(store.listEvents('run1', first)).toHaveLength(1);
      store.close();
    });

    it('用量采集（桩 D6）与项目级上下文记录（桩 D9）', () => {
      const store = make();
      const usage: UsageRecord = {
        id: 'u1',
        runId: 'run1',
        stageId: 'stage1',
        harnessId: 'pi',
        model: 'glm',
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        source: 'harness',
        timestamp: 't1',
        raw: { note: 'x' },
      };
      store.appendUsage(usage);
      const list = store.listUsageByRun('run1');
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ totalTokens: 150, source: 'harness', raw: { note: 'x' } });

      const ctx: ContextRecord = {
        id: 'c1',
        projectId: 'proj1',
        kind: 'gotcha',
        key: 'auth-timeout',
        value: '中转 openai-responses 不可用',
        sourceRunId: 'run1',
        createdAt: 't1',
      };
      store.appendContext(ctx);
      const ctxList = store.listContextByProject('proj1');
      expect(ctxList).toHaveLength(1);
      expect(ctxList[0]).toMatchObject({ kind: 'gotcha', key: 'auth-timeout' });
      store.close();
    });

    it('项目与审批记录', () => {
      const store = make();
      store.upsertProject({ id: 'proj1', root: '/repo', createdAt: 't1' });
      expect(store.getProject('proj1')).toMatchObject({ root: '/repo' });

      store.createApproval({
        id: 'ap1',
        runId: 'run1',
        taskId: 'task1',
        gate: 'merge',
        status: 'pending',
        requestedAt: 't1',
        decidedAt: null,
        note: null,
      });
      expect(store.getApproval('ap1')).toMatchObject({ gate: 'merge', status: 'pending' });
      store.updateApproval('ap1', 'approved', 't2', 'ok');
      expect(store.getApproval('ap1')).toMatchObject({ status: 'approved', note: 'ok' });
      store.close();
    });
  });
}
