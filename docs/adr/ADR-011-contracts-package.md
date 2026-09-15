# ADR-011: 契约独立成包（@hcp/contracts）

- 状态：Accepted
- 日期：2026-09-15

## 背景

按 ADR-002，adapter 是独立插件包；按 ADR-006，用 npm workspaces 做包化。起初结构（structure.md v0.1）把域模型与接口放在 `@hcp/core`，adapter 依赖 `core`。

但 adapter 只需要**接口与共享类型**，不需要 core 的实现（调度、Store、schema）。若 adapter → core：

1. adapter 被迫携带 core 的全部实现依赖
2. 插件边界模糊，违背 ADR-002 的可扩展性目标

## 决策

将**共享类型与接口**独立为 `@hcp/contracts`（纯类型，零逻辑、零依赖）：

- 内容：域模型类型（manifest / event / result / task / records / usage）+ 接口（`HarnessAdapter` / `Store`）
- `@hcp/core`：实现（schema 解析、memory / sqlite Store、调度、上下文）
- `@hcp/adapter-*`：只依赖 `@hcp/contracts`，**不依赖** `@hcp/core`

依赖方向：

```text
contracts   （零依赖）
   ▲   ▲
   │   └─────────────┐
 core ───────────────┘        adapter-*
                                cli ──▶ core / registry
```

## 理由

- adapter 作为独立插件包，应只依赖稳定的契约，不依赖内核实现
- 契约包零依赖、编译快，充当所有包的公共语言
- 明确"共享语言"与"实现"的边界，避免 `core` 变成什么都往里塞的中心

## 后果

- 新增 `@hcp/contracts` 包（M1 建立）
- [structure.md](../structure.md) 与 ADR-002 的依赖方向表述更新为 adapter → contracts
- 契约变更影响面大，需版本化与审慎（同 ADR-009 的 adapter 协议稳定性考量）

## 替代方案

- **类型与接口留在 core，adapter 依赖 core**：M1 简单，但插件携带内核依赖、边界模糊，弃用
- **只把接口拆出、类型留 core**：会导致 `contracts` 依赖 `core`，方向反转，弃用
