# 任务 06：Router 集成 + Fallback JSP

## 目标

将审批详情页（或大订单详情页的审批区块）的 JSP 改为使用 `island-router.jsp` 进行集中路由。从原来的 if/else 代码块收敛为 1 行 router include。

## 依赖

- 任务 02（jQuery Store 化完成 + 功能回归通过）
- 任务 04（IslandResolver + island-router.jsp 可用）
- 任务 05（React Island 组件构建产出 + 功能测试通过）

## 与哪些任务可并行

- 无（本任务是阶段 1 和阶段 1.5/2 的集成点）

## 输入

- 任务 02 产物：已 Store 化的 jQuery 代码
- 任务 04 产物：`IslandResolver.getUrl()` + `island-router.jsp` 可用
- 任务 05 产物：`dist/islands/approvalStatus.[hash].js`

## 产出

1. JSP 页面改造（替换审批区块为 router include）
2. `fallback/approval-status.jsp`（原 JSP HTML + jQuery 逻辑搬过来）
3. `island.routes` 增加 `approval-status` 路由条目

## 步骤

### 步骤 1：改造 JSP 页面

```jsp
<%-- order/detail.jsp（或 approval/detail.jsp）改造前后对比 --%>

<%-- 公共数据层（不变） --%>
<script>
  window.$page = window.$page || {};
  window.$page.approval = {
    orderId: '<%= order.id %>',
    status: '<%= order.approvalStatus %>',
    operator: '<%= order.approvalOperator %>'
  };
</script>

<!-- 改造前（45 行 if/else） -->
<%
  boolean useReact = "react".equals(ConfigService.getString("order.approval.renderer", "jquery"));
%>
<% if (useReact) { %>
  <div id="approval-status-root"></div>
  <script src="<%= IslandResolver.getUrl("vendor") %>"></script>
  <script src="<%= IslandResolver.getUrl("approvalStatus") %>"></script>
  <script>
    __islands.ApprovalStatus.mount('#approval-status-root', { orderId: '<%= order.id %>' });
  </script>
<% } else { %>
  <%@ include file="approval-status-jquery.inc.jsp" %>
<% } %>

<!-- 改造后（1 行） -->
<jsp:include page="/WEB-INF/includes/island-router.jsp">
  <jsp:param name="route" value="approval-status"/>
</jsp:include>
```

### 步骤 2：创建 Fallback JSP

将原来审批区块的 HTML + jQuery 逻辑完整搬入 `fallback/approval-status.jsp`，一个字符不改：

```jsp
<%-- /WEB-INF/includes/fallback/approval-status.jsp --%>
<div class="approval-panel">
  <span id="approval-status" class="badge badge-pending">待审</span>
  <div id="approval-actions">
    <textarea id="approval-comment" placeholder="请输入审批意见"></textarea>
    <button id="btn-approve">通过</button>
    <button id="btn-reject">驳回</button>
  </div>
  <input type="hidden" name="approvalStatus" id="hidden-status">
</div>

<script>
  // 从 $page 读取初始数据
  var pageData = window.$page && window.$page.approval;
  if (pageData) {
    useApprovalStore.setState({
      status: pageData.status,
      orderId: pageData.orderId,
      operator: pageData.operator || null
    });
  }

  // DOM 同步（Store → DOM）
  useApprovalStore.subscribe(function(state) {
    var label = state.statusLabel ? state.statusLabel() : state.status;
    $('#approval-status').text(label).attr('class', 'badge badge-' + state.status);
    $('#hidden-status').val(state.status);
  });

  // 按钮事件
  $('#btn-approve').on('click', function() {
    var comment = $('#approval-comment').val();
    useApprovalStore.getState().approve('当前用户', comment);
  });
  $('#btn-reject').on('click', function() {
    var comment = $('#approval-comment').val();
    useApprovalStore.getState().reject('当前用户', comment);
  });
</script>
```

### 步骤 3：配置 island.routes

在 TCC 中新增条目：

```json
{
  "approval-status": {
    "renderer": "jquery",
    "island": "approvalStatus",
    "traffic": 0
  }
}
```

初始 `renderer: "jquery"`——保证上线后行为与改造前一模一样。

### 步骤 4：验证两个分支

| 测试场景 | 方法 | 预期 |
|---|---|---|
| jQuery 分支 | `island.routes` 中 `renderer: "jquery"` | fallback JSP 完整渲染，功能与改造前一致 |
| React 分支 | URL 加 `?__r_approval-status=react` | React Island 渲染，功能正常 |
| 切回 jQuery 分支 | 去掉 URL 参数 | fallback JSP 渲染，数据一致 |
| 切回 React 分支 | URL 加参数 | React Island 渲染，数据一致（同一 Store） |
| TCC 不可用 | 模拟 TCC 故障 | 默认走 jQuery 分支，不白屏 |

## 里程碑

| 节点 | 判定标准 |
|---|---|
| M1：JSP 改造 + Fallback 创建 | 代码 Review 通过 |
| M2：jQuery 分支验证 | 行为与改造前完全一致 |
| M3：React 分支验证 | Island 正常渲染，功能正常 |
| M4：island.routes 注册 | TCC 可读到路由配置 |

## 量化指标

| 指标 | 目标 |
|---|---|
| JSP 改动量 | 原 45 行 if/else → 1 行 `<jsp:include>` |
| 分支切换延迟 | 秒级（TCC 配置生效 + 用户刷新） |
| 降级覆盖率 | jQuery 分支 + React 分支 + TCC 不可用全部验证 |

## 验收标准

- [ ] `renderer: "jquery"` 时页面行为与改造前完全一致
- [ ] `renderer: "react"` 时 Island 正常渲染，数据从 `window.$page` 正确初始化
- [ ] Query Param `?__r_approval-status=react|jquery` 可强制切换
- [ ] TCC 不可用时默认走 jQuery 分支
- [ ] JSP 中不再出现 Feature Flag 的 if/else 代码块（改为 router include）
