import { describe, expect, it } from 'vitest';
import { readRecovery } from '../src/components/admin/draft-recovery';
import { emptyContent } from '../src/lib/defaults';

describe('local draft recovery', () => {
  const valid = { content: { ...emptyContent, body: '# Private work', tags: ['C#'] }, at: '2026-09-23T08:00:00Z', version: 2 };
  it('keeps valid, possibly unfinished drafts without rewriting them', () => {
    expect(readRecovery(JSON.stringify(valid))).toEqual(valid);
    const unfinished = { ...valid, content: { ...valid.content, title: '', slug: '' } };
    expect(readRecovery(JSON.stringify(unfinished))).toEqual(unfinished);
  });
  it.each([null, '', '{broken', 'null', '[]', '42'])('ignores malformed storage: %s', (raw) => { expect(readRecovery(raw)).toBeNull(); });
  it('rejects obsolete shapes and invalid dates, versions, and field types', () => {
    for (const invalid of [
      { ...valid, content: { title: 'Old draft' } }, { ...valid, at: 'not a date' }, { ...valid, version: 0 }, { ...valid, version: 1.5 },
      { ...valid, content: { ...valid.content, body: null } }, { ...valid, content: { ...valid.content, tags: [42] } }, { ...valid, content: { ...valid.content, featured: 'true' } },
    ]) expect(readRecovery(JSON.stringify(invalid))).toBeNull();
  });
});
