# Harness Control Plane — 代码结构

> 版本：v0.1 · 日期：2026-09-15
> 关联：[requirements.md](./requirements.md) · [architecture.md](./architecture.md) · [development-plan.md](./development-plan.md)

---

## 1. 顶层布局

```text
harness-control-plane/
├── docs/                          # 设计文档
│   ├── requirements.md
│   ├── architecture.md
│   ├── development-plan.md
│   ├── structure.md               # 本文件
│   ├── dev-rules.md               # 开发规则（R1 阶段留案 / R2 影响图 + 增量测试）
│   ├── impact-graph.md            # 代码链路影响图
│   ├── M1/                        # 阶段目录：plan.md（计划）+ verification.md（验收核查）
│   ├── M2/ …                      # 后续阶段同构
│   └── adr/                       # 架构决策记录
├── packages/                      # npm workspaces
│   ├── core/                      # 域模型、调度、状态机、Store、上下文
│   ├── registry/                  # manifest 加载、能力索引、路由
│   ├── adapters/
│   │   ├── adapter-cli/           # CLI 通用基类
│   │   ├── adapter-http/          # HTTP/SSE 基类
│   │   ├── adapter-claude-code/
│   │   ├── adapter-codex/
│   │   ├── adapter-pi/
│   │   └── adapter-template/      # 新 harness 脚手架
│   └── cli/                       # hcp 命令入口
├── examples/                      # 示例任务 YAML
├── .tmp/                          # 临时目录（包外，gitignore；见 dev-rules R3）
├── package.json                   # workspaces 根
├── tsconfig.base.json
└── vitest.config.ts
```

## 2. 包职责与依赖方向

| 包 | 职责 | 首次出现里程碑 |
|---|---|---|
| `@hcp/contracts` | **共享类型与接口**（manifest / event / result / task / records / usage / store / adapter），零逻辑、零依赖 | M1 |
| `@hcp/core` | 实现：任务 schema、Store、DAG 调度、状态机、审批、worktree、上下文 | M1 |
| `@hcp/registry` | manifest 加载（内置 + 配置）、能力索引、健康检查、路由策略 | M4 |
| `@hcp/adapter-cli` | CLI 型 harness 的通用基类（子进程、流解析、超时、清理） | M2 |
| `@hcp/adapter-pi` | pi 适配器（复用 `~/.pi/agent/models.json` 线路） | M2 |
| `@hcp/adapter-claude-code` | claude-code 适配器 | M4 |
| `@hcp/adapter-codex` | codex 适配器 | M4 |
| `@hcp/adapter-http` | 本地服务（SSE/HTTP）基类 | M6 |
| `@hcp/adapter-template` | 新 harness 接入脚手架 | M6 |
| `@hcp/cli` | `hcp` 命令入口（list/run/status/logs/diff/merge + serve） | M5 |

**依赖方向（禁止反向）**

```text
contracts   （零依赖，公共语言）
   ▲        ▲
   │        │
 core     adapter-*
   ▲
 registry ──▶ core        cli ──▶ core / registry
```

- **`contracts` 不得依赖任何内核包**（纯类型）。
- **`core` 不得依赖** `cli` / `registry` / `adapters`。
- **adapter 只依赖 `contracts`**，不依赖 `core`（ADR-011）。
- `core` 不得依赖 CLI 上下文（不直接 print、不读 `process.argv`）——为 HTTP 服务与 TUI 复用（ADR-007）。
- adapter 只实现接口差异部分，不编排、不持有跨任务状态（ADR-002）。

### 2.1 core 内部模块

| 模块 | 职责 | 里程碑 |
|---|---|---|
| `schema/` | 任务 YAML → `TaskDefinition` + 校验（默认值、错误语义） | M1 |
| `store/` | `Store` 接口实现（memory / sqlite） | M1 |
| `scheduler/` | DAG、状态机、调度循环 | M3 |
| `context/` | 项目级上下文记录（M1）/ 注入器（M3） | M1 / M3 |
| `workspace/` | worktree 创建 / 复用 / 清理 | M3 |

## 3. 命名约定

| 对象 | 约定 | 示例 |
|---|---|---|
| 包名 | `@hcp/<name>` | `@hcp/core` |
| 文件名 | `kebab-case.ts` | `unified-event.ts` |
| 类型 / 接口 | `PascalCase` | `HarnessManifest` |
| 函数 / 变量 | `camelCase` | `createRun` |
| 常量 | `UPPER_SNAKE` | `DEFAULT_TIMEOUT_MS` |

## 4. 运行时与工具链

| 项 | 选择 | 说明 |
|---|---|---|
| 语言 | TypeScript 5.x（`strict`） | ADR-006 |
| 运行时 | Node ≥ 22（当前 24.18） | 需 `node:sqlite` |
| 模块 | ESM（`"type": "module"`） | 现代默认 |
| 包管理 | npm workspaces | ADR-006 |
| 测试 | vitest | 快、TS 原生 |
| SQLite | **`node:sqlite`（内置）** | 避开 better-sqlite3 原生编译；在 `Store` 接口后可换（见下） |

> **对 ADR-005 的实现细化**：ADR-005 决策为"SQLite + `Store` 接口抽象"。驱动选用 Node 内置 `node:sqlite`（而非 better-sqlite3），以规避 Windows 原生模块编译（architecture §12 已知风险）。因 `Store` 接口已抽象，驱动更换不影响调用方，不构成对 ADR-005 的偏离。

## 5. 常用命令

```bash
npm install            # 安装 workspace 依赖
npm test               # 运行全部单测（vitest run）
npm run typecheck      # 类型检查（tsc --noEmit）
```

## 6. 扩展新 harness 的位置

新增 harness **只应新增** `packages/adapters/adapter-<name>/` 并注册 manifest，**不改动** `core` / `registry` / `cli`（ADR-002 的可扩展性验收）。
