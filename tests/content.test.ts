import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown';
import { contentSchema, settingsSchema } from '../src/lib/http';
import { emptyContent, defaultSettings } from '../src/lib/defaults';
import { defaultHomeIntro } from '../src/lib/home-intro';
describe('內容渲染與輸入邊界', () => {
  it('不執行 HTML、JavaScript 連結與內嵌腳本', async () => {
    const { html } = await renderMarkdown(
      '# 安全測試\n\n<script>alert(1)</script>\n\n[點我](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>',
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('onerror');
  });
  it('支援中文目錄、表格、任务清單和程式碼高亮', async () => {
    const result = await renderMarkdown(
      '# 海洋實驗\n\n- [x] 完成\n\n|名稱|狀態|\n|---|---|\n|文章|公開|\n\n```js\nconst x = 1;\n```',
    );
    expect(result.toc[0]).toEqual({ id: 'section-海洋實驗', text: '海洋實驗', depth: 1 });
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('checkbox');
    expect(result.html).toContain('data-rehype-pretty-code');
  });
  it('舊設定保留目前首頁文字，並以安全的 Markdown 呈現', async () => {
    const source = defaultHomeIntro({
      ...defaultSettings,
      authorName: 'Andy *開發者*',
    });
    expect(source).toContain('# 嗨，我是 Andy \\*開發者\\*');
    expect(source).toContain('技術筆記與開源作品');
    const { html } = await renderMarkdown(source);
    expect(html).toContain('<h1 id="section-嗨我是-andy-開發者">');
    expect(html).toContain('Andy *開發者*');
  });
  it('允許中文網址與去除重複標籤', () => {
    expect(
      contentSchema.parse({
        ...emptyContent,
        title: '海洋',
        slug: '海洋-實驗',
        tags: ['Astro', 'Astro'],
      }).tags,
    ).toEqual(['Astro']);
  });
  it('拒絕不安全的資產與作品連結', () => {
    expect(() =>
      contentSchema.parse({ ...emptyContent, slug: 'test', demoUrl: 'javascript:alert(1)' }),
    ).toThrow();
    expect(() =>
      contentSchema.parse({ ...emptyContent, slug: 'test', cover: '//evil.test/image.png' }),
    ).toThrow();
    expect(() =>
      settingsSchema.parse({
        ...defaultSettings,
        socialLinks: [{ label: '連結', url: 'data:text/html,x' }],
      }),
    ).toThrow();
  });
});
