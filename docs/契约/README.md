# 契约地图

> 平台的公共语言。**结构与签名以 `@hcp/contracts` 代码为准**；本目录只写代码表达不了的语义、缺什么、何时冻。
> 关联：[ADR-011](../adr/ADR-011-contracts-package.md) · [ADR-012](../adr/ADR-012-platform-positioning.md) · [architecture.md](../architecture.md)

---

## 分层

```
已冻                          M3 必须冻                     后冻（形状已知）
────────────────────────────────────────────────────────────────
Manifest / Adapter 生命周期     ContextPack                  RouteStrategy
Event / Result                  Manifest.injection           GateHandler
Store / Records                 Scheduler                    UsageProvider
Task / Stage YAML               Workspace                    EventBus + HTTP
Usage / Context 形状            （可选）StageExecutor        Merge
CreateRunArgs.prompt ← M3 并列 ContextPack
                                ── 全程 ──
                                版本规则（00-版本.md）
```

| 层 | 文件 | 状态 |
|---|---|---|
| 元契约 | [00-版本.md](./00-版本.md) | `@hcp/contracts` 已升至 0.1.0；YAML `schema` 缺省为 1 |
| 已冻 | [01-已冻.md](./01-已冻.md) | 代码在 `packages/contracts/src/` |
| M3 必冻 | [02-M3必冻.md](./02-M3必冻.md) | 类型与接口已入代码；Scheduler、Workspace、ContextPack 组装等运行时待实现 |
| 后冻 | [03-后冻.md](./03-后冻.md) | 形状可从现有类型推出；M3 不得假设它们不存在 |

## 原则

1. **同一事实一个源**：字段名 / 类型 / 可选性 / 方法签名 → 代码；默认值 / 错误语义 / YAML↔TS 映射 / 为何这样 → 本目录。
2. **新能力优先可选方法**（范例：`collectUsage?`），再变必填。
3. **Scheduler 不焊死后冻契约**：不要在调度循环里写死「只有 pi、只有 prompt 字符串、只有一个仓库」。
4. **core 交 pack、adapter 翻译通道**：`injection` 是能力声明，不是 core 拼 CLI 的菜谱。
