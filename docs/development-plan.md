# Harness Control Plane — 开发计划

> 版本：v0.1（DRAFT）
> 日期：2026-09-14
> 关联：[architecture.md](./architecture.md) · [draft.md](./draft.md)

---

## 1. 总体策略

**先立骨架，再通链路，后扩能力。**

不做大而全的第一版。首期目标只有一个：**用一个 YAML 跑通"分析 → 实现 → 审查"的真实 DAG**，且每个环节由不同 harness 执行。

分阶段原则：

- 每阶段可独立验证，不依赖后续阶段
- 首期只做本地 CLI，无 UI、无分布式
- 扩展性由接口设计保证，不由功能数量保证

---

## 2. 里程碑总览

| 里程碑 | 目标 | 产出 |
|---|---|---|
| **M0 文档与骨架** | 架构、计划、仓库结构定型 | docs + monorepo 骨架 |
| **M1 域模型** | 接口与数据模型冻结 | core 类型 + Store 接口 + 单测 |
| **M2 单 harness 打通** | pi 适配器端到端可跑 | adapter-cli + adapter-pi |
| **M3 调度与隔离** | DAG 执行 + worktree 隔离 | 调度器 + worktree + 持久化 |
| **M4 多 harness** | claude-code 接入 + 路由降级 | adapter-claude-code + registry 路由 |
| **M5 CLI 闭环** | 六命令可用 + 合并审批 | hcp CLI + 示例任务 + E2E |
| **M6 扩展验证** | 用第三/第四个 harness 验证扩展点 | kimi / dsh 或 http adapter |

---

## 3. 分阶段任务

### M0 — 文档与骨架

**任务**

- [x] 创建 `F:\harness-control-plane`
- [x] `docs/draft.md` 规划草稿
- [x] `docs/requirements.md` 需求文档
- [x] `docs/architecture.md` 架构文档
- [x] `docs/development-plan.md` 本文件
- [x] `docs/structure.md` 代码结构文档
- [x] ADR（架构决策记录）机制建立（ADR-001…010）
- [x] monorepo 骨架落地（workspaces / tsconfig / vitest）

**验收**：文档评审通过，目录结构与命名无歧义。

**风险**：过早定语言 → 用 ADR 记录，允许 M1 前调整。

---

### M1 — 域模型

> 详细计划（目标产出 / 任务分解 / 验收）：[M1/plan.md](./M1/plan.md) · 验收核查：[M1/verification.md](./M1/verification.md)

**任务**

- [ ] `core`: `HarnessManifest` / `HarnessConfig` / `RunStatus` 类型
- [ ] `core`: `UnifiedEvent` / `UnifiedResult` 类型
- [ ] `core`: `TaskDefinition` / `StageDefinition` 类型（对齐 YAML schema）
- [ ] `core`: `HarnessAdapter` 接口
- [ ] `core`: `UsageProvider` 接口 + `usage` 记录（需求 §6 D6）
- [ ] `core`: run 记录 config / prompt 版本字段（需求 §6 D7）
- [ ] `core`: 项目级上下文**结构化记录**（只写不注）（需求 §6 D9）
- [ ] `core`: `Store` 接口 + 内存实现（供测试）
- [ ] `core`: SQLite `Store` 实现 + 迁移脚本
- [ ] 单测：类型校验、Store CRUD、状态机流转

**验收**：`vitest run` 通过；接口冻结并写入 architecture.md。

**依赖**：M0。

---

### M2 — 单 harness 打通（pi）

**任务**

- [ ] `adapter-cli`: 子进程启动、stdout/stderr 捕获、退出码
- [ ] `adapter-cli`: 行缓冲事件归一化、超时、kill、清理
- [ ] `adapter-cli`: 统一结果提取骨架（结果文件 / 退出码 / changedFiles）
- [ ] `adapter-pi`: `buildArgs()` 映射 `--provider/--model/-p/--no-session`
- [ ] `adapter-pi`: manifest（复用 `~/.pi/agent/models.json` 三条线路）
- [ ] 端到端：`pi` 真实调用一次，事件与结果落库
- [ ] 契约测试：解析固定样本输出

**验收**：能编程式调用 pi 完成一次任务并拿到结构化结果。

**风险**：pi `-p` 挂起问题（此前实测）→ 记录并优先非交互模式调参。

---

### M3 — 调度与隔离

> 详细计划：[M3/plan.md](./M3/plan.md) · 契约：[契约/02-M3必冻.md](./契约/02-M3必冻.md)

**任务**

- [x] `core`: YAML 任务解析 + schema 校验
- [ ] `core`: DAG 构建 + 拓扑排序 + 就绪队列
- [ ] `core`: 调度循环（并发上限、依赖等待、失败传播）
- [ ] `core`: 状态机持久化与恢复
- [ ] `core`: Git worktree 创建 / 复用 / 清理
- [ ] `core`: `owned_paths` 解析与重叠检测
- [ ] `core`: 上下文注入器（项目级 + 上游产物 → 精简上下文包）（需求 §6 D9）
- [ ] `core`: retry / timeout 策略
- [ ] 单测：DAG 正确性、冲突检测、崩溃恢复

**验收**：多 Stage DAG 能按依赖顺序执行，写入型任务互不干扰。

---

### M4 — 多 harness 与路由

**任务**

- [ ] `registry`: manifest 加载（内置 + 配置文件）
- [ ] `registry`: 能力索引与 `requires` 匹配
- [ ] `registry`: 健康检查聚合
- [ ] `registry`: 路由策略 `preferred-first` / `cheapest` / `fastest`
- [ ] `registry`: 降级执行（首选失败取次选）
- [ ] `adapter-claude-code`: 继承 `adapter-cli`
- [ ] 单测：路由决策、降级路径

**验收**：同一 Stage 在首选不可用时自动降级到次选并成功。

---

### M5 — CLI 闭环

**任务**

- [ ] `cli`: `hcp list`
- [ ] `cli`: `hcp run <task.yaml>`
- [ ] `cli`: `hcp status [runId]`
- [ ] `cli`: `hcp logs <runId> [-f]`
- [ ] `cli`: `hcp diff <runId>`
- [ ] `cli`: `hcp merge <runId>`（含人工确认）
- [ ] `examples/auth-refactor.task.yaml` 完整示例
- [ ] E2E：跑通 analyze → implement → fast-scan → verify

**验收**：见 §5 验收标准。

---

### M6 — 扩展验证

**任务**

- [ ] `adapter-http`（本地服务，SSE/HTTP）
- [ ] `adapter-template`（新 harness 脚手架）
- [ ] 用 Kimi Code / DSH 任一验证"只加 adapter、不动内核"
- [ ] 记录接入一个 harness 的实际耗时与踩坑

**验收**：新增 harness 的改动范围不超出 `packages/adapters/adapter-<name>/` + 配置。

---

## 4. 优先级与依赖图

```text
M0 ─▶ M1 ─▶ M2 ─▶ M3 ─▶ M4 ─▶ M5 ─▶ M6
              │            │
              └────────────┘
           (M3 可与 M2 并行做骨架)
```

**可并行**

- M2 与 M3：adapter 与调度器接口在 M1 已冻结，可并行
- M4 与 M5：路由逻辑与 CLI 展示层可分工

**必须串行**

- M1 → 其它（接口冻结是前提）
- M3 → M5（无调度则无闭环）

---

## 5. 验收标准（MVP 完成定义）

- [ ] 一个 YAML 定义 4 个 Stage 的 DAG，含并行与依赖，跑通
- [ ] 写入型 Stage 自动创建 worktree；只读 Stage 无写权限
- [ ] pi 与 claude-code 两个真实 adapter 端到端可用
- [ ] 路由支持能力匹配与降级
- [ ] 事件、结果、产物落 SQLite；进程被杀后可查
- [ ] `hcp diff` 正确输出改动；`hcp merge` 需人工确认
- [ ] `owned_paths` 重叠时阻断或串行，有明确提示
- [ ] 全部单测通过；有一个 E2E 用例

---

## 6. 测试策略

| 层级 | 范围 | 工具 |
|---|---|---|
| 单元 | 类型、DAG、路由、状态机、冲突检测 | vitest + 内存 Store |
| 契约 | 各 adapter 对固定样本输出的解析 | 录制样本 + 快照 |
| 集成 | adapter 真实调用（可选联网） | 标记 `@integration`，默认跳过 |
| 端到端 | 完整 DAG 跑通 | examples/ 任务 |

原则：

- 默认测试不依赖真实 CLI 与网络
- 契约测试对 adapter 输出格式变更敏感，是主要防线
- 端到端用例固定在示例仓库，避免污染真实项目

---

## 7. 风险登记

| 风险 | 影响 | 概率 | 应对 |
|---|---|---|---|
| 各家 CLI 接口不稳定 | adapter 频繁失效 | 高 | 契约测试 + 版本探测 + 降级 |
| 交互式 CLI 无法无人化 | 部分 harness 不可用 | 中 | 优先非交互参数；必要时伪终端 |
| Windows 兼容性 | 路径/编码/进程 kill | 中 | 统一 UTF-8；抽象进程层 |
| worktree 磁盘膨胀 | 长期运行占满盘 | 中 | 上限 + 自动清理策略 |
| 中转限制 | 部分模型/协议不可用 | 已发生 | 使用 `openai-completions`；能力探测 |
| 任务定义复杂度过高 | 用户不愿写 YAML | 中 | 提供模板 + 简写 + 默认值 |

---

## 8. 架构决策记录（ADR）清单

| 编号 | 决策 | 状态 |
|---|---|---|
| ADR-001 | 定位为调度中台而非模型网关 | 已定 |
| ADR-002 | Adapter 插件化，内核不感知具体 harness | 已定 |
| ADR-003 | 统一事件/结果协议，保留 raw | 已定 |
| ADR-004 | 写入型任务强制 worktree 隔离 | 已定 |
| ADR-005 | 首期 SQLite + Store 接口抽象 | 已定 |
| ADR-006 | 核心语言 TypeScript | 已定 |
| ADR-007 | 首期即暴露本地 HTTP API | 已定 |
| ADR-008 | 事件默认全量保留 | 已定 |
| ADR-009 | 首期适配器范围：claude-code / codex / pi 实现，其余模板 | 已定 |
| ADR-010 | 首期不支持跨仓库（多 Project），预留扩展空间 | 已定 |

---

## 9. 待确认问题

> 原 5 项阻塞项已全部决策，见 §8 与 `docs/adr/`。后续新增待决问题在此登记。

（暂无）

---

## 10. 下一步

1. 冻结 M1 接口（域模型 + Store），落实 §11 F4 的两项预留
2. 进入 M1 实现（域模型 + Store）

---

## 11. 后续需求（Post-MVP Backlog）

> 明确"将来要做、首期不做"的需求。记录动机与关键约束，避免 M1 接口设计时堵死后路。
> 这些不是 MVP 范围，不进入当前里程碑验收。

### F1 — 用量 / 成本核算

- **目标**：按 run / stage / harness / 模型维度统计 token 用量与成本
- **数据来源优先级**
  1. **事件流**（adapter 解析 harness 上报的 usage）——主底座，粒度可细到 stage
  2. **外部网关**（如 new-api）——把 harness 的 `base_url` 指向网关，白拿成本统计，作为可选加速器
- **约束**：走网关必须给流量**打标**（每 run 独立 key / 模型别名 / 网关会记录的 header），否则网关按 key/model 聚合，无法对齐 runId
- **边界**：本需求**不违反 ADR-001**——只消费网关，不实现网关

### F2 — Bad token 统计（浪费归因）

- **目标**：识别"花了但没用"的 token，作为 prompt 调优依据
- **四类浪费**（对齐 DSH）
  - 重试浪费：同一 stage 反复重试产生的重复消耗
  - 死循环：agent 在相同状态间空转（重复读同一文件、反复执行同一工具）
  - 失败工具调用：工具报错 / 返回失败后的连带消耗
  - 空转探索：长时间探索但无产出（无 artifact / 无 changedFiles）
- **关键约束**：**只有语义事件流能支撑此类判断**——网关在 HTTP 层，看不到"第几轮重试 / 是否失败 / 是否空转"，因此 F2 **硬依赖事件流**，而非网关
- **依赖**：F1 的 usage 底座；判断层额外依赖结构化事件与其 raw

### F3 — Prompt 优化闭环

- **目标**：跑 → 测浪费 → 定位 prompt 问题 → 调整某 harness 的系统提示词 → 重跑 → 看 delta
- **能力需求**
  - adapter 声明"系统提示词如何被注入 / 覆盖"（flag / 配置文件 / env）
  - run 记录本次使用的 prompt / 配置版本
  - 实验 / variant 概念：同一任务跑多个 prompt 版本并对比
- **定位**：非 MVP 主线；多 harness 是手段，闭环是目的之一

### F4 — 已并入 MVP 的前置项

> 经需求评审（[requirements.md](./requirements.md) §6），以下不是"预留"而是 **MVP Must**——它们属于"现在不做就补不回"的信息。

| 项 | 原因 | 落位 |
|---|---|---|
| events 保留 raw | F2 判断层依赖原文 | ✅ 已由 ADR-003 保证 |
| `UsageProvider` 接口 + `usage` 采集 | usage 来源可插拔；采集晚做则历史不可追 | **MVP Must**（M1） |
| run 记录 config / prompt 版本 | 不记录则将来无法回溯 delta 归因 | **MVP Must**（M1，`run.config_ref`） |
| 项目级上下文结构化（记录） | 不结构化则"项目记忆"无源可溯；注入器 M3 增量补，不还债 | **MVP Must**（M1 记录，M3 注入，D9） |

### F5 — 编排生成（Intent → DAG）

- **目标**：自然语言意图 → 轻量 AI（如 pi）生成规范任务 YAML → 中台校验并调度（轴 C 的终点 C3）
- **MVP 前置**：YAML schema 先达"AI 可生成"标准（严格 schema、强默认、可校验）——见 requirements D8
- **定位**：编排为主线的自然延伸
