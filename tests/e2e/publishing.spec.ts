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
  await page.getByRole('button', { name: '進入工作空間' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: '歡迎回到你的創作宇宙' })).toBeVisible();
  await page.getByRole('link', { name: '撰寫文章', exact: true }).click();
  await expect(page.getByLabel('文章標題')).toBeVisible();
  const slug = `ocean-${Date.now()}`;
  await page.getByLabel('文章標題').fill('在數位海洋，建立自己的創作基地');
  await page.getByLabel('網址代稱', { exact: true }).fill(slug);
  await page
    .locator('.cm-content')
    .fill(
      '# 每一個想法，都值得被記錄\n\n從 Astro 開始，打造一個屬於自己的內容基地。\n\n## 讓技術服務創作\n\n- [x] 完成網站\n- [ ] 繼續探索\n\n```typescript\nconst curiosity = true;\n```',
    );
  await page
    .getByLabel('內容摘要', { exact: true })
    .fill('把零散的想法整理成文字，將每一次探索，留在自己的數位空間。');
  await page.getByRole('button', { name: '發布內容', exact: true }).click();
  await expect(
    page.getByText('已發布，讀者現在可以在公開網站閱讀最新內容。', { exact: true }),
  ).toBeVisible();
  const entryPath = new URL(page.url()).pathname;
  const id = entryPath.split('/').at(-1)!;
  const publicResponse = await request.get(`/articles/${slug}`);
  expect(publicResponse.status()).toBe(200);
  expect(await publicResponse.text()).toContain('在數位海洋，建立自己的創作基地');
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
      title: '在數位海洋，建立自己的創作基地',
      featured: true,
      cover: '/images/kaiyo-hero.png',
      coverAlt: '海洋研究室',
      category: '開發筆記',
      tags: ['Astro', '創作'],
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
      title: '把靈感寫成程式，讓想像成為日常',
      category: '靈感隨筆',
      tags: ['設計', '生活'],
      excerpt: '一些關於創作節奏、技術選擇與持續學習的筆記。',
      cover: '/images/cover-orbit.svg',
    },
    {
      kind: 'article',
      title: '從零開始的 Markdown 寫作工作流',
      category: '開發筆記',
      tags: ['Markdown', '工具'],
      excerpt: '專注文字，也照顧閱讀體驗。用簡單的工具整理複雜的想法。',
      cover: '/images/cover-grid.svg',
    },
    {
      kind: 'project',
      title: 'KaiyoLab · 個人創作實驗室',
      category: '開源專案',
      tags: ['Astro', 'PostgreSQL'],
      excerpt: '一個能夠自己掌握資料、自由部署的內容管理系統。',
      cover: '/images/kaiyo-hero.png',
    },
    {
      kind: 'project',
      title: 'Markdown 筆記工具',
      category: '開源專案',
      tags: ['TypeScript', 'Markdown'],
      excerpt: '把靈感整理成文字，專注寫作的小工具。',
      cover: '/images/cover-grid.svg',
    },
    {
      kind: 'project',
      title: '色彩工作室',
      category: '創作實驗',
      tags: ['CSS', '設計'],
      excerpt: '探索配色、對比與介面裡的細節。',
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
        body: `# ${item.title}\n\n${item.excerpt}\n\n## 關於這份紀錄\n\n這是 KaiyoLab 端到端驗收使用的示範內容。`,
        featured: item.kind === 'project',
        cover: item.cover,
        coverAlt: '原創動漫科技研究室',
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
    page.getByRole('link', { name: '在數位海洋，建立自己的創作基地' }).first(),
  ).toBeVisible();
  expect(await (await request.get('/rss.xml')).text()).toContain('在數位海洋');
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
  const themeButton = page.getByRole('button', { name: /切換[深淺]色主題/ });
  await themeButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', switchedTheme);
  expect(await page.evaluate(() => localStorage.getItem('kaiyo-theme'))).toBe(switchedTheme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', switchedTheme);

  await page.setViewportSize({ width: 375, height: 1000 });
  const mobileMenu = page.getByRole('button', { name: '開啟選單', exact: true });
  const mobileNavigation = page.getByRole('navigation', { name: '行動版導覽' });
  await expect(mobileNavigation).toBeHidden();
  await mobileMenu.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '關閉選單', exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole('link', { name: '文章', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(mobileNavigation).toBeHidden();
  await expect(mobileMenu).toHaveAttribute('aria-expanded', 'false');
  await expect(mobileMenu).toBeFocused();

  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL! });
  await page.goto(`/articles/${slug}`);
  const copyButton = page.getByRole('button', { name: '複製程式碼', exact: true }).first();
  await expect(copyButton).toBeVisible();
  await copyButton.focus();
  await page.keyboard.press('Enter');
  await expect(copyButton).toHaveText('已複製');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('const curiosity = true;');
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
  await expect(page.getByText('已下架，內容保留為私人草稿。', { exact: true })).toBeVisible();
  expect((await request.get(`/articles/${slug}`)).status()).toBe(404);
  current = await api(`/api/admin/entries/${id}`, 'GET');
  await api(`/api/admin/entries/${id}/action`, 'POST', {
    version: current.version,
    action: 'publish',
  });
});
