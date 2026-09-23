import { describe, it, expect } from 'vitest';
import { normalizeUiLanguage, uiLabels, uiLabel, isUiLabel } from '../src/lib/ui-language';

describe('public interface language', () => {
  it('accepts only supported languages', () => {
    expect(normalizeUiLanguage('zh-TW')).toBe('zh-TW');
    expect(normalizeUiLanguage('en')).toBe('en');
    for (const value of [null, undefined, '', 'zh', 'constructor', '<script>', {}, 1]) {
      expect(normalizeUiLanguage(value)).toBe('en');
    }
  });
  it('has complete English and Traditional Chinese interface labels', () => {
    for (const [key, values] of Object.entries(uiLabels)) {
      expect(values).toHaveLength(2);
      expect(values.every((text) => text.trim().length > 0), key).toBe(true);
      expect(values.every((text) => !text.includes('<script')), key).toBe(true);
    }
    expect(uiLabel('openMenu', 'en')).toBe('Open menu');
    expect(uiLabel('openMenu', 'zh-TW')).toBe('開啟選單');
  });
  it('does not recognize inherited properties as translation keys', () => {
    expect(isUiLabel('search')).toBe(true);
    for (const key of ['constructor', '__proto__', 'toString', undefined, 'authoredContent']) {
      expect(isUiLabel(key)).toBe(false);
    }
  });
});
