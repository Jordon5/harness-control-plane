# M2 — 单 harness 打通（pi）· 验收核查

> 对照 [plan.md](./plan.md) 的验收点逐条核查。日期：2026-09-16 · 结论：**6/6 通过**

---

## 1. 验收点核查

| # | 验收点 | 结果 | 证据 |
|---|---|---|---|
| 1 | `npm test` 全绿；`npm run typecheck` 无错误 | ✅ | 全量 **30 通过 / 1 跳过**（默认跳过 integration）；开 `HCP_INTEGRATION=1` 时 **31 通过**；typecheck 干净 |
| 2 | adapter-cli 通用链路（假 CLI） | ✅ | `fixtures/fake-cli.mjs`：正常 / 非0退出 / 超时kill / interrupt / healthCheck，5 用例 |
| 3 | adapter-pi 解析（样本） | ✅ | 合成样本 + **真实成功样本** + 真实错误样本：映射、usage 抽取、未知行降级保留 raw，9 用例 |
| 4 | adapter-pi `buildArgs` | ✅ | 断言等于 `--mode json --no-session --provider … --model … <prompt>` |
| 5 | 端到端真实调用 pi | ✅ | `HCP_INTEGRATION=1` 真跑 `iottepa-domestic/deepseek-v4.1-flash`：事件流 + `UnifiedResult` + `collectUsage`，1.6s |
| 6 | impact-graph 登记；verification 填写 | ✅ | 影响图已更新；本文件 |

**端到端运行方式**：

```bash
HCP_INTEGRATION=1 IOTTEPA_DOMESTIC_API_KEY=<key> npx vitest run packages/adapters/adapter-pi/test
```

## 2. 本机实测发现（关键）

1. **`-p` 不可用，用 `--mode json`**：`pi -p …` 立即失败（`Cannot read properties of undefined (reading 'includes')`）；**`--mode json` 单独用即流式非交互**。→ `buildArgs` 去掉 `-p`。
2. **pi 在 `--mode json` 后等待 stdin**：stdin 不关则进程不退出（曾挂起 3 分钟）；**关掉 stdin 后 3 秒退出**。→ adapter-cli spawn 用 `stdio: ['ignore','pipe','pipe']`（stdin 关闭）已正确处理。
3. **Windows：Node 无法直接 spawn npm 的 shim**：`spawn('pi')` → `ENOENT`（`pi` 是 `.cmd`/sh shim）。→ 引入 **`cross-spawn`**（解析 `.cmd` shim + 正确转义参数），adapter-cli 改用它。
4. **provider 选择**：可用线路为 `iottepa-domestic`（模型 `deepseek-v4.1-flash`，key 在**用户环境变量** `IOTTEPA_DOMESTIC_API_KEY`）。内置 `anthropic` 线路请求报错（pi/线路侧问题，非本项目）。
5. **真实 JSONL 形状**（`test/fixtures/pi-sample-real.jsonl`）：`session → agent_start → turn_start → (user)message_start/end → (assistant)message_start/(message_update…)…/message_end → turn_end → agent_end → agent_settled`；消息内 `timestamp` 为 epoch 数字；`usage` 出现在 `message_update`/`message_end`/`turn_end`；末事件 `agent_settled`（文档未列，已解析）。

## 3. 偏差与环境适配

| 项 | 计划 | 实际 | 原因 |
|---|---|---|---|
| pi 调用参数 | `-p --mode json` | **`--mode json`（去 `-p`）** | `-p` 触发致命错误路径（§2.1） |
| 进程 spawn | `child_process.spawn` | **`cross-spawn`** | Windows 下 npm `.cmd` shim 无法直接 spawn（§2.3） |
| 契约 | — | `HarnessAdapter` 新增**可选** `collectUsage(handle)` | D6 用量上报出口；可选、不破坏既有实现 |

## 4. 未做（不属验收点）

- 任务态注入实际组装（M3；M2 只留 `--system-prompt` 接口）

## 5. 结论

M2 验收点 **6/6 通过**。adapter-cli 基类 + adapter-pi 实现经**真实端到端**验证（本机 pi + domestic 线路），事件流、结果、用量三项均正确落定。
新增依赖：`@hcp/adapter-cli` → `cross-spawn`。可进入下一阶段。
