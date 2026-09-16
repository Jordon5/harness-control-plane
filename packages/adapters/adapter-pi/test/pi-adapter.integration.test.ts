import { describe, expect, it } from 'vitest';
import type { HarnessConfig, UnifiedEvent } from '@hcp/contracts';
import { PiAdapter } from '../src/index.js';

// 真实调用 pi（联网 + 计费）。设 HCP_INTEGRATION=1 才运行：默认跳过。
const enabled = process.env['HCP_INTEGRATION'] === '1';

const CONFIG: HarnessConfig = {
  adapter: '@hcp/adapter-pi',
  type: 'cli',
  command: 'pi',
  options: {
    provider: 'iottepa-domestic',
    model: 'deepseek-v4.1-flash',
    noContextFiles: true,
  },
};

describe.skipIf(!enabled)('PiAdapter 端到端（真实调用）', () => {
  it('调用 pi 完成一次最小任务：事件流 + 结果 + 用量', async () => {
    const adapter = new PiAdapter(CONFIG);
    const handle = await adapter.createRun({
      runId: 'it-1',
      taskId: 'it',
      stageId: 'it',
      harnessId: 'pi',
      config: CONFIG,
      workspace: process.cwd(),
      prompt: 'Reply with exactly: ok',
      ownedPaths: [],
      model: null,
      timeoutMs: 120_000,
    });

    const events: UnifiedEvent[] = [];
    for await (const e of adapter.streamEvents(handle)) events.push(e);

    expect(events[0]?.type).toBe('run.started');
    expect(events.at(-1)?.type).toBe('run.completed');

    const result = await adapter.collectResult(handle);
    expect(result.status).toBe('completed');

    const usage = await adapter.collectUsage(handle);
    expect(usage).toHaveLength(1);
    expect(usage[0]?.harnessId).toBe('pi');
    expect(usage[0]?.source).toBe('harness');

    await adapter.cleanup(handle);
  }, 180_000);
});
