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
  it('檢查摘要、封面與 Markdown 引用圖片的替代文字', async () => {
    const review = await reviewContent(
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
  it('接受公開舊網址，辨識同源、相對與參照連結，忽略外部網址及程式碼', async () => {
    const review = await reviewContent(
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
  it('解碼中文路徑、辨識錨點並去除重複提醒', async () => {
    const review = await reviewContent(
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
      { code: 'broken-anchor', message: '找不到章節錨點：/articles/current#id' },
    ]);
  });
  it('中文、重複標題及自己的舊網址沿用正式渲染器的錨點', async () => {
    const review = await reviewContent(
      {
        ...emptyContent,
        excerpt: '摘要',
        body: '## 併發控制\n\n## 併發控制\n\n[第一節](#section-%E4%BD%B5%E7%99%BC%E6%8E%A7%E5%88%B6) [第二節](#section-併發控制-1) [舊網址](/articles/previous#section-併發控制) [不存在](#section-不存在)\n\n`[範例](#code)`',
      },
      null,
      { ...options, currentPaths: new Set(['/articles/previous']) },
    );
    expect(review.warnings).toEqual([
      { code: 'broken-anchor', message: '找不到章節錨點：/articles/current#section-不存在' },
    ]);
  });
  it('站內目標驗證公開錨點，忽略外站與原始 HTML 腳本', async () => {
    const visited: string[] = [];
    const review = await reviewContent(
      {
        ...emptyContent,
        excerpt: '摘要',
        body: '[存在](/articles/live?q=1#section-公開) [不存在](/articles/live#section-草稿) [外站](https://external.test/articles/live#missing)\n\n<script>throw new Error("不可執行")</script>',
      },
      null,
      {
        ...options,
        publicAnchors: async (pathname) => {
          visited.push(pathname);
          return new Set(['section-公開']);
        },
      },
    );
    expect(visited).toEqual(['/articles/live']);
    expect(review.warnings).toEqual([
      { code: 'broken-anchor', message: '找不到章節錨點：/articles/live#section-草稿' },
    ]);
  });
  it('Mermaid 隔離解析支援中文流程與時序圖，指出語法及不支援設定', async () => {
    const review = await reviewContent(
      {
        ...emptyContent,
        excerpt: '摘要',
        body: [
          '```mermaid\nflowchart TD\nA[建立工單] --> B[完成]\n```',
          '```mermaid\nsequenceDiagram\n站長->>網站: 發布文章\n```',
          '```mermaid\nflowchart TD\nA[尚未結束\n```',
          '```mermaid\nflowchart TD\nclick A "javascript:alert(1)"\n```',
        ].join('\n\n'),
      },
      null,
      options,
    );
    expect(review.warnings.map((warning) => warning.code)).toEqual([
      'diagram-policy',
      'diagram-syntax',
    ]);
    expect(review.warnings[1].message).toContain('第 11 行');
  });
  it('超量圖表與錨點給出有限提醒', async () => {
    const review = await reviewContent(
      {
        ...emptyContent,
        excerpt: '摘要',
        body: [
          ...Array.from({ length: 25 }, (_, index) => `[缺少](#missing-${index})`),
          ...Array.from({ length: 22 }, () => '```mermaid\npie\n"A" : 1\n```'),
        ].join('\n\n'),
      },
      null,
      options,
    );
    expect(review.warnings.filter((warning) => warning.code === 'broken-anchor')).toHaveLength(20);
    expect(review.warnings).toContainEqual({
      code: 'more-anchors',
      message: '另外有 5 個找不到的章節錨點',
    });
    expect(review.warnings.filter((warning) => warning.code === 'diagram-policy')).toHaveLength(20);
    expect(review.warnings.find((warning) => warning.code === 'more-diagrams')).toBeTruthy();
  });
});
describe('內容差異', () => {
  it('標示中間變更並忽略兩端未變更行', () => {
    const before = { ...emptyContent, body: '相同\n舊文字\n尾端' };
    const after = { ...before, title: '新標題', body: '相同\n新文字\n新增一行\n尾端' };
    expect(contentDiff(before, after)).toMatchObject({
      fields: ['Title'],
      metadata: [{ label: 'Title', before: 'Untitled article', after: '新標題' }],
      body: {
        changed: true,
        status: 'complete',
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
  it('超過行數上限明確回報無法比較，不虛構全文新增刪除計數', () => {
    const diff = contentDiff(
      { ...emptyContent, body: 'a\n'.repeat(250000) },
      { ...emptyContent, body: 'b'.repeat(500000) },
    );
    expect(diff.body).toMatchObject({
      changed: true,
      status: 'too-large',
      hunks: [],
      removed: [],
      added: [],
      removedCount: null,
      addedCount: null,
    });
  });
  it('不把全文當成 HTML 執行', () => {
    expect(
      contentDiff(null, { ...emptyContent, body: '<script>alert(1)</script>' }).body.added,
    ).toEqual(['<script>alert(1)</script>']);
  });
});
