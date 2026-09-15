# M1 — 域模型（验收核查）

> 对照 [plan.md](./plan.md) 的验收点逐条核查。日期：2026-09-15 · 结论：**全部通过**

---

## 1. 验收点核查

| # | 验收点 | 结果 | 证据 |
|---|---|---|---|
| 1 | `npm test` 全绿 | ✅ | 2 文件 / **16 用例通过**（schema 8 + store 8），`npm test` |
| 2 | `npm run typecheck` 无错误 | ✅ | `npx tsc -p tsconfig.json --noEmit` 无输出 |
| 3 | schema 正反例 | ✅ | 合法样例：camelCase 映射 + 默认值全对；反例 7 个：未知 depends_on / 循环依赖 / 重复 id / 缺 command / 缺 harness / 空 stages / YAML 语法错 |
| 4 | 接口冻结回写 architecture §3/§4 | ✅ | §3.3 新增 `usage` / `context` 表 + `runs.config_ref`；§4.1 指向 `@hcp/contracts` |
| 5 | 四根桩落库路径存在 | ✅ | D6 `usage` 表、D7 `runs.config_ref`、D9 `context` 表、events 无清理接口；store.test 对 memory + sqlite 双跑覆盖 |

## 2. 交付物核查（对照 plan §2）

| # | 交付物 | 结果 |
|---|---|---|
| 0 | `@hcp/contracts` 包 | ✅ `packages/contracts/` |
| 1–6 | 类型与接口 | ✅ `contracts/src/*.ts`（harness/event/result/task/records/usage/adapter/store） |
| 7 | 任务 YAML schema + 校验器 | ✅ `core/src/schema/task-schema.ts`（zod + 归一化 + DAG 完整性） |
| 8 | 内存 Store | ✅ `core/src/store/memory.ts` |
| 9 | SQLite Store + 迁移 | ✅ `core/src/store/sqlite.ts`（`node:sqlite`，meta.schema_version 版本化） |
| 10 | 四根桩载体 | ✅ 并入两实现 |
| 11 | 单测 | ✅ `core/test/{schema,store}.test.ts` |

## 3. 偏差与环境适配（显式记录）

| 项 | 计划 | 实际 | 原因 |
|---|---|---|---|
| 测试框架 | vitest | vitest **3.2.7** | 上游 `picomatch@^4.0.7` 不存在（最新 4.0.5），vitest@5 无法安装 |
| TS `paths` | `baseUrl` + `paths` | 仅 `paths`（相对路径） | TypeScript 7 移除了 `baseUrl` |
| SQLite 驱动 | better-sqlite3（ADR-005 提及） | **`node:sqlite`** | 规避 Windows 原生编译；在 `Store` 接口后可换，不构成对 ADR-005 的偏离（见 structure.md §4） |

## 4. 未做项（不属验收点）

- **JSON Schema 产物**（D8 的 C2，供 AI 生成）——Should，zod 可后续导出。
- **完整状态机**——属 M3；M1 仅覆盖状态字段的存储流转。

## 5. 结论

M1 验收点 **5/5 通过**，交付物 **12/12 落地**，可进入下一阶段（M2 / M3）。
