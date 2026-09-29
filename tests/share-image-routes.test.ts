import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyContent, defaultSettings } from '../src/lib/defaults';

const mocks = vi.hoisted(() => ({
  getPublished: vi.fn(),
  getSettings: vi.fn(),
  publishedRedirect: vi.fn(),
  shareImageResponse: vi.fn(),
}));
vi.mock('../src/lib/content', () => mocks);
vi.mock('../src/lib/share-image', () => ({ shareImageResponse: mocks.shareImageResponse }));
import { GET } from '../src/pages/og/[kind]/[slug].png';

describe('分享圖片的公開內容邊界', () => {
  const request = new Request('https://example.test/og/article/test.png', {
    headers: { 'If-None-Match': '"old-image"' },
  });
  const call = (kind: string, slug: string) =>
    GET({ params: { kind, slug }, request } as unknown as Parameters<typeof GET>[0]);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publishedRedirect.mockResolvedValue(null);
    mocks.getSettings.mockResolvedValue({ ...defaultSettings, siteUrl: 'https://example.test' });
    mocks.shareImageResponse.mockResolvedValue(
      new Response('png', { headers: { 'Content-Type': 'image/png' } }),
    );
  });
  it('草稿、已下架或垃圾桶文章不因舊 ETag 而洩漏快取', async () => {
    mocks.getPublished.mockResolvedValue(null);
    const result = await call('article', 'private-draft');
    expect(result.status).toBe(404);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(mocks.getPublished).toHaveBeenCalledWith('article', 'private-draft');
    expect(mocks.publishedRedirect).toHaveBeenCalledWith('article', 'private-draft');
    expect(mocks.shareImageResponse).not.toHaveBeenCalled();
  });
  it('不存在的種類、路徑及超長 slug 在查詢前拒絕', async () => {
    for (const [kind, slug] of [
      ['draft', 'test'],
      ['article', '../secret'],
      ['article', 'x'.repeat(161)],
    ])
      expect((await call(kind, slug)).status).toBe(404);
    expect(mocks.getPublished).not.toHaveBeenCalled();
    expect(mocks.publishedRedirect).not.toHaveBeenCalled();
  });
  it.each([
    ['article', 'articles'],
    ['project', 'projects'],
  ])('%s 的舊公開分享網址轉址至已編碼的新 slug，舊 ETag 不可略過查證', async (kind, section) => {
    mocks.getPublished.mockResolvedValue(null);
    mocks.publishedRedirect.mockResolvedValue(`/${section}/${encodeURIComponent('新版分享網址')}`);
    const result = await call(kind, 'old-slug');
    expect(result.status).toBe(301);
    expect(result.headers.get('location')).toBe(
      `/og/${kind}/${encodeURIComponent('新版分享網址')}.png`,
    );
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(mocks.publishedRedirect).toHaveBeenCalledWith(kind, 'old-slug');
    expect(mocks.shareImageResponse).not.toHaveBeenCalled();
    expect(mocks.getSettings).not.toHaveBeenCalled();
  });
  it('只將已發布快照的標題交給產圖服務', async () => {
    mocks.getPublished.mockResolvedValue({
      ...emptyContent,
      title: '公開標題',
      slug: '公開標題',
      category: '技術',
      publishedAt: '2026-09-01T00:00:00Z',
    });
    expect((await call('article', '公開標題')).status).toBe(200);
    expect(mocks.publishedRedirect).not.toHaveBeenCalled();
    expect(mocks.shareImageResponse).toHaveBeenCalledWith(
      request,
      expect.objectContaining({ title: '公開標題', category: '技術' }),
    );
  });
});
