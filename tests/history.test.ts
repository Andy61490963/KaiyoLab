import { describe, it, expect } from 'vitest';
import { checkpointDue, DRAFT_CHECKPOINT_MS } from '../src/lib/history-rules';
import { contentSchema } from '../src/lib/http';
import { emptyContent } from '../src/lib/defaults';

describe('版本與系列規則', () => {
  it('首次記錄及五分鐘邊界會建立草稿快照', () => {
    const previous = new Date('2026-01-01T00:00:00Z');
    expect(checkpointDue(null, previous)).toBe(true);
    expect(checkpointDue(previous, new Date(previous.getTime() + DRAFT_CHECKPOINT_MS - 1))).toBe(
      false,
    );
    expect(checkpointDue(previous, new Date(previous.getTime() + DRAFT_CHECKPOINT_MS))).toBe(true);
  });
  it('相容缺少新欄位的舊文章並限制系列順序與封面焦點', () => {
    const { series, seriesOrder, coverPosition, ...legacy } = { ...emptyContent, slug: 'test' };
    expect(contentSchema.parse(legacy).series).toBeUndefined();
    expect(
      contentSchema.parse({
        ...legacy,
        series: '  Docker  ',
        seriesOrder: 3,
        coverPosition: { x: 0, y: 100 },
      }).series,
    ).toBe('Docker');
    for (const input of [
      { seriesOrder: -1 },
      { seriesOrder: 1.1 },
      { seriesOrder: 100001 },
      { coverPosition: { x: 101, y: 50 } },
    ])
      expect(() => contentSchema.parse({ ...legacy, ...input })).toThrow();
  });
});
