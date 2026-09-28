import type { CreateRunArgs, HarnessManifest, UnifiedEvent, UnifiedResult } from '@hcp/contracts';
import { CliAdapter, type LineContext, type ResultContext, type UsageSnapshot } from '@hcp/adapter-cli';

function renderProjectContext(ctx: NonNullable<CreateRunArgs['context']>): string | null {
  const lines: string[] = [];
  if (ctx.projectContext.length > 0) {
    lines.push('项目上下文（精选）：');
    for (const c of ctx.projectContext) lines.push(`- [${c.kind}] ${c.key}: ${c.value}`);
  }
  if (ctx.ownedPaths.length > 0) {
    lines.push('写入范围（owned_paths）：');
    for (const p of ctx.ownedPaths) lines.push(`- ${p}`);
  }
  if (ctx.doneCriteria) lines.push(`完成判据：${ctx.doneCriteria}`);
  if (lines.length === 0) return null;
  return lines.join('\n');
}

function buildPrimaryPrompt(args: CreateRunArgs): string {
  const ctx = args.context;
  if (!ctx) return args.prompt;
  const parts: string[] = [];
  if (ctx.goal) parts.push(`任务目标：${ctx.goal}`);
  parts.push(`当前节点：${ctx.stageIntent}`);
  return parts.join('\n');
}

export interface PiOptions {
  provider?: string;
  model?: string;
  thinking?: string;
  systemPrompt?: string;
  noContextFiles?: boolean;
}

const CAPABILITIES = ['coding', 'repository-analysis', 'code-review', 'fast-scan'];

interface PiEvent {
  type?: string;
  id?: unknown;
  toolName?: unknown;
  isError?: unknown;
  usage?: { input?: number; output?: number; totalTokens?: number } & Record<string, unknown>;
  assistantMessageEvent?: { type?: string; delta?: string };
  message?: { role?: string; content?: unknown };
}

/** pi 适配器（v0.84.4，`--mode json` JSONL 事件流）。 */
export class PiAdapter extends CliAdapter {
  manifest(): HarnessManifest {
    return {
      id: 'pi',
      adapter: '@hcp/adapter-pi',
      kind: 'cli',
      capabilities: CAPABILITIES,
      execution: {
        supportsStreaming: true,
        supportsResume: false,
        supportsWorktree: true,
        supportsJsonResult: true,
      },
      defaults: { model: this.options().model ?? 'claude-haiku-4-5' },
      injection: {
        channels: ['argv-prompt', 'append-system-prompt', 'file-refs', 'context-files'],
        discoversContextFiles: true,
      },
    };
  }

  protected resolveCommand(): string {
    return this.config.command ?? 'pi';
  }

  private options(): PiOptions {
    return (this.config.options ?? {}) as PiOptions;
  }

  protected buildArgs(args: CreateRunArgs): string[] {
    const o = this.options();
    // 注意：不传 `-p`。实测 pi v0.84.4 中 `-p` 在 provider 报错路径上会触发
    // 致命错误（`Cannot read properties of undefined (reading 'includes')`）；
    // `--mode json` 本身即流式非交互（处理完退出）。
    const argv = ['--mode', 'json', '--no-session'];
    if (o.noContextFiles) argv.push('--no-context-files');
    if (o.provider) argv.push('--provider', o.provider);
    const model = args.model ?? o.model;
    if (model) argv.push('--model', model);
    if (o.thinking) argv.push('--thinking', o.thinking);
    if (o.systemPrompt) argv.push('--system-prompt', o.systemPrompt);

    const ctx = args.context;
    if (ctx && this.manifest().injection?.channels.includes('append-system-prompt')) {
      const extra = renderProjectContext(ctx);
      if (extra) argv.push('--append-system-prompt', extra);
    }
    if (ctx && this.manifest().injection?.channels.includes('file-refs')) {
      for (const u of ctx.upstream) argv.push(`@${u.path}`);
    }

    argv.push(buildPrimaryPrompt(args));
    return argv;
  }

  protected parseLine(line: string, ctx: LineContext): UnifiedEvent[] {
    const obj = safeJson<PiEvent>(line);
    if (!obj || typeof obj.type !== 'string') return [];
    const ev = (type: UnifiedEvent['type'], message: string): UnifiedEvent => ({
      runId: ctx.runId,
      taskId: ctx.taskId,
      harness: ctx.harnessId,
      type,
      timestamp: new Date().toISOString(),
      message,
      raw: { source: 'stdout', payload: line },
    });

    switch (obj.type) {
      case 'session':
        return [ev('run.progress', `pi session ${String(obj.id ?? '')}`.trim())];
      case 'agent_start':
      case 'turn_start':
        return [ev('run.progress', obj.type)];
      case 'message_update': {
        const ae = obj.assistantMessageEvent;
        if (ae && typeof ae.delta === 'string') return [ev('run.output', ae.delta)];
        return [ev('run.progress', `message_update:${ae?.type ?? 'unknown'}`)];
      }
      case 'tool_execution_start':
        return [ev('tool.started', String(obj.toolName ?? 'tool'))];
      case 'tool_execution_end':
        return [ev('tool.completed', `${String(obj.toolName ?? 'tool')}${obj.isError ? ' (error)' : ''}`)];
      case 'message_end':
      case 'turn_end':
      case 'agent_end':
      case 'agent_settled':
        return [ev('run.progress', obj.type)];
      default:
        return [];
    }
  }

  protected parseUsage(line: string, _ctx: LineContext): UsageSnapshot | null {
    const obj = safeJson<PiEvent>(line);
    if (!obj || obj.type !== 'message_update' || !obj.usage) return null;
    const u = obj.usage;
    const input = u.input ?? 0;
    const output = u.output ?? 0;
    return {
      inputTokens: input,
      outputTokens: output,
      totalTokens: u.totalTokens ?? input + output,
      raw: u,
    };
  }

  protected extractResult(ctx: ResultContext): UnifiedResult {
    return {
      taskId: ctx.taskId,
      harness: ctx.harnessId,
      status: ctx.cancelled ? 'cancelled' : ctx.exitCode === 0 ? 'completed' : 'failed',
      workspace: ctx.workspace,
      changedFiles: [],
      commit: null,
      summary: lastAssistantText(ctx.stdoutLines),
      artifacts: [],
      tests: null,
      error: ctx.error,
    };
  }
}

function safeJson<T>(line: string): T | null {
  try {
    return JSON.parse(line) as T;
  } catch {
    return null;
  }
}

/** 从最后一条 assistant 的 message_end 提取正文，作为 summary。 */
function lastAssistantText(lines: string[]): string {
  for (let i = lines.length - 1; i >= 0; i--) {
    const obj = safeJson<PiEvent>(lines[i] as string);
    if (!obj || obj.type !== 'message_end' || obj.message?.role !== 'assistant') continue;
    const content = obj.message.content;
    if (Array.isArray(content)) {
      return content
        .filter((c): c is { type: string; text: string } => {
          const b = c as { type?: string; text?: string };
          return b?.type === 'text' && typeof b.text === 'string';
        })
        .map((c) => c.text)
        .join('');
    }
    if (typeof content === 'string') return content;
  }
  return '';
}
