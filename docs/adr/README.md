# 架构决策记录（ADR）

记录 Harness Control Plane 的重要架构决策。每条 ADR 一经 Accepted 不再修改内容，如需变更则新开一条并标记 Supersedes。

## 索引

| 编号 | 标题 | 状态 |
|---|---|---|
| [ADR-001](./ADR-001-positioning.md) | 定位为调度中台而非模型网关 | Accepted |
| [ADR-002](./ADR-002-adapter-plugin.md) | Adapter 插件化，内核不感知具体 harness | Accepted |
| [ADR-003](./ADR-003-unified-events.md) | 统一事件与结果协议，保留 raw 原文 | Accepted |
| [ADR-004](./ADR-004-worktree-isolation.md) | 写入型任务强制 Git worktree 隔离 | Accepted |
| [ADR-005](./ADR-005-sqlite-store.md) | 首期 SQLite + Store 接口抽象 | Accepted |
| [ADR-006](./ADR-006-core-language.md) | 核心实现语言（TypeScript） | Accepted |
| [ADR-007](./ADR-007-http-api-scope.md) | 首期即暴露本地 HTTP API | Accepted |
| [ADR-008](./ADR-008-event-retention.md) | 事件全量保留 | Accepted |
| [ADR-009](./ADR-009-adapter-scope.md) | 首期适配器范围 | Accepted |
| [ADR-010](./ADR-010-multi-project.md) | 首期不支持跨仓库编排 | Accepted |
| [ADR-011](./ADR-011-contracts-package.md) | 契约独立成包（@hcp/contracts） | Accepted |
| [ADR-012](./ADR-012-platform-positioning.md) | 定位演进为平台工程 | Accepted |

## 模板

```markdown
# ADR-NNN: 标题

- 状态：Proposed | Accepted | Deprecated | Superseded by ADR-XXX
- 日期：YYYY-MM-DD
- 决策者：（可选）

## 背景
问题是什么，为什么需要决策。

## 决策
选择什么。

## 理由
为什么这样选。

## 后果
正面 / 负面 / 需要接受的约束。

## 替代方案
考虑过但未采用的选项，以及未采用的原因。
```
