import type { EntryContent } from '../../lib/types';

export interface DraftRecovery {
  content: EntryContent;
  at: string;
  version: number;
}

// Local storage can contain obsolete, corrupted, or manually edited data.
export function readRecovery(raw: string | null): DraftRecovery | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (typeof record.at !== 'string' || !Number.isFinite(Date.parse(record.at)) ||
        typeof record.version !== 'number' || !Number.isInteger(record.version) || record.version < 1 ||
        !record.content || typeof record.content !== 'object') return null;
    const content = record.content as Record<string, unknown>;
    const textFields = ['title', 'slug', 'excerpt', 'body', 'cover', 'coverAlt', 'category', 'seoTitle', 'seoDescription', 'demoUrl', 'repoUrl'] as const;
    if (!textFields.every((field) => typeof content[field] === 'string') ||
        typeof content.featured !== 'boolean' || !Array.isArray(content.tags) ||
        !content.tags.every((tag) => typeof tag === 'string')) return null;
    return record as unknown as DraftRecovery;
  } catch { return null; }
}
