# 任务 00：基线采集

## 目标

编写扫描脚本，产出审批流在当前代码中的状态副本数量和 UI 实现重复度的基线数据。为后续所有改造提供量化对比锚点。

## 依赖

无。可立即启动。

## 与哪些任务可并行

- 任务 03（Vite + Preact 构建链）— 完全独立

## 输入

- 项目 JS 文件目录（待确认实际路径）
- 项目 JSP 文件目录（待确认实际路径）

## 产出

1. 扫描脚本 `scripts/scan-state-copies.js`（可重复运行）
2. 基线报告 `baselines/approval-flow-baseline.json`

## 步骤

### 步骤 1：确定扫描范围

列出审批流涉及的所有文件：

```
JSP 页面（待校准）：
  approval/detail.jsp
  approval/todo.jsp
  approval/done.jsp
  approval/apply.jsp
  mobile/approval.jsp
  dashboard/index.jsp
  workflow/config.jsp

JS 文件（待校准）：
  js/approval.js
  js/workflow.js
  js/common/datatables.js
```

### 步骤 2：编写扫描脚本

检测 5 种状态副本模式：

| 模式 | 正则/匹配方式 | 示例 |
|---|---|---|
| DOM 文本写入 | `\$\(['\"]\.[\w-]*status[\w-]*['\"]\)\.text\(` | `$('#status').text('已通过')` |
| 隐藏域 | `<input[^>]*name=['\"]status['\"][^>]*>` | `<input type="hidden" name="status">` |
| jQuery.data | `\.data\(['\"]status['\"]` | `$('#panel').data('status', val)` |
| 全局变量 | `window\.\w*[Aa]pprov\w*\._*\w*[Ss]tatus\s*=` | `window.ApprovalModule._status = ...` |
| JSP 内联注入 | `<%=.*[Ss]tatus.*%>` | `<%= order.approvalStatus %>` |

额外检测：审批状态的条件分支（`if (status === ...)`）散落位置。

### 步骤 3：运行脚本 + 人工校验

1. 运行脚本，输出原始 JSON
2. 人工逐条确认：这些副本是否操作的是"同一个业务概念"（审批状态）
3. 合并相同概念，产出最终基线报告

### 步骤 4：产出基线 JSON

```json
{
  "baselineDate": "2026-06-21",
  "concepts": [
    {
      "name": "审批状态",
      "totalCopies": 7,
      "filesInvolved": 4,
      "breakdown": {
        "DOM-text": 3,
        "DOM-hidden": 1,
        "global-var": 1,
        "JSP-inline": 2
      },
      "independentUIs": 7,
      "affectedPages": [
        "approval/detail.jsp",
        "approval/todo.jsp",
        "approval/done.jsp",
        "mobile/approval.jsp"
      ]
    }
  ]
}
```

## 里程碑

| 节点 | 判定标准 |
|---|---|
| M1：扫描脚本完成 | 在项目目录下运行，能输出原始 JSON |
| M2：基线报告生成 | 人工校验通过，JSON 文件提交到仓库 |

## 量化指标

| 指标 | 当前值 | 目标值（阶段 1 后） | 目标值（阶段 1.5/2 后） |
|---|---|---|---|
| 审批状态源副本数 | 待扫描 | 1（单一 Store） | 1（Store 不变） |
| UI 实现独立份数 | 待扫描 | 不变（jQuery UI 仍在） | 1 组件 + N 处引用 |

## 验收标准

- [ ] 脚本在项目目录下可独立运行，不依赖构建链
- [ ] 基线 JSON 中每个副本有明确的文件路径和行号
- [ ] 基线 JSON 提交到仓库，作为后续量化的对比锚点
