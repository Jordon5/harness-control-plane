# ADR-009: 首期适配器范围

- 状态：Accepted
- 日期：2026-09-15

## 背景

系统规划接入多家 harness（Claude Code、Codex CLI、Gemini CLI、pi、Kimi Code、DSH）。
首期若全部做成完整实现，工作量与维护面过大；若全部只留模板，则无法验证端到端链路。

## 决策

首期区分"完整实现"与"模板"两类：

| 类别 | harness | 说明 |
|---|---|---|
| 完整实现 | claude-code、codex、pi | 端到端可用，作为真实链路验证 |
| 模板 | kimi-code、dsh、gemini | 仅提供 `adapter-template` 脚手架与 manifest 占位 |

MVP 验收以 claude-code / codex / pi 三个真实 adapter 端到端通过为准。

## 理由

- 三个完整实现足以覆盖"cli 传输类型 + 多 harness 路由/降级"的核心假设
- 三个 harness 分属不同厂商与线路，能暴露 adapter 协议的真实差异
- 模板类保持"只加 adapter、不动内核"的扩展路径可被验证（M6）

## 后果

- `adapter-cli` 基类必须在三家差异中保持稳定
- 模板需随 `adapter-cli` 接口同步更新，避免腐化
- 未实现 harness 的能力声明仍可先行登记，供路由匹配

## 替代方案

- **全部实现**：覆盖全但拖慢 MVP，弃用
- **只做 pi 一个**：无法验证多 harness 路由与降级，弃用
