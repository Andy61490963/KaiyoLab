import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { Entry, EntryContent, EntryRevision } from '../../src/lib/types';
import { cleanupTestDatabase } from '../helpers/database-cleanup';

describe.skipIf(!process.env.DATABASE_URL)('PostgreSQL 版本紀錄與公開網址', () => {
  let admin: pg.Pool;
  let name: string;
  let database: typeof import('../../src/lib/db');
  let api: typeof import('../../src/pages/api/admin/[...path]');
  let content: typeof import('../../src/lib/content');
  let history: typeof import('../../src/lib/history');
  const origin = 'http://localhost:4321';

  async function call(route: string, method = 'GET', data?: unknown) {
    const url = new URL(`/api/admin/${route}`, origin);
    return api.ALL!({
      request: new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      url,
      params: { path: url.pathname.replace('/api/admin/', '') },
    } as any) as Promise<Response>;
  }
  async function entryResponse(response: Response): Promise<Entry> {
    const value = await response.json();
    expect(response.status, JSON.stringify(value)).toBeLessThan(300);
    return value;
  }
  async function create(slug: string = randomUUID(), kind = 'article') {
    const entry = await entryResponse(await call('entries', 'POST', { kind }));
    return save(entry, {
      title: slug,
      slug,
      body: `# ${slug}\n\nPublic body`,
      category: 'Engineering',
    });
  }
  async function save(entry: Entry, changes: Partial<EntryContent>) {
    return entryResponse(
      await call(`entries/${entry.id}`, 'PATCH', {
        version: entry.version,
        content: { ...entry.content, ...changes },
      }),
    );
  }
  async function action(entry: Entry, action: string) {
    return entryResponse(
      await call(`entries/${entry.id}/action`, 'POST', { version: entry.version, action }),
    );
  }
  async function revisions(entry: Entry) {
    return (await (await call(`history/${entry.id}`)).json()) as {
      items: EntryRevision[];
      nextCursor: string | null;
    };
  }

  beforeAll(async () => {
    const source = process.env.DATABASE_URL!;
    admin = new pg.Pool({ connectionString: source });
    name = `kaiyo_history_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(source);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.href;
    database = await import('../../src/lib/db');
    for (const migration of ['001_initial.sql', '007_content_history.sql'])
      await database
        .getPool()
        .query(
          await readFile(new URL(`../../db/migrations/${migration}`, import.meta.url), 'utf8'),
        );
    api = await import('../../src/pages/api/admin/[...path]');
    content = await import('../../src/lib/content');
    history = await import('../../src/lib/history');
  });
  afterAll(async () => {
    await cleanupTestDatabase(admin, name, database?.getPool());
  });

  it('既有公開內容可遷移時間、版本與網址紀錄，重跑不重複建立', async () => {
    const { emptyContent } = await import('../../src/lib/defaults');
    const old = {
      ...emptyContent,
      title: 'Legacy note',
      slug: 'legacy-note',
      body: 'Existing publication',
    };
    await database
      .getPool()
      .query(
        "INSERT INTO entries(id,kind,content,published,published_at) VALUES('legacy-note','article',$1,$1,'2020-01-01T00:00:00Z')",
        [JSON.stringify(old)],
      );
    const migration = await readFile(
      new URL('../../db/migrations/007_content_history.sql', import.meta.url),
      'utf8',
    );
    await database.getPool().query(migration);
    await database.getPool().query(migration);
    expect((await content.getPublished('article', 'legacy-note'))?.updatedAt).toBe(
      '2020-01-01T00:00:00.000Z',
    );
    expect((await history.listRevisions(database.db(), 'legacy-note')).items).toHaveLength(2);
    expect(
      (await database.getPool().query("SELECT entry_id FROM entry_slugs WHERE slug='legacy-note'"))
        .rows,
    ).toEqual([{ entry_id: 'legacy-note' }]);
  });

  it('遷移既有草稿與別篇公開slug碰撞時保護公開連結，垃圾桶不能搶用', async () => {
    const { emptyContent } = await import('../../src/lib/defaults');
    const payload = (slug: string) =>
      JSON.stringify({ ...emptyContent, title: slug, slug, body: 'Existing content' });
    const draftOwner = randomUUID();
    const publicOwner = randomUUID();
    await database
      .getPool()
      .query(
        "INSERT INTO entries(id,kind,content,published,published_at) VALUES($1,'article',$2,$3,'2020-01-01T00:00:00Z'),($4,'article',$5,$2,'2021-01-01T00:00:00Z')",
        [
          draftOwner,
          payload('legacy-cross-slug'),
          payload('legacy-original'),
          publicOwner,
          payload('legacy-private-slug'),
        ],
      );
    await database
      .getPool()
      .query(
        "INSERT INTO entries(id,kind,content,published,published_at,deleted_at) VALUES($1,'article',$2,$3,'2025-01-01T00:00:00Z',now())",
        [randomUUID(), payload('legacy-trash-slug'), payload('legacy-cross-slug')],
      );
    await database
      .getPool()
      .query(
        await readFile(
          new URL('../../db/migrations/007_content_history.sql', import.meta.url),
          'utf8',
        ),
      );
    expect(
      (
        await database
          .getPool()
          .query(
            "SELECT entry_id FROM entry_slugs WHERE kind='article' AND slug='legacy-cross-slug'",
          )
      ).rows,
    ).toEqual([{ entry_id: publicOwner }]);
    expect((await content.getPublished('article', 'legacy-cross-slug'))?.id).toBe(publicOwner);
    const draft = await entryResponse(await call(`entries/${draftOwner}`));
    expect(
      (
        await call(`entries/${draftOwner}`, 'PATCH', {
          version: draft.version,
          content: draft.content,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(`entries/${draftOwner}/action`, 'POST', {
          version: draft.version,
          action: 'publish',
        })
      ).status,
    ).toBe(409);
    expect((await save(draft, { slug: 'legacy-fixed-slug' })).content.slug).toBe(
      'legacy-fixed-slug',
    );
  });

  it('保留首次發布時間，草稿不影響公開更新時間或快照', async () => {
    let entry = await action(await create('stable-dates'), 'publish');
    await database
      .getPool()
      .query(
        "UPDATE entries SET published_at='2020-01-01T00:00:00Z', published_updated_at='2021-01-01T00:00:00Z' WHERE id=$1",
        [entry.id],
      );
    entry = await entryResponse(await call(`entries/${entry.id}`));
    entry = await save(entry, { body: 'Private revision' });
    let publicEntry = await content.getPublished('article', 'stable-dates');
    expect(publicEntry).toMatchObject({
      body: '# stable-dates\n\nPublic body',
      publishedAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2021-01-01T00:00:00.000Z',
    });
    entry = await action(entry, 'publish');
    publicEntry = await content.getPublished('article', 'stable-dates');
    expect(publicEntry?.publishedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(publicEntry?.updatedAt).toBe(entry.publishedUpdatedAt);
    expect(publicEntry?.body).toBe('Private revision');
    entry = await action(entry, 'unpublish');
    expect(await content.getPublished('article', 'stable-dates')).toBeNull();
    entry = await action(entry, 'publish');
    expect(entry.publishedAt).toBe('2020-01-01T00:00:00.000Z');
    expect(
      (await revisions(entry)).items.filter((item) => item.source === 'published'),
    ).toHaveLength(3);
  });

  it('每個舊網址直接指向目前公開網址，改回自己的舊網址不形成迴圈', async () => {
    let entry = await action(await create('original-address'), 'publish');
    entry = await action(await save(entry, { slug: 'second-address' }), 'publish');
    entry = await action(await save(entry, { slug: '第三篇' }), 'publish');
    expect(await content.publishedRedirect('article', 'original-address')).toBe(
      '/articles/%E7%AC%AC%E4%B8%89%E7%AF%87',
    );
    expect(await content.publishedRedirect('article', 'second-address')).toBe(
      '/articles/%E7%AC%AC%E4%B8%89%E7%AF%87',
    );
    expect(await content.publishedRedirect('article', '第三篇')).toBeNull();
    entry = await action(await save(entry, { slug: 'original-address' }), 'publish');
    expect(await content.publishedRedirect('article', 'original-address')).toBeNull();
    expect(await content.publishedRedirect('article', 'second-address')).toBe(
      '/articles/original-address',
    );
    expect(await content.publishedRedirect('article', '第三篇')).toBe('/articles/original-address');
    const other = await create('other-entry');
    expect(
      (
        await call(`entries/${other.id}`, 'PATCH', {
          version: other.version,
          content: { ...other.content, slug: 'second-address' },
        })
      ).status,
    ).toBe(409);
    await create('second-address', 'project');
    entry = await action(entry, 'unpublish');
    expect(await content.publishedRedirect('article', 'second-address')).toBeNull();
    expect(
      (
        await call(`entries/${other.id}`, 'PATCH', {
          version: other.version,
          content: { ...other.content, slug: 'second-address' },
        })
      ).status,
    ).toBe(409);
    entry = await action(entry, 'publish');
    entry = await action(entry, 'trash');
    expect(await content.publishedRedirect('article', 'second-address')).toBeNull();
    expect(await content.getPublished('article', 'original-address')).toBeNull();
  });

  it('還原版本只修改草稿且先保留目前內容，拒絕過期版本及別篇快照', async () => {
    let entry = await action(await create('restore-history'), 'publish');
    const published = (await revisions(entry)).items.find((item) => item.source === 'published')!;
    entry = await save(entry, {
      body: 'Draft that must be recoverable',
      title: 'Latest private work',
    });
    const stale = entry.version;
    entry = await entryResponse(
      await call(`history/${entry.id}`, 'POST', {
        revisionId: published.id,
        version: entry.version,
      }),
    );
    expect(entry.content.body).toBe(published.content.body);
    expect(entry.published?.body).toBe(published.content.body);
    const previous = (await revisions(entry)).items.find((item) => item.source === 'restore')!;
    expect(previous.content.body).toBe('Draft that must be recoverable');
    expect(
      (await call(`history/${entry.id}`, 'POST', { revisionId: previous.id, version: stale }))
        .status,
    ).toBe(409);
    entry = await entryResponse(
      await call(`history/${entry.id}`, 'POST', {
        revisionId: previous.id,
        version: entry.version,
      }),
    );
    expect(entry.content.body).toBe('Draft that must be recoverable');
    expect((await content.getPublished('article', 'restore-history'))?.body).toBe(
      published.content.body,
    );
    const other = await create('unrelated-history');
    expect(
      (
        await call(`history/${other.id}`, 'POST', {
          revisionId: published.id,
          version: other.version,
        })
      ).status,
    ).toBe(404);
    const trashed = await action(entry, 'trash');
    expect(
      (
        await call(`history/${entry.id}`, 'POST', {
          revisionId: published.id,
          version: trashed.version,
        })
      ).status,
    ).toBe(409);
  });

  it('草稿快照每五分鐘建立並限制100份，發布版本永久保留且分頁不重複', async () => {
    let entry = await create('checkpoint-history');
    expect((await revisions(entry)).items).toHaveLength(1);
    entry = await save(entry, { body: 'First completed text' });
    expect((await revisions(entry)).items).toHaveLength(1);
    await database
      .getPool()
      .query("UPDATE entry_revisions SET created_at=now()-interval '6 minutes' WHERE entry_id=$1", [
        entry.id,
      ]);
    entry = await save(entry, { body: 'Second completed text' });
    expect((await revisions(entry)).items.map((item) => item.content.body)).toContain(
      'First completed text',
    );
    entry = await action(entry, 'publish');
    for (let i = 0; i < 103; i++)
      await history.recordRevision(
        database.db(),
        { ...entry, content: { ...entry.content, body: `Revision ${i}` } },
        'draft',
      );
    const counts = await database
      .getPool()
      .query(
        'SELECT source,count(*)::int AS n FROM entry_revisions WHERE entry_id=$1 GROUP BY source',
        [entry.id],
      );
    expect(counts.rows).toEqual(
      expect.arrayContaining([
        { source: 'draft', n: 100 },
        { source: 'published', n: 1 },
      ]),
    );
    let cursor: string | null = null;
    const ids: string[] = [];
    do {
      const response = await call(`history/${entry.id}${cursor ? `?before=${cursor}` : ''}`);
      const page = (await response.json()) as Awaited<ReturnType<typeof revisions>>;
      expect(page.items.length).toBeLessThanOrEqual(20);
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toHaveLength(101);
    expect(new Set(ids).size).toBe(101);
    expect((await call(`history/${entry.id}?before=missing`)).status).toBe(400);
  });

  it('系列只採用公開快照，以排序和日期提供前後篇', async () => {
    let first = await save(await create('series-first'), {
      series: 'Docker basics',
      seriesOrder: 10,
    });
    let second = await save(await create('series-second'), {
      series: 'Docker basics',
      seriesOrder: 20,
    });
    await save(await create('series-draft'), { series: 'Docker basics', seriesOrder: 15 });
    first = await action(first, 'publish');
    second = await action(second, 'publish');
    second = await save(second, { series: 'Private series', seriesOrder: 1 });
    const nav = await content.seriesNavigation(
      (await content.getPublished('article', first.content.slug))!,
    );
    expect(nav.items.map((item) => item.slug)).toEqual(['series-first', 'series-second']);
    expect(nav.previous).toBeNull();
    expect(nav.next?.slug).toBe('series-second');
    await action(second, 'trash');
    expect(
      (await content.seriesNavigation((await content.getPublished('article', first.content.slug))!))
        .items,
    ).toHaveLength(1);
  });

  it('同時搶用網址只有一個成功，已刪除文章的舊網址仍被保留', async () => {
    const a = await create('race-a');
    const b = await create('race-b');
    const results = await Promise.all(
      [a, b].map((entry) =>
        call(`entries/${entry.id}`, 'PATCH', {
          version: entry.version,
          content: { ...entry.content, slug: 'claimed-address' },
        }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
  });

  it('歷史使用的圖片可找到引用，即使已離開目前草稿', async () => {
    const entry = await create('historical-image');
    await history.recordRevision(database.db(), entry, 'published', {
      ...entry.content,
      body: '![old](/media/12345678-abcd.webp)',
    });
    expect(await history.historyMediaUsages(database.db(), '12345678-abcd')).toEqual([
      'historical-image (version history)',
    ]);
  });
});
