# 架构演进切入点分析

## 1. 架构现状诊断

### 1.1 技术栈与加载链路

基于 J2EE + jQuery + gulp 的典型技术栈特征，推断当前前端运行机制如下：

```
JSP 页面（服务端渲染）
  ├── header.jsp（<jsp:include> 或 <%@ include %>）
  │     ├── <script src="/js/lib/jquery.min.js">
  │     ├── <script src="/js/lib/jquery.plugins.js">
  │     └── <script src="/js/common/global.js">
  ├── 页面内联脚本
  │     └── <script>var orderId = '<%= request.getAttribute("orderId") %>';</script>
  ├── 业务模块脚本
  │     ├── <script src="/js/module/order.js">
  │     └── <script src="/js/module/approval.js">
  └── 初始化脚本
        └── <script>$(function() { OrderModule.init(); })</script>
```

**关键特征：**

| 特征 | 现状 | 影响 |
|---|---|---|
| 文件加载方式 | `<script>` 标签串行加载 | 加载顺序即依赖关系，无法静态验证 |
| 模块导出 | `window.XxxModule = { ... }` | 全局命名空间污染，无访问控制 |
| 模块依赖 | 隐式，靠 script 标签顺序保证 | 依赖关系不可见，全靠人脑记忆 |
| 全局污染 | 所有模块 + 插件均挂载 window | 命名冲突风险，修改影响面不可评估 |
| 构建工具 | gulp（concat + minify） | 仅做物理合并，不解析模块边界 |
| 服务端桥接 | JSP 内联 `<script>` 注入变量 | JS 逻辑与服务端模板强耦合 |

### 1.2 模块通信方式

```
window 全局命名空间（平铺结构，无层级）

  window.Utils          ← 工具函数集合
  window.OrderModule    ← 订单模块
  window.ApprovalModule ← 审批模块
  window.SupplierModule ← 供应商模块
  window.ContractModule ← 合同模块
  window.LogisticsModule← 物流模块
  ...                   ← 30+ 个模块

  模块间调用：window.YyyModule.xxx()
  模块间状态：散落在 DOM 属性、隐藏域、多个 JS 全局变量中
```

**"模块"在项目中的实际含义**：不是技术上的强制边界，而是文件级的命名约定。任何模块可以访问任何其他模块的内部状态，任何脚本可以操作任何 DOM 节点。`window.XxxModule` 已固化为团队的认知基础——跨模块调用直接使用，没有人觉得这有问题。

### 1.3 根因推导

README 中描述的 5 个典型问题，不是 5 个独立问题，而是**"无模块边界"这一共同根因的 5 种症状**：

```
                    无模块边界（根因）
                          │
     ┌────────┬───────────┼───────────┬──────────┐
     ▼        ▼           ▼           ▼          ▼
  UI重复实现  状态不一致  交互失效   并发丢数据  上手困难
  (症状A)   (症状B)    (症状C)    (症状D)    (症状E)
```

**症状 A —— UI 重复实现**（痛点 1 的本质）：

现有项目中，**Model/逻辑层已通过函数级物理拆分和 `window.Utils` 实现了一定程度的复用**（如 `validateForm`、`formatPrice` 等工具函数可跨文件调用）。真正的缺口在 **UI/视图层**——同一业务概念的 UI 在不同页面被独立实现了多次，彼此之间没有任何共享。

以"危险品证书号"字段为例：

```
Model 层（部分复用，但也不统一）
  ├── validateCertNo()  → window.Utils 中可能有一份
  └── 某些页面可能另有自己的校验逻辑副本

UI 层（零复用）
  ├── 新增页：独立实现 <input> + 校验提示 DOM
  ├── 编辑页：独立实现 <input> + 校验提示 DOM（与新增页类似但不完全相同）
  ├── 详情页：独立实现展示 DOM
  ├── 批量导入页：独立实现表格列渲染
  ├── 列表导出模板：独立实现表头 + 格式
  ├── 移动端审批页：独立实现展示 DOM
  └── 3 个 JSP 内联脚本：各自操作上述 DOM
```

**核心问题**：不同页面里的"危险品证书号"，虽然业务含义相同，但在代码层面是 9+ 个独立存在、互不相干的 UI 实现。不是因为一个改动需要传播到 9 个地方（那是结果），而是**从一开始就没有"UI 组件"这个概念**——每个页面各自造轮子。

- 症状 B：无单一状态源 → 状态在 DOM、隐藏域、全局变量中分别存储，必然漂移
- 症状 C：逻辑与 DOM 隐式耦合 → 依赖加载顺序和 DOM 可见性，操作结果不可复现
- 症状 D：无变更隔离 → 多处代码直接操作同一数据，无法检测冲突
- 症状 E：无显式边界 → 修改影响面无法静态评估，依赖老员工脑图

**结论：根因是模块边界的缺失。** 解决了它，5 个症状会在不同程度上被缓解；绕过它去解决任何一个症状，都只能做点状修补。

---

## 2. 改造难度矩阵

### 2.1 难度分层

不是所有代码的改造难度相同。按四个维度对一个模块进行难度评级：

| 难度维度 | 简单场景（🟢） | 困难场景（🔴） | 评估指标 |
|---|---|---|---|
| 依赖方向 | 纯工具函数，只被依赖不依赖别人 | 循环依赖的模块对 | 在依赖图中的入度/出度 |
| 全局耦合度 | 仅通过 window 暴露 API | 还依赖 DOM 状态、JSP 内联变量、全局事件 | 隐式契约的数量 |
| jQuery 耦合 | 只用 `$().on()` 事件绑定 | `$.fn` 插件扩展、`$().html()` 动态拼模板 | 对 DOM 的直接操作密度 |
| JSP 桥接 | 无服务端数据注入 | 内联 `<script>var x = '<%=x%>'</script>` | 服务端变量穿越到 JS 的频次 |

### 2.2 分阶段难度评级

```
难度 →
      低             中             高
  ┌─────────┬─────────┬─────────┬─────────┐
  │ 阶段1   │ 阶段1.5 │ 阶段2   │ 阶段3   │
  │Zustand  │局部Island│全页React│jQuery退役│
  │状态治理  │         │         │         │
  │─────────│─────────│─────────│─────────│
  │ 技术:🟢 │ 技术:🟡 │ 技术:🟡 │ 技术:🟢  │
  │ 认知:🟢 │ 认知:🟡 │ 认知:🟡 │ 认知:🟢  │
  │ 风险:极低│ 风险:中  │ 风险:中  │ 风险:低  │
  └─────────┴─────────┴─────────┴─────────┘

阶段 1 风险极低：不引入新框架，只改变 jQuery 代码的状态读写方式
阶段 1.5/2 有风险但可控：Feature flag + 配置级降级 = 秒级回滚
```

### 2.3 核心策略：Feature Flag + 岛内独治

不再通过 UMD 桥接让新老 DOM 共存。改为 Feature flag 二选一：一个区块要么 JSP 渲染，要么 React 渲染，不同时存在。

```
┌──────────────────────────────────────────────────────┐
│                    同一个 JSP 页面                       │
│                                                      │
│  区块 1（jQuery，不动）    区块 2（Feature flag 控制）    │
│  ┌──────────────────┐   ┌──────────────────────────┐  │
│  │ JSP 照常渲染       │   │ if (flag == "react") {    │  │
│  │ jQuery 事件绑定    │   │   <div id="root"></div>  │  │
│  │                   │   │   React 渲染到此空 div     │  │
│  │ 从 Store 读状态    │   │   从 Store 读同一份状态    │  │
│  └──────────────────┘   │ } else {                 │  │
│                          │   JSP 渲染旧 HTML         │  │
│                          │   从 Store 读同一份状态    │  │
│                          │ }                        │  │
│                          └──────────────────────────┘  │
│                                                      │
│  降级：改 flag 配置 → JSP 走 else 分支 → 秒级生效        │
│  Zustand Store：两个分支读同一份 Store，状态天然一致      │
└──────────────────────────────────────────────────────┘
```

---

## 3. 量化框架

### 3.1 设计原则

- **不做绝对值承诺**，做"改造模块 vs 未改造模块"的同期对比 —— 排除业务波动干扰
- **多维度锚定**，不依赖单一指标 —— 避免"客诉率个位数"这种做完不变的情况
- **每个指标有明确的采集方式**，不依赖主观判断

### 3.2 四维指标体系

| 指标维度 | 测量什么 | 采集方式 | 作用于哪个痛点 |
|---|---|---|---|
| **UI 实现重复度** | 同一业务概念的 UI 在多少个独立位置被实现 | 选定 3-5 个核心业务字段（如"危险品证书号"、"订单状态"），统计每个字段的 UI（DOM 结构 + 事件绑定 + 校验展示）在多少页面/文件中被独立实现。改造前 vs 改造后 | A（UI 重复实现） |
| **缺陷密度** | 每个需求交付引入的 bug 数 | 改造模块 vs 未改造模块，同一时期内，归属于该模块的 bug 总数 / 该模块的需求数 | A+B（UI 重复+不一致） |
| **页面操作完成率** | 关键操作的一次成功率 | 页面埋点：提交成功数 / 提交尝试数。可选：页面停留时长作为辅助指标 | C（交互可靠性） |
| **新人独立产出时间** | 从入职到第一个独立 MR 的天数 | 记录数据（不含试用期基础培训时间） | E（可维护性） |

### 3.3 分阶段量化侧重点

| 阶段 | 主测量指标 | 辅助验证 |
|---|---|---|
| 模块边界阶段（当前） | UI 实现重复度 | — |
| 组件化阶段（随后） | UI 实现重复度 + 缺陷密度 | — |
| 状态管理阶段（随后） | 缺陷密度 + 页面操作完成率 | 用户满意度访谈（改造前后对比） |
| 持续演进 | 新人独立产出时间 | 全周期对比 |

### 3.4 说服链设计

```
第一阶段数据："'危险品证书号'字段的 UI 原来在 9 个位置独立实现，现在 1 处组件定义 + 9 处引用"
       ↓ （说服：消除 UI 重复，不是重构，是降本）
第二阶段数据："改造的模块 bug 数是未改造模块的 1/3"
       ↓ （说服：质量提升 = 减少业务损失）
第三阶段数据："关键操作失败率从 X% 降到 Y%"
       ↓ （说服：用户价值可感知）
管理层最终认可 → 争取更多资源 → 加速推进
```

---

## 4. 切入点选择

### 4.1 为什么是一步到位，而非渐进中间态

**AI Coding 改变了迁移成本等式。**

| | 旧假设（AI 之前） | 新现实（AI 时代） |
|---|---|---|
| 代码翻译成本 | 高（jQuery→React 需人工逐行重写） | 低（AI 承担 80% 机械翻译） |
| 合理的策略 | 渐进中间态，降低每次跳跃成本 | 一步锚定终态，不产生二次迁移 |
| 中间态的代价 | 一次额外投入 | 浪费——本可以直接到终态 |

Pure JS 组件工厂的问题：它在 jQuery 体系内做"设计优化"，改变了代码组织方式但不改变范式（仍然操作 DOM 以反映状态，而不是管理状态以驱动 DOM）。**它的每一次投入都是沉没成本——等未来迁移到 React 时需要全部重做。** 在 AI 已经能大幅压缩代码翻译成本的今天，这个中间态不再必要。

### 4.2 选定策略：React Island + Zustand

三位一体，每个承担不同角色：

```
React Island + Zustand（三位一体，同一次寄生中搭建）

  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
  │ Vite            │   │ React           │   │ Zustand          │
  │ 构建链           │   │ UI 组件化        │   │ 状态管理         │
  │                 │   │                 │   │                 │
  │ • 输出 IIFE 格式 │   │ • 声明式 UI      │   │ • 框架无关 API   │
  │ • vendor 共享   │   │ • 组件复用       │   │ • jQuery 可消费  │
  │ • 与 gulp 并行  │   │ • AI 最友好的范式 │   │ • React 原生支持 │
  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
           │                     │                     │
           └─────────────────────┼─────────────────────┘
                                 │
                   ┌─────────────┴─────────────┐
                   │ 一次投入，三个产出           │
                   │ 之后不再有中间态迁移成本      │
                   │ 每个 Island 就是终态的一部分  │
                   └───────────────────────────┘
```

**为什么是 Zustand 而非 useState**：

| | useState（React 内置） | Zustand |
|---|---|---|
| React 中使用 | ✅ | ✅ |
| jQuery 中消费 | ❌ 不可行 | ✅ `getState()` / `setState()` / `subscribe()` |
| 跨 Island 共享 | 🟡 需要 Context/CustomEvent | ✅ 同一 store 天然共享 |
| 对终态贡献 | 🟡 后续需要引入状态管理库 | 🟢 直接是终态 |
| 体积 | 0（内置） | ~1KB |

**Zustand 的核心价值**：同一份 store，jQuery 代码通过 `getState()` 读取、`setState()` 写入，React 组件通过 `useStore(selector)` 消费。两者操作的是同一个数据源，不产生副本。这使得"状态管理"不再是后续阶段，而是从第一天就内建。

### 4.3 React Island 工作机制

**核心原则：岛内独治，岛外不动。**

一个页面区块只有一个主人：要么 JSP 渲染，要么 React 渲染，不同时存在。

```
正确设计（Feature flag 二选一）：

  分支 A（react）→ 空 div + React 填充
  分支 B（jquery）→ JSP 渲染旧 HTML

  出问题：改配置切回分支 B，秒级生效
  不是 DOM 级共存（无同步问题）
```

**构建策略**：共享 vendor + 独立 Island + Manifest 寻址

```
dist/
  vendor/
    vendor.1a2b3c4.js         ← Preact + Zustand，~5KB gzipped，Cache-Control: 30 天
  islands/
    certNoField.d4e5f6a.js    ← 带 hash，Cache-Control: immutable
    approvalPanel.a1b2c3d.js
  manifest.json               ← 构建产出，推送到 TCC 配置中心
```

JSP 通过 `IslandResolver` 从 TCC 读取 manifest 获取当前 hash 文件名，不写死版本号。前端发版：`npm run build → 上传 CDN → 推送 manifest 到 TCC → Java 零操作`。

**Feature Flag 控制**（通过 island-router.jsp 集中路由）：

```jsp
<%-- 公共数据层：JSP 只输出 JSON，不感知前端库 --%>
<script>
  window.$page = window.$page || {};
  window.$page.approval = {
    orderId: '<%= order.id %>',
    status: '<%= order.approvalStatus %>',
    operator: '<%= order.approvalOperator %>'
  };
</script>

<%-- 1 行 router include 替代原 45 行 if/else --%>
<jsp:include page="/WEB-INF/includes/island-router.jsp">
  <jsp:param name="route" value="approval-status"/>
</jsp:include>
```

island-router.jsp 在服务端根据 TCC `island.routes` 配置 + 确定性哈希决定走 React 分支还是 jQuery 分支。renderer="react" 时只出空 div + script，renderer="jquery" 时直接 include fallback JSP。

island-router.jsp 内部逻辑（伪代码）：

```
String route = "approval-status";
Map cfg = TCC.get("island.routes").get(route);
// cfg = { renderer: "react", island: "approvalStatus", traffic: 0.5 }

int bucket = hash(userId + ":" + route) % 100;
boolean useReact = "react".equals(renderer) && bucket < traffic * 100;

if (useReact) → 输出空 div + vendor.js + island.js → React 渲染
else        → include fallback/approval-status.jsp → jQuery 渲染
```

**降级方式**：

| 场景 | 表现 | 恢复 |
|---|---|---|
| Island JS 加载失败 | JSP 走 else 分支，旧 HTML 完整渲染 | 用户刷新 |
| Island 运行时崩溃 | ErrorBoundary 捕获，该区域降级 | 自动 |
| 全局回滚 React | 改配置 `order.approval.renderer = "jquery"` | 秒级生效 |

**Zustand 桥接**：阶段 1 已引入 Zustand，jQuery 代码改为读写 Store。阶段 1.5/2 的 React Island 读写同一个 Store。详见阶段 1 设计。

### 4.4 与 Pure JS 组件工厂的本质区别

| | Pure JS 组件工厂 | React Island + Zustand |
|---|---|---|
| 渲染方式 | 拼接 HTML → `$().append()` | 声明式 JSX → React diff → DOM |
| 状态管理 | 仍散落在 DOM + jQuery.data() + 全局变量 | Zustand store，单一源 |
| 状态变→UI 变 | 手动同步多个位置 | 自动：改 state → React 重渲染 |
| jQuery 可消费 | ✅ | ✅（Zustand getState/setState） |
| 跨 Island 状态共享 | ❌ 靠 window 全局变量 | ✅ 同一 store 天然共享 |
| 对终态贡献 | 🔴 零（未来需重做） | 🟢 直接是终态 |
| AI 可生成度 | 🔴 低（自定义模式） | 🟢 高（React 是 AI 训练数据最多的前端范式） |

### 4.5 试点选择：审批流

从 30+ 模块中按四个条件筛选：

| 筛选条件 | 含义 |
|---|---|
| 有状态流转 | 不是静态字段，而是随时间/操作变化的实体生命周期 |
| 有一定复杂性 | 至少 3+ 状态节点 + 条件分支，足以验证架构 |
| 多页面用到 | 同一状态被列表、详情、操作、移动端等多处消费 |
| 可量化对比 | 改造前状态散落程度可度量 |

审批流是唯一满足四个条件且在 README 中有明确已发问题的模块（"页面显示已通过，后台却是待审"）。

**审批流状态机**：

```
pending → inReview → approved → executed
         ├→ rejected → resubmit → inReview
         └→ withdrawn
```

**涉及页面**（7 个，跨 PC 和移动端）：

| 页面 | 状态消费方式 |
|---|---|
| 待办列表页 | 展示待审批项 + 状态筛选 |
| 已办列表页 | 展示已审批项 + 状态 |
| 审批详情页 | 审批操作 + 意见填写 + 状态展示 |
| 发起申请页 | 查看审批进度 |
| 移动端审批页 | 快速审批 |
| Dashboard | 审批统计 |
| 工作流配置页 | 审批节点/条件配置 |

**试点的最小可行范围**：

```
试点范围：审批详情页 + 待办列表页（两个 Island，消费同一 Zustand store）
其余页面后续扩展，不纳入首次试点
```

**审批流是"横向"能力**——订单审批、合同审批、供应商资质审批、费用审批都在用同一个审批流模式。做完一次审批流的 Island 化，自然形成一个可复用的模式模板，后续横向复制成本极低。这比改造单个"纵向"模块（如订单）的说服力更强。

**试点卡片**：

```
试点：审批流（分两个 MR 推进）

MR 1（阶段 1：Zustand 状态治理，本周）：
  审批详情页 + 待办列表页的 jQuery 代码改为读写 Store
  不引入 React，零新依赖，零风险
  量化：状态源数量 N → 1

MR 2（阶段 1.5 或 2，下一轮业务需求时）：
  审批状态面板 Island 化
  - 如果审批详情是独立小页面 → 全页 React（阶段 2）
  - 如果审批面板嵌在大订单详情页 → 局部 Island（阶段 1.5）
  Feature flag 控制，配置级降级
  量化：UI 实现重复度 7 → 1 组件 + 7 引用

时间：寄生在下一个审批相关的业务需求中
后端依赖：MR 1 零后端依赖；MR 2 需要 Java 团队实现 IslandResolver（一次性，约 30 行代码）
```

---

## 5. AI 辅助的操作指南

### 5.1 核心流程（两阶段推进）

**阶段 1：Zustand 状态治理（不引入 React）**

```
[扫描脚本] ──→ 输出状态散落 JSON
     ↓
[AI 分析]  ──→ 状态副本地图 + 基线数值
     ↓
[AI 生成]  ──→ Zustand store 定义
     ↓
[人工 review] ──→ 确认业务规则正确
     ↓
[AI 生成]  ──→ jQuery 改造 diff（读写 DOM/全局变量 → 读写 Store）
     ↓
[人工 review] ──→ 确认行为等价
     ↓
[提交]    ──→ 量化：状态源数量 N → 1
```

**阶段 1.5/2：React Island 引入**

```
[AI 输入]  ──→ 老 JSP HTML + jQuery 逻辑 + Zustand store
     ↓
[AI 生成]  ──→ React Island 组件 + Feature flag JSP 片段
     ↓
[人工 review] ──→ 确认视觉和行为等价
     ↓
[构建验证] ──→ Vite build + staging 环境功能回归
     ↓
[灰度发布] ──→ Feature flag 放量 1% → 10% → 50% → 100%
     ↓
[提交]    ──→ 量化：UI 实现重复度对比
```

### 5.2 步骤一：状态副本检测

**目标**：扫描一个业务概念（如审批状态）在当前代码中的"副本数量"——多少位置独立存储/修改了该状态。

**检测点**：

| 模式 | 扫描目标 | 示例 |
|---|---|---|
| DOM 文本 | `$().text()` / `$().html()` 设置状态文本 | `$('#status').text('已通过')` |
| DOM 隐藏域 | `<input type="hidden">` 的 value | `<input type="hidden" name="status" value="pending">` |
| jQuery.data | `$().data(key, val)` | `$('#panel').data('status', 'approved')` |
| JS 全局变量 | `window.Xxx._status = ...` | `window.ApprovalModule._status = 'approved'` |
| 内联脚本 | JSP 中 `<script>` 块的变量赋值 | `<script>var approvalStatus = '<%=status%>';</script>` |

**输出**（JSON）：

```json
{
  "approvalStatus": {
    "concept": "审批状态",
    "copies": [
      { "file": "approval/detail.jsp", "line": 45, "type": "DOM-text", "value": "$('#status-badge').text(...)" },
      { "file": "approval/detail.jsp", "line": 78, "type": "DOM-hidden", "value": "<input type='hidden' name='status'>" },
      { "file": "approval/detail.jsp", "line": 120, "type": "JSP-inline", "value": "var status = '<%=status%>'" },
      { "file": "js/approval.js", "line": 23, "type": "global-var", "value": "window.ApprovalModule._status" },
      { "file": "js/approval.js", "line": 67, "type": "DOM-text", "value": "$('#approval-status').text(...)" },
      { "file": "todo/list.jsp", "line": 89, "type": "DOM-text", "value": "$('.status-label').text(...)" },
      { "file": "mobile/approval.jsp", "line": 34, "type": "DOM-text", "value": "$('#m-status').text(...)" }
    ],
    "totalCopies": 7,
    "filesInvolved": 4
  }
}
```

**AI 分析任务**：识别所有这些副本是否操作的是"同一个概念"（审批状态），合并为一张状态副本地图。产出改造前基线数值。

**量化价值**："审批状态在 4 个文件中有 7 个独立副本"——这个数字本身就是一个无法反驳的理由。管理层、业务方都能理解。

### 5.3 步骤二：Zustand Store 设计（阶段 1）

**AI 输入**：状态副本地图 + 业务逻辑（审批流程规则）

**AI 输出**：

```js
// store/approvalStore.ts —— 阶段 1 产出，jQuery 代码通过 getState()/setState()/subscribe() 消费
import { create } from 'zustand';

export const useApprovalStore = create((set, get) => ({
  // 状态定义（来自副本地图中的核心字段）
  status: 'pending',          // pending | inReview | approved | rejected | withdrawn | executed
  orderId: null,
  operator: null,
  comment: '',

  // 操作（来自原来散落在各处的条件判断逻辑）
  submit: () => set({ status: 'inReview' }),
  assign: (reviewer) => set({ status: 'inReview', operator: reviewer }),
  approve: (operator, comment) => set({ status: 'approved', operator, comment }),
  reject: (operator, comment) => set({ status: 'rejected', operator, comment }),
  resubmit: () => set({ status: 'inReview', comment: '' }),
  withdraw: (operator) => set({ status: 'withdrawn', operator }),
  execute: (operator) => set({ status: 'executed', operator }),

  // 派生属性（jQuery 通过 getState() 消费，React 通过 useStore selector 消费）
  isEditable: () => ['pending', 'rejected'].includes(get().status),
  canApprove: () => get().status === 'inReview',
  statusLabel: () => {
    const labels = { pending: '待审', inReview: '审核中', approved: '已通过', rejected: '已驳回', withdrawn: '已撤回', executed: '已执行' };
    return labels[get().status];
  },
}));
```

**关键边界**：Store 只管理跨页面、跨时间的业务状态。用户在表单中的即时输入（textarea 内容、日期选择）留在 DOM 中，submit 时一次性读取——不进入 Store。

### 5.4 步骤三：React Island 生成 + Feature Flag JSP 片段（阶段 1.5/2）

**AI 输入**：原审批区域的 HTML 模板 + jQuery 逻辑 + Zustand store 定义

**AI 输出**：

**A. React Island 组件**：

```tsx
// islands/ApprovalPanel.tsx
export default function ApprovalPanel({ orderId }: Props) {
  return (
    <IslandErrorBoundary fallback={/* JSP 旧版本已在 else 分支中 */}>
      <ApprovalStatusBadge />
      <ApprovalCommentBox />
      <ApprovalActionButtons orderId={orderId} />
      <ApprovalHistory orderId={orderId} />
    </IslandErrorBoundary>
  );
}
```

**B. Feature Flag JSP 片段**：

```jsp
<%-- 公共数据层 --%>
<script>
  window.$page = window.$page || {};
  window.$page.approval = {
    orderId: '<%= order.id %>',
    status: '<%= order.approvalStatus %>',
    operator: '<%= order.approvalOperator %>'
  };
</script>

<%-- 分支 A：React（flag = "react"） --%>
<div id="approval-status-root"></div>
<script src="<%= IslandResolver.getUrl("vendor") %>"></script>
<script src="<%= IslandResolver.getUrl("approvalStatus") %>"></script>
<script>
  __islands.ApprovalStatus.mount('#approval-status-root', {
    orderId: '<%= order.id %>'
  });
</script>

<%-- 分支 B：jQuery（flag = "jquery"） —— 旧代码完整保留 --%>
<%@ include file="approval-status-jquery.inc.jsp" %>
```

**C. 降级**：Feature flag 切回 `"jquery"` → JSP 走 else 分支 → 旧代码完整渲染。不存在 DOM 级的共存或同步。

### 5.5 步骤四：灰度发布与旧代码清理（阶段 1.5/2 后续）

**灰度发布**：Feature flag 逐步放量

```
Day 1：内部用户 100%
Day 3：1% 真实用户（观察 CWV 和错误率）
Day 5：10%（确认无劣化）
Day 7：50%
Day 10：100%
Day 30：删除旧代码（jQuery 分支 + inc.jsp）
```

**清理时**：Zustand Store 保持不变（从阶段 1 到终态同一份代码），只移除 jQuery UI 代码。

### 5.6 AI 介入点总结

| 步骤 | 阶段 | AI 角色 | 人的角色 |
|---|---|---|---|
| 状态副本检测 | 1 | 解析扫描 JSON，合并相同概念，输出副本地图 | 确认"同一概念"的业务语义 |
| Store 设计 | 1 | 从副本和条件分支中抽取状态定义 + 操作 + 派生 | 确认业务规则正确性（边界条件） |
| jQuery Store 化 diff | 1 | 生成 jQuery 改造 diff（DOM/全局变量读写 → Store 读写） | 确认行为等价 |
| React Island 生成 | 1.5/2 | 从老 HTML + jQuery 生成等效 React 组件 | 确认视觉和行为等价 |
| Feature Flag JSP | 1.5/2 | 生成 if/else 分支的 JSP 片段 | 确认降级路径正确 |
| Manifest 推送 | 1.5/2 | CI 自动化 | 确认 TCC 配置更新成功 |

---

## 6. 后续演进路径

```
阶段 0：基线采集
  └── 扫描脚本 → 状态副本地图 + UI 重复度基线

阶段 1：Zustand 状态治理
  ├── jQuery 仍渲染 UI，状态读写改走 Store
  ├── 不引入 React，零新依赖，零闪屏风险
  ├── 量化锚点：状态源数量
  └── 产出：跨页面共享的 Zustand Store 层

阶段 1.5：局部 React Island（大页面中挑最痛的区块）
  ├── 岛内独治：Feature flag 二选一，不同时存在
  ├── 降级 = 改配置切回 JSP 分支，秒级生效
  ├── 量化锚点：UI 实现重复度 + Island 覆盖率
  └── 适用：大 JSP 页面中高痛点的局部区域

阶段 2：全页 React 重写（中小页面、新页面）
  ├── Store 不变，全页走 React，Feature flag + 灰度
  ├── 量化锚点：缺陷密度 + 操作完成率
  └── 适用：独立小页面、全新页面

阶段 3：jQuery 全量退役
  ├── 最后一个页面 React 化后，移除 jQuery 依赖
  └── Store 从阶段 1 到终态同一份代码

长期（各阶段并行推进）：
  ├── 横向能力优先：审批流、待办、通知、文件上传
  ├── 纵向模块逐个：订单、合同、物流、财务
  ├── 构建部署：Vite + Manifest + TCC，前端独立发版
  └── 技术栈：Preact + Zustand + TypeScript
```

**关键原则**：
- **不产生二次迁移**：Zustand store 从第一阶段到最后阶段是同一份代码。jQuery 消费 → React 消费，Store 不变
- **阶段 1.5 和 2 不是二选一**：按页面情况选用。大页面走 1.5（局部 Island），小页面/新页面走 2（全页 React）
- **一次投入，后续零新增成本**：IslandResolver 一次实现后，后续所有 Island 页面直接复用，Java 零改动
- **每一轮寄生于业务需求**：不独立申请资源，每次提交带量化数据

---

## 7. 边界条件与约束

### 7.1 硬约束

- **不能停服**：所有改造在线上运行期间进行，新老代码共存
- **不能暂停业务需求**：改造寄生在业务需求中，不独立占用排期
- **团队规模有限**：每次改动面尽可能小，降低 review 负担
- **后端配合需 ROI**：优先选择零后端依赖的改动

### 7.2 组织约束

- **业务方不认可投入产出比**：策略是寄生而非独立项目，每次改造关联一个业务需求，不额外申请资源
- **管理层求稳、不给资源**：策略是用数据建立说服链，第一阶段不申请额外资源，用数据证明 ROI

### 7.3 技术约束

- **JSP 服务端渲染为主**：Island 以挂载点方式嵌入 JSP 页面，不改变服务端渲染逻辑
- **jQuery 广泛使用**：通过 Zustand getState/setState/subscribe 提供双向兼容，老代码不强制改造
- **全局变量已成认知基础**：`window.__islands` 遵循同样的全局约定，降低认知迁移阻力
- **Zustand 体积约束**：vendor.js 包含 React + ReactDOM + Zustand，首次加载会增加页面体积，需在试点阶段实测评估

---

## 8. 已确认

1. **试点场景**：审批流——审批详情页 + 待办列表页
2. **技术栈**：Vite + React + Zustand
3. **演进策略**：寄生式——不独立申请资源，关联业务需求推动
4. **量化方式**：状态源数量 + UI 实现重复度，改造前基线 → 改造后对比

## 9. 待确认事项

1. **实际 JS 文件结构**：当前推断基于 J2EE + jQuery + gulp 的典型架构，实际项目结构需要通过扫描脚本校准

2. **第一个寄生需求的具体内容**：需要与业务方确认下一个审批相关的需求，确定寄生时机

3. **团队 React/Zustand 熟悉度**：如果团队不熟悉，需要在计划中纳入学习缓冲

4. **vendor.js 体积对首屏加载的影响**：React + ReactDOM + Zustand ≈ 40KB gzipped，需在试点中实测对旧页面的性能影响
