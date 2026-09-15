# ADR-003: 统一事件与结果协议，保留 raw 原文

- 状态：Accepted
- 日期：2026-09-14

## 背景

不同 harness 的输出形态差异很大：有的输出逐行文本，有的输出 JSON 流，有的通过 SSE 推送结构化事件。

上层需要统一的能力：展示进度、判断成败、提取改动、跨 harness 汇总、崩溃后回放。

同时，一旦把原始输出转换成统一格式，排障时会丢失关键细节。

## 决策

每个 adapter 必须把原始输出映射为**统一事件**，同时**原样保留 raw**：

```json
{
  "runId": "run_01HXY",
  "taskId": "review-auth",
  "harness": "kimi-code",
  "type": "tool.started",
  "timestamp": "2026-09-14T12:00:00Z",
  "message": "Running tests",
  "raw": { "source": "stdout", "payload": "..." }
}
```

最小事件集：

```text
run.started / run.progress / run.output
tool.started / tool.completed
artifact.created
run.completed / run.failed / run.cancelled
```

统一结果模型（每个 run 一份）：

```json
{
  "taskId": "...", "harness": "...", "status": "completed",
  "workspace": "...", "changedFiles": [], "commit": null,
  "summary": "...", "artifacts": [], "tests": {...}, "error": null
}
```

规则：

- `raw` 必填，保留原始载荷
- 无法归类的内容降级为 `run.output`，**不丢信息**
- adapter 解析失败不得中断运行

## 理由

- 上层只面对一种协议，逻辑简单
- 保留 raw 使排障、回放、协议演进成为可能
- 未知事件有兜底通道，新 harness 也能先跑起来再优化

## 后果

- 事件表体积较大（重复存储 raw），需要保留策略（见 ADR-008）
- 事件类型集合若扩充，需同步所有 adapter
- 需要为"归一化"写契约测试，防止格式漂移

## 替代方案

- **只存原文，上层各自解析**：上层复杂度爆炸，弃用
- **只存归一化结果，丢弃 raw**：排障信息丢失，弃用
