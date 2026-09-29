import { describe, expect, it } from 'vitest';
import { contentLanguage, markdownText, readingMinutes } from '../src/lib/reading';
import { renderMarkdown } from '../src/lib/markdown';

describe('公開閱讀文字與語言', () => {
  it('只計算可閱讀文字，連結長度與 Markdown 標記不增加時間', () => {
    const words = Array.from({ length: 700 }, () => 'word').join(' ');
    expect(readingMinutes(words)).toBe(2);
    expect(readingMinutes(`# [${words}](https://example.test/${'a'.repeat(5000)})`)).toBe(2);
    expect(markdownText('**清楚** [連結](https://example.test) ![替代文字](/image.webp)')).toBe(
      '清楚 連結 替代文字',
    );
    expect(readingMinutes('')).toBe(1);
  });
  it('不把不可見 HTML 與圖表原始碼算進閱讀時間', () => {
    expect(
      markdownText('<script>doNotRun()</script>\n\n可見\n\n```mermaid\nflowchart TD\nA-->B\n```'),
    ).toBe('可見');
    expect(markdownText('```sql\nSELECT quantity FROM stock;\n```')).toContain('SELECT quantity');
  });
  it('預覽與公開卡片使用相同的閱讀時間規則', async () => {
    const source =
      '# 測試\n\n' + '中文內容'.repeat(180) + '\n\n[來源](https://example.test/very-long-path)';
    expect((await renderMarkdown(source)).readingMinutes).toBe(readingMinutes(source));
    expect(readingMinutes(source)).toBe(3);
  });
  it('中文正文的語言不受大量英文程式碼影響', () => {
    expect(
      contentLanguage(
        '## 交易與鎖\n\n這篇說明 PostgreSQL 的併發控制\n\n```sql\n' +
          'SELECT '.repeat(1000) +
          '\n```',
      ),
    ).toBe('zh-Hant');
    expect(contentLanguage('Database notes with a short Chinese label 中文')).toBe('en');
    expect(contentLanguage('工單')).toBe('zh-Hant');
    expect(contentLanguage('')).toBe('en');
  });
});
