# M1 — 域模型（计划）

> 阶段：M1 · 状态：已完成 · 日期：2026-09-15
> 关联：[development-plan.md](../development-plan.md) · [architecture.md](../architecture.md) · [requirements.md](../requirements.md) · [structure.md](../structure.md) · [verification.md](./verification.md)

---

## 1. 目标

**冻结域模型与接口。** 只交付"模型与契约"，不含调度、执行、CLI。

M1 一结束，M2（adapter）与 M3（调度）即可并行开工——因为两者依赖的接口都已冻结。

## 2. 目标产出（交付物）

| # | 交付物 | 说明 | 落位 |
|---|---|---|---|
| 0 | `@hcp/contracts` 包 | 独立契约包（ADR-011） | `packages/contracts/` |
| 1 | 域模型类型 | `HarnessManifest` / `HarnessConfig` / 传输与执行特性 | `contracts/src/harness.ts` |
| 2 | 事件与结果类型 | `UnifiedEvent` / `UnifiedResult` | `contracts/src/event.ts`、`result.ts` |
| 3 | 任务定义类型 | `TaskDefinition` / `StageDefinition`（归一化形态） | `contracts/src/task.ts` |
| 4 | 记录与用量类型 | `RunRecord`（含 `configRef`）/ `UsageRecord` / `ContextRecord` 等 | `contracts/src/records.ts`、`usage.ts` |
| 5 | 适配器接口 | `HarnessAdapter` 生命周期接口 | `contracts/src/adapter.ts` |
| 6 | `Store` 接口 | tasks/stages/runs/events/artifacts/approvals + usage + context | `contracts/src/store.ts` |
| 7 | 任务 YAML schema | 达"AI 可生成"标准的 schema + 校验器（默认值 / 错误语义） | `core/src/schema/` |
| 8 | 内存 Store | 测试用实现 | `core/src/store/memory.ts` |
| 9 | SQLite Store | `node:sqlite` 实现 + 迁移 | `core/src/store/sqlite.ts` |
| 10 | **四根桩载体** | usage / `configRef` / 项目级上下文 / events 全量 | 并入 Store 实现 |
| 11 | 单测 | 类型校验、schema 正反例、Store CRUD、状态机流转 | `core/test/` |

## 3. 任务分解

- [x] `@hcp/contracts`：类型 + 接口（harness / event / result / task / records / usage / adapter / store）
- [x] 初始化 `packages/core`：package.json / tsconfig / 入口
- [x] schema：任务 YAML 规范 + 校验器（含默认值、错误信息）
- [x] 实现：内存 Store
- [x] 实现：SQLite Store（node:sqlite）+ 迁移脚本
- [x] 单测：schema / Store
- [x] 回写 architecture.md §3/§4（冻结后的最终形态）

## 4. 验收标准

- [x] `npm test` 全绿（vitest run）
- [x] `npm run typecheck` 无错误
- [x] schema 正反例：合法任务通过、非法任务给出可读错误
- [x] 接口冻结并回写 [architecture.md](../architecture.md) §3（数据模型）/ §4（adapter 协议）
- [x] `usage` / `run.config_ref` / 项目级上下文 / events 全量 —— 四根桩的落库路径均存在

> 核查记录见 [verification.md](./verification.md)。

## 5. 非目标（明确排除）

- ❌ DAG 调度、拓扑排序、状态机**执行**（M3）
- ❌ 任何具体 adapter 实现（M2 / M4）
- ❌ CLI 命令（M5）
- ❌ 上下文**注入器**（M3；M1 只做结构化**记录**）
- ❌ usage 的**展示与估算**（Should；M1 只做采集）

## 6. 契约落位与语义约定

**类型与接口 = 代码**（`packages/contracts/src/`，纯类型 + 接口，零实现）：

| 契约 | 文件 |
|---|---|
| manifest / config / transport / execution | `harness.ts` |
| 事件 | `event.ts` |
| 结果 | `result.ts` |
| 用量 | `usage.ts` |
| 任务定义 | `task.ts` |
| 各 Record | `records.ts` |
| `HarnessAdapter` | `adapter.ts` |
| `Store` | `store.ts` |

### 语义约定（代码表达不了、写在这里的部分）

- **命名映射**：任务 YAML 用 snake_case（`depends_on` / `owned_paths`），TS 契约用 camelCase；映射由 schema 层负责。
- **默认值**（schema 归一化时填入）：`kind=harness`、`mode=read-only`、`retry.max=0`、`dependsOn=[]`、`ownedPaths=[]`。
- **`timeout`**：归一化保留为时长字符串（如 `"30m"`），转毫秒在执行层。
- **`configRef`**：指向本次 Run 所用 prompt / 配置版本的标识（M1 只记录值）。
- **事件 `raw`**：`RawEvent` 的 JSON 序列化，原样保留（ADR-003）。

## 7. 依赖与并行

- **前置**：无（M1 是起点）。
- **解锁**：M2（adapter）与 M3（调度）在 M1 接口冻结后**可并行**（见 development-plan §4）。
