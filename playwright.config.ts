import { defineConfig } from '@playwright/test';

const browserExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:4321';
// 本機 Edge 啟動會產生 Windows 4625，反覆測試曾導致 RDP 帳號鎖定。
if (
  browserExecutable &&
  /(?:^|[\\/])msedge(?:\.exe)?$/i.test(browserExecutable.trim().replace(/^"|"$/g, ''))
) {
  throw new Error(
    '禁止使用系統 Edge 執行測試：請移除 PLAYWRIGHT_CHROMIUM_EXECUTABLE，並執行 playwright install chromium --only-shell 安裝專用瀏覽器。',
  );
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // 既有操作流程以已選英文的站長執行；語言測試另以空白儲存驗證預設繁中
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [{ name: 'kaiyo-admin-language', value: 'en' }],
        },
      ],
    },
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 },
    launchOptions: browserExecutable ? { executablePath: browserExecutable } : {},
  },
  webServer: process.env.E2E_EXTERNAL_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:4321/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
