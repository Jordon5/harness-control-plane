# Harness Control Plane — 架构文档

> 版本：v0.1（DRAFT）
> 日期：2026-09-14
> 关联：[requirements.md](./requirements.md) · [draft.md](./draft.md) · [development-plan.md](./development-plan.md) · [契约/](./契约/)

---

## 1. 问题与定位

### 1.1 要解决的问题

当前 AI 编程工具高度绑定自家 harness：

- 模型能力 ≠ 实际效果。真实效果 = 模型 + 原生系统提示 + 工具实现 + 上下文策略 + 权限模型 + 任务循环
- Claude Code、Codex CLI、Gemini CLI 等各家 harness 各有优势，把模型抽到统一 harness 里通常**次优**
- 用户需要同时使用多个 harness，但缺少统一的**任务编排、隔离、状态与合并**能力

### 1.2 定位

**可扩展的多 Agent Harness 调度平台。**（定位演进见 ADR-012）

它不统一模型 API，不替代任何 coding agent，只统一**调度协议**：

```text
核心控制器负责：调度什么、何时调度、在哪里执行、结果如何合并
Adapter 负责：某个具体 harness 如何工作
```

### 1.3 非目标（明确排除）

- ❌ 不做统一模型网关（不是 one-api / new-api 的替代）
- ❌ 不实现自己的 agent loop 或工具集
- ❌ 不追求替代 Claude Code / Codex 等任一 harness
- ❌ 首期不做 Web UI、不做多租户、不做分布式调度

---

## 2. 分层架构

```text
┌───────────────────────────────────────────────────────────┐
│                       CLI（hcp）                           │
│   list / run / status / logs / diff / merge                │
├───────────────────────────────────────────────────────────┤
│                    Control Plane（core）                    │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │ 任务模型 │ DAG 调度 │ 状态机   │ 审批 Gate│ 合并器   │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
├───────────────────────────────────────────────────────────┤
│                  Registry（能力注册表）                     │
│   manifest 加载 · 能力索引 · 健康检查 · 路由决策            │
├───────────────────────────────────────────────────────────┤
│                   Adapter Layer（适配层）                   │
│   ┌─────────────┬──────────────┬─────────────────────┐     │
│   │ adapter-cli │ adapter-http │ adapter-remote(预留) │     │
│   └─────────────┴──────────────┴─────────────────────┘     │
│     └── adapter-pi / adapter-claude-code / …（具体实现）    │
├───────────────────────────────────────────────────────────┤
│                  Workspaces（工作区）                       │
│   Git worktree 管理 · owned_paths 所有权 · 只读隔离         │
├───────────────────────────────────────────────────────────┤
│               Persistence（持久化）                         │
│   SQLite：tasks / runs / events / artifacts / approvals     │
└───────────────────────────────────────────────────────────┘
```

### 2.1 各层职责边界

| 层 | 负责 | 不负责 |
|---|---|---|
| CLI | 参数解析、人类可读输出 | 业务逻辑 |
| Control Plane | 任务解析、DAG、状态、审批、合并 | 如何调用某个 CLI |
| Registry | manifest 发现、能力索引、路由 | 具体执行 |
| Adapter | 启动/交互/事件解析/结果提取 | 任务编排、跨任务状态 |
| Workspaces | 目录隔离、所有权校验 | 决定用哪个 harness |
| Persistence | 记录与查询 | 业务规则 |

---

## 3. 核心概念与数据模型

### 3.1 概念

| 概念 | 含义 |
|---|---|
| **Harness** | 一个可被调度的执行器（Claude Code / pi / Kimi Code …） |
| **Adapter** | 把某个 harness 接入本系统的适配器实现 |
| **Project** | 一次被编排的目标代码库（对应一个 git 仓库） |
| **Task** | 用户定义的编排单元，含 DAG、路由需求、权限声明 |
| **Stage** | Task 内的一个执行节点，绑定一个 harness |
| **Run** | Stage 的一次具体执行（一个进程 / 一个会话） |
| **Event** | Run 产生的统一事件（日志、工具调用、产物） |
| **Artifact** | Run 产出的文件（md / patch / 测试报告） |
| **Approval** | 需要人工确认的 Gate 记录 |

### 3.2 关系

```text
Project 1 ── * Task 1 ── * Stage 1 ── * Run 1 ── * Event
                                    └── * Artifact
                                    └── * Approval
```

### 3.3 持久化 Schema（SQLite）

```sql
-- 任务定义（来自 YAML，快照存储）
CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  definition    TEXT NOT NULL,      -- 原始 YAML
  status        TEXT NOT NULL,      -- pending|running|completed|failed|cancelled
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 执行节点
CREATE TABLE stages (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  harness_id    TEXT NOT NULL,
  mode          TEXT NOT NULL,      -- read-only|write
  depends_on    TEXT NOT NULL,      -- JSON 数组
  owned_paths   TEXT,               -- JSON 数组（glob）
  status        TEXT NOT NULL,
  workspace     TEXT,               -- worktree 路径（写入型）
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- 一次执行
CREATE TABLE runs (
  id            TEXT PRIMARY KEY,
  stage_id      TEXT NOT NULL,
  harness_id    TEXT NOT NULL,
  model         TEXT,
  pid           INTEGER,
  status        TEXT NOT NULL,
  exit_code     INTEGER,
  started_at    TEXT,
  ended_at      TEXT,
  result        TEXT,               -- JSON，统一结果模型
  error         TEXT,
  config_ref    TEXT,               -- 本次 run 的 prompt/config 版本（D7）
  FOREIGN KEY (stage_id) REFERENCES stages(id)
);

-- 事件流（统一事件模型，保留 raw）
CREATE TABLE events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT NOT NULL,
  type          TEXT NOT NULL,
  timestamp     TEXT NOT NULL,
  message       TEXT,
  raw           TEXT,               -- JSON 原文
  FOREIGN KEY (run_id) REFERENCES runs(id)
);
CREATE INDEX idx_events_run ON events(run_id, id);

-- 产物
CREATE TABLE artifacts (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  kind          TEXT NOT NULL,      -- markdown|patch|report|other
  path          TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- 审批记录
CREATE TABLE approvals (
  id            TEXT PRIMARY KEY,
  run_id        TEXT,
  task_id       TEXT,
  gate          TEXT NOT NULL,      -- first-write|merge|push|destructive|path-conflict
  status        TEXT NOT NULL,      -- pending|approved|rejected
  requested_at  TEXT NOT NULL,
  decided_at    TEXT,
  note          TEXT
);

-- 用量（D6：运行时采集，晚做不可回溯）
CREATE TABLE usage (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  stage_id      TEXT NOT NULL,
  harness_id    TEXT NOT NULL,
  model         TEXT,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens  INTEGER NOT NULL,
  source        TEXT NOT NULL,      -- harness|gateway|upstream-account
  timestamp     TEXT NOT NULL,
  raw           TEXT
);

-- 项目级上下文（D9：M1 只记录，注入在 M3）
CREATE TABLE context (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,      -- decision|convention|gotcha|note
  key           TEXT NOT NULL,
  value         TEXT NOT NULL,
  source_run_id TEXT,
  created_at    TEXT NOT NULL
);
```

> 存储层通过接口 `Store` 抽象，SQLite 为首期实现，便于后续替换。

---

## 4. Adapter 插件协议

### 4.1 生命周期接口

> 类型与接口定义见 `packages/contracts/src/`（`@hcp/contracts`，ADR-011）。

```typescript
interface HarnessAdapter {
  manifest(): HarnessManifest;
  validateConfig(cfg: HarnessConfig): Promise<ValidationResult>;
  healthCheck(cfg: HarnessConfig): Promise<HealthReport>;

  createRun(args: CreateRunArgs): Promise<RunHandle>;
  streamEvents(handle: RunHandle): AsyncIterable<UnifiedEvent>;
  getStatus(handle: RunHandle): Promise<RunStatus>;
  interrupt(handle: RunHandle): Promise<void>;
  collectResult(handle: RunHandle): Promise<UnifiedResult>;
  cleanup(handle: RunHandle): Promise<void>;
}
```

### 4.2 传输类型与对应基类

| kind | 基类 | 适用 |
|---|---|---|
| `cli` | `CliAdapter` | Claude Code、Codex、pi、Gemini、Kimi Code、DSH |
| `local-server` | `HttpAdapter` | 本机 daemon（SSE/WebSocket/HTTP） |
| `remote-service` | `RemoteAdapter`（预留） | 云端 worker + 轮询/回调 |

**关键设计：** 具体 harness（pi、claude-code）只实现差异部分（参数拼装、事件解析、结果提取），公共部分（进程管理、超时、退出码、写盘、事件归一化）由 `CliAdapter` 基类提供。

### 4.3 新增一个 harness 的最小工作量

```text
1. 新建 packages/adapters/adapter-<name>/
2. 继承 CliAdapter
3. 实现：buildArgs() / parseEvent() / extractResult()
4. 写 manifest()
5. 在 hcp 配置中注册
```

不需要改动 core / registry / cli。

### 4.4 事件归一化协议

所有 adapter 必须把原始输出映射为统一事件：

```json
{
  "runId": "run_01HXY",
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
run.started      运行开始
run.progress     进度/阶段
run.output       普通输出
tool.started     工具调用开始
tool.completed   工具调用结束
artifact.created 产物生成
run.completed    正常结束
run.failed       异常结束
run.cancelled    被中断
```

规则：

- `raw` 必须保留原文，便于排障与回放
- 无法归类的内容一律映射为 `run.output`，不丢信息
- adapter 不得阻塞事件流；解析失败降级为 `run.output`

### 4.5 统一结果模型

```json
{
  "taskId": "implement-auth",
  "harness": "codex",
  "status": "completed",
  "workspace": "worktrees/implement-auth",
  "changedFiles": ["src/auth.ts", "tests/auth.test.ts"],
  "commit": null,
  "summary": "Implemented authentication flow.",
  "artifacts": ["review.md"],
  "tests": { "command": "npm test", "status": "passed" },
  "error": null
}
```

---

## 5. 能力声明与路由

### 5.1 Manifest 示例

```yaml
id: kimi-code
adapter: "@hcp/adapter-kimi-code"
kind: cli
capabilities: [coding, repository-analysis, code-review]
execution:
  supports_streaming: true
  supports_resume: false
  supports_worktree: true
  supports_json_result: false
defaults:
  model: kimi-k3
```

### 5.2 路由决策

输入：Stage 的 `requires` + `preferred_harnesses`；输出：选中 harness 或失败。

```text
1. 过滤：capabilities ⊇ requires
2. 过滤：execution 满足约束（如写入型需 supports_worktree）
3. 排序：preferred_harnesses 优先 → 健康状态 → 成本/并发策略
4. 降级：首选不可用/超时/失败时，取下一个满足能力者
```

### 5.3 路由策略（可插拔）

| 策略 | 说明 |
|---|---|
| `preferred-first` | 按声明顺序（默认） |
| `cheapest` | 按成本权重 |
| `fastest` | 按历史 P50 耗时 |
| `round-robin` | 均衡负载 |

---

## 6. 工作区与隔离模型

### 6.1 隔离级别

| Stage mode | 工作区 | 权限 |
|---|---|---|
| `read-only` | 主工作区 | 禁止写入 |
| `write` | 独立 Git worktree | 仅允许 `owned_paths` |
| `review` | 基于目标 run 的只读快照 | 只读 |

### 6.2 冲突控制

```text
写入型 Stage 并行执行前检查 owned_paths 是否重叠
  ├── 不重叠 → 可并行
  └── 重叠   → 强制串行 或 触发 path-conflict 审批
```

### 6.3 合并流程

```text
Stage 产出（commit / patch）
        ↓
[hcp merge] 人工确认
        ↓
校验：无未提交改动、无冲突、测试通过
        ↓
cherry-pick / apply patch 到目标分支
        ↓
记录合并结果与来源 run
```

---

## 7. 任务 DAG 与执行

### 7.1 任务定义格式

```yaml
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

  - id: fast-scan
    depends_on: [implement]
    harness: { preferred: [pi], requires: [fast-scan] }
    mode: read-only
    model: glm-5.3-flash

  - id: verify
    depends_on: [fast-scan]
    kind: local-command
    command: npm test
```

> **Schema 设计约束**（见 requirements D8）：任务 YAML 需同时满足"**人写不累**"与"**AI 写不出错**"——严格 schema、强默认、选项极少、机器可校验、错误可读，为将来"意图 → 轻量 AI 生成 DAG"预留。

### 7.2 执行流程

```text
解析 YAML → 构建 DAG → 拓扑排序
  → 就绪队列（依赖全部 completed）
  → 路由选 harness
  → 检查写权限 / 创建 worktree
  → 组装上下文（项目级 + 上游产物，精简注入，D9）
  → 执行 Run，流式写入 events
  → 收集结果，判定 completed/failed
  → 失败按 retry 策略处理
  → 全部门通过 → 触发合并 Gate
```

### 7.3 状态机

```text
pending ──▶ running ──▶ completed
                 └────▶ failed ──(retry)──▶ pending
                 └────▶ cancelled
```

---

## 8. 审批与安全边界

### 8.1 Gate 类型

| Gate | 触发时机 | 默认 |
|---|---|---|
| `first-write` | 首次执行写入型 Stage | 需确认 |
| `merge` | 合并任何代码 | 需确认 |
| `push` | git push / 发布 | 需确认 |
| `destructive` | 批量删除 / 重命名 | 需确认 |
| `path-conflict` | 写入路径重叠 | 需确认 |

### 8.2 默认权限原则

```text
读操作（分析、审查）        → 可自动执行
写操作                     → 隔离 worktree 内执行
合并 / 推送 / 部署          → 默认等待人工确认
```

### 8.3 凭据处理

- 凭据通过环境变量或本机配置注入，不写入任务 YAML、不入库
- 事件 `raw` 与日志需对已知凭据做脱敏
- 未来接 harness 本地服务时，端点鉴权由配置层管理

---

## 9. 可观测性与运维

| 能力 | 首期 | 后续 |
|---|---|---|
| 运行状态 | SQLite + `hcp status` | 面板 |
| 日志 | `hcp logs`（读 events 表） | 实时跟随 + 过滤 |
| 事件回放 | 全量保留 | 滚动清理 / 归档 |
| 指标 | 运行耗时、生灭、失败率 | 成本统计、token 用量 |
| 追踪 | runId 贯穿 | OpenTelemetry |

---

## 10. 配置格式

### 10.1 全局配置 `hcp.config.yaml`

```yaml
harnesses:
  claude-code:
    adapter: "@hcp/adapter-claude-code"
    type: cli
    command: claude

  pi:
    adapter: "@hcp/adapter-pi"
    type: cli
    command: pi
    options:
      provider: iottepa-domestic
      model: glm-5.3-flash

  kimi-code:
    adapter: "@hcp/adapter-kimi-code"
    type: cli
    command: kimi

  local-agent:
    adapter: "@hcp/adapter-http"
    type: local-server
    endpoint: "http://127.0.0.1:8080"

storage:
  kind: sqlite
  path: ".hcp/hcp.db"

workspaces:
  root: ".hcp/worktrees"
  strategy: worktree

routing:
  default_strategy: preferred-first
```

### 10.2 配置优先级

```text
CLI 参数 > 项目 hcp.config.yaml > 用户全局配置 > 内置默认
```

---

## 11. 扩展点清单

| 扩展点 | 方式 | 用途 |
|---|---|---|
| 新 harness | 新增 adapter 包 + manifest | 接入 Kimi Code / DSH / 自建服务 |
| 新路由策略 | 实现 `RouteStrategy` | 成本 / 速度 / 负载 |
| 新 Stage 类型 | 实现 `StageExecutor` | local-command、脚本、人工节点 |
| 新存储 | 实现 `Store` | 换 Postgres / 远程 |
| 新审批 Gate | 注册 GateHandler | 自定义确认点 |
| 事件消费 | 订阅事件总线 | 通知、CI 集成 |

---

## 12. 已知约束与风险

| 项 | 说明 | 缓解 |
|---|---|---|
| 各家 CLI 无稳定机器接口 | 输出格式可能随版本变 | adapter 版本化 + `raw` 保留 + 契约测试 |
| 交互式 CLI 难自动化 | 部分 harness 需 TTY | 优先非交互模式（如 `-p`） |
| worktree 磁盘占用 | 多 worktree 叠加 | 定期清理 + 上限 |
| 中转能力限制 | `api.iottepa.cn` 不支持 `openai-responses` | 一律使用 `openai-completions` |
| Windows 路径/编码 | CRLF、GBK 控制台 | 统一 UTF-8、路径规范化 |
| 长任务进程管理 | 挂起/僵尸进程 | pid 记录 + 超时 kill + cleanup |

---

## 13. 已决问题

原待决项均已决策，详见 `docs/adr/`：

| 问题 | 结论 | ADR |
|---|---|---|
| 核心语言 | TypeScript | ADR-006 |
| 本地 HTTP API | 首期即暴露 | ADR-007 |
| 事件保留 | 全量保留 | ADR-008 |
| 适配器范围 | claude-code / codex / pi 完整实现，其余模板 | ADR-009 |
| 跨仓库编排 | 首期不支持，预留扩展空间 | ADR-010 |
