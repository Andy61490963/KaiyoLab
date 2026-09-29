import { structuredPatch } from 'diff';
import type { EntryContent } from './types';

export interface ContentDiffLine {
  kind: 'context' | 'remove' | 'add' | 'note';
  text: string;
  oldNumber: number | null;
  newNumber: number | null;
}
export interface ContentDiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: ContentDiffLine[];
}
export const DIFF_PREVIEW_LIMITS = { lines: 400, lineLength: 1000 } as const;
export const DIFF_COMPUTE_LIMITS = {
  characters: 500000,
  lines: 20000,
  editLength: 4000,
  milliseconds: 150,
} as const;

export interface ContentDiff {
  fields: string[];
  metadata: {
    label: string;
    before: string;
    after: string;
    beforeEmpty: boolean;
    afterEmpty: boolean;
  }[];
  body: {
    changed: boolean;
    status: 'complete' | 'too-large' | 'too-complex';
    hunks: ContentDiffHunk[];
    totalHunks: number | null;
    oldLineCount: number;
    newLineCount: number;
    removed: string[];
    added: string[];
    removedCount: number | null;
    addedCount: number | null;
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

function lineCount(text: string): number {
  if (!text) return 0;
  let count = text.endsWith('\n') ? 0 : 1;
  for (let index = 0; index < text.length; index++) if (text.charCodeAt(index) === 10) count++;
  return count;
}

function clipLine(text: string): string {
  const carriageReturn = text.endsWith('\r') ? '\r' : '';
  const content = carriageReturn ? text.slice(0, -1) : text;
  if (content.length <= DIFF_PREVIEW_LIMITS.lineLength) return text;
  let prefix = content.slice(0, DIFF_PREVIEW_LIMITS.lineLength);
  const last = prefix.charCodeAt(prefix.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) prefix = prefix.slice(0, -1);
  return `${prefix}…${carriageReturn}`;
}

function bodyDiff(before: string, after: string): ContentDiff['body'] {
  const base: ContentDiff['body'] = {
    changed: before !== after,
    status: 'complete',
    hunks: [],
    totalHunks: 0,
    oldLineCount: lineCount(before),
    newLineCount: lineCount(after),
    removed: [],
    added: [],
    removedCount: 0,
    addedCount: 0,
    truncated: false,
  };
  if (!base.changed) return base;
  const unavailable = (status: 'too-large' | 'too-complex'): ContentDiff['body'] => ({
    ...base,
    status,
    totalHunks: null,
    removedCount: null,
    addedCount: null,
  });
  if (
    before.length > DIFF_COMPUTE_LIMITS.characters ||
    after.length > DIFF_COMPUTE_LIMITS.characters ||
    base.oldLineCount > DIFF_COMPUTE_LIMITS.lines ||
    base.newLineCount > DIFF_COMPUTE_LIMITS.lines
  )
    return unavailable('too-large');

  // 使用有限成本的 Myers 差異計算，保留空白、CRLF 及檔尾換行差異
  // 未完成時不以全文替換冒充精確差異，供介面另行提示無法比較
  const patch = structuredPatch('previous.md', 'current.md', before, after, undefined, undefined, {
    context: 3,
    ignoreWhitespace: false,
    stripTrailingCr: false,
    timeout: DIFF_COMPUTE_LIMITS.milliseconds,
    maxEditLength: DIFF_COMPUTE_LIMITS.editLength,
  });
  if (!patch) return unavailable('too-complex');

  const result = { ...base, totalHunks: patch.hunks.length, removedCount: 0, addedCount: 0 };
  let displayed = 0;
  for (const hunk of patch.hunks) {
    let oldNumber = hunk.oldStart;
    let newNumber = hunk.newStart;
    const lines: ContentDiffLine[] = [];
    for (const raw of hunk.lines) {
      const prefix = raw[0];
      const kind =
        prefix === '-' ? 'remove' : prefix === '+' ? 'add' : prefix === '\\' ? 'note' : 'context';
      if (kind === 'remove') result.removedCount++;
      if (kind === 'add') result.addedCount++;
      const text = kind === 'note' ? raw.slice(2) : raw.slice(1);
      const line: ContentDiffLine = {
        kind,
        text,
        oldNumber: kind === 'context' || kind === 'remove' ? oldNumber++ : null,
        newNumber: kind === 'context' || kind === 'add' ? newNumber++ : null,
      };
      if (displayed >= DIFF_PREVIEW_LIMITS.lines) {
        result.truncated = true;
        continue;
      }
      const clipped = clipLine(text);
      if (clipped !== text) result.truncated = true;
      line.text = clipped;
      lines.push(line);
      displayed++;
      if (kind === 'remove') result.removed.push(clipped);
      if (kind === 'add') result.added.push(clipped);
    }
    // 標頭保留完整 hunk 範圍，預覽裁切不會偽造行號或影響總計
    if (lines.length)
      result.hunks.push({
        oldStart: hunk.oldLines ? hunk.oldStart : hunk.oldStart - 1,
        oldLines: hunk.oldLines,
        newStart: hunk.newLines ? hunk.newStart : hunk.newStart - 1,
        newLines: hunk.newLines,
        lines,
      });
  }
  return result;
}

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
  const isEmpty = (value: unknown) => value === '' || (Array.isArray(value) && value.length === 0);
  const metadata = changedKeys.map((key) => ({
    label: fieldLabels[key]!,
    before: display(normal(before, key)),
    after: display(normal(after, key)),
    beforeEmpty: isEmpty(normal(before, key)),
    afterEmpty: isEmpty(normal(after, key)),
  }));
  return {
    fields,
    metadata,
    body: bodyDiff(before?.body || '', after.body),
  };
}
