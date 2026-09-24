import type { SiteSettings } from './types';

// Private server-maintained metadata in the existing settings document, not editable copy.
export const ARTICLE_VIEWS_KEY = '_articleViewsV1';
export const VIEW_COOLDOWN_SECONDS = 30 * 60;
export const VIEW_COUNT_EXPLANATION =
  'Views since this counter was introduced. Repeat visits in the same browser within 30 minutes are usually counted once; this is not a unique-person count.' as const;

export function publicSiteSettings(value?: SiteSettings): Partial<SiteSettings> {
  if (!value) return {};
  const result = { ...value } as SiteSettings & { [ARTICLE_VIEWS_KEY]?: unknown };
  delete result[ARTICLE_VIEWS_KEY];
  return result;
}

export function parseViewCount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid article view count.');
  return value;
}

export function compactViewCount(value: number): string {
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(parseViewCount(value));
}
