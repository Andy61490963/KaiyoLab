import { describe, it, expect } from 'vitest';
import { chinese, normalizeUiLanguage, uiText, uiLabel, uiPlaceholder } from '../src/lib/ui-language';

describe('public interface language', () => {
  it('uses an allowlist and defaults safely to English', () => {
    expect(normalizeUiLanguage('zh-TW')).toBe('zh-TW');
    for (const value of ['en', 'zh', 'fr', '', null, undefined, {}, '<script>'])
      expect(normalizeUiLanguage(value)).toBe('en');
  });
  it('has matching, complete placeholders in every translation', () => {
    for (const [en, zh] of Object.entries(chinese)) {
      expect(zh.trim().length).toBeGreaterThan(0);
      expect((zh.match(/\{\w+\}/g) || []).sort()).toEqual((en.match(/\{\w+\}/g) || []).sort());
    }
  });
  it('preserves user-provided values rather than translating them', () => {
    const values = { category: 'My 中文 notes' };
    expect(uiText(' in {category}', 'zh-TW', values)).toBe('，分類「My 中文 notes」');
    expect(values.category).toBe('My 中文 notes');
    expect(uiText('{count} min read', 'en', { count: 3 })).toBe('3 min read');
  });
  it('does not interpolate inherited properties', () => {
    expect(uiText('{name} home', 'en', Object.create({ name: 'unexpected' }))).toBe('{name} home');
  });
  it('provides paired labels and placeholders without generating HTML', () => {
    const name = '<script>alert(1)</script>';
    expect(uiLabel('{name} home', { name })['aria-label']).toBe(`${name} home`);
    expect(uiLabel('Search articles')['data-ui-label-zh']).toBe('搜尋文章');
    expect(uiPlaceholder('Search titles or content…').placeholder).toBe('Search titles or content…');
  });
});
