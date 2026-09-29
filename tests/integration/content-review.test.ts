import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { emptyContent } from '../../src/lib/defaults';
import { cleanupTestDatabase } from '../helpers/database-cleanup';

describe.skipIf(!process.env.DATABASE_URL)('發布檢查使用真實公開版本', () => {
  let admin: pg.Pool;
  let name: string;
  let database: typeof import('../../src/lib/db');
  let checks: typeof import('../../src/pages/api/admin/entries/[id]/checks');
  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
    name = `kaiyo_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const connection = new URL(process.env.DATABASE_URL!);
    connection.pathname = `/${name}`;
    process.env.DATABASE_URL = connection.href;
    process.env.SITE_URL = 'http://localhost:4321';
    database = await import('../../src/lib/db');
    for (const file of [
      '001_initial.sql',
      '007_content_history.sql',
      '008_settings_version.sql',
      '009_entry_order.sql',
    ])
      await database
        .getPool()
        .query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    checks = await import('../../src/pages/api/admin/entries/[id]/checks');
  });
  beforeEach(async () => {
    await database.getPool().query('TRUNCATE entries, entry_revisions, entry_slugs CASCADE');
  });
  afterAll(async () => {
    await cleanupTestDatabase(admin, name, database?.getPool());
  });
  async function review(id: string, version = 1) {
    return checks.POST!({
      params: { id },
      request: new Request('http://localhost:4321/api/admin/entries/' + id + '/checks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version }),
      }),
    } as any) as Promise<Response>;
  }
  it('舊網址解析到公開內容，當前文章舊網址則檢查即將發布的草稿', async () => {
    const currentId = randomUUID();
    const targetId = randomUUID();
    const hiddenId = randomUUID();
    await database
      .db()
      .insert(database.entries)
      .values([
        {
          id: targetId,
          kind: 'article',
          content: { ...emptyContent, slug: 'target', body: '## 尚未公開' },
          published: { ...emptyContent, slug: 'target', body: '## 公開章節' },
        },
        {
          id: hiddenId,
          kind: 'article',
          content: { ...emptyContent, slug: 'hidden', body: '## 私人' },
        },
        {
          id: currentId,
          kind: 'article',
          content: {
            ...emptyContent,
            slug: 'current',
            excerpt: '摘要',
            body: '## 目前草稿\n\n[已發布舊址](/articles/target-old?q=1#section-公開章節) [新草稿不可見](/articles/target#section-尚未公開) [自身舊址](/articles/current-old#section-目前草稿) [已刪章節](/articles/current-old#section-舊章節) [私人](/articles/hidden#section-私人)',
          },
          published: { ...emptyContent, slug: 'current-old', body: '## 舊章節' },
        },
      ]);
    await database
      .db()
      .insert(database.entrySlugs)
      .values([
        { entryId: targetId, kind: 'article', slug: 'target-old' },
        { entryId: currentId, kind: 'article', slug: 'current-old' },
      ]);
    const response = await review(currentId);
    expect(response.status).toBe(200);
    const value = await response.json();
    expect(value.warnings).toEqual([
      { code: 'broken-link', message: 'No published content at /articles/hidden' },
      { code: 'broken-anchor', message: '找不到章節錨點：/articles/target#section-尚未公開' },
      { code: 'broken-anchor', message: '找不到章節錨點：/articles/current-old#section-舊章節' },
    ]);
    expect(value.version).toBe(1);
  });
  it('流程圖錯誤從檢查 API 回傳提示，不改變草稿版本或發布內容', async () => {
    const id = randomUUID();
    await database
      .db()
      .insert(database.entries)
      .values({
        id,
        kind: 'project',
        content: {
          ...emptyContent,
          slug: 'flow',
          excerpt: '摘要',
          body: '```mermaid\nflowchart TD\nA[未結束\n```',
        },
      });
    const response = await review(id);
    expect(response.status).toBe(200);
    expect((await response.json()).warnings[0].code).toBe('diagram-syntax');
    expect((await review(id, 99)).status).toBe(409);
    const [stored] = await database.db().select().from(database.entries);
    expect(stored.version).toBe(1);
    expect(stored.published).toBeNull();
  });
});
