import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
test('站長從初始設定、創作發布到多尺寸閱讀', async ({ page, request, baseURL, context }) => {
  const email = process.env.E2E_EMAIL || 'e2e@example.test';
  const password = process.env.E2E_PASSWORD || 'KaiyoLab-e2e-password-2026';
  await page.goto('/setup');
  if (new URL(page.url()).pathname === '/setup') {
    expect(process.env.SETUP_TOKEN, '測試必須提供一次性初始化碼').toBeTruthy();
    await page.getByLabel('一次性初始化碼').fill(process.env.SETUP_TOKEN!);
    await page.getByLabel('顯示名稱').fill('Kaiyo');
    await page.getByLabel('網站名稱').fill('KaiyoLab');
    await page.getByLabel('電子郵件').fill(email);
    await page.getByLabel('設定密碼', { exact: true }).fill(password);
    await page.getByRole('button', { name: '建立網站與管理帳號' }).click();
    await expect(page).toHaveURL(/\/login/);
  }
  await page.getByLabel('電子郵件').fill(email);
  await page.getByLabel('密碼', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登入後台' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: '網站總覽' })).toBeVisible();
  await page.getByRole('link', { name: '撰寫文章', exact: true }).click();
  await expect(page.getByLabel('文章標題')).toBeVisible();
  const slug = `ocean-${Date.now()}`;
  await page.getByLabel('文章標題').fill('Astro SSR 與 PostgreSQL 的部署筆記');
  await page.getByLabel('網址代稱', { exact: true }).fill(slug);
  await page
    .locator('.cm-content')
    .fill(
      '# Astro SSR 與 PostgreSQL 的部署筆記\n\n記錄網站從本機建置到容器部署時需要的設定\n\n## 部署步驟\n\n- [x] 建置網站\n- [ ] 驗證資料庫連線\n\n```typescript\nconst serverReady = true;\n```',
    );
  await page
    .getByLabel('內容摘要', { exact: true })
    .fill('整理 Astro SSR、PostgreSQL 與 Docker Compose 的部署設定');
  await page.getByRole('button', { name: '發布內容', exact: true }).click();
  await expect(
    page.getByText('已發布，讀者現在可以在公開網站閱讀最新內容', { exact: true }),
  ).toBeVisible();
  const entryPath = new URL(page.url()).pathname;
  const id = entryPath.split('/').at(-1)!;
  const publicResponse = await request.get(`/articles/${slug}`);
  expect(publicResponse.status()).toBe(200);
  expect(await publicResponse.text()).toContain('Astro SSR 與 PostgreSQL 的部署筆記');
  await page.getByLabel('文章標題').fill('未公開的想法');
  await page.getByRole('button', { name: '儲存草稿', exact: true }).click();
  await expect(page.getByText('所有變更已儲存', { exact: true })).toBeVisible();
  expect(await (await request.get(`/articles/${slug}`)).text()).not.toContain('未公開的想法');
  const headers = { Origin: baseURL! };
  const client = page.request;
  async function api(route: string, method: string, data?: unknown) {
    const r = await client.fetch(route, { method, data, headers });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  }
  let current = await api(`/api/admin/entries/${id}`, 'GET');
  current = await api(`/api/admin/entries/${id}`, 'PATCH', {
    version: current.version,
    content: {
      ...current.content,
      title: 'Astro SSR 與 PostgreSQL 的部署筆記',
      featured: true,
      cover: '/images/kaiyo-hero.png',
      coverAlt: '海洋研究室',
      category: '開發筆記',
      tags: ['Astro', '部署'],
    },
  });
  await api(`/api/admin/entries/${id}/action`, 'POST', {
    version: current.version,
    action: 'publish',
  });
  let projectPath = '';
  for (const item of [
    {
      kind: 'article',
      title: 'Docker Compose 的資料備份與還原',
      category: '部署筆記',
      tags: ['Docker', 'PostgreSQL'],
      excerpt: '記錄資料庫與媒體目錄的備份指令，以及新環境的還原步驟',
      cover: '/images/cover-orbit.svg',
    },
    {
      kind: 'article',
      title: '從零開始的 Markdown 寫作工作流',
      category: '開發筆記',
      tags: ['Markdown', '工具'],
      excerpt: '比較編輯器與公開頁的 Markdown 呈現，確認表格、任務清單和程式碼一致',
      cover: '/images/cover-grid.svg',
    },
    {
      kind: 'project',
      title: 'KaiyoLab 內容管理系統',
      category: '開源專案',
      tags: ['Astro', 'PostgreSQL'],
      excerpt: '使用 Astro 與 PostgreSQL 建立的自架內容管理系統',
      cover: '/images/kaiyo-hero.png',
    },
    {
      kind: 'project',
      title: 'Markdown 筆記工具',
      category: '開源專案',
      tags: ['TypeScript', 'Markdown'],
      excerpt: '提供 Markdown 輸入與預覽的本機練習專案',
      cover: '/images/cover-grid.svg',
    },
    {
      kind: 'project',
      title: '介面色彩對比檢查',
      category: '介面練習',
      tags: ['CSS', '設計'],
      excerpt: '對照 WCAG 比例檢查按鈕與文字在明暗主題的可讀性',
      cover: '/images/cover-orbit.svg',
    },
  ]) {
    let draft = await api('/api/admin/entries', 'POST', { kind: item.kind, title: item.title });
    draft = await api(`/api/admin/entries/${draft.id}`, 'PATCH', {
      version: draft.version,
      content: {
        ...draft.content,
        ...item,
        slug: `sample-${draft.id.slice(0, 8)}`,
        body: `# ${item.title}\n\n${item.excerpt}\n\n## 測試資料\n\n這是 KaiyoLab 端到端驗收使用的示範內容`,
        featured: item.kind === 'project',
        cover: item.cover,
        coverAlt: '測試資料使用的封面圖片',
      },
    });
    await api(`/api/admin/entries/${draft.id}/action`, 'POST', {
      version: draft.version,
      action: 'publish',
    });
    if (item.kind === 'project') projectPath = `/projects/${draft.content.slug}`;
  }
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Astro SSR 與 PostgreSQL 的部署筆記' }).first(),
  ).toBeVisible();
  expect(await (await request.get('/rss.xml')).text()).toContain('Astro SSR');
  expect(await (await request.get('/sitemap.xml')).text()).toContain(slug);
  const privateResponse = await request.get('/api/admin/entries');
  expect(privateResponse.status()).toBe(401);
  expect(projectPath, '示範作品應已取得公開網址').toBeTruthy();
  await page.locator('img').evaluateAll(async (elements) => {
    const images = elements as HTMLImageElement[];
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map((image) => image.decode()));
  });

  const originalTheme = await page.locator('html').getAttribute('data-theme');
  const switchedTheme = originalTheme === 'dark' ? 'light' : 'dark';
  const themeButton = page.getByRole('button', { name: /Switch to (light|dark) theme/ });
  await themeButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', switchedTheme);
  expect(await page.evaluate(() => localStorage.getItem('kaiyo-theme'))).toBe(switchedTheme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', switchedTheme);

  await page.setViewportSize({ width: 375, height: 1000 });
  const mobileMenu = page.getByRole('button', { name: 'Open menu', exact: true });
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(mobileNavigation).toBeHidden();
  await mobileMenu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole('link', { name: 'Articles', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(mobileNavigation).toBeHidden();
  await expect(mobileMenu).toHaveAttribute('aria-expanded', 'false');
  await expect(mobileMenu).toBeFocused();

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! });
  await page.goto(`/articles/${slug}`);
  const copyButton = page.getByRole('button', { name: 'Copy code', exact: true }).first();
  await expect(copyButton).toBeVisible();
  await copyButton.focus();
  await page.keyboard.press('Enter');
  await expect(copyButton).toHaveText('Copied');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('const serverReady = true;');
  if (process.env.CAPTURE_DOCS) await mkdir('docs/screenshots', { recursive: true });
  for (const theme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate((t) => {
      localStorage.setItem('kaiyo-theme', t);
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of [
        '/',
        '/articles',
        `/articles/${slug}`,
        '/projects',
        projectPath,
        '/about',
        '/admin',
        entryPath,
      ]) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${route} ${theme} ${width}px 不應橫向溢出`,
        ).toBeTruthy();
        if (process.env.CAPTURE_DOCS && theme === 'dark' && width === 375) {
          if (route === '/')
            await page.screenshot({ path: 'docs/screenshots/home-mobile.png', fullPage: true });
          if (route === entryPath) {
            await expect(page.getByLabel('文章標題')).toBeVisible();
            await page.screenshot({ path: 'docs/screenshots/editor-mobile.png', fullPage: true });
          }
        }
        if (
          process.env.CAPTURE_DOCS &&
          route === '/projects' &&
          (width === 1440 || width === 375)
        ) {
          await page.screenshot({
            path: `docs/screenshots/projects-${theme}-${width}.png`,
            fullPage: true,
          });
        }
      }
    }
    if (process.env.CAPTURE_DOCS && theme === 'dark') {
      await page.goto('/');
      await page.screenshot({ path: 'docs/screenshots/home-dark.png', fullPage: true });
      await page.goto('/admin');
      await expect(page.getByText('最近編輯', { exact: true })).toBeVisible();
      await page.screenshot({ path: 'docs/screenshots/admin.png', fullPage: true });
    }
    if (process.env.CAPTURE_DOCS && theme === 'light') {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: 'docs/screenshots/home-light.png', fullPage: true });
    }
  }
  await page.goto(entryPath);
  await page.getByRole('button', { name: '下架內容', exact: true }).click();
  await expect(page.getByText('已下架，內容保留為私人草稿', { exact: true })).toBeVisible();
  expect((await request.get(`/articles/${slug}`)).status()).toBe(404);
  current = await api(`/api/admin/entries/${id}`, 'GET');
  await api(`/api/admin/entries/${id}/action`, 'POST', {
    version: current.version,
    action: 'publish',
  });
});
