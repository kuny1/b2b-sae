import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — E2E + visual regression for jQuery ↔ React migration.
 *
 * Two projects:
 *   e2e         — Midscene.js AI-driven E2E tests (runs on staging deploy)
 *   visual      — Screenshot comparison between jQuery and React branches
 *
 * Usage:
 *   npx playwright test --project=e2e
 *   npx playwright test --project=visual
 *   npx playwright test --project=visual --update-snapshots
 */
export default defineConfig({
  testDir: './e2e',

  // Each test gets 60s (Midscene AI calls are 2-5s each)
  timeout: 60_000,

  // Retry once on CI (network flakiness)
  retries: process.env.CI ? 1 : 0,

  // Parallel workers — Midscene.js tests share a single browser context
  workers: process.env.CI ? 2 : 1,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
  ],

  use: {
    // Base URL — override with PLAYWRIGHT_BASE_URL env var
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080',

    // Capture screenshot on failure
    screenshot: 'only-on-failure',

    // Trace on first retry
    trace: 'on-first-retry',
  },

  projects: [
    // ── E2E: Midscene.js AI-driven functional tests ──
    {
      name: 'e2e',
      testMatch: '**/*.spec.ts',
      // Exclude visual tests
      testIgnore: '**/visual/**',
      use: {
        ...devices['Desktop Chrome'],
        // Midscene needs a non-headless browser for visual AI
        headless: false,
      },
    },

    // ── Visual regression: Playwright screenshot comparison ──
    {
      name: 'visual',
      testMatch: '**/visual/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        // Consistent viewport for screenshot comparison
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  // CI webServer config (uncomment when staging is available)
  // webServer: {
  //   command: 'npm run preview',
  //   port: 4173,
  //   timeout: 30_000,
  // },
});
