# 任务 01：Zustand Store 设计与实现

## 目标

将审批流的状态机抽象为一个 Zustand Store，同时暴露纯 JS API（jQuery 可用 `getState`/`setState`/`subscribe` 消费）和 React hook（Island 可用 `useStore` 消费）。

## 依赖

- 任务 00（基线数据，了解当前状态散落的全貌）

## 与哪些任务可并行

- 无（Store 是后续所有任务的共同依赖）

## 输入

- 任务 00 的基线 JSON（状态副本地图）
- 审批流业务规则（状态机：pending → inReview → approved/rejected/withdrawn → executed/resubmit）

## 产出

1. `src/store/approvalStore.ts` —— 审批状态 Zustand Store
2. `src/store/__tests__/approvalStore.test.ts` —— 状态机单元测试

## 步骤

### 步骤 1：梳理状态机

从基线 JSON 和业务规则中梳理：

- 状态枚举（6 个：pending, inReview, approved, rejected, withdrawn, executed）
- 合法转换（如 pending → inReview，inReview → approved/rejected）
- 非法转换（如 approved → rejected 不可行）
- 派生属性（isEditable, canApprove, statusLabel）
- 边界条件（驳回后重提交、撤回后的状态恢复）

### 步骤 2：定义 TypeScript 类型

```ts
type ApprovalStatus = 'pending' | 'inReview' | 'approved' | 'rejected' | 'withdrawn' | 'executed';

interface ApprovalState {
  status: ApprovalStatus;
  orderId: string | null;
  operator: string | null;
  comment: string;
  // actions
  submit: () => void;
  assign: (reviewer: string) => void;
  approve: (operator: string, comment: string) => void;
  reject: (operator: string, comment: string) => void;
  resubmit: () => void;
  withdraw: (operator: string) => void;
  execute: (operator: string) => void;
  // queries
  isEditable: () => boolean;
  canApprove: () => boolean;
  statusLabel: () => string;
}
```

### 步骤 3：实现 Store

参考 [`plan.md`](../plan.md) 中阶段 1 的 Store 设计。

**关键约束**：Store 不管理表单输入值（textarea 内容、日期选择等），这些值留在 DOM，submit 时一次性读取。

### 步骤 4：编写单元测试

覆盖：
- 所有合法状态转换
- 所有非法转换被拒绝
- 派生属性正确性
- 边界条件（重复操作、并发状态）

## 里程碑

| 节点 | 判定标准 |
|---|---|
| M1：Store 实现 | 代码 Review 通过，类型定义完整 |
| M2：单元测试通过 | 所有状态转换 case 通过，覆盖率 100%（状态机逻辑） |

## 量化指标

| 指标 | 改造前（任务 00 基线） | 改造后 |
|---|---|---|
| 审批状态定义位置 | N 个文件，M 处副本 | 1 个文件（`approvalStore.ts`） |
| 状态转换规则 | 散落在各个 `if` / `switch` 中 | 集中在 Store actions 中，可测试 |

## 验收标准

- [ ] Store 在 Node.js 环境可独立运行测试（不依赖 jsdom/浏览器）
- [ ] Store 的 `getState()`/`setState()`/`subscribe()` 在纯 JS 环境可用（jQuery 兼容）
- [ ] 所有状态转换测试通过
- [ ] 类型定义无 `any`
