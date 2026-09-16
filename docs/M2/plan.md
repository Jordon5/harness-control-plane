# M2 — 单 harness 打通（pi）

> 阶段：M2 · 状态：已完成 · 日期：2026-09-16
> 关联：[development-plan.md](../development-plan.md) · [architecture.md](../architecture.md) · [requirements.md](../requirements.md) · [structure.md](../structure.md) · [impact-graph.md](../impact-graph.md) · [ADR-009](../adr/ADR-009-adapter-scope.md) · 验收：[verification.md](./verification.md)

---

## 1. 目标

打通**第一个真实 harness**：能**编程式**调用 `pi` 完成一次任务，拿到结构化事件流与统一结果。产出 `adapter-cli` 通用基类 + `adapter-pi` 实现。

M2 不依赖调度：用一次手动驱动的 Run 即可验证；不碰 DAG、worktree、CLI。

## 2. 已探明的环境事实（pi v0.84.4，本机）

| 项 | 事实 |
|---|---|
| 可执行 | `pi`（全局，`@earendil-works/pi-coding-agent`） |
| 非交互 | `-p` / `--print`：处理 prompt 后退出 |
| **结构化输出** | **`--mode json`**：stdout 输出 **JSONL 事件流**（首选，免解析文本） |
| 其他模式 | `--mode text`（默认）/ `rpc` |
| 关键参数 | `--provider`、`--model`、`--no-session`、`--system-prompt`、`--append-system-prompt`、`--thinking`、`--tools/--no-tools` |
| 三条线路 | `iottepa-claude`(anthropic-messages) · `iottepa-gpt` · `iottepa-domestic`(openai-completions)；另有内置 `anthropic` |
| 默认 | provider `anthropic`，model `claude-opus-4-8` |
| 文档 | `.../pi-coding-agent/docs/json.md`（事件类型规范） |

**`--mode json` 事件流**（每行一个 JSON 对象）：

```text
{"type":"session","version":3,"id":...,"cwd":...}      ← 头
{"type":"agent_start"} / {"type":"turn_start"}
{"type":"message_start","message":{...}}
{"type":"message_update","usage":{...},"assistantMessageEvent":{"type":"text_delta","delta":"..."}}
{"type":"tool_execution_start","toolCallId","toolName","args"}
{"type":"tool_execution_end","toolCallId","toolName","result","isError"}
{"type":"message_end","message":{...}} / {"type":"turn_end",...} / {"type":"agent_end","messages":[...]}
```

> **关键**：`message_update.usage` 是 provider 上报的累计 usage → **即 D6 用量采集的来源**。

## 3. 目标产出（交付物）

| # | 交付物 | 说明 | 落位 |
|---|---|---|---|
| 1 | `adapter-cli` 基类 | CLI 型 harness 通用：子进程管理、行缓冲、超时/kill、清理、结果提取骨架 | `packages/adapters/adapter-cli/` |
| 2 | `adapter-pi` | `buildArgs` / `manifest` / `parseLine`(JSONL→事件) / usage 抽取 / `extractResult` | `packages/adapters/adapter-pi/` |
| 3 | 契约测试 | adapter-cli 用**假 CLI 脚本**；adapter-pi 用**固定 JSON 样本** | 各包 `test/` |
| 4 | 端到端（可选联网） | 真实 `pi` 调用一次，落事件与结果 | 标记 `@integration`，默认跳过 |

## 4. 关键设计

### 4.1 `CliAdapter` 抽象钩子（子类只实现差异）

```typescript
abstract class CliAdapter implements HarnessAdapter {
  protected abstract buildArgs(args: CreateRunArgs): string[];
  protected abstract parseLine(line: string): UnifiedEvent[];   // 0..n 个事件
  protected abstract extractUsage(line: string): UsageRecord[]; // 可选，M2 用于 pi
  protected abstract extractResult(ctx: ResultContext): UnifiedResult;
  // 公共：resolveCommand / spawn / 行缓冲 / timeout→kill / interrupt / cleanup / 退出码
}
```

`ResultContext` 提供：`exitCode`、`workspace`、`taskId`、累计的文本输出、`artifactHints`。

### 4.2 pi 事件映射（`parseLine`）

| pi 事件 | 归一化 `UnifiedEvent.type` |
|---|---|
| `session` / `agent_start` | `run.started` |
| `turn_start` | `run.progress` |
| `message_update` (text_delta) | `run.output` |
| `tool_execution_start` | `tool.started` |
| `tool_execution_end` | `tool.completed` |
| `agent_end` | `run.completed` |
| 其余未识别 | `run.output`（降级，不丢信息，ADR-003；`raw` 保留原行） |

### 4.3 `buildArgs`（pi）

```text
pi -p --mode json --no-session --provider <p> --model <m> <prompt>
```

（`--system-prompt` 供 M3 任务态注入使用，M2 先留接口。）

## 5. 验收点

- [ ] `npm test` 全绿；`npm run typecheck` 无错误
- [ ] **adapter-cli 通用链路**（假 CLI 脚本）：启动 → 行缓冲归一化事件 → 正常退出 → `UnifiedResult`；**超时被 kill**；`interrupt` 生效；`cleanup` 无泄漏
- [ ] **adapter-pi 解析**：固定 JSON 样本 → 事件类型映射正确、`usage` 抽取正确、未知行降级为 `run.output` 且保留 `raw`
- [ ] **adapter-pi `buildArgs`**：`provider/model/-p/--mode json/--no-session` 映射正确
- [ ] **端到端**（`@integration`，默认跳过）：真实调用 pi 一次，拿到事件流与 `UnifiedResult`
- [ ] `impact-graph.md` 登记新节点；本阶段 `verification.md` 填写

## 6. 非目标（明确排除）

- ❌ DAG 调度、worktree、状态机执行（M3）
- ❌ registry / 能力路由 / 降级（M4）
- ❌ `hcp` CLI 命令（M5）
- ❌ 除 pi 外的 harness（M4 / M6）
- ❌ 任务态注入的实际组装（M3；M2 只留 `--system-prompt` 接口）

## 7. 决策与实测结论

1. **真实调用**：已跑（`iottepa-domestic` / `deepseek-v4.1-flash`），端到端通过。
2. **provider**：内置 `anthropic` 线路请求报错；采用 `iottepa-domestic`，key 经用户环境变量 `IOTTEPA_DOMESTIC_API_KEY` 注入。
3. **`-p` 问题**：确认不可用（致命错误）→ 改用 `--mode json`。另发现 pi 在 json 模式后等 stdin、Windows 下 Node 无法直接 spawn npm `.cmd` shim。详见 [verification.md](./verification.md) §2。
