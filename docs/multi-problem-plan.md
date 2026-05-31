# 多问题 Processing — 实施步骤（修正版）

## 数据结构变更

```json
{
  "mainQuery": "旋转超导圆筒...",
  "subProblemCount": 3,
  "isMulti": true,
  "totalProgress": { "done": 5, "total": 31 },
  "subProblems": [
    {
      "id": "q1",
      "title": "问题 1",               // 来自 dispatch_plan.md
      "query": "推导磁场 B 与 ω...",
      "status": "completed",
      "steps": [ 9步... ],
      "stream": [ ... ],
      "throughVerdict": "FAIL",       // 来自 through_review.md
      "compressionRatio": 6.81,
      "latency": 88.8
    },
    { "id": "q2", ... },
    { "id": "q3", ... }
  ],
  "crossFusion": {
    "status": "pending",              // pending / running / completed
    "files": [
      { "name": "cross_analysis.md",  "status": "pending" },
      { "name": "contradictions.md",  "status": "pending" },
      { "name": "final_answer.md",    "status": "pending" }
    ],
    "optionalFiles": [
      { "name": "let_fly.md",         "status": "pending" }
    ],
    "finalAnswerPreview": null        // final_answer.md 前 300 字
  }
}
```

## 阶段一：Server 重构

### 步骤 1.1 — 提取 `getPipelineState(pipeDir)`

从当前 `getLatestProcessingState()` 中提取管道级逻辑为独立函数：
- 读 `trace.json` 或按 .md 文件检测进度
- 返回 `{ id, query, title, status, steps, stream, throughVerdict, compressionRatio, latency }`
- `title` 从 `dispatcher/dispatch_plan.md` 解析（"问题 1", "问题 2"...）
- `throughVerdict` 从 `through_review.md` 读取

### 步骤 1.2 — 重写 `getLatestProcessingState()`

```python
if (masterTrace.subProblemCount > 1) or (cross_fusion 有核心文件):
    # 多问题模式
    subProblems = []
    for each qN:
        subProblems.push(getPipelineState(qN_dir))
    crossFusion = getCrossFusionState(sessionDir)
    return { mainQuery, subProblemCount, isMulti: true, subProblems, crossFusion, totalProgress }
else:
    # 单问题模式（兼容后退路）
    pipeline = getPipelineState(q1_dir)
    return { mainQuery, subProblemCount: 1, isMulti: false, subProblems: [pipeline], ... }
```

### 步骤 1.3 — `getCrossFusionState(sessionDir)`

```js
// 核心 3 文件 + 可选 1 文件
// 完成判定: final_answer.md 存在
// 运行中判定: 有 cross_fusion/ 目录但 final_answer.md 不存在
// 待办判定: 无 cross_fusion/ 目录或无核心文件
```

### 步骤 1.4 — 进度条计算

```js
totalSteps = subProblemCount * 9 + 4  // 每管道 9 步 + CrossFusion 4 个产出
```

## 阶段二：Client 适配

### 步骤 2.1 — 处理单/多模式切换

```jsx
if (data.isMulti) {
  // 多问题: 渲染 SubProblemBadges + SubProblemCard[] + CrossFusionCard
} else {
  // 单问题: 退化到现有视图（仅第一个子问题）
}
```

### 步骤 2.2 — 轮询/WebSocket 兼容

```jsx
// 旧: JSON.stringify(data.steps) !== JSON.stringify(cur.steps)
// 新: 
const oldSteps = cur.subProblems?.flatMap(p => p.steps) || cur.steps || []
const newSteps = data.subProblems?.flatMap(p => p.steps) || data.steps || []
const hasNewData = JSON.stringify(newSteps) !== JSON.stringify(oldSteps)
```

## 阶段三：UI 组件

按设计文档构建 `SubProblemBadges`, `MainQueryHeader`, `SubProblemCard`, `CrossFusionCard`。

## 实施顺序

| 序 | 步 | 内容 | 预估 |
|----|----|------|------|
| 1 | 1.1 | 提取 `getPipelineState()` | 中 |
| 2 | 1.3 | 实现 `getCrossFusionState()` | 小 |
| 3 | 1.2+1.4 | 重写 `getLatestProcessingState()` + 进度计算 | 中 |
| 4 | 2.1 | Client 单/多模式切换 | 小 |
| 5 | 3 | UI 组件（Badges/Card/CrossFusionCard） | 中 |
| 6 | 2.2 | 轮询/WS 兼容 | 小 |
| 7 | 测试 | 用 3 子问题物理题验证 | 中 |
