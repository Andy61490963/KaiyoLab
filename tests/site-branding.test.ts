import { describe, expect, it } from 'vitest';
import { normalizeLegacyBranding } from '../src/lib/site-branding';

describe('精準移除舊內建品牌圖示', () => {
  const content = {
    siteName: '我的 KaiyoLab',
    description: '本文提到 /favicon.svg，保留這段原文',
    about: '# 我的介紹\n\n![自訂內容](/favicon.svg)',
    homeIntro: '[原始圖示](/favicon.svg)',
    version: 12,
    socialLinks: [{ label: '作品', url: 'https://example.com/favicon.svg' }],
  };

  it('只清空三個品牌欄位中完全相同的舊路徑，其他內容與版本保持原值', () => {
    const input = {
      ...content,
      logo: '/favicon.svg',
      avatar: '/favicon.svg',
      heroImage: '/favicon.svg',
    };
    expect(normalizeLegacyBranding(input)).toEqual({
      ...content,
      logo: '',
      avatar: '',
      heroImage: '',
    });
  });

  it('各品牌欄位都保留自訂媒體、HTTPS 網址及與舊路徑不完全相同的值', () => {
    for (const custom of [
      '/media/12345678-1234-4123-8123-123456789abc.webp',
      'https://example.com/favicon.svg',
      '/images/favicon.svg',
      '/favicon.svg?custom=1',
      '/favicon.svg#logo',
      '/FAVICON.svg',
      ' /favicon.svg',
      '',
    ]) {
      const input = { ...content, logo: custom, avatar: custom, heroImage: custom };
      expect(normalizeLegacyBranding(input)).toEqual(input);
    }
    const mixed = {
      ...content,
      logo: '/favicon.svg',
      avatar: '/media/12345678-1234-4123-8123-123456789abc.webp',
      heroImage: 'https://example.com/cover.gif',
    };
    expect(normalizeLegacyBranding(mixed)).toEqual({ ...mixed, logo: '' });
  });

  it('回傳新物件，不修改輸入或其自訂內容', () => {
    const input = Object.freeze({
      ...content,
      logo: '/favicon.svg',
      avatar: 'https://example.com/avatar.webp',
      heroImage: '/favicon.svg',
    });
    const before = structuredClone(input);
    const result = normalizeLegacyBranding(input);
    expect(result).not.toBe(input);
    expect(input).toEqual(before);
    expect(result).toEqual({ ...before, logo: '', heroImage: '' });
    expect(result.socialLinks).toEqual(before.socialLinks);
  });
});
