import { describe, expect, it } from 'vitest';
import { contentDiff } from '../src/lib/content-diff';
import { reviewContent } from '../src/lib/content-review';
import { emptyContent } from '../src/lib/defaults';

const options = {
  siteUrl: 'https://example.test',
  currentPath: '/articles/current',
  publicPaths: new Set(['/articles/live', '/articles/old-slug']),
};
describe('發布前檢查', () => {
  it('檢查摘要、封面與 Markdown 引用圖片的替代文字', () => {
    const review = reviewContent(
      {
        ...emptyContent,
        cover: '/media/test.webp',
        body: '![](image.webp)\n\n![][cover]\n\n[cover]: /image.webp\n\n![已有描述](other.webp)',
      },
      null,
      options,
    );
    expect(review.warnings.map((warning) => warning.code)).toEqual([
      'summary',
      'cover-alt',
      'image-alt',
    ]);
    expect(review.warnings[2].message).toContain('2 body images');
  });
  it('接受公開舊網址，辨識同源、相對與參照連結，忽略外部網址及程式碼', () => {
    const review = reviewContent(
      {
        ...emptyContent,
        excerpt: '摘要',
        body: '[目前](/articles/live) [舊址](/articles/old-slug) [失效](missing) [同源](https://example.test/projects/missing) [外部](https://external.test/articles/missing) [參照][a]\n\n[a]: /articles/draft\n\n`[程式碼](/articles/code)`',
      },
      null,
      options,
    );
    expect(review.warnings.map((warning) => warning.message)).toEqual([
      'No published content at /articles/missing',
      'No published content at /projects/missing',
      'No published content at /articles/draft',
    ]);
  });
  it('解碼中文路徑、忽略查詢與fragment並去除重複提醒', () => {
    const review = reviewContent(
      {
        ...emptyContent,
        excerpt: '摘要',
        body: '[甲](/articles/%E6%96%87%E7%AB%A0?q=test#section) [乙](/articles/文章) [節](#id)',
      },
      null,
      options,
    );
    expect(review.warnings).toEqual([
      { code: 'broken-link', message: 'No published content at /articles/文章' },
    ]);
  });
});
describe('內容差異', () => {
  it('標示中間變更並忽略兩端未變更行', () => {
    const before = { ...emptyContent, body: '相同\n舊文字\n尾端' };
    const after = { ...before, title: '新標題', body: '相同\n新文字\n新增一行\n尾端' };
    expect(contentDiff(before, after)).toEqual({
      fields: ['Title'],
      metadata: [{ label: 'Title', before: 'Untitled article', after: '新標題' }],
      body: {
        removed: ['舊文字'],
        added: ['新文字', '新增一行'],
        removedCount: 1,
        addedCount: 2,
        truncated: false,
      },
    });
  });
  it('舊內容缺少新增選填欄位時，不製造假變更', () => {
    expect(
      contentDiff(emptyContent, {
        ...emptyContent,
        series: '',
        seriesOrder: 0,
        coverPosition: { x: 50, y: 50 },
      }).fields,
    ).toEqual([]);
  });
  it('大篇幅與單行內容皆限制差異預覽大小', () => {
    const diff = contentDiff(
      { ...emptyContent, body: 'a\n'.repeat(250000) },
      { ...emptyContent, body: 'b'.repeat(500000) },
    );
    expect(diff.body.removed.length).toBe(100);
    expect(diff.body.added[0].length).toBe(1001);
    expect(diff.body.truncated).toBe(true);
  });
  it('不把全文當成 HTML 執行', () => {
    expect(
      contentDiff(null, { ...emptyContent, body: '<script>alert(1)</script>' }).body.added,
    ).toEqual(['<script>alert(1)</script>']);
  });
});
