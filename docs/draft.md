# Harness Control Plane — 项目规划草稿

> 状态：DRAFT v0.1
> 日期：2026-09-14
> 位置：`F:\harness-control-plane`

---

## 1. 项目定位

**可扩展的多 Agent Harness 中枢控制器（Extensible Harness Control Plane）**。

它不统一模型 API，也不替代任何 coding agent，而是统一**调度协议**：把 Claude Code、Codex CLI、Gemini CLI、pi、Kimi Code、DSH 等原生 harness 作为可插拔的执行节点，由中台负责任务编排、隔离、状态、审批和结果汇总。

核心原则：

```text
核心控制器负责"调度什么、何时调度、在哪里执行、结果如何合并"
Adapter 负责"某个具体 harness 如何工作"
```

---

## 2. 系统分层

```text
┌─────────────────────────────────────────────────┐
│                Control Plane                     │
│  任务 DAG / 调度 / 状态机 / 审批 / 合并 / 日志   │
├─────────────────────────────────────────────────┤
│              Harness Registry                    │
│  manifest 加载 / 能力声明 / 健康检查 / 路由      │
├─────────────────────────────────────────────────┤
│              Adapter Layer                       │
│  CLI Adapter │ HTTP/SSE Adapter │ (Remote 预留)  │
├─────────────────────────────────────────────────┤
│                 Workspaces                       │
│  Git worktree 池 / 文件所有权 / 只读隔离          │
└─────────────────────────────────────────────────┘
```

---

## 3. Adapter 插件协议

每个 harness 适配器实现统一生命周期接口：

```text
HarnessAdapter
├── manifest()          # id、版本、能力、传输类型、默认模型
├── validateConfig()    # 检查 CLI 是否存在、认证、模型可用性
├── healthCheck()       # 探活
├── createRun(task, workspace, options)   # 启动一次执行
├── streamEvents()      # stdout/stderr/SSE → 统一事件流
├── getStatus(runId)
├── interrupt(runId)
├── collectResult(runId)  # 结构化结果 + 产物 + patch/commit
└── cleanup(runId)
```

### 3.1 传输类型

| 类型 | 说明 | 示例 |
|---|---|---|
| `cli` | 子进程，捕获 stdout/stderr、退出码、产物 | Claude Code、Codex、pi、Gemini、Kimi、DSH |
| `local-server` | HTTP / WebSocket / SSE / gRPC | 本机 agent daemon |
| `remote-service` | 远程 API + 轮询/回调（预留） | 云端 worker |

### 3.2 统一事件模型

```json
{
  "runId": "run_01HXY...",
  "taskId": "review-auth",
  "harness": "kimi-code",
  "type": "tool.started",
  "timestamp": "2026-09-14T12:00:00Z",
  "message": "Running tests",
  "raw": { "source": "stdout", "payload": "..." }
}
```

最小事件集：

```text
run.started / run.progress / run.output
tool.started / tool.completed
artifact.created
run.completed / run.failed / run.cancelled
```

### 3.3 统一结果模型

```json
{
  "taskId": "implement-auth",
  "harness": "codex",
  "status": "completed",
  "workspace": "worktrees/implement-auth",
  "changedFiles": ["src/auth.ts"],
  "commit": null,
  "summary": "Implemented authentication flow.",
  "artifacts": ["review.md"],
  "tests": { "command": "npm test", "status": "passed" },
  "error": null
}
```

---

## 4. 能力声明与动态路由

Harness 通过 manifest 声明能力，调度器按任务需求路由，而非写死 if-else：

```yaml
id: kimi-code
kind: cli
capabilities: [coding, repository-analysis, code-review]
execution:
  supports_streaming: true
  supports_resume: false
  supports_worktree: true
  supports_json_result: false
```

任务侧声明需求：

```yaml
task:
  requires: [coding, repository-analysis]
  preferred_harnesses: [claude-code, kimi-code]
```

支持降级策略：首选 harness 不可用/超时/成本超限时，自动选择满足能力的次选。

---

## 5. 工作区隔离

- **只读任务**（分析、审查）：直接使用主工作区，禁止写入
- **写入任务**（实现）：为每次 run 创建独立 Git worktree
- 每个任务声明 `owned_paths`（允许修改的路径 glob）
- 调度器检测两个写入任务路径重叠时强制串行或人工确认
- 产物合并只允许在人工审批后由控制器执行（patch apply / cherry-pick）

```text
repo/
├── main/
└── worktrees/
    ├── implement-auth/
    ├── test-auth/
    └── review-auth/
```

---

## 6. 任务 DAG 与调度

- 任务定义为 YAML，支持 `depends_on`、并行组、超时、重试策略
- 调度器拓扑排序后按能力路由执行
- 状态机：`pending → running → completed / failed / cancelled`
- 人工审批点（gate）：写入任务首跑、合并、push/部署、批量删除、跨任务路径冲突

---

## 7. 技术栈选型

| 层 | 选择 | 理由 |
|---|---|---|
| 核心语言 | **TypeScript / Node.js** | 跨平台子进程管理、SSE/HTTP 原生支持、插件 npm 生态、与 pi/各类 CLI 工具链同构 |
| CLI 框架 | commander 或 cac | 轻量、成熟 |
| 存储 | **SQLite**（better-sqlite3） | 本地持久化任务/运行/事件，后续可换 |
| 工作流 | 首期内置简单 DAG 调度器；预留 Temporal 迁移接口 | 不过早引入复杂度 |
| 测试 | vitest | 快、TS 原生 |

> 未决（待确认）：语言是否改用 Python（若团队更熟）；首期是否同时暴露本地 HTTP API。

---

## 8. 目录结构（MVP）

```text
F:\harness-control-plane\
├── docs/                     # 规划与设计文档
│   └── draft.md
├── packages/
│   ├── core/                 # 调度器、DAG、状态机、审批、worktree 管理
│   ├── registry/             # manifest 发现与加载
│   ├── adapters/
│   │   ├── adapter-cli/      # CLI 通用基类（覆盖大多数命令行 harness）
│   │   ├── adapter-http/     # HTTP/SSE 通用基类
│   │   ├── adapter-claude-code/
│   │   ├── adapter-pi/
│   │   └── adapter-template/ # 新 harness 接入模板
│   └── cli/                  # hcp 命令行入口
├── examples/
│   └── auth-refactor.task.yaml
├── package.json              # npm workspaces
└── tsconfig.base.json
```

## 9. MVP 命令

```text
hcp list                     # 列出已注册 harness 及健康状态
hcp run <task.yaml>          # 按 DAG 执行任务
hcp status [runId]           # 查看运行状态
hcp logs <runId> [-f]        # 查看/跟随日志
hcp diff <runId>             # 查看该 run 产生的改动
hcp merge <runId>            # 人工确认后合并 patch/commit
```

## 10. 首批适配器

1. `adapter-cli` 通用基类
2. `adapter-pi`（参考实现，复用 `~/.pi/agent/models.json` 三条线路：anthropic-messages / openai-completions）
3. `adapter-claude-code`
4. `adapter-http`（为 kimi code 本地服务 / dsh 预留）
5. `adapter-template`（新 harness 接入的脚手架）

注意：中转 `api.iottepa.cn` 已验证**不支持** `openai-responses`，所有 OpenAI 兼容线路一律使用 `openai-completions`。

## 11. 验收标准（MVP）

- [ ] 能用一个 YAML 定义 analyze → implement → review 的 DAG 并跑通
- [ ] 写入型任务自动创建 worktree，只读任务无写权限
- [ ] pi 与 claude-code 两个真实适配器完成端到端调用
- [ ] 事件与结果持久化到 SQLite，进程崩溃后可查
- [ ] `hcp diff` 输出改动，`hcp merge` 需人工确认

---

## 附：待确认问题

1. 核心语言最终确认（TS vs Python）
2. 首期是否需要本地 HTTP API（供未来 Web UI）
3. Codex / Gemini / Kimi / DSH 适配器首期只预留模板还是实现
4. 事件保留策略（全量保留 or 滚动清理）
