# 任务 08：质量保障体系

> 本文档回答"具体怎么操作"的问题。proposal.md §3 中概括性描述与本文档一致，本文档补充实现细节和工具链。

## 目标

建立三层自动化测试体系，借助 AI 将复杂业务的全链路回归从"每次 2-3 小时人工"压缩到"分钟级自动化 + 30 分钟人工 checklist"。

## 依赖

- 任务 01（Zustand Store 类型定义）
- 任务 02（jQuery Store 化完成）
- 任务 05（React Island 组件完成）

## 与哪些任务可并行

- 本任务贯穿阶段 1 到阶段 1.5，与 02/05/06 并行推进。用例随代码产出同步编写。

---

## 层 1：Store 状态机测试（纯逻辑，毫秒级）

### 用什么工具

- **Vitest**（与 Vite 同生态，零额外配置）
- 纯 JS/TS 测试，不依赖浏览器，Node 环境直接跑

### 状态流转图怎么来——不依赖人手写

**问题**：新来的 RD 不熟悉审批业务流程，怎么知道有哪些状态、哪些合法转换？

**答案**：状态流转图不是人凭空写的。分两步：

**第 1 步：AI 从代码中提取**

将以下材料喂给 Coding Agent（Claude Code / Cursor / Copilot）：

```
请阅读以下文件，提取"审批状态"的完整状态机：

1. js/approval.js —— 审批操作逻辑
2. approval/detail.jsp —— 审批详情页
3. todo/list.jsp —— 待办列表页的状态筛选

输出格式：
- 所有状态值（如 pending, inReview, approved...）
- 每个状态允许哪些操作（操作名 → 目标状态）
- 哪些状态之间不允许直接跳转

搜索线索：
- if (status === 'xxx') 的条件分支
- switch(status) 的 case 分支
- $('#btn-xxx').show() / .hide() 的条件（按钮在哪些状态下可见）
- statusLabel 映射表（中文标签 → 状态值）
- JSP 中 <c:if test="status == 'xxx'"> 的条件渲染
```

AI 会从散落在各处的条件判断、按钮显隐逻辑、状态标签映射中，拼出完整的状态机。

**第 2 步：人工 review**

AI 输出的状态机需要一个人（熟悉业务的 RD 或 PM）逐条确认：

| 确认项 | 方法 |
|--------|------|
| 状态列表是否完整 | 对照业务文档或问 PM |
| 转换规则是否正确 | 挑 2-3 个典型场景在现有系统中走一遍 |
| 边界条件是否遗漏 | 比如"已执行的订单能否撤回"（通常不能，但需确认） |

**投入**：第 1 步 AI 完成（分钟级），第 2 步人工 review 约 15 分钟。

**为什么可以信任 AI 提取的结果**：状态机的信息已经存在于现有代码中——条件判断、按钮显隐、JSP 标签——AI 只是"汇总"而非"创造"。人的作用是确认 AI 没有遗漏或误读。

### AI 生成测试用例

将确认后的状态机 + Store 类型定义喂给 AI：

```
基于以下状态机定义和 Zustand Store 类型，生成 Vitest 测试用例：

状态机：
  pending → submit() → inReview
  inReview → approve() → approved
  inReview → reject() → rejected
  inReview → withdraw() → withdrawn
  rejected → resubmit() → inReview
  approved → execute() → executed

要求：
- 覆盖所有合法转换路径
- 覆盖非法转换（如 pending 不能 approve、executed 不能做任何操作）
- 覆盖派生属性（statusLabel、isEditable、canApprove）
```

### 产出示例

```ts
// store/__tests__/approvalStore.test.ts（AI 生成，人工 review）
import { describe, it, expect, beforeEach } from 'vitest';
import { useApprovalStore } from '../approvalStore';

beforeEach(() => {
  useApprovalStore.setState({
    status: 'pending', orderId: 'test-1', operator: null, comment: '',
  });
});

describe('合法转换', () => {
  it('pending → inReview', () => {
    useApprovalStore.getState().submit();
    expect(useApprovalStore.getState().status).toBe('inReview');
  });
  it('inReview → approved', () => {
    useApprovalStore.setState({ status: 'inReview' });
    useApprovalStore.getState().approve('张三', '同意');
    expect(useApprovalStore.getState().status).toBe('approved');
  });
  it('inReview → rejected → resubmit → inReview', () => {
    useApprovalStore.setState({ status: 'inReview' });
    useApprovalStore.getState().reject('张三', '材料不全');
    expect(useApprovalStore.getState().status).toBe('rejected');
    useApprovalStore.getState().resubmit();
    expect(useApprovalStore.getState().status).toBe('inReview');
  });
  it('inReview → withdrawn', () => {
    useApprovalStore.setState({ status: 'inReview' });
    useApprovalStore.getState().withdraw('李四');
    expect(useApprovalStore.getState().status).toBe('withdrawn');
  });
  it('approved → executed', () => {
    useApprovalStore.setState({ status: 'approved' });
    useApprovalStore.getState().execute('王五');
    expect(useApprovalStore.getState().status).toBe('executed');
  });
});

describe('非法转换', () => {
  it('pending 不能 approve', () => {
    expect(useApprovalStore.getState().canApprove()).toBe(false);
  });
  it('approved 不能再次 approve', () => {
    useApprovalStore.setState({ status: 'approved' });
    expect(useApprovalStore.getState().canApprove()).toBe(false);
  });
  it('executed 不能编辑', () => {
    useApprovalStore.setState({ status: 'executed' });
    expect(useApprovalStore.getState().isEditable()).toBe(false);
  });
});

describe('派生属性', () => {
  it('statusLabel：各状态中文标签正确', () => {
    expect(useApprovalStore.getState().statusLabel()).toBe('待审');
    useApprovalStore.setState({ status: 'approved' });
    expect(useApprovalStore.getState().statusLabel()).toBe('已通过');
  });
  it('isEditable：仅 pending 和 rejected 为 true', () => {
    expect(useApprovalStore.getState().isEditable()).toBe(true);
    useApprovalStore.setState({ status: 'approved' });
    expect(useApprovalStore.getState().isEditable()).toBe(false);
    useApprovalStore.setState({ status: 'rejected' });
    expect(useApprovalStore.getState().isEditable()).toBe(true);
  });
});
```

### 验收标准

- [ ] 覆盖全部 6 个状态的所有合法转换路径
- [ ] 覆盖至少 3 个非法转换场景
- [ ] CI 每次提交自动执行，执行时间 < 1s

---

## 层 2：组件行为等价测试（Island 级别）

### 核心问题

jQuery 版本和 React 版本在**相同输入**下，**行为是否等价**？

不对比 DOM 结构（太脆弱），只验证**语义等价**：相同用户操作 → 相同 Store 状态变化 + 相同关键文案变化。

### 用什么工具

- **Vitest** + **@testing-library/preact**（React Testing Library 的 Preact 适配）
- 在 Node 环境跑（jsdom 模拟 DOM），不依赖浏览器
- 执行时间 < 5s，CI 必跑

### AI 怎么生成——具体操作流程

**不是**安装某个"插件"就能自动生成。是通过 **Coding Agent**（如 Claude Code）分步完成：

**Step 1：喂入旧 jQuery 代码，让 AI 提取"事件→状态→DOM"链路**

```
请分析 js/approval.js 中的这段 jQuery 代码，提取所有"用户操作 → 状态变化 → DOM 更新"的链路。

对每个链路，输出：
1. 触发条件（什么状态下、点击什么按钮）
2. 状态变化（调用了 Store 的哪个 action，或修改了什么变量）
3. DOM 更新（修改了哪些元素的 text/class/visibility）

示例输出格式：
---
链路 1：审批通过
  触发：status === 'inReview' 时，点击 #btn-approve
  状态：useApprovalStore.getState().approve(operator, comment)
        status: 'inReview' → 'approved'
   DOM：
    - $('#approval-status').text() 从 '审核中' → '已通过'
    - $('#approval-status').attr('class') 从 'badge badge-inReview' → 'badge badge-approved'
    - $('#approval-actions').hide()
    - $('#hidden-status').val() 从 'inReview' → 'approved'
---
```

**Step 2：喂入 React 组件代码，让 AI 生成等价测试用例**

```
基于上面提取的链路，以及 React Island 组件 ApprovalStatusPanel.tsx，
生成 @testing-library/preact 的测试用例。

对每条链路，生成一个 test case：
- 设置相同的初始 Store 状态
- 模拟相同的用户操作（fireEvent.click 等）
- 断言：
  a. Store 状态变化与旧代码一致（expect store status）
  b. 关键 DOM 文案变化与旧代码一致（expect screen.getByText）
  c. 按钮显隐与旧代码一致（expect queryByText 存在/不存在）

注意：
- 不要对比 CSS class 或 DOM 结构
- 只对比用户能感知的"语义"（文案、按钮是否存在、状态值）
- 使用 data-testid 选择器，不依赖 CSS class
```

**Step 3：人工 review**

开发者逐条检查 AI 生成的用例，确认：
- 提取的链路没有遗漏（对照旧代码中所有 `$().on('click')` 事件）
- 每条用例的预期结果与旧系统行为一致
- 边界条件（空输入、重复点击等）是否有对应的特殊用例

**为什么 Coding Agent 能做到**：jQuery 代码的模式是高度重复的——`事件绑定 → 状态修改 → DOM 更新`。AI 不需要理解业务，只需要识别代码模式。人的角色是确认"AI 没有漏掉某个事件处理函数"和"提取的业务语义正确"。

### 产出示例

```tsx
// islands/approvalStatus/__tests__/behavior.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { useApprovalStore } from '../../../store/approvalStore';
import ApprovalStatusPanel from '../index';

beforeEach(() => {
  document.body.innerHTML = '<div id="test-root"></div>';
  useApprovalStore.setState({
    status: 'inReview', orderId: 'order-1', operator: '张三', comment: '',
  });
});

describe('审批面板 - 行为等价', () => {
  it('inReview：显示通过和驳回按钮', () => {
    render(<ApprovalStatusPanel orderId="order-1" />, document.getElementById('test-root')!);
    expect(screen.getByText('通过')).toBeInTheDocument();
    expect(screen.getByText('驳回')).toBeInTheDocument();
    expect(screen.queryByText('提交审批')).not.toBeInTheDocument();
  });

  it('点击通过 → Store approved → 显示已通过', () => {
    render(<ApprovalStatusPanel orderId="order-1" />, document.getElementById('test-root')!);
    fireEvent.click(screen.getByText('通过'));
    expect(useApprovalStore.getState().status).toBe('approved');
    expect(screen.getByText('已通过')).toBeInTheDocument();
  });

  it('点击驳回 → Store rejected → 显示已驳回', () => {
    render(<ApprovalStatusPanel orderId="order-1" />, document.getElementById('test-root')!);
    fireEvent.click(screen.getByText('驳回'));
    expect(useApprovalStore.getState().status).toBe('rejected');
    expect(screen.getByText('已驳回')).toBeInTheDocument();
  });

  it('pending：显示提交按钮，不显示审批按钮', () => {
    useApprovalStore.setState({ status: 'pending' });
    render(<ApprovalStatusPanel orderId="order-1" />, document.getElementById('test-root')!);
    expect(screen.getByText('提交审批')).toBeInTheDocument();
    expect(screen.queryByText('通过')).not.toBeInTheDocument();
  });

  it('approved：不显示任何操作按钮', () => {
    useApprovalStore.setState({ status: 'approved' });
    render(<ApprovalStatusPanel orderId="order-1" />, document.getElementById('test-root')!);
    expect(screen.queryByText('通过')).not.toBeInTheDocument();
    expect(screen.queryByText('驳回')).not.toBeInTheDocument();
  });
});
```

### 验收标准

- [ ] 每个 Island 的每个状态节点的渲染输出有对应断言
- [ ] 每个可点击操作有点击后的 Store 状态 + DOM 文案断言
- [ ] CI 必跑，执行时间 < 5s

---

## 层 3：E2E 关键路径（Playwright + Midscene.js）

### 核心优势：视觉定位替代 DOM 选择器

传统 Playwright E2E 最大的维护负担：CSS 选择器 / `data-testid` 随 DOM 重构而断裂。对本项目而言这个问题更严重——**jQuery 分支和 React 分支的 DOM 结构完全不同**，传统选择器无法在两套 DOM 上通用。

**Midscene.js** 用 AI 视觉理解替代 DOM 选择器：不关心按钮是 `<button>` 还是 `<a>`，不关心 class 是 `btn-approve` 还是 `approval-btn`——只关心用户**看到**了什么。

```
传统方式：await page.click('[data-testid="btn-approve"]');
          → 依赖 data-testid，两端都要维护，DOM 重构即断裂

Midscene：await ai('点击"通过"按钮');
          → 视觉定位，jQuery 和 React 分支通用，零选择器维护
```

### 用什么工具

| 工具 | 角色 |
|------|------|
| **Playwright** | 浏览器自动化引擎（打开页面、网络 mock、截图） |
| **Midscene.js** | AI 视觉交互层（`@midscene/web`），作为 Playwright fixture 注入 |
| **多模态模型** | Midscene 的后端——视觉定位和断言的实际执行者（OpenAI GPT-4o / Claude / Qwen-VL） |

### 安装

```bash
npm install -D @playwright/test @midscene/web
# Midscene 需要多模态模型 API。任选其一：
#   OpenAI:   export MIDSCENE_MODEL="gpt-4o"
#   Claude:   export MIDSCENE_MODEL="claude-3-opus"
#   Qwen-VL:  export MIDSCENE_MODEL="qwen-vl-max"
# 配置 API key 到环境变量
```

### 测试用例写法

```ts
// e2e/approval-flow.spec.ts
import { test as base } from '@playwright/test';
import { PlaywrightAiFixture } from '@midscene/web/playwright';

const test = base.extend(PlaywrightAiFixture());

const BRANCHES = [
  { name: 'jQuery', param: '?__r_approval-status=jquery' },
  { name: 'React', param: '?__r_approval-status=react' },
];

for (const branch of BRANCHES) {
  test.describe(`审批流关键路径 [${branch.name}]`, () => {

    test('完整审批流：提交 → 通过', async ({ ai, page }) => {
      await page.goto(`/order/detail?id=test-1${branch.param}`);

      // 断言初始状态
      await ai('页面显示"待审"状态标签');

      // 点击提交审批
      await ai('点击"提交审批"按钮');
      await ai('页面显示"审核中"状态标签');

      // 输入审批意见
      await ai('在审批意见输入框中输入"同意"');
      await ai('点击"通过"按钮');

      // 断言最终状态
      await ai('页面显示"已通过"状态标签');
      await ai('"通过"按钮已不可见');
    });

    test('驳回重提交', async ({ ai, page }) => {
      await page.goto(`/order/detail?id=test-1${branch.param}`);

      await ai('在审批意见输入框中输入"材料不全"');
      await ai('点击"驳回"按钮');
      await ai('页面显示"已驳回"状态标签');

      // 重提交
      await ai('点击"重新提交"按钮');
      await ai('页面显示"审核中"状态标签');
    });

    test('防重：连点两次通过按钮', async ({ ai, page }) => {
      await page.goto(`/order/detail?id=test-1${branch.param}`);

      // Midscene 的 ai() 会等前一个操作完成再执行下一个
      await ai('点击"通过"按钮');
      await ai('点击"通过"按钮'); // 第二次点击

      // 断言：状态只变更一次，badge 不变为异常状态
      await ai('页面显示"已通过"状态标签，且不显示异常状态');
    });
  });
}
```

**关键差异 vs 传统 Playwright**：
- 零 CSS 选择器、零 `data-testid`
- 同一套用例，jQuery 和 React 分支**完全通用**——Midscene 用视觉理解定位按钮，不关心背后的 DOM 结构
- 用例文案就是业务语言——PM 能直接看懂

### 也支持结构化查询

对于需要精确数值的场景，Midscene 提供 `aiQuery`：

```ts
test('状态 badge 文案正确', async ({ ai, page }) => {
  await page.goto(`/order/detail?id=test-1${branch.param}`);

  // aiQuery 返回结构化结果，可用于精确断言
  const badgeText = await ai.aiQuery('审批状态标签显示的文案是什么？');
  expect(badgeText).toBe('待审');
});
```

### 怎么生成这些用例

**不是录制出来的，是 AI 写出来的。** 流程如下：

**Step 1**：将本文档层 2 提取的"事件→状态→DOM"链路 + 页面截图喂给 Coding Agent：

```
以下是审批详情页的交互链路：

链路 1：提交审批
  前置状态：pending，badge 显示"待审"
  操作：点击"提交审批"按钮
  后置状态：inReview，badge 显示"审核中"

链路 2：审批通过
  前置状态：inReview，badge 显示"审核中"
  操作：在审批意见框输入"同意"，点击"通过"按钮
  后置状态：approved，badge 显示"已通过"，"通过"按钮消失

请为上述链路生成 Playwright + Midscene.js 测试用例。
用例需要同时在 jQuery 和 React 两个渲染分支下执行。
```

**Step 2**：人工 review，确认：
- 操作步骤是否覆盖了完整业务路径
- 断言文案是否与页面实际文案一致
- 边界条件（空输入、重复点击、慢网络）是否被覆盖

**Step 3**：CI 中运行。首次运行可能需要调整——AI 视觉定位依赖文案匹配，如果页面文案有歧义（如多处出现"通过"），需要将提示词写得更具体（"点击审批操作区域的'通过'按钮"）。

### 运行

```bash
# 本地运行（headless）
npx playwright test e2e/approval-flow.spec.ts

# 本地调试（看到浏览器操作过程）
npx playwright test e2e/approval-flow.spec.ts --headed

# CI 中运行
npx playwright test --project e2e
```

### 成本与限制

| 维度 | 说明 |
|------|------|
| **API 调用成本** | 每次 `ai()` 调用走一次多模态模型 API。一个完整审批流约 6-8 次调用。10 个用例约 60-80 次。按 GPT-4o 计，约 $0.01-0.02/次，全量 E2E 跑一次约 $1-2 |
| **执行速度** | 每次 `ai()` 约 2-5 秒（模型推理 + 视觉分析）。一个完整用例约 15-40 秒。10 个用例并行可压缩到 2-3 分钟 |
| **确定性** | 视觉定位有极小概率（<2%）因页面渲染差异导致定位失败。建议每个关键路径保留一个传统 `data-testid` 用例作为 CI 快速 smoke test |
| **模型依赖** | 依赖外部多模态模型 API。内网私有化部署需使用 Midscene 的 `custom` 模型配置对接内部模型（如 Qwen-VL 私有部署） |

### Midscene + 传统 Playwright 的分工

```
CI 每次 PR（快速 feedback）：
  → 传统 Playwright + data-testid 的 smoke test（2-3 个最关键路径，秒级）
  → 层 1 Store 测试 + 层 2 组件测试

CI staging 部署后（完整回归）：
  → Midscene E2E 全量用例（10 个，~3 分钟）
  → Playwright 视觉回归截图对比

两者互补，不是二选一。
```

### 验收标准

- [ ] Midscene.js 集成到 Playwright project
- [ ] 5 个主流程 × 2 个分支 = 10 个用例
- [ ] 至少 3 个边界条件（防重、空输入、慢网络）
- [ ] staging 部署后自动执行
- [ ] 保留 2-3 个 data-testid smoke test 作为 CI PR 快速卡点

---

## 层 4：视觉回归

### 用什么工具——有成熟方案，不需要从零开发

**Playwright 内置的 `toHaveScreenshot()`** 是最直接的方案：

```ts
// e2e/visual/approval-panel.spec.ts
import { test, expect } from '@playwright/test';

test('审批面板 - jQuery vs React 视觉对比', async ({ page }) => {
  // 截图 1：jQuery 分支
  await page.goto('/order/detail?id=test-1?__r_approval-status=jquery');
  const jqueryScreenshot = await page.locator('[data-testid="approval-panel"]').screenshot();

  // 截图 2：React 分支
  await page.goto('/order/detail?id=test-1?__r_approval-status=react');
  const reactScreenshot = await page.locator('[data-testid="approval-panel"]').screenshot();

  // 像素对比
  expect(reactScreenshot).toEqual(jqueryScreenshot);
});
```

**工作原理**：
- 首次运行时，Playwright 将截图保存为 **golden snapshot**（基准）
- 后续运行时，Playwright 自动对比新截图 vs 基准
- 不一致时：测试失败，输出 diff 图片（差异区域用红色标注）

**运行**：
```bash
# 首次：生成基准截图
npx playwright test --project visual --update-snapshots

# 后续：对比
npx playwright test --project visual
```

**CI 集成**：GitHub Actions 中 Playwright 官方 action 直接支持，截图 artifact 可下载查看。

### 如果需要更高级的方案

| 工具 | 特点 | 成本 |
|------|------|------|
| **Playwright toHaveScreenshot()** | 内置，零额外依赖，适合本项目 | 免费 |
| **Percy**（BrowserStack） | 托管截图存储、跨浏览器对比、团队 review UI | 付费（有免费 tier） |
| **Chromatic**（Storybook 团队） | 组件级视觉回归，与 Storybook 深度集成 | 付费（有免费 tier） |
| **BackstopJS** | 开源，配置灵活 | 免费 |

**本项目建议**：先用 Playwright 内置方案，零额外成本。如果后续 Island 数量多、需要团队协作 review 视觉差异，再考虑 Percy。

### AI 在视觉回归中的角色——目前是增强，不是替代

这是四个层中 **AI 成熟度最低** 的一层。当前可做和不可做：

| 能力 | 成熟度 | 说明 |
|------|--------|------|
| 自动化截图 + 像素对比 | ✅ 成熟 | Playwright toHaveScreenshot() |
| 自动标注差异区域 | ✅ 成熟 | Playwright 输出 diff 图片，红色高亮差异像素 |
| AI 分类差异类型 | 🟡 实验性 | 将 diff 图片发给多模态模型（Claude/GPT-4V），让其判断是"布局偏移"还是"可接受的渲染差异"——需要人工验证 AI 判断 |
| AI 自动判定是否可接受 | ❌ 不可行 | "可接受"是业务判断，AI 无法替代 |

**实际操作流程**：

1. Playwright 自动截图 + 对比 → 得到 diff 图片
2. 人工看 diff，标注"可接受"或"需修复"
3. （可选）将 diff + 人工标注喂给多模态模型，训练判断模式——但这不是试点阶段必需的

**试点阶段的建议**：不追求 AI 自动分类。Playwright 的 diff 输出已经足够清晰——红色区域即差异，人一眼能判断是否可接受。灰度 10% 前手动过一遍即可。

### 验收标准

- [ ] Playwright 截图对比脚本可运行
- [ ] jQuery 分支和 React 分支的关键区域（badge、按钮、输入框）有截图对比
- [ ] 无"缺失元素"类差异
- [ ] 灰度 10% 前完成一次完整视觉回归

---

## 步骤 5：Feature Flag 质量闸门

（保留原有内容，不变）

### 放行条件表

| 阶段 | 必须通过 | 观察周期 | 回滚条件 |
|------|----------|----------|----------|
| 内部环境 | Store 单元测试 100% + 组件行为测试 100% | 开发自测 | — |
| staging | E2E 主流程（2 分支 × 5 流程）+ 视觉回归 | 1 次完整回归 | 任何 RED 用例 |
| 灰度 1% | staging 全部通过 + 24h 无 JS 异常飙升 | 24h | ErrorBoundary 崩溃率 > 0.1% |
| 灰度 10% | 1% 通过 + CWV 无劣化 | 48h | INP 劣化 > 20% 或 LCP 增加 > 200ms |
| 灰度 50% | 10% 通过 | 72h | 业务错误率 > 基线 2x |
| 灰度 100% | 50% 通过 | 7 天 | 任何未在灰度早期发现的生产事故 |

---

## FAQ：四个常见疑问

### Q1：状态流转图依赖人工吗？新 RD 不熟悉业务怎么办？

**不依赖人手写**。状态流转换图由 Coding Agent 从现有 jQuery 代码中提取——搜索 `if (status === 'xxx')`、`switch(status)`、按钮显隐条件、JSP 状态标签等，拼出完整状态机。

新 RD 的角色：review AI 的输出，对照 2-3 个典型操作在系统中走一遍确认。不需要从零理解全部业务逻辑，只需要**验证**而非**创造**。

### Q2：AI 怎么从 jQuery 提取"事件→状态→DOM"链路？怎么操作？

**操作方法**：将旧 jQuery 代码文件（如 `approval.js`）喂给 Coding Agent（Claude Code / Cursor / Copilot），用自然语言要求其提取所有 `事件绑定 → 状态变化 → DOM 更新` 的链路。AI 输出结构化链路描述。

然后将链路描述 + React 组件代码再次喂给 Agent，要求生成 @testing-library/preact 测试用例。

**不是安装一个"插件"自动完成**——需要开发者主动与 Coding Agent 对话。但每次对话的 prompt 模板是固定的（见本文档层 2 的 Step 1/2 prompt），可直接复用。

**为什么可行**：jQuery 代码的模式高度重复（全部是 `$().on('click', fn)` + `$().text/val/attr/hide/show`），AI 不需要理解业务就能识别代码模式。

### Q3：Playwright + Midscene.js 怎么用？需要 QA 录制吗？

**不需要录制。** 测试用例由 Coding Agent 根据审批交互链路直接生成，不是录出来的。

**操作流程**：
1. 开发者将已提取的"事件→状态→DOM"链路描述喂给 Coding Agent（prompt 模板见层 3 Step 1）
2. AI 生成 Midscene.js 用例——自然语言描述的操作和断言（`ai('点击"通过"按钮')`）
3. 人工 review：确认操作覆盖完整路径，文案与页面一致
4. 运行 `npx playwright test`，CI 自动执行

**Midscene.js 不依赖 DOM 选择器**：它用多模态模型视觉定位页面元素。同一个 `ai('点击"通过"按钮')` 在 jQuery 分支和 React 分支都能正确执行——尽管两边的 DOM 完全不同。这是 codegen 录制做不到的。

**为什么不需要 QA 手动录制**：审批流的标准交互路径是已知的——提交→分配→审批通过→驳回→重提交→执行。AI 从状态机中就能生成对应的自然语言操作序列。QA 的人力释放出来做更难自动化的事（如特殊业务规则的验证）。

**测试运行**：`npx playwright test e2e/approval-flow.spec.ts`。本地加 `--headed` 可看到浏览器中 AI 的操作过程。

### Q4：视觉回归有成熟方案吗？还是需要自己开发？

**Playwright 内置的 `toHaveScreenshot()` 就是成熟方案**，不需要从零开发。功能包括：

- 自动截图（全页或指定元素）
- 自动对比（像素级 diff，差异区域红色标注）
- 自动保存基准截图（golden snapshot）
- CI 集成（GitHub Actions 官方 action 支持）

**AI 自动分类差异类型**是目前较实验性的部分，试点阶段**不做**。Playwright 的 diff 输出人一眼能判断是否可接受。灰度 10% 前人工 review 一次即可。

如果需要高级功能（跨浏览器对比、团队 review UI、截图历史），Percy 或 Chromatic 是成熟的 SaaS 方案，但需要付费。

---

## 量化指标

| 指标 | 目标 |
|------|------|
| Store 状态机测试覆盖率 | 全部合法转换 + ≥3 非法路径 |
| 组件行为等价用例数 | 每个 Island 每个状态节点 ≥1 个用例 |
| E2E 主流程 | 5 个流程 × 2 个分支 = 10 个用例 |
| 自动化回归时间 | < 5 分钟（Store + 组件 + E2E 并行） |
| 人工回归时间 | 从 2-3 小时 → ~30 分钟 checklist |
| Playwright 截图对比 | 灰度 10% 前完成，零"缺失元素"差异 |

## 验收标准

- [ ] AI 从 jQuery 代码成功提取状态机，人工 review 确认
- [ ] Store 状态机测试 CI 必跑，< 1s
- [ ] 组件行为等价测试 CI 必跑，< 5s
- [ ] Playwright E2E 脚本录制 + AI 补充完成，2 个分支均通过
- [ ] Playwright 视觉回归截图对比脚本可运行
- [ ] data-testid 在 jQuery fallback JSP 和 React 组件中保持一致
- [ ] 每个灰度阶段放行/回滚条件明确可量化
