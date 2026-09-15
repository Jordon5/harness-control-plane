# 代码链路影响图

> 随代码演进维护。**改代码前先查此图**，确定受影响链路与应跑的测试（见 [dev-rules.md](./dev-rules.md) R2）。
> 最后更新：2026-09-15（M1）

---

## 1. 当前链路（M1）

```text
@hcp/contracts             （叶子，零依赖：src/*.ts）
      ▲            ▲
      │            │
@hcp/core/schema  @hcp/core/store
      │            │
      ▼            ▼
schema.test.ts    store.test.ts
```

## 2. 节点表

| 节点 | 文件 | 依赖 | 被谁依赖 |
|---|---|---|---|
| `contracts` | `packages/contracts/src/*.ts` | — | `core/schema`、`core/store`（及未来所有包） |
| `core/schema` | `core/src/schema/task-schema.ts` | `contracts` | `schema.test.ts` |
| `core/store` | `core/src/store/{memory,sqlite}.ts` | `contracts` | `store.test.ts` |

## 3. 测试覆盖映射

| 测试文件 | 覆盖节点 |
|---|---|
| `core/test/schema.test.ts` | `core/schema` |
| `core/test/store.test.ts` | `core/store`（memory + sqlite 双跑） |

## 4. 影响规则（改哪测哪）

| 改动位置 | 受影响链路 | 应跑 |
|---|---|---|
| `contracts` | `core/schema` + `core/store`（+所有依赖方） | **全量**（契约影响面最大，全测合理） |
| `core/schema` | 仅 schema | `schema.test.ts` |
| `core/store` | 仅 store | `store.test.ts` |

命令：

```bash
npx vitest run packages/core/test/schema.test.ts        # 只测某链路
npx vitest related packages/core/src/schema/task-schema.ts   # 按依赖自动选
```

## 5. 维护约定

- 新增模块/包时，**先在此登记节点与依赖边**，再写代码。
- 结构变化（如 M2 引入 `adapter-cli` → `contracts`）后立即更新本图。
