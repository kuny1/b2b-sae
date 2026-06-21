# 任务 07：集成验证 + 量化对比 + 灰度发布

## 目标

完成所有任务的集成验证，产出改造前后量化对比数据，按灰度计划发布，稳定后清理旧代码。

## 依赖

- 所有前置任务（00-06）均已完成并通过验收

## 与哪些任务可并行

- 无（集成收尾）

## 输入

- 任务 00：基线数据（状态副本数、UI 重复度）
- 任务 01：Zustand Store
- 任务 02：jQuery Store 化代码
- 任务 03：Vite 构建链 + Manifest
- 任务 04：Java IslandResolver
- 任务 05：React Island 组件
- 任务 06：Feature Flag JSP

## 步骤

### 步骤 1：全链路 staging 验证

| 验证场景 | 方法 | 预期 |
|---|---|---|
| jQuery 分支功能正常 | 完整的审批流程（提交→审批→驳回→重提交） | 与改造前一致 |
| React 分支功能正常 | 同上 | 与 jQuery 分支行为等价 |
| 分支切换数据一致 | 在 jQuery 分支审批通过 → 切到 React 分支 → 查看 | 状态一致（读同一 Store） |
| 异常降级 | 模拟 Island JS 404 → 页面行为 | React 分支：空 div，审批面板空白；监控上报加载失败 |
| 异常降级 | 模拟 TCC 不可用 → 页面行为 | island-router.jsp 默认走 jQuery 分支，页面正常 |
| 错误上报 | Island 崩溃 → 监控平台 | ErrorBoundary 上报，页面不白屏 |

### 步骤 2：量化对比数据产出

| 指标 | 改造前（任务 00） | 阶段 1 后 | 阶段 1.5/2 后 |
|---|---|---|---|
| 审批状态源副本数 | 基线值 | 1（Store） | 1（Store） |
| UI 实现重复度 | 基线值 | 基线值（UI 未变） | 1 组件 + N 引用 |
| 缺陷密度 | 改造前 3 个月 | — | 改造后 3 个月（后续跟踪） |
| Island 加载时间 | — | — | P50 / P75 / P95 |
| vendor.js 体积 | — | — | gzipped KB |
| 降级/崩溃率 | — | — | loadFailed / loadAttempted |

### 步骤 3：CWV 性能对比

```
┌────────────────────────────────────────────┐
│  审批详情页 CWV 对比（staging 环境）         │
│                                            │
│              │ jQuery分支 │ React分支       │
│  ────────────┼───────────┼───────────────  │
│  P75 FCP     │   Xms      │   Xms          │
│  P75 LCP     │   Xms      │   Xms          │
│  P75 INP     │   Xms      │   Xms          │
│  P75 CLS     │   X.XX     │   X.XX         │
└────────────────────────────────────────────┘
```

### 步骤 4：灰度发布

```
Day 1：内部用户 100%（flag = "react"），观察 24h
  ├── 监控：Island 崩溃率、业务错误率
  └── 决策点：崩溃率 > 0.1% → 回滚

Day 3：1% 真实用户
  ├── 监控：CWV P75（INP/LCP/CLS）
  └── 决策点：INP 劣化 > 20% → 回滚

Day 5：10%
Day 7：50%
Day 10：100%

全程 TCC 配置控制，任一步出问题 → 改 flag 切回 "jquery"（秒级）
```

### 步骤 5：清理旧代码（灰度 100% 稳定 30 天后）

1. 删除 `fallback/approval-status.jsp`（jQuery 版本不再需要）
2. 从 `island.routes` TCC 配置中移除 `approval-status` 条目（或保留，renderer 固定 "react"）
3. JSP 中 `island-router.jsp` include 保持不变（全页 React 化后此 include 也会移除）
4. 删除与该区块相关的独立 jQuery JS 文件
5. Zustand Store 不变

## 里程碑

| 节点 | 判定标准 |
|---|---|
| M1：staging 全链路通过 | 7 个验证场景全部通过 |
| M2：量化对比报告 | 数据对比产出，附在 MR 描述中 |
| M3：内部灰度通过 | 24h 无异常 |
| M4：100% 全量 | 真实用户无异常，CWV 无劣化 |
| M5：旧代码清理 | 提交删除旧代码，jQuery 逻辑量减少 |

## 验收标准

- [ ] staging 全链路验证通过（jQuery 分支 + React 分支 + 切换 + 降级）
- [ ] 量化对比数据产出并提交到仓库
- [ ] CWV 无显著劣化（INP 增量 < 20%，LCP 增量 < 200ms）
- [ ] 灰度过程中任一环节可秒级回滚（TCC 改 flag）
- [ ] 全量稳定 30 天后旧代码已清理

## 后续

本任务结束后，产出试点总结报告（`reports/pilot-summary.md`），包含量化对比数据和经验教训，作为说服管理层扩大推进范围的关键材料。
