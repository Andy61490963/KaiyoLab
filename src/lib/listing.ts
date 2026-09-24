/** Shared, dependency-free list rules. Never interpolate request values into SQL. */
export const publicSorts = ['newest', 'oldest', 'title-asc', 'title-desc'] as const;
export const entrySorts = ['updated-desc', 'updated-asc', 'title-asc', 'title-desc'] as const;
export const mediaSorts = ['newest', 'oldest', 'name-asc', 'name-desc', 'size-desc', 'size-asc'] as const;
export const nameSorts = ['name-asc', 'name-desc'] as const;
export type PublicSort = (typeof publicSorts)[number];
export interface PageInfo {
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  from: number;
  to: number;
}
export interface ListResult<T> extends PageInfo { items: T[] }
export interface ListConfig {
  sorts: readonly string[];
  defaultSort: string;
  sizes: readonly number[];
  defaultSize: number;
}
export const articleList: ListConfig = { sorts: publicSorts, defaultSort: 'newest', sizes: [8, 12, 24], defaultSize: 8 };
export const projectList: ListConfig = { ...articleList, defaultSize: 12 };
export const adminEntryList: ListConfig = { sorts: entrySorts, defaultSort: 'updated-desc', sizes: [10, 20, 50], defaultSize: 20 };
export const adminMediaList: ListConfig = { sorts: mediaSorts, defaultSort: 'newest', sizes: [12, 24, 48], defaultSize: 24 };
export const taxonomyList: ListConfig = { sorts: nameSorts, defaultSort: 'name-asc', sizes: [10, 20, 50], defaultSize: 10 };
export function positiveInteger(value: unknown, fallback = 1): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
export function readListing(params: URLSearchParams, config: ListConfig) {
  const size = positiveInteger(params.get('pageSize'), config.defaultSize);
  const sort = params.get('sort') || config.defaultSort;
  return {
    page: positiveInteger(params.get('page')),
    pageSize: config.sizes.includes(size) ? size : config.defaultSize,
    sort: config.sorts.includes(sort) ? sort : config.defaultSort,
  };
}
export function paginate(total: number, requestedPage: unknown = 1, requestedSize: unknown = 12): PageInfo {
  total = Math.max(0, Number.isSafeInteger(total) ? total : 0);
  const pageSize = Math.min(100, positiveInteger(requestedSize, 12));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, positiveInteger(requestedPage));
  return { total, page, pages, pageSize, from: total ? (page - 1) * pageSize + 1 : 0, to: Math.min(page * pageSize, total) };
}
/** Constant-space pager, including for very large collections. */
export function pageNumbers(page: number, pages: number): Array<number | 'gap'> {
  pages = positiveInteger(pages);
  page = Math.min(pages, positiveInteger(page));
  const numbers = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  for (const [index, n] of numbers.entries()) {
    const previous = numbers[index - 1];
    if (index && n - previous === 2) result.push(previous + 1);
    else if (index && n - previous > 2) result.push('gap');
    result.push(n);
  }
  return result;
}
/** Local links preserve filters; callers explicitly reset page when changing criteria. */
export function listingHref(url: URL, changes: Record<string, string | number | null>): string {
  const params = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '' || (key === 'page' && value === 1)) params.delete(key);
    else params.set(key, String(value));
  }
  return `${url.pathname}${params.size ? `?${params}` : ''}`;
}
export const literalLike = (text: string) => `%${text.slice(0, 200).replace(/[\\%_]/g, '\\$&')}%`;
