import { describe, expect, it } from 'vitest';
import {
  articleList, adminEntryList, adminMediaList, readListing, paginate,
  pageNumbers, positiveInteger, listingHref, literalLike,
} from '../src/lib/listing';

describe('list parameters and bounded pagination', () => {
  it('rejects invalid, fractional and unsafe page values', () => {
    for (const value of [null, '', '1.2', 'Infinity', 'NaN', '-1', '1e3', 1.5, Infinity, NaN, 0, Number.MAX_SAFE_INTEGER + 1]) {
      expect(positiveInteger(value)).toBe(1);
    }
    expect(positiveInteger('002')).toBe(2);
    expect(paginate(0, 99, 8)).toEqual({ total: 0, page: 1, pages: 1, pageSize: 8, from: 0, to: 0 });
    expect(paginate(43, 99, 20)).toEqual({ total: 43, page: 3, pages: 3, pageSize: 20, from: 41, to: 43 });
    expect(paginate(40, 3, 20).page).toBe(2);
  });
  it('allowlists sort and page sizes independently for each collection', () => {
    expect(readListing(new URLSearchParams('sort=title-desc&pageSize=24&page=2'), articleList))
      .toEqual({ sort: 'title-desc', pageSize: 24, page: 2 });
    expect(readListing(new URLSearchParams('sort=DROP TABLE entries&pageSize=100000&page=Infinity'), adminEntryList))
      .toEqual({ sort: 'updated-desc', pageSize: 20, page: 1 });
    expect(readListing(new URLSearchParams('sort=size-desc&pageSize=12'), adminMediaList))
      .toEqual({ sort: 'size-desc', pageSize: 12, page: 1 });
    expect(paginate(1000, 1, 100000).pageSize).toBe(100);
  });
  it('builds a constant-size pager with the current, first and last pages', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(3, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNumbers(500, 1000)).toEqual([1, 'gap', 499, 500, 501, 'gap', 1000]);
    expect(pageNumbers(500, Number.MAX_SAFE_INTEGER).length).toBeLessThanOrEqual(7);
  });
  it('preserves filters and ordering in local page links, resetting page explicitly', () => {
    const source = new URL('https://example.test/articles?q=C%2B%2B&category=MES&tag=API&sort=oldest&pageSize=12&page=2');
    const next = new URL(listingHref(source, { page: 3 }), source);
    expect(next.searchParams.get('q')).toBe('C++');
    expect(next.searchParams.get('category')).toBe('MES');
    expect(next.searchParams.get('tag')).toBe('API');
    expect(next.searchParams.get('sort')).toBe('oldest');
    expect(next.searchParams.get('page')).toBe('3');
    expect(listingHref(source, { page: 1 })).not.toContain('page=');
    expect(listingHref(source, { page: 1, q: null, tag: null })).toContain('category=MES');
    expect(listingHref(source, {})).toMatch(/^\/articles\?/);
  });
  it('treats SQL wildcard characters as literal search text', () => {
    expect(literalLike('100%_\\')).toBe('%100\\%\\_\\\\%');
    expect(literalLike('a'.repeat(250))).toHaveLength(202);
  });
});
