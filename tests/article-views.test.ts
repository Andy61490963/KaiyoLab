import { describe, it, expect } from 'vitest';
import { defaultSettings } from '../src/lib/defaults';
import { ARTICLE_VIEWS_KEY, VIEW_COOLDOWN_SECONDS, compactViewCount, parseViewCount, publicSiteSettings } from '../src/lib/view-metrics';
import { createViewReceipt, validViewReceipt, viewCookieName } from '../src/lib/article-views';

const key = 'unit-test-receipt-secret-000000000000000000';
const now = 1790200000000;
describe('article view metrics', () => {
  it('formats compact counts while retaining safe integer boundaries', () => {
    expect(compactViewCount(0)).toBe('0');
    expect(compactViewCount(2400)).toBe('2.4K');
    expect(compactViewCount(1000000)).toBe('1M');
    expect(parseViewCount(null)).toBe(0);
    for (const value of [-1, 1.2, '3', Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, {}, []])
      expect(() => parseViewCount(value)).toThrow();
  });
  it('does not expose server metadata or mutate author settings', () => {
    const stored = {...defaultSettings, [ARTICLE_VIEWS_KEY]: {article: 42}};
    expect(publicSiteSettings(stored)).toEqual(defaultSettings);
    expect(stored[ARTICLE_VIEWS_KEY].article).toBe(42);
    expect(publicSiteSettings()).toEqual({});
  });
  it('accepts receipts only for the same article, key, and unexpired time window', () => {
    const receipt = createViewReceipt('article-a', key, now);
    expect(validViewReceipt(receipt, 'article-a', key, now)).toBe(true);
    expect(validViewReceipt(receipt, 'article-b', key, now)).toBe(false);
    expect(validViewReceipt(receipt, 'article-a', 'another-key-0000000000000000000000000', now)).toBe(false);
    expect(validViewReceipt(receipt, 'article-a', key, now + VIEW_COOLDOWN_SECONDS * 1000)).toBe(false);
    expect(validViewReceipt(receipt, 'article-a', key, now - 60000)).toBe(false);
  });
  it('rejects malformed or forged receipts without throwing', () => {
    for (const value of [undefined, '', '0.x', 'x'.repeat(20000), createViewReceipt('a', key, now) + 'x'])
      expect(validViewReceipt(value, 'a', key, now)).toBe(false);
    expect(validViewReceipt(createViewReceipt('a',key,now).replace(/.$/,'!'), 'a',key,now)).toBe(false);
    expect(() => createViewReceipt('a','short',now)).toThrow();
    expect(validViewReceipt('x','a','short',now)).toBe(false);
  });
  it('uses distinct path-safe cookie names per article', () => {
    expect(viewCookieName('a')).not.toBe(viewCookieName('b'));
    expect(viewCookieName('a')).toMatch(/^kaiyo-view-[a-f0-9]{16}$/);
  });
});
