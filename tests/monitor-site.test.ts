import { describe, it, expect } from 'vitest';
import { checkSite, monitorOrigin } from '../scripts/monitor-site.mjs';

describe('外部網站監測', () => {
  it('拒絕含帳密或不明目標的來源', () => {
    for (const value of [
      'http://example.com',
      'https://user:pass@example.com',
      'https://example.com/path',
      'https://example.com?x=1',
    ])
      expect(() => monitorOrigin(value)).toThrow();
  });
  it('驗證網站內容、資料庫與未登入的管理 API', async () => {
    const request: typeof fetch = async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.pathname === '/api/health') return Response.json({ status: 'ok' });
      if (url.pathname === '/api/admin/entries') return new Response(null, { status: 401 });
      return new Response('<html><body>KaiyoLab</body></html>', {
        headers: { 'content-type': 'text/html' },
      });
    };
    expect(
      (await checkSite(new URL('https://example.com'), request)).every((result) => result.ok),
    ).toBe(true);
    const results = await checkSite(
      new URL('https://example.com'),
      async () => new Response('edge error', { status: 200 }),
    );
    expect(results.every((result) => !result.ok)).toBe(true);
  });
  it('連線失敗不會省略路徑或輸出遠端內容', async () => {
    const results = await checkSite(new URL('https://example.com'), async () => {
      throw new Error('secret=private');
    });
    expect(results).toHaveLength(4);
    expect(JSON.stringify(results)).not.toContain('private');
  });
});
