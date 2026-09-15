# ADR-002: Adapter 插件化，内核不感知具体 harness

- 状态：Accepted
- 日期：2026-09-14

## 背景

需要接入的 harness 会持续增加：Claude Code、Codex CLI、Gemini CLI、pi、Kimi Code、DSH，以及未来本地部署的 agent 服务。

如果内核用 `if harness == "pi"` 这类分支处理差异，每接一个新工具都要改核心代码，扩展成本随数量线性上升，且容易引入回归。

## 决策

内核只依赖统一的 Adapter 接口，不感知任何具体 harness：

```text
HarnessAdapter
├── manifest()          静态描述（能力、传输类型）
├── validateConfig()    配置校验
├── healthCheck()       探活
├── createRun()         启动执行
├── streamEvents()      统一事件流
├── getStatus()
├── interrupt()
├── collectResult()
└── cleanup()
```

并通过传输类型基类收敛公共逻辑：

| kind | 基类 | 适用 |
|---|---|---|
| `cli` | `CliAdapter` | 子进程类 harness |
| `local-server` | `HttpAdapter` | 本机 HTTP/SSE 服务 |
| `remote-service` | `RemoteAdapter`（预留） | 远程 API |

**新增 harness 的改动范围必须限于** `packages/adapters/adapter-<name>/` + 配置注册，不得修改 core / registry / cli。

## 理由

- 扩展成本恒定：第 N 个 harness 与第 1 个成本相当
- 内核与外部工具解耦，外部变化不外溢
- 便于独立测试每个 adapter

## 后果

- 需要设计足够稳定的接口与事件协议（见 ADR-003），否则接口频繁破坏所有 adapter
- 复杂 harness 的个性化能力可能需要通过 `options` 透传，而非接口扩展
- 增加一层抽象，简单场景下有样板代码成本

## 替代方案

- **内核内分支处理**：初期快，但扩展成本线性上升，弃用
- **每个 harness 一个独立子项目**：隔离过度，编排逻辑重复，弃用
