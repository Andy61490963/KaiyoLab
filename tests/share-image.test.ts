import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { normalizeShareText, shareImage, shareImageResponse } from '../src/lib/share-image';

describe('PNG 分享圖片', () => {
  const value = {
    siteName: 'KaiyoLab',
    title: '資料庫交易：報工、鎖與併發控制',
    category: 'MES Domain',
    footer: 'Andy · 2026-09-29',
  };
  it('使用隨附中文字型產生固定尺寸的真實 PNG', async () => {
    const image = await shareImage(value);
    expect(image.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(await sharp(image).metadata()).toMatchObject({
      format: 'png',
      width: 1200,
      height: 630,
    });
    const { channels } = await sharp(image)
      .extract({ left: 72, top: 224, width: 1056, height: 266 })
      .stats();
    expect(channels[0].stdev).toBeGreaterThan(10);
    expect(await shareImage(value)).toBe(image);
  });
  it('動態標題以文字處理且限制長度，不接受 Pango 標籤', async () => {
    const hostile = { ...value, title: '<span foreground="red">測試</span> & "內容"' };
    const response = await shareImageResponse(
      new Request('https://example.test/og/site.png'),
      hostile,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(
      Array.from(normalizeShareText({ ...value, title: '標'.repeat(10000) }).title),
    ).toHaveLength(180);
    expect(normalizeShareText({ ...value, title: '\u0001\n', siteName: '\u0001' }).title).toBe(
      'KaiyoLab',
    );
    const repeat = await shareImageResponse(
      new Request('https://example.test/og/site.png', {
        headers: { 'If-None-Match': response.headers.get('etag')! },
      }),
      hostile,
    );
    expect(repeat.status).toBe(304);
  });
});
