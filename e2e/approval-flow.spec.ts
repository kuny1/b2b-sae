/**
 * E2E approval flow — Midscene.js visual AI tests.
 *
 * Same natural-language test cases run against BOTH jQuery and React branches.
 * Midscene.js uses visual understanding, not DOM selectors — the two branches
 * have completely different DOM but the same visual semantics.
 *
 * Prerequisites:
 *   1. Install Midscene.js: npm install -D @midscene/web
 *   2. Set AI model: export MIDSCENE_MODEL="gpt-4o"
 *   3. Set API key: export OPENAI_API_KEY="sk-..."
 *   4. Staging server running on PLAYWRIGHT_BASE_URL
 *
 * Usage:
 *   npx playwright test --project=e2e e2e/approval-flow.spec.ts
 *   npx playwright test --project=e2e e2e/approval-flow.spec.ts --headed
 *
 * Note: This file uses the Midscene.js PlaywrightAiFixture.
 * If Midscene.js is not installed, tests will be skipped.
 */

import { test as base, expect } from '@playwright/test';

// ── Conditional Midscene import ──
// Wrap in try-catch so tests skip gracefully if Midscene is not installed.
let PlaywrightAiFixture: any;
try {
  const midscene = require('@midscene/web/playwright');
  PlaywrightAiFixture = midscene.PlaywrightAiFixture;
} catch {
  // Midscene not installed — tests will be skipped
}

const test = PlaywrightAiFixture
  ? base.extend(PlaywrightAiFixture())
  : base;

const BRANCHES = [
  { name: 'jQuery', param: '?__r_approval-status=jquery' },
  { name: 'React', param: '?__r_approval-status=react' },
];

for (const branch of BRANCHES) {
  test.describe(`审批流关键路径 [${branch.name}]`, () => {

    /**
     * Full approval flow: submit → approve.
     * This is the primary happy-path scenario.
     */
    test('完整审批流：提交 → 通过', async ({ ai, page }) => {
      test.skip(!ai, 'Midscene.js not installed — skipping AI-driven test');

      await page.goto(`/order/detail?id=test-1${branch.param}`);

      // Verify initial state
      await ai('页面显示"待审"状态标签');

      // Submit for review
      await ai('点击"提交审批"按钮');
      await ai('页面显示"审核中"状态标签');

      // Approve
      await ai('在审批意见输入框中输入"同意"');
      await ai('点击"通过"按钮');

      // Verify final state
      await ai('页面显示"已通过"状态标签');
      await ai('"通过"按钮已不可见');
    });

    /**
     * Reject and resubmit flow.
     */
    test('驳回重提交', async ({ ai, page }) => {
      test.skip(!ai, 'Midscene.js not installed — skipping AI-driven test');

      await page.goto(`/order/detail?id=test-1${branch.param}`);

      await ai('在审批意见输入框中输入"材料不全"');
      await ai('点击"驳回"按钮');
      await ai('页面显示"已驳回"状态标签');

      // Resubmit
      await ai('点击"重新提交"按钮');
      await ai('页面显示"审核中"状态标签');
    });

    /**
     * Double-click guard: rapid clicks should not cause state corruption.
     */
    test('防重：连点两次通过按钮', async ({ ai, page }) => {
      test.skip(!ai, 'Midscene.js not installed — skipping AI-driven test');

      await page.goto(`/order/detail?id=test-1${branch.param}`);

      await ai('点击"通过"按钮');
      await ai('点击"通过"按钮'); // second click while first is processing

      // Assert: badge shows approved only once, no error state
      await ai('页面显示"已通过"状态标签，且不显示异常状态');
    });

    /**
     * Slow network: the UI should handle delayed API responses gracefully.
     */
    test('慢网络：审批操作仍完成', async ({ ai, page }) => {
      test.skip(!ai, 'Midscene.js not installed — skipping AI-driven test');

      // Simulate 3s API delay
      await page.route('**/api/approval/**', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await route.continue();
      });

      await page.goto(`/order/detail?id=test-2${branch.param}`);

      // Click approve — button should disable during request
      await ai('点击"通过"按钮');

      // After delay, badge should show correct status
      await ai('页面显示"已通过"状态标签', { timeout: 10_000 });
    });
  });
}

/**
 * Fallback smoke tests — use traditional Playwright selectors (no AI).
 * These run in CI on every PR as quick sanity checks.
 * Assumes data-testid attributes are consistent between jQuery and React branches.
 */
test.describe('审批流 - Smoke tests (传统 Playwright)', () => {
  test('jQuery 分支：badge 可见', async ({ page }) => {
    await page.goto('/order/detail?id=test-1?__r_approval-status=jquery');
    await expect(page.locator('[data-testid="approval-badge"]')).toBeVisible();
  });

  test('React 分支：badge 可见', async ({ page }) => {
    await page.goto('/order/detail?id=test-1?__r_approval-status=react');
    await expect(page.locator('[data-testid="approval-badge"]')).toBeVisible();
  });

  test('两个分支 badge 文案一致', async ({ page }) => {
    await page.goto('/order/detail?id=test-1?__r_approval-status=jquery');
    const jqueryText = await page.locator('[data-testid="approval-badge"]').textContent();

    await page.goto('/order/detail?id=test-1?__r_approval-status=react');
    const reactText = await page.locator('[data-testid="approval-badge"]').textContent();

    expect(jqueryText).toBe(reactText);
  });
});
