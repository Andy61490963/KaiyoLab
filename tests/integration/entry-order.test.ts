import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { emptyContent } from '../../src/lib/defaults';
import type { EntryOrderSnapshot } from '../../src/lib/types';
import { cleanupTestDatabase } from '../helpers/database-cleanup';

describe.skipIf(!process.env.DATABASE_URL)('PostgreSQL 文章與作品跨頁手動排序', () => {
  let admin: pg.Pool;
  let name: string;
  let database: typeof import('../../src/lib/db');
  let endpoint: typeof import('../../src/pages/api/admin/entries/order');
  let legacy: typeof import('../../src/pages/api/admin/[...path]');
  let middleware: typeof import('../../src/middleware');
  let content: typeof import('../../src/lib/content');
  let listing: typeof import('../../src/lib/admin-listing');
  let order: typeof import('../../src/lib/entry-order');
  let cookie = '';
  let migrationRows: unknown[];
  let repeatedMigrationRows: unknown[];
  const origin = 'http://localhost:4321';

  async function call(
    method = 'GET',
    payload?: unknown,
    options: { kind?: string; anonymous?: boolean; origin?: string; legacyPath?: string } = {},
  ): Promise<Response> {
    const route =
      options.legacyPath || `entries/order?kind=${encodeURIComponent(options.kind || 'article')}`;
    const url = new URL(`/api/admin/${route}`, origin);
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (!options.anonymous) headers.set('Cookie', cookie);
    if (method !== 'GET') headers.set('Origin', options.origin ?? origin);
    const context: any = {
      url,
      request: new Request(url, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
      }),
      params: { path: options.legacyPath || 'entries/order' },
      locals: {},
      redirect: (target: string) =>
        new Response(null, { status: 302, headers: { Location: target } }),
    };
    const response = await middleware.onRequest(context, async () => {
      if (options.legacyPath) return legacy.ALL!(context);
      return method === 'GET' ? endpoint.GET!(context) : endpoint.PATCH!(context);
    });
    if (!(response instanceof Response)) throw new Error('排序端點未回傳 Response');
    return response;
  }

  async function snapshot(kind = 'article'): Promise<EntryOrderSnapshot> {
    const response = await call('GET', undefined, { kind });
    expect(response.status).toBe(200);
    return response.json();
  }

  async function move(id: string, position: number, current: EntryOrderSnapshot, kind = 'article') {
    return call('PATCH', { kind, id, position, revision: current.revision });
  }

  async function action(id: string, action: string) {
    const current = await database.getPool().query('SELECT version FROM entries WHERE id=$1', [id]);
    const response = await call(
      'POST',
      { action, version: current.rows[0].version },
      {
        legacyPath: `entries/${id}/action`,
      },
    );
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json();
  }

  async function insert(id: string, kind: string, rank: number, published = true, deleted = false) {
    const publicValue = {
      ...emptyContent,
      title: `公開 ${id}`,
      slug: id,
      body: '公開內容',
      category: 'MES',
    };
    const privateValue = { ...publicValue, title: `草稿 ${id}`, body: `NEVER_PUBLIC_${id}` };
    await database.getPool().query(
      `INSERT INTO entries(id,kind,sort_order,content,published,published_at,published_updated_at,updated_at,deleted_at)
       VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8)`,
      [
        id,
        kind,
        rank,
        JSON.stringify(privateValue),
        published ? JSON.stringify(publicValue) : null,
        published ? new Date(Date.UTC(2026, 0, Math.min(rank + 1, 28))) : null,
        new Date('2026-02-01T00:00:00Z'),
        deleted ? new Date('2026-02-02T00:00:00Z') : null,
      ],
    );
  }

  beforeAll(async () => {
    const source = process.env.DATABASE_URL!;
    admin = new pg.Pool({ connectionString: source });
    name = `kaiyo_test_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE ${name}`);
    const connection = new URL(source);
    connection.pathname = `/${name}`;
    process.env.DATABASE_URL = connection.href;
    process.env.SITE_URL = origin;
    process.env.BETTER_AUTH_SECRET = 'entry-order-only-secret-012345678901234567890';
    process.env.SETUP_TOKEN = 'entry-order-only-setup-012345678901234567890';
    database = await import('../../src/lib/db');
    for (const file of ['001_initial.sql', '007_content_history.sql', '008_settings_version.sql']) {
      await database
        .getPool()
        .query(await readFile(new URL(`../../db/migrations/${file}`, import.meta.url), 'utf8'));
    }
    for (const [id, kind, publishedAt, updatedAt] of [
      ['old', 'article', '2020-01-01', '2026-01-01'],
      ['new', 'article', '2021-01-01', '2025-01-01'],
      ['new-tie', 'article', '2021-01-01', '2024-01-01'],
      ['private', 'article', null, '2026-01-02'],
      ['project', 'project', '2019-01-01', '2026-01-01'],
    ]) {
      const value = JSON.stringify({ ...emptyContent, title: '遷移測試', slug: id });
      await database
        .getPool()
        .query(
          'INSERT INTO entries(id,kind,content,published,published_at,updated_at) VALUES($1,$2,$3,$4,$5,$6)',
          [
            id,
            kind,
            value,
            publishedAt ? value : null,
            publishedAt ? `${publishedAt}T00:00:00Z` : null,
            `${updatedAt}T00:00:00Z`,
          ],
        );
    }
    const migration = await readFile(
      new URL('../../db/migrations/009_entry_order.sql', import.meta.url),
      'utf8',
    );
    await database.getPool().query(migration);
    migrationRows = (
      await database
        .getPool()
        .query('SELECT id,kind,sort_order,version,updated_at FROM entries ORDER BY kind,sort_order')
    ).rows;
    await database.getPool().query(migration);
    repeatedMigrationRows = (
      await database
        .getPool()
        .query('SELECT id,kind,sort_order,version,updated_at FROM entries ORDER BY kind,sort_order')
    ).rows;
    endpoint = await import('../../src/pages/api/admin/entries/order');
    legacy = await import('../../src/pages/api/admin/[...path]');
    middleware = await import('../../src/middleware');
    content = await import('../../src/lib/content');
    listing = await import('../../src/lib/admin-listing');
    order = await import('../../src/lib/entry-order');
    const setup = await import('../../src/pages/api/setup');
    const initialized = await setup.POST!({
      request: new Request(`${origin}/api/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: process.env.SETUP_TOKEN,
          name: '排序驗收',
          siteName: '排序驗收',
          email: 'order@example.test',
          password: 'order-integration-password-2026',
        }),
      }),
    } as any);
    expect(initialized.status).toBe(200);
    const { getAuth } = await import('../../src/lib/auth');
    const login = await getAuth().api.signInEmail({
      body: { email: 'order@example.test', password: 'order-integration-password-2026' },
      asResponse: true,
    });
    expect(login.status).toBe(200);
    cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
  });

  beforeEach(async () => {
    await database.getPool().query('TRUNCATE entries CASCADE');
    for (let index = 1; index <= 25; index++) {
      await insert(`article-${String(index).padStart(2, '0')}`, 'article', index);
    }
    await insert('draft-secret', 'article', 7, false);
    await insert('trashed-secret', 'article', 4, true, true);
    for (let index = 1; index <= 3; index++) await insert(`project-${index}`, 'project', index);
  });

  afterAll(async () => {
    await cleanupTestDatabase(admin, name, database?.getPool());
  });

  it('遷移保留各類型既有公開時間順序，重跑不改順位與內容版本', () => {
    expect(migrationRows).toEqual([
      expect.objectContaining({
        id: 'new-tie',
        sort_order: 1,
        version: 1,
        updated_at: new Date('2024-01-01T00:00:00Z'),
      }),
      expect.objectContaining({
        id: 'new',
        sort_order: 2,
        version: 1,
        updated_at: new Date('2025-01-01T00:00:00Z'),
      }),
      expect.objectContaining({ id: 'old', sort_order: 3, version: 1 }),
      expect.objectContaining({ id: 'private', sort_order: 4, version: 1 }),
      expect.objectContaining({ id: 'project', sort_order: 1, version: 1 }),
    ]);
    expect(repeatedMigrationRows).toEqual(migrationRows);
  });

  it('從末頁移到第一頁後前後台同序，保留全部內容且不洩漏草稿', async () => {
    const original = await snapshot();
    expect(original.items).toHaveLength(26);
    expect(Object.keys(original.items[0]).sort()).toEqual(['id', 'published', 'title']);
    expect(original.items.some((item) => item.id === 'trashed-secret')).toBe(false);
    const before = (
      await database
        .getPool()
        .query("SELECT to_jsonb(entries) - 'sort_order' AS value FROM entries ORDER BY id")
    ).rows;
    const projects = await snapshot('project');
    const result = await move('article-25', 2, original);
    expect(result.status).toBe(200);
    const after = (await result.json()) as EntryOrderSnapshot;
    const expected = original.items.map((item) => item.id).filter((id) => id !== 'article-25');
    expected.splice(1, 0, 'article-25');
    expect(after.items.map((item) => item.id)).toEqual(expected);
    const adminIds: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const result = await listing.listAdminEntries(
        new URLSearchParams(`kind=article&pageSize=10&page=${page}`),
      );
      adminIds.push(...result.items.map((item) => item.id));
    }
    expect(adminIds).toEqual(expected);
    const publicItems = [];
    for (let page = 1; page <= 4; page++) {
      publicItems.push(
        ...(await content.listPublished({ kind: 'article', pageSize: 8, page })).items,
      );
    }
    expect(publicItems.map((item) => item.id)).toEqual(
      expected.filter((id) => id !== 'draft-secret'),
    );
    expect(JSON.stringify(publicItems)).not.toContain('NEVER_PUBLIC');
    expect(publicItems.every((item) => !('sortOrder' in item))).toBe(true);
    expect(await snapshot('project')).toEqual(projects);
    expect(
      (
        await database
          .getPool()
          .query("SELECT to_jsonb(entries) - 'sort_order' AS value FROM entries ORDER BY id")
      ).rows,
    ).toEqual(before);
  });

  it('作品可移至最後一個位置，日期排序仍按公開日期而非手動位置', async () => {
    const articles = await snapshot();
    const current = await snapshot('project');
    expect((await move('project-1', 3, current, 'project')).status).toBe(200);
    expect((await content.listPublished({ kind: 'project' })).items.map((item) => item.id)).toEqual(
      ['project-2', 'project-3', 'project-1'],
    );
    expect(
      (await content.listPublished({ kind: 'project', sort: 'newest' })).items.map(
        (item) => item.id,
      ),
    ).toEqual(['project-3', 'project-2', 'project-1']);
    expect(
      (await content.listPublished({ kind: 'project', sort: 'oldest' })).items.map(
        (item) => item.id,
      ),
    ).toEqual(['project-1', 'project-2', 'project-3']);
    expect(
      (await content.listPublished({ kind: 'project', sort: 'invalid' })).items.map(
        (item) => item.id,
      ),
    ).toEqual(['project-2', 'project-3', 'project-1']);
    expect(await snapshot()).toEqual(articles);
  });

  it('垃圾桶不能排序，刪除或還原會讓舊排序快照失效且保留還原槽位', async () => {
    const before = await snapshot();
    await action('article-02', 'trash');
    expect((await move('article-25', 1, before)).status).toBe(409);
    const active = await snapshot();
    expect(active.items.some((item) => item.id === 'article-02')).toBe(false);
    expect((await move('article-02', 1, active)).status).toBe(404);
    expect((await move('article-25', 1, active)).status).toBe(200);
    const priorRestore = await snapshot();
    await action('article-02', 'restore');
    const restored = await snapshot();
    expect(restored.items.slice(0, 3).map((item) => item.id)).toEqual([
      'article-25',
      'article-02',
      'article-01',
    ]);
    expect((await move('article-03', 1, priorRestore)).status).toBe(409);
  });

  it('兩個分頁同時排序只有一個成功，過期快照不覆蓋較新順序', async () => {
    const original = await snapshot();
    const outcomes = await Promise.all([
      move('article-25', 1, original),
      move('article-24', 1, original),
    ]);
    expect(outcomes.map((response) => response.status).sort()).toEqual([200, 409]);
    const winner = await outcomes.find((response) => response.status === 200)!.json();
    expect(await snapshot()).toEqual(winner);
    expect((await move('article-10', 1, original)).status).toBe(409);
    const project = await snapshot('project');
    expect((await move('article-01', 1, project)).status).toBe(409);
  });

  it('原位移動不寫入，編輯或重新發布不改排序，新增內容使舊快照失效', async () => {
    const original = await snapshot();
    const before = (await database.getPool().query('SELECT * FROM entries ORDER BY id')).rows;
    const noChange = await move(original.items[0].id, 1, original);
    expect(await noChange.json()).toEqual(original);
    expect((await database.getPool().query('SELECT * FROM entries ORDER BY id')).rows).toEqual(
      before,
    );
    await database
      .getPool()
      .query(
        "UPDATE entries SET updated_at=now(),published_updated_at=now(),version=version+1 WHERE id='article-25'",
      );
    expect(await snapshot()).toEqual(original);
    await database
      .getPool()
      .query("INSERT INTO entries(id,kind,content) VALUES('new-item','article',$1)", [
        JSON.stringify({ ...emptyContent, title: '新增文章', slug: 'new-item' }),
      ]);
    expect((await snapshot()).items[0].id).toBe('new-item');
    expect((await move('article-25', 1, original)).status).toBe(409);
  });

  it('匿名存取及跨來源寫入被拒絕，非法型別、位置、額外欄位均無法寫入', async () => {
    const current = await snapshot();
    const payload = { kind: 'article', id: 'article-01', position: 2, revision: current.revision };
    expect((await call('GET', undefined, { anonymous: true })).status).toBe(401);
    expect((await call('PATCH', payload, { anonymous: true })).status).toBe(401);
    expect((await call('PATCH', payload, { origin: 'https://external.example' })).status).toBe(403);
    expect((await call('PATCH', payload, { origin: '' })).status).toBe(403);
    expect((await call('GET', undefined, { kind: 'other' })).status).toBe(400);
    for (const patch of [
      { position: 0 },
      { position: -1 },
      { position: 1.5 },
      { position: '1' },
      { position: 27 },
      { kind: 'other' },
      { id: '' },
      { revision: 'old' },
      { extra: true },
    ])
      expect((await call('PATCH', { ...payload, ...patch })).status).toBe(400);
    expect((await call('PATCH', { ...payload, id: 'missing' })).status).toBe(404);
    expect((await call('PATCH', { ...payload, id: 'project-1' })).status).toBe(404);
    expect(await snapshot()).toEqual(current);
  });

  it('重整順位保留相對位置並回傳最大值供匯入附加，沒有整數溢位', async () => {
    await database
      .getPool()
      .query("UPDATE entries SET sort_order=2147483647 WHERE id='article-25'");
    const before = await snapshot();
    const { lockContent } = await import('../../src/lib/media');
    const count = await database.db().transaction(async (tx) => {
      const connection = tx as unknown as ReturnType<typeof database.db>;
      await lockContent(connection);
      return order.compactEntryOrder(connection, 'article');
    });
    expect(count).toBe(27);
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await database
          .getPool()
          .query("SELECT max(sort_order)::int AS maximum FROM entries WHERE kind='article'")
      ).rows[0].maximum,
    ).toBe(27);
  });
});
