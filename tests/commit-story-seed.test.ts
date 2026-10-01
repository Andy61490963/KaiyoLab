import { describe, expect, it, vi } from 'vitest';
import { readCommitStories, seedCommitStories } from '../scripts/seed-commit-stories.mjs';

describe('owner-requested commit story payload', () => {
  it('contains exactly five complete original articles with series order and metadata', async () => {
    const entries = await readCommitStories();
    expect(entries).toHaveLength(5);
    expect(entries.map((item: { content: { seriesOrder: number } }) => item.content.seriesOrder)).toEqual([1, 2, 3, 4, 5]);
    for (const entry of entries) {
      expect(entry.content.body.length).toBeGreaterThan(3000);
      expect(entry.content.body).toContain('```mermaid');
      expect(entry.content.category).toBe('開發實戰');
      expect(entry.content.series).toBe('從 Commit 看工程取捨');
      expect(entry.content.excerpt).not.toBe('');
      expect(entry.content.tags.length).toBeGreaterThan(0);
      expect(entry).not.toHaveProperty('published');
      expect(entry).not.toHaveProperty('settings');
    }
  });

  it.each([
    undefined, 'bad', 'http://localhost:4321', 'https://other.example',
    'https://kaiyo.zeabur.app.evil.example', 'https://user:password@kaiyo.zeabur.app',
    'https://kaiyo.zeabur.app/sub',
  ])('does not even query another site: %s', async (site) => {
    const client = { query: vi.fn() };
    expect(await seedCommitStories(client, site)).toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });
});
