import { describe, expect, it } from 'vitest';
import { archiveUrl, rewriteMarkdownUrls } from '../src/lib/markdown-links';

describe('Markdown 站內連結改寫', () => {
  it('只改連結、圖片與參照定義，保留內嵌和區塊程式碼', () => {
    const code = '`[程式碼](/articles/old)`\n\n```md\n[範例](/articles/old)\n```';
    const source = `前文  **保留格式**\n\n[文章](/articles/old?q=1#section-中文 "說明")\n\n![封面](/media/old.webp)\n\n[引用][note]\n\n[note]: /articles/old\n\n${code}\n`;
    const result = rewriteMarkdownUrls(source, (url) =>
      url.replace('/articles/old', '/articles/new').replace('/media/old.webp', '/media/new.webp'),
    );
    expect(result.changes).toHaveLength(3);
    expect(result.text).toContain('[文章](/articles/new?q=1#section-中文 "說明")');
    expect(result.text).toContain('![封面](/media/new.webp)');
    expect(result.text).toContain('[note]: /articles/new');
    expect(result.text).toContain(code);
    expect(result.text.startsWith('前文  **保留格式**\n\n')).toBe(true);
  });
  it('巢狀連結圖片只輸出一次，表格結構保持原樣', () => {
    const source = '| 連結 |\n| --- |\n| [![圖片](/media/old.webp)](/articles/old) |';
    const result = rewriteMarkdownUrls(source, (url) => url.replace('old', 'new'));
    expect(result.text).toBe('| 連結 |\n| --- |\n| [![圖片](/media/new.webp)](/articles/new) |');
    expect(result.changes).toHaveLength(2);
  });
  it('沒有修改的 Markdown 保持逐字相同', () => {
    const source = '> [連結](https://external.test/a)\n\n-   特殊縮排\n\n<div>/articles/old</div>';
    expect(rewriteMarkdownUrls(source, (url) => url)).toEqual({ text: source, changes: [] });
  });
  it('來源 origin 限制絕對網址，舊封存檔不猜測網域', () => {
    expect(archiveUrl('../projects/demo?q=1#中文', '/articles/a')?.href).toBe(
      'https://archive.invalid/projects/demo?q=1#%E4%B8%AD%E6%96%87',
    );
    expect(archiveUrl('https://source.test/articles/a', '/', 'https://source.test')?.pathname).toBe(
      '/articles/a',
    );
    expect(archiveUrl('//source.test/articles/a', '/', 'https://source.test')?.pathname).toBe(
      '/articles/a',
    );
    for (const url of [
      'https://outside.test/articles/a',
      'https://name:pass@source.test/articles/a',
      '#section-a',
      '\\articles\\a',
    ])
      expect(archiveUrl(url, '/', 'https://source.test')).toBeNull();
    expect(archiveUrl('https://source.test/articles/a', '/')).toBeNull();
    expect(archiveUrl('//source.test/articles/a', '/')).toBeNull();
  });
});
