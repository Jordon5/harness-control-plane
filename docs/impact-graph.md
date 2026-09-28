# 代码链路影响图

> 随代码演进维护。**改代码前先查此图**，确定受影响链路与应跑的测试（见 [dev-rules.md](./dev-rules.md) R2）。
> 最后更新：2026-09-19（M3 节点预登记，实现未落地）

---

## 1. 当前链路

```text
@hcp/contracts                    （叶子，零依赖：src/*.ts）
   ▲        ▲           ▲
   │        │           │
core/schema core/store  adapter-cli
                          ▲
                          │
                       adapter-pi

M3 将增加（依赖 contracts；scheduler 依赖下列 + store）：
  core/scheduler  core/workspace  core/context  core/executor

（测试）
schema.test  store.test  adapter-cli/test  adapter-pi/test
```

## 2. 节点表

| 节点 | 文件 | 依赖 | 被谁依赖 |
|---|---|---|---|
| `contracts` | `packages/contracts/src/*.ts` | — | 所有包 |
| `core/schema` | `core/src/schema/task-schema.ts` | `contracts` | `schema.test` |
| `core/store` | `core/src/store/{memory,sqlite}.ts` | `contracts` | `store.test` |
| `adapter-cli` | `packages/adapters/adapter-cli/src/*.ts` | `contracts`、`cross-spawn`（外部） | `adapter-pi`、`adapter-cli/test` |
| `adapter-pi` | `packages/adapters/adapter-pi/src/*.ts` | `contracts`、`adapter-cli` | `adapter-pi/test` |
| `core/scheduler` | `core/src/scheduler/`（计划） | `contracts`、store、workspace、context、executor | scheduler 测试 |
| `core/workspace` | `core/src/workspace/`（计划） | `contracts` | scheduler、workspace 测试 |
| `core/context` | `core/src/context/`（计划） | `contracts` | scheduler、context 测试 |
| `core/executor` | `core/src/executor/`（计划） | `contracts` | scheduler、executor 测试 |

## 3. 测试覆盖映射

| 测试文件 | 覆盖节点 |
|---|---|
| `core/test/schema.test.ts` | `core/schema` |
| `core/test/store.test.ts` | `core/store`（memory + sqlite 双跑） |
| `adapter-cli/test/*.test.ts` | `adapter-cli`（假 CLI 脚本）|
| `adapter-pi/test/*.test.ts` | `adapter-pi`（固定 JSON 样本）|
| `adapter-*/test/*.integration.test.ts` | `adapter-pi` 真实调用（默认跳过）|

## 4. 影响规则（改哪测哪）

| 改动位置 | 受影响链路 | 应跑 |
|---|---|---|
| `contracts` | 所有下游 | **全量**（契约影响面最大） |
| `core/schema` | schema | `schema.test` |
| `core/store` | store | `store.test` |
| `adapter-cli` | adapter-cli + **adapter-pi** | `adapter-cli`、`adapter-pi` 测试 |
| `adapter-pi` | adapter-pi | `adapter-pi` 测试 |
| `core/scheduler` | 调度循环 | `scheduler` 测试（假 adapter） |
| `core/workspace` | worktree + overlap | `workspace` 测试 |
| `core/context` | ContextPack 组装 | `context` 测试 |
| `core/executor` | local-command | `executor` 测试 |

命令：

```bash
npx vitest run packages/adapters/adapter-pi/test   # 只测某链路
npx vitest related packages/adapters/adapter-cli/src/index.ts   # 按依赖自动选（含 adapter-pi）
```

## 5. 维护约定

- 新增模块/包时，**先在此登记节点与依赖边**，再写代码。
- 结构变化（如 M3 引入 `core/scheduler`、`core/workspace`）后立即更新本图。
