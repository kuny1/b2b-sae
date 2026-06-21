# 任务 02：jQuery 改造 Store 化

## 目标

将审批详情页和待办列表页中，审批状态相关的 jQuery 代码，从读写 DOM/全局变量改为读写 Zustand Store。**不改变 UI，不引入 React。**

## 依赖

- 任务 01（Zustand Store 已实现 + 测试通过）

## 与哪些任务可并行

- 任务 03（Vite 构建链）— 独立，可并行
- 任务 04（Java IslandResolver）— 独立，可并行

## 输入

- 任务 01 产出：`src/store/approvalStore.ts`
- 审批详情页 JSP 和 JS 文件
- 待办列表页 JSP 和 JS 文件

## 产出

1. 审批详情页 JS 改造 diff（`js/approval.js` 修改）
2. 审批详情页 JSP 数据注入修改（JSP 内联脚本改为 `store.setState()`）
3. 待办列表页 JS 改造 diff
4. 待办列表页 JSP 数据注入修改

## 步骤

### 步骤 1：审批详情页改造

**改造模式**（参照 [`plan.md`](../plan.md) 阶段 1 的 jQuery 改造前后对比）：

```diff
- var _status = 'pending';
+ // 状态从 Store 读取

  function approve(operator, comment) {
-   _status = 'approved';
-   $('#approval-status').text('已通过');
-   $('#hidden-status').val('approved');
+   useApprovalStore.getState().approve(operator, comment);
  }

  function getStatus() {
-   return _status;
+   return useApprovalStore.getState().status;
  }

+ // DOM 同步：Store 变更 → 更新所有 DOM 展示位置
+ useApprovalStore.subscribe(function(state) {
+   var label = state.statusLabel ? state.statusLabel() : state.status;
+   $('#approval-status').text(label);
+   $('#hidden-status').val(state.status);
+ });
```

### 步骤 2：JSP 数据注入改造

JSP 只输出 JSON 数据，不调用任何前端库方法。

```diff
- <script>
-   var approvalStatus = '<%= order.approvalStatus %>';
-   var orderId = '<%= order.id %>';
- </script>
+ <script>
+   window.$page = window.$page || {};
+   window.$page.approval = {
+     orderId: '<%= order.id %>',
+     status: '<%= order.approvalStatus %>',
+     operator: '<%= order.approvalOperator %>'
+   };
+ </script>
```

Store 的初始化逻辑收敛到 `approval.js` 的顶部：

```js
// approval.js 顶部 —— 从 $page 读数据初始化 Store
var pageData = window.$page && window.$page.approval;
if (pageData) {
  useApprovalStore.setState({
    status: pageData.status,
    orderId: pageData.orderId,
    operator: pageData.operator || null
  });
}
```

### 步骤 3：待办列表页改造

类似步骤 1-2，每行操作改为从 Store 读写。

### 步骤 4：表单提交逻辑确认

确认：用户在 textarea 的输入值仍从 DOM 读取（`$('#comment').val()`），不进入 Store。只有业务状态（审批结果）进入 Store。

### 步骤 5：功能回归

- 审批通过 → 状态更新 → DOM 展示与 Store 值一致
- 审批驳回 → 同上
- 刷新页面 → JSP 初始数据注入 Store → 展示正确
- 审批详情页操作后 → 打开待办列表页 → 状态一致（同一 Store 实例）

## 里程碑

| 节点 | 判定标准 |
|---|---|
| M1：审批详情页改造 | 代码 Review 通过，本地测试通过 |
| M2：待办列表页改造 | 代码 Review 通过，本地测试通过 |
| M3：跨页面一致性验证 | 详情页改状态 → 列表页自动感知（同一 Store） |

## 量化指标

| 指标 | 改造前 | 改造后 |
|---|---|---|
| 审批状态源副本数 | 任务 00 基线值 | 1（只有 Store） |
| 代码改动行数 | — | 记录净改动行数（供后续说服用） |
| jQuery 操作 DOM 次数（审批状态相关） | 基线值 | 减少至 subscribe 回调中的自动同步 |

## 验收标准

- [ ] 审批详情页：审批操作走 Store，DOM 由 subscribe 自动更新
- [ ] 待办列表页：同上
- [ ] 表单提交功能正常（从 DOM 读 comment + 从 Store 读 status → 调用后端）
- [ ] 跨页面验证：详情页操作后，列表页刷新后状态一致
- [ ] 不引入任何新依赖（Zustand 在阶段 1 就已引入）
- [ ] 不会有任何视觉变化（纯逻辑改动，UI 不变）

## 边界

- 不改造表单输入值的读写方式（仍然从 DOM 读取）
- 不改造页面其他非审批状态的区域
- 不引入 React、Vite
