import type { EntryContent } from './types';

export interface ContentDiff {
  fields: string[];
  metadata: { label: string; before: string; after: string }[];
  body: {
    removed: string[];
    added: string[];
    removedCount: number;
    addedCount: number;
    truncated: boolean;
  };
}

const fieldLabels: Partial<Record<keyof EntryContent, string>> = {
  title: 'Title',
  slug: 'Slug',
  excerpt: 'Summary',
  cover: 'Cover',
  coverAlt: 'Cover alt text',
  category: 'Category',
  tags: 'Tags',
  featured: 'Featured',
  seoTitle: 'SEO title',
  seoDescription: 'SEO description',
  demoUrl: 'Demo URL',
  repoUrl: 'Source code URL',
  series: 'Series',
  seriesOrder: 'Series order',
  coverPosition: 'Cover focus',
};

export function contentDiff(before: EntryContent | null, after: EntryContent): ContentDiff {
  const normal = (content: EntryContent | null, key: keyof EntryContent) => {
    if (key === 'coverPosition') return content?.[key] ?? { x: 50, y: 50 };
    if (key === 'seriesOrder') return content?.[key] ?? 0;
    if (key === 'tags') return content?.[key] ?? [];
    if (key === 'featured') return content?.[key] ?? false;
    return content?.[key] ?? '';
  };
  const changedKeys = (Object.keys(fieldLabels) as (keyof EntryContent)[]).filter(
    (key) => JSON.stringify(normal(before, key)) !== JSON.stringify(normal(after, key)),
  );
  const fields = changedKeys.map((key) => fieldLabels[key]!);
  const display = (value: unknown) =>
    typeof value === 'boolean'
      ? value
        ? 'Yes'
        : 'No'
      : Array.isArray(value)
        ? value.join(', ') || '(empty)'
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value) || '(empty)';
  const metadata = changedKeys.map((key) => ({
    label: fieldLabels[key]!,
    before: display(normal(before, key)),
    after: display(normal(after, key)),
  }));
  const oldLines = before?.body ? before.body.split('\n') : [];
  const newLines = after.body ? after.body.split('\n') : [];
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start])
    start++;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }
  const removedCount = oldEnd - start;
  const addedCount = newEnd - start;
  // 單一變更區塊採線性掃描，大篇幅文章也不建立平方大小的差異矩陣
  const removed = oldLines.slice(start, Math.min(oldEnd, start + 100));
  const added = newLines.slice(start, Math.min(newEnd, start + 100));
  const truncated =
    removedCount > 100 ||
    addedCount > 100 ||
    [...removed, ...added].some((line) => line.length > 1000);
  return {
    fields,
    metadata,
    body: {
      removed: removed.map((line) => (line.length > 1000 ? `${line.slice(0, 1000)}…` : line)),
      added: added.map((line) => (line.length > 1000 ? `${line.slice(0, 1000)}…` : line)),
      removedCount,
      addedCount,
      truncated,
    },
  };
}
