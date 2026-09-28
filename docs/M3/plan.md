# M3 — 调度与隔离

> 阶段：M3 · 状态：计划中 · 日期：2026-09-19
> 关联：[development-plan.md](../development-plan.md) · [契约/02-M3必冻.md](../契约/02-M3必冻.md) · [契约/00-版本.md](../契约/00-版本.md) · [requirements.md](../requirements.md) · [ADR-012](../adr/ADR-012-platform-positioning.md) · [impact-graph.md](../impact-graph.md)

---

## 1. 目标

**让平台心脏跳起来。** 用已校验的 YAML DAG，按依赖执行多 Stage：写入型走 worktree、只读走主区、上下文以 `ContextPack` 注入、事件/用量/`configRef` 落库。

M3 是平台第一个内核（ADR-012）：调度器按「可替换」写，不焊死 pi / 单仓库 / prompt 字符串。

## 2. 已拍板（契约审查）

| # | 决定 |
|---|---|
| 1 | YAML `intent` / `done` 为 schema:1 **可选**字段；缺省回退 `goal` / `null` |
| 2 | `configRef` = ContextPack（或无 pack 时的 `prompt`）**稳定哈希** |
| 3 | **实现**内置 `local-command` executor |
| 4 | D9 M3 = **全量**注入该 project 的 ContextRecord，不加 `context_keys` |
| 5 | `CreateRunArgs.context?` 与 `prompt` **并列**；无 `injection` 不拒写入 |
| 6 | 依赖失败 → 下游保持 `pending`，不新增 `blocked` |
| 7 | `@hcp/contracts` **0.1.0**（ContextPack 等为 minor）；YAML 顶层可选 `schema: 1`（缺省 1） |

完整形状见 [契约/02-M3必冻.md](../契约/02-M3必冻.md)。

## 3. 交付物

| # | 交付物 | 落位 |
|---|---|---|
| 1 | 契约增量：ContextPack / ContextItem / ArtifactRef / InjectionProfile；CreateRunArgs.context?；StageDefinition.intent/done；HarnessManifest.injection? | `packages/contracts` |
| 2 | Scheduler + SchedulerDeps | `core/src/scheduler/` |
| 3 | Workspace（git worktree）+ `ownedPathsOverlap` | `core/src/workspace/` |
| 4 | ContextPack 组装器（上游引用 + 全量 project context） | `core/src/context/` |
| 5 | `local-command` StageExecutor | `core/src/executor/` |
| 6 | YAML：`schema` / `intent` / `done` 解析 | `core/src/schema/` |
| 7 | pi：`manifest.injection` + 把 pack 翻成 argv/`@file`/`--append-system-prompt` | `adapter-pi` |
| 8 | 单测（假 adapter，不联网） | 各包 `test/` |
| 9 | 示例 DAG YAML | `examples/` |

## 4. 任务分解

- [ ] contracts `0.1.0`：上表第 1 项类型
- [ ] schema：`schema` 缺省 1；`intent`/`done` 可选
- [ ] `ownedPathsOverlap` + 单测
- [ ] Workspace：acquireWrite/Read/release（worktree 落 `.hcp/worktrees`，包外）
- [ ] ContextPack 组装 + configRef 哈希
- [ ] Scheduler 循环：拓扑就绪队列、并发上限、超时、retry、失败不启动下游、写四根桩
- [ ] local-command executor
- [ ] adapter-pi：injection 声明 + pack 翻译（无 pack 仍走 prompt）
- [ ] 假 adapter 驱动的 DAG 单测（含并行无重叠、重叠串行、retry、local-command）
- [ ] `examples/auth-refactor.task.yaml`（可把 verify 做成 local-command）
- [ ] 更新 impact-graph；本阶段 verification

## 5. 验收点

- [ ] `npm run typecheck` 干净；受影响测试全绿（contracts 变更 → **全量**，见 R2）
- [ ] 线性 DAG（analyze → implement → verify）按依赖完成；verify 为 local-command
- [ ] 写入 Stage 得到独立 worktree 路径；只读 Stage 不创建 worktree
- [ ] 两写入 Stage `owned_paths` 重叠 → 串行；不重叠 → 可并行（单测即可，不必真 git 两次）
- [ ] 上游失败 → 下游保持 pending、无 Run
- [ ] 每次 harness Run：`CreateRunArgs.context` 有 pack；`run.configRef` 非空；events 落库；若 adapter 实现了 `collectUsage` 则 usage 落库
- [ ] 无 `injection` 的假 adapter：只收 `prompt`（= stageIntent），仍能跑
- [ ] YAML 无 `schema`/`intent`/`done` 仍能 parse（缺省）
- [ ] 崩溃恢复：Store 里 running 的 task 可被再次 submit/恢复策略**先做到「可查出」**；完整 resume 若来不及标偏差（见 §7）

## 6. 非目标

- ❌ 多 harness 路由 / 降级（M4，M3 取 `preferred[0]`）
- ❌ Gate 人工确认（M4；first-write 本阶段不挡）
- ❌ HTTP / CLI / 事件总线（M5）
- ❌ 真实联网跑完整 DAG（可做 `@integration` 默认跳过）
- ❌ `context_keys` 过滤、TUI/WebUI
- ❌ 换 Temporal

## 7. 风险

| 风险 | 应对 |
|---|---|
| Windows worktree 路径 / 锁 | Workspace 单测用临时 git 仓，建在仓库根 `.tmp/`（R3） |
| pi pack 翻译与 `-p` 同类坑 | 翻译层单测用 argv 快照，不默认真跑 |
| 完整崩溃 resume 偏大 | 验收点允许「状态可查」；自动 resume 标 verification 偏差 |

## 8. 影响图（开工前登记）

新增节点：`core/scheduler`、`core/workspace`、`core/context`、`core/executor`。均依赖 `contracts`；scheduler 依赖后三者 + store。测试：各模块单测；contracts 一改跑全量。
