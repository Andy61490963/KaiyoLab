import { describe, expect, it } from 'vitest';
import { mediaPresentation, mediaWidth } from '../src/lib/media-presentation';
describe('圖片尺寸與裁切焦點', () => {
  it('僅為媒體庫圖片產生受限尺寸', () => {
    const url = '/media/12345678-1234-1234-1234-123456789abc.webp';
    expect(mediaPresentation(url, { x: 0, y: 100 })).toEqual({
      src: `${url}?w=960`,
      srcset: `${url}?w=480 480w, ${url}?w=960 960w, ${url}?w=1600 1600w`,
      style: 'object-position: 0% 100%',
    });
    expect(mediaPresentation('/images/example.webp').srcset).toBeUndefined();
    expect(mediaPresentation('https://example.test/a.webp').src).toBe(
      'https://example.test/a.webp',
    );
  });
  it('拒絕任意縮圖尺寸與非數值焦點', () => {
    expect(mediaWidth(null)).toBeNull();
    for (const invalid of ['0', '9999', '0480', '480.0', 'abc', '-1'])
      expect(mediaWidth(invalid)).toBe(false);
    expect(mediaWidth('480')).toBe(480);
    expect(mediaPresentation('', { x: NaN, y: 200 }).style).toBe('object-position: 50% 100%');
  });
});
